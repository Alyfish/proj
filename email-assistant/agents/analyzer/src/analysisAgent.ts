import { Agent, EmailMetadata, EmailAnalysisResult } from '@email-assistant/common/src/types';
import { db } from '@email-assistant/common/src/db';
import { llm } from '@email-assistant/common/src/llm';
import { GmailClient } from '@email-assistant/agent-gmail/src/gmailClient';
import { EmailSummarizer } from './emailSummarizer';

type IntentType = 'search' | 'reply' | 'process';

interface AnalysisInput {
    userId: string;
    emails: (EmailMetadata & { priority: 'high' | 'medium' | 'low' })[];
    searchQuery?: string;
    maxAnalyze?: number;
    intent?: IntentType;
}

interface AnalysisOutput {
    analyses: EmailAnalysisResult[];
}

export class AnalysisAgent implements Agent<AnalysisInput, AnalysisOutput> {
    name = 'AnalysisAgent';
    private gmail: any;
    private bodyCache: Map<string, string> = new Map();
    private embeddingCache: Map<string, number[]> = new Map();
    private summarizer = new EmailSummarizer();
    private travelKeywords = ['flight', 'itinerary', 'itenerary', 'trip', 'pnr', 'confirmation', 'boarding', 'depart', 'arrival', 'airport'];
    private airlineHintRegex = /(airlines?|airways?|delta|united|american|alaska|frontier|spirit|jetblue|southwest|lufthansa|qatar|emirates|etihad|air france|klm|qantas|turkish|alitalia|british airways|virgin|expedia|booking\.com|orbitz|travelocity|air canada)/i;

    constructor() {
        // Summarizer initialized above
    }

    async run(input: AnalysisInput): Promise<AnalysisOutput> {
        const maxAnalyze = input.maxAnalyze ?? 12;
        const normalizedQuery = input.searchQuery?.toLowerCase() ?? '';
        const tokens = normalizedQuery ? normalizedQuery.split(/\s+/).filter(Boolean) : [];
        const refreshEmbeddings = tokens.length > 0; // for search intents, recompute to honor full-body context

        const matchesQuery = (email: EmailMetadata & { priority: 'high' | 'medium' | 'low' }) => {
            if (!tokens.length) return true;
            const haystack = `${email.subject} ${email.snippet} ${email.from}`.toLowerCase();
            return tokens.every(t => haystack.includes(t));
        };

        // If user provided a query, consider all matches (even low priority); otherwise prefer medium/high
        let toAnalyze = tokens.length > 0
            ? input.emails.filter(matchesQuery)
            : input.emails.filter(e => e.priority !== 'low' && matchesQuery(e));

        // If nothing is high/medium, fall back to query matches regardless of priority, then recency
        if (toAnalyze.length === 0) {
            const matched = input.emails.filter(matchesQuery);
            if (matched.length > 0) {
                toAnalyze = matched.slice(0, maxAnalyze);
            }
        }
        // Final fallback: take latest few emails
        if (toAnalyze.length === 0) {
            toAnalyze = input.emails.slice(0, maxAnalyze);
        }

        // Rank by simple scoring (priority + query match + recency) and trim to maxAnalyze
        const scoreEmail = (email: EmailMetadata & { priority: 'high' | 'medium' | 'low' }) => {
            const priScore = email.priority === 'high' ? 3 : email.priority === 'medium' ? 2 : 1;
            const haystack = `${email.subject} ${email.snippet} ${email.from}`.toLowerCase();
            const matchScore = tokens.reduce((acc, t) => acc + (haystack.includes(t) ? 2 : 0), 0); // boost exact token matches
            const recencyScore = (() => {
                const hoursOld = (Date.now() - new Date(email.receivedAt).getTime()) / (1000 * 60 * 60);
                if (hoursOld < 6) return 1.5;
                if (hoursOld < 24) return 1;
                if (hoursOld < 72) return 0.5;
                return 0;
            })();
            return priScore + matchScore + recencyScore;
        };
        toAnalyze = toAnalyze
            .map(e => ({ ...e, _score: scoreEmail(e) }))
            .sort((a, b) => b._score - a._score)
            .slice(0, maxAnalyze)
            .map(({ _score, ...rest }) => rest);

        // Semantic rerank if we have a query: compute embeddings and boost similarity
        let queryEmbedding: number[] | null = null;
        if (tokens.length > 0) {
            queryEmbedding = await llm.embed(input.searchQuery!);
        }
        const cosine = (a: number[], b: number[]) => {
            let dot = 0, na = 0, nb = 0;
            const len = Math.min(a.length, b.length);
            for (let i = 0; i < len; i++) {
                dot += a[i] * b[i];
                na += a[i] * a[i];
                nb += b[i] * b[i];
            }
            if (na === 0 || nb === 0) return 0;
            return dot / (Math.sqrt(na) * Math.sqrt(nb));
        };

        if (queryEmbedding) {
            const fetchEmbedding = async (email: EmailMetadata) => {
                if (!refreshEmbeddings && this.embeddingCache.has(email.id)) return this.embeddingCache.get(email.id)!;
                if (!refreshEmbeddings) {
                    const row = db.prepare('SELECT embedding FROM email_embeddings WHERE email_id = ?').get(email.id) as { embedding: string } | undefined;
                    if (row?.embedding) {
                        const vec = JSON.parse(row.embedding);
                        this.embeddingCache.set(email.id, vec);
                        return vec;
                    }
                }
                const fullText = await this.getFullText(email);
                // Use summarizer to create optimized embedding text (1500 chars max)
                const embeddingText = this.summarizer.createEmbeddingText(email, fullText);
                const vec = await llm.embed(embeddingText);
                if (vec) {
                    this.embeddingCache.set(email.id, vec);
                    db.prepare('INSERT OR REPLACE INTO email_embeddings (email_id, embedding) VALUES (?, ?)').run(email.id, JSON.stringify(vec));
                }
                return vec;
            };

            const scored: Array<{ email: (EmailMetadata & { priority: 'high' | 'medium' | 'low' }); score: number }> = [];
            for (const email of toAnalyze) {
                const vec = await fetchEmbedding(email);
                const sim = vec && queryEmbedding ? cosine(vec, queryEmbedding) : 0;
                const priScore = email.priority === 'high' ? 3 : email.priority === 'medium' ? 2 : 1;
                const combined = priScore + sim * 6; // weight similarity heavier to honor intent
                scored.push({ email, score: combined });
            }
            toAnalyze = scored.sort((a, b) => b.score - a.score).slice(0, maxAnalyze).map(s => s.email);
        }

        console.log(`[${this.name}] Analyzing ${toAnalyze.length} emails (query="${input.searchQuery || 'n/a'}")...`);

        // We need the Gmail client to get the full body
        await this.ensureGmail();

        const results: EmailAnalysisResult[] = [];
        const updateStmt = db.prepare('UPDATE emails SET analysis = ?, processed = 1 WHERE id = ?');

        for (const email of toAnalyze) {
            try {
                // 1. Get full body
                const body = await this.getFullText(email);

                // 2. Create optimized analysis text (2000 chars max)
                const analysisText = this.summarizer.createAnalysisText(email, body, 2000);

                // Log token estimate
                const estimatedTokens = llm.estimateTokens(analysisText);
                console.log(`[${this.name}] Analyzing ${email.id} (~${estimatedTokens} tokens)`);

                // 3. Optimized LLM prompt (reduced verbosity)
                const hasQuery = input.searchQuery && input.searchQuery.length > 0;
                const prompt = `Analyze this email${hasQuery ? ' focusing on: "' + input.searchQuery + '"' : ''}.

${analysisText}

Return JSON with:
- summary: 2-3 sentences${hasQuery ? ' answering the query' : ''}
- answer: ${hasQuery ? 'Direct answer to query (1-2 sentences)' : 'null'}
- actions: [{description, dueDate?}]
- key_facts: {key: value} for amounts, dates, IDs
- structuredEntities: {people: [], organizations: [], locations: [], dates: []}
- relevance: 0-10 score`;
                const jsonStr = await llm.callModel(prompt, 'You are an expert email analyst. Output valid JSON only.', 'gpt-5', true);

                if (jsonStr) {
                    const analysis = JSON.parse(jsonStr) as any;
                    const isSearch = tokens.length > 0;
                    if (!isSearch && typeof analysis.relevance === 'number' && analysis.relevance < 0.3) {
                        // For general runs, skip very low relevance; for explicit searches keep everything.
                        continue;
                    }
                    // Lightweight domain extraction: travel
                    const travelDetails = this.extractTravelDetails(email, body);
                    const result: EmailAnalysisResult = {
                        emailId: email.id,
                        summary: analysis.summary,
                        actions: analysis.actions || [],
                        entities: [
                            ...(analysis.structuredEntities?.people || []),
                            ...(analysis.structuredEntities?.organizations || [])
                        ], // Flatten for backward compatibility
                        relevance: analysis.relevance,
                        answer: analysis.answer,
                        key_facts: analysis.key_facts,
                        structuredEntities: analysis.structuredEntities,
                        ...(travelDetails ? { travelDetails } : {})
                    };

                    // 3. Save to DB
                    updateStmt.run(JSON.stringify(result), email.id);
                    results.push(result);
                    console.log(`[${this.name}] Analyzed ${email.id}: ${analysis.summary.substring(0, 50)}...`);
                }
            } catch (error) {
                console.error(`[${this.name}] Failed to analyze ${email.id} `, error);
            }
        }

        return { analyses: results };
    }

    private decodeBase64Url(data: string): string {
        // Gmail returns base64url; normalize so Buffer can decode consistently.
        const normalized = data.replace(/-/g, '+').replace(/_/g, '/');
        const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
        return Buffer.from(padded, 'base64').toString('utf-8');
    }

    private extractBody(msg: any): string {
        if (!msg) return '';
        // Simple body extraction (text/plain preferred)
        let body = '';
        if (msg.payload?.body?.data) {
            body = this.decodeBase64Url(msg.payload.body.data);
        } else if (msg.payload?.parts) {
            const part = msg.payload.parts.find((p: any) => p.mimeType === 'text/plain') || msg.payload.parts[0];
            if (part?.body?.data) {
                body = this.decodeBase64Url(part.body.data);
            }
        }
        return body || msg.snippet || '';
    }

    private async ensureGmail() {
        if (this.gmail) return;
        const { GmailClient } = require('../../gmail/src/gmailClient');
        this.gmail = new GmailClient();
    }

    private async getFullText(email: EmailMetadata): Promise<string> {
        if (this.bodyCache.has(email.id)) return this.bodyCache.get(email.id)!;
        await this.ensureGmail();
        const msg = await this.gmail.getMessage(email.id);
        const body = this.extractBody(msg);
        const text = `From: ${email.from} \nSubject: ${email.subject} \n${body || email.snippet || ''} `;
        this.bodyCache.set(email.id, text);
        return text;
    }

    private extractTravelDetails(email: EmailMetadata, text: string) {
        const lower = text.toLowerCase();
        const subjLower = (email.subject || '').toLowerCase();
        const looksTravel =
            this.travelKeywords.some(k => lower.includes(k) || subjLower.includes(k)) ||
            this.airlineHintRegex.test(text) ||
            /[A-Z0-9]{6}/.test(text);
        if (!looksTravel) return null;

        // Confirmation / PNR
        let pnr: string | undefined;
        const pnrMatch = text.match(/(confirmation|record locator|pnr)[^\w]{0,6}([A-Z0-9]{6})/i)
            || text.match(/\b([A-Z0-9]{6})\b/);
        if (pnrMatch) {
            pnr = pnrMatch[pnrMatch.length - 1];
        }

        // Passenger names (very lightweight; capture capitalized words before comma/newline)
        const passengerMatches = Array.from(text.matchAll(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\b/g))
            .map(m => m[1])
            .filter(name => name.length < 40);
        const passengers = Array.from(new Set(passengerMatches)).slice(0, 3);

        // Legs: detect simple "ATL - SFO" or "ATL→SFO" patterns
        const legRegex = /\b([A-Z]{3})\s*(?:-|–|—|→|to)\s*([A-Z]{3})\b/g;
        const legs: Array<{ from?: string; to?: string; departTime?: string; arriveTime?: string; flight?: string; date?: string }> = [];
        for (const m of text.matchAll(legRegex)) {
            legs.push({ from: m[1], to: m[2] });
        }

        // Flight number
        const flightMatch = text.match(/\b([A-Z]{2,3}\s?\d{2,4})\b/);
        const flight = flightMatch ? flightMatch[1].replace(/\s+/, ' ') : undefined;

        return {
            pnr,
            passengers: passengers.length ? passengers : undefined,
            legs: legs.length ? legs : undefined,
            flight,
            confirmationNumber: pnr,
        };
    }
}
