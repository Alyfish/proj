import { EmailRetrievalAgent } from '../../agents/gmail/src/retrievalAgent';
import { ContextAgent } from '../../agents/context/src/contextAgent';
import { PrioritizationAgent } from '../../agents/prioritizer/src/prioritizationAgent';
import { AnalysisAgent } from '../../agents/analyzer/src/analysisAgent';
import { SuggestionAgent } from '../../agents/suggester/src/suggestionAgent';
import { db } from '@email-assistant/common/src/db';
import { EmailMetadata } from '@email-assistant/common/src/types';

type IntentType = 'search' | 'reply' | 'process';

export async function runBatchForUser(
    userId: string,
    opts?: { searchQuery?: string; maxAnalyze?: number; intent?: IntentType; maxRetrieve?: number; quickMode?: boolean }
) {
    console.log(`\n=== Starting Batch Run for User ${userId} ===`);

    // 0. Record Run Start
    const runResult = db.prepare("INSERT INTO runs (user_id, status) VALUES (?, 'started')").run(userId);
    const runId = runResult.lastInsertRowid;

    try {
        // 1. Retrieval
        const retrievalAgent = new EmailRetrievalAgent();
        const retrievalResult = await retrievalAgent.run({
            userId,
            searchQuery: opts?.searchQuery,
            maxResults: opts?.maxRetrieve ?? (opts?.searchQuery ? 200 : 50),
            forceAll: !!opts?.searchQuery, // search intent: ignore last-run window
        });

        let workingEmails: EmailMetadata[] = retrievalResult.emails;

        // If a search query was provided but nothing new was fetched, fall back to cached emails
        if (workingEmails.length === 0 && opts?.searchQuery) {
            const rows = db.prepare(`
                SELECT id, thread_id as threadId, sender as "from", subject, snippet, received_at as receivedAt, labels
                FROM emails
                WHERE user_id = ? AND received_at >= datetime('now', '-30 days')
                ORDER BY received_at DESC
                LIMIT ?
            `).all(userId, opts?.maxRetrieve ?? 250) as any[];

            workingEmails = rows.map(row => ({
                id: row.id,
                threadId: row.threadId,
                from: row.from,
                to: [],
                subject: row.subject,
                snippet: row.snippet,
                receivedAt: row.receivedAt,
                labels: row.labels ? JSON.parse(row.labels) : [],
            }));
            console.log(`[runBatch] Using ${workingEmails.length} cached emails for query processing.`);
        }

        if (workingEmails.length === 0) {
            console.log('No emails to process (new or cached).');
            db.prepare("UPDATE runs SET status = 'completed', completed_at = CURRENT_TIMESTAMP WHERE id = ?").run(runId);
            return [];
        }

        // 2. Context Analysis
        const contextAgent = new ContextAgent();
        const contextResult = await contextAgent.run({
            userId,
            emails: workingEmails
        });

        // 3. Prioritization
        const prioritizationAgent = new PrioritizationAgent();
        const prioritized = await prioritizationAgent.run({
            userId,
            emails: workingEmails,
            context: contextResult,
            searchQuery: opts?.searchQuery,
        });

        // 3b. Thread grouping: keep only the most recent email per thread to avoid redundant analyses
        const byThread = new Map<string, EmailMetadata & { priority: 'high' | 'medium' | 'low' }>();
        for (const email of prioritized.emails) {
            if (!email.threadId) {
                byThread.set(email.id, email);
                continue;
            }
            const existing = byThread.get(email.threadId);
            if (!existing) {
                byThread.set(email.threadId, email);
            } else {
                const existingDate = new Date(existing.receivedAt).getTime();
                const currentDate = new Date(email.receivedAt).getTime();
                if (currentDate > existingDate) {
                    byThread.set(email.threadId, email);
                }
            }
        }
        const dedupedEmails = Array.from(byThread.values());

        // Quick mode: return early with prioritized emails only
        if (opts?.quickMode) {
            console.log(`[runBatch] Quick mode: returning ${dedupedEmails.length} prioritized emails without analysis`);
            db.prepare("UPDATE runs SET status = 'completed', completed_at = CURRENT_TIMESTAMP, metadata = ? WHERE id = ?")
                .run(JSON.stringify({ quickMode: true, emailCount: dedupedEmails.length }), runId);

            return {
                suggestions: [],
                context: contextResult,
                quickMode: true
            };
        }

        // 4. Analysis
        const analysisAgent = new AnalysisAgent();
        const analyzed = await analysisAgent.run({
            userId,
            emails: dedupedEmails,
            searchQuery: opts?.searchQuery,
            maxAnalyze: opts?.maxAnalyze ?? 5,
            intent: opts?.intent ?? 'search',
        });

        // 5. Suggestions
        const suggestionAgent = new SuggestionAgent();
        const suggestionResult = await suggestionAgent.run({
            userId,
            analyses: analyzed.analyses,
            intent: opts?.intent ?? 'search',
        });

        // 6. Record Completion
        db.prepare("UPDATE runs SET status = 'completed', completed_at = CURRENT_TIMESTAMP, metadata = ? WHERE id = ?")
            .run(JSON.stringify({ suggestionsCount: suggestionResult.suggestions.length }), runId);

        console.log(`=== Batch Run Completed. Generated ${suggestionResult.suggestions.length} suggestions. ===\n`);
        return {
            suggestions: suggestionResult.suggestions,
            context: contextResult
        };

    } catch (error) {
        console.error('Batch Run Failed:', error);
        db.prepare("UPDATE runs SET status = 'failed', completed_at = CURRENT_TIMESTAMP, metadata = ? WHERE id = ?")
            .run(JSON.stringify({ error: String(error) }), runId);
        throw error;
    }
}
