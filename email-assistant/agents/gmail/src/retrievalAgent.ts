import { Agent, EmailMetadata } from '@email-assistant/common/src/types';
import { GmailClient } from './gmailClient';
import { db } from '@email-assistant/common/src/db';

interface EmailRetrievalInput {
    userId: string;
    forceAll?: boolean;
    searchQuery?: string;
    maxResults?: number;
}

interface EmailRetrievalOutput {
    emails: EmailMetadata[];
}

export class EmailRetrievalAgent implements Agent<EmailRetrievalInput, EmailRetrievalOutput> {
    name = 'EmailRetrievalAgent';
    private gmail: GmailClient;

    constructor() {
        this.gmail = new GmailClient();
    }

    async run(input: EmailRetrievalInput): Promise<EmailRetrievalOutput> {
        console.log(`[${this.name}] Starting retrieval for user ${input.userId}...`);

        // 1. Determine query window
        let query = 'label:INBOX';

        if (!input.forceAll) {
            const lastRun = db.prepare(`
        SELECT started_at FROM runs 
        WHERE user_id = ? AND status = 'completed' 
        ORDER BY started_at DESC LIMIT 1
      `).get(input.userId) as { started_at: string } | undefined;

            if (lastRun) {
                const lastRunDate = new Date(lastRun.started_at);
                const seconds = Math.floor(lastRunDate.getTime() / 1000);
                query += ` after:${seconds}`;
                console.log(`[${this.name}] Fetching emails since ${lastRun.started_at}`);
            } else {
                console.log(`[${this.name}] No previous run found. Fetching recent emails (default 1d).`);
                query += ` newer_than:1d`;
            }
        } else {
            // For search queries, avoid restrictive windows
            console.log(`[${this.name}] Force all mode: no time window applied.`);
        }

        // 2. Fetch messages from Gmail
        if (input.searchQuery) {
            // Use LLM to extract keywords/filters from natural language query
            // This is better than passing the raw sentence which Gmail search often fails on
            const prompt = `
            Convert this natural language query into a BROAD Gmail search query.
            Query: "${input.searchQuery}"
            
            Rules:
            1. Return ONLY the search string.
            2. Use 'OR' between keywords to maximize results.
            3. If a sender name is multi-word, use quotes (e.g. from:"Angel Squad").
            4. Do NOT use 'subject:' unless the user explicitly asks for it. Just use the keywords directly to search body text too.
            5. If the user mentions a name like "Brian", search for it as a keyword OR a sender (e.g. "Brian" OR from:Brian).
            6. Example: "emails from angel squad about investment" -> 'from:"Angel Squad" (investment OR investing)'
            `;

            let cleanQuery = input.searchQuery.trim();
            try {
                const { llm } = require('@email-assistant/common/src/llm');
                const refinedQuery = await llm.callModel(prompt, 'You are a Gmail search expert. Output only the query string.', 'gpt-4o-mini');

                if (refinedQuery) {
                    cleanQuery = refinedQuery.replace(/^"|"$/g, '').trim();
                    query += ` ${cleanQuery}`;
                    console.log(`[${this.name}] Refined search query: "${input.searchQuery}" -> "${cleanQuery}"`);
                } else {
                    // Fallback to simple keyword extraction
                    const keywords = input.searchQuery.split(' ')
                        .filter(w => w.length > 3 && !['give', 'what', 'from', 'emails', 'about', 'that', 'this', 'should'].includes(w.toLowerCase()))
                        .join(' ');
                    query += ` ${keywords}`;
                    console.log(`[${this.name}] Fallback search query: ${keywords}`);
                }

                // Broaden known senders/brands for angel-investing searches
                const sq = input.searchQuery.toLowerCase();
                const angelHint = sq.includes('angel squad') || sq.includes('hustle fund') || sq.includes('brian');
                if (angelHint) {
                    query += ` ("Angel Squad" OR from:brian@hustlefund.vc OR "Hustle Fund" OR from:no-reply@notification.circle.so OR "Angel Investing")`;
                    console.log(`[${this.name}] Added Angel Squad sender/brand filters to broaden results.`);
                }

                // Keep searches recent by default (last 30d) unless user explicitly provided a time filter
                const hasTimeFilter = /\b(after:|newer_than:)/i.test(cleanQuery);
                if (!hasTimeFilter) {
                    query += ' newer_than:30d';
                    console.log(`[${this.name}] Added recency filter newer_than:30d for search.`);
                }
            } catch (e) {
                console.error(`[${this.name}] Failed to refine query, using raw input`, e);
                query += ` ${input.searchQuery}`;
            }
        }

        const maxResults = input.maxResults ?? (input.searchQuery ? 400 : 50);
        const messages = await this.gmail.listMessages(query, maxResults);
        console.log(`[${this.name}] Found ${messages.length} messages.`);

        const newEmails: EmailMetadata[] = [];
        const insertStmt = db.prepare(`
      INSERT OR IGNORE INTO emails (id, user_id, thread_id, sender, subject, snippet, received_at, labels, processed)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
    `);

        // 3. Fetch details and persist
        for (const msgStub of messages) {
            if (!msgStub.id) continue;

            // Check if exists to avoid unnecessary API call (though INSERT OR IGNORE handles DB side)
            const exists = db.prepare('SELECT id FROM emails WHERE id = ?').get(msgStub.id);
            if (exists) {
                // console.log(`[${this.name}] Skipped existing email ${msgStub.id}`);
                continue;
            }

            const fullMsg = await this.gmail.getMessage(msgStub.id);
            if (!fullMsg) continue;

            const headers = fullMsg.payload?.headers || [];
            const subject = headers.find(h => h.name === 'Subject')?.value || '(No Subject)';
            const from = headers.find(h => h.name === 'From')?.value || 'Unknown';
            const to = headers.find(h => h.name === 'To')?.value || '';
            const dateStr = headers.find(h => h.name === 'Date')?.value || new Date().toISOString();
            const receivedAt = new Date(dateStr).toISOString(); // Normalize date

            const metadata: EmailMetadata = {
                id: fullMsg.id!,
                threadId: fullMsg.threadId!,
                from,
                to: to.split(',').map(e => e.trim()),
                subject,
                snippet: fullMsg.snippet || '',
                receivedAt,
                labels: fullMsg.labelIds || [],
            };

            insertStmt.run(
                metadata.id,
                input.userId,
                metadata.threadId,
                metadata.from,
                metadata.subject,
                metadata.snippet,
                metadata.receivedAt,
                JSON.stringify(metadata.labels)
            );

            newEmails.push(metadata);
        }

        console.log(`[${this.name}] Retrieved and stored ${newEmails.length} new emails.`);
        return { emails: newEmails };
    }
}
