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
        console.log(`[runBatch] Invoking LangGraph Agent for query: "${opts?.searchQuery || ''}"`);

        // Dynamic import to handle potential ESM/CJS interop issues if any, or just standard import
        const { runAgent } = require('@email-assistant/agent-langgraph');

        const result = await runAgent(opts?.searchQuery || "Summarize recent important emails");

        // 1. Persist Fetched Emails
        const emails = result.emails || [];
        console.log(`[runBatch] Graph returned ${emails.length} emails. Persisting to DB...`);

        const insertStmt = db.prepare(`
            INSERT OR IGNORE INTO emails (id, user_id, thread_id, sender, subject, snippet, received_at, labels, processed)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
        `);

        for (const email of emails) {
            // Map LangGraph Email to DB schema
            // LangGraph Email: { id, subject, from, to, timestamp, snippet, body, labels }
            // DB expectations: thread_id (missing in simplified type, use id or blank), received_at (ISO string)

            insertStmt.run(
                email.id,
                userId,
                email.id, // simplified: usage id as thread_id fallback
                email.from,
                email.subject,
                email.snippet,
                new Date(email.timestamp).toISOString(),
                JSON.stringify(email.labels || [])
            );
        }

        // 2. Persist Priorities
        const prioritized = result.prioritized_emails || [];
        console.log(`[runBatch] Marking ${prioritized.length} emails as HIGH priority.`);

        const priorityStmt = db.prepare('UPDATE emails SET priority = ? WHERE id = ?');
        const updateTransaction = db.transaction((ids: string[]) => {
            // Reset all processed in this batch/window? 
            // Ideally we only update the ones returned as prioritized.
            // We set them to 'high'. The rest remain as is (or default low/medium from previous?).
            // For now, explicitly marking the selected ones as high.
            for (const id of ids) {
                priorityStmt.run('high', id);
            }
        });
        updateTransaction(prioritized.map((e: any) => e.id));

        // 3. Persist Analysis/Summary
        // The LangGraph returns a global `analysis_result` string.
        // We can store this in the `runs` table metadata or return it directly.
        // The UI expects per-email analysis for cards.
        // We can create a "fake" analysis entry for the top prioritized email to show the summary? 
        // OR simply return it in the text output.

        const metadata = {
            suggestionsCount: result.suggestions?.length || 0,
            langGraphOutput: result.analysis_result,
            keywords: result.keywords
        };

        // 6. Record Completion
        db.prepare("UPDATE runs SET status = 'completed', completed_at = CURRENT_TIMESTAMP, metadata = ? WHERE id = ?")
            .run(JSON.stringify(metadata), runId);

        console.log(`=== Batch Run Completed (LangGraph). Generated ${result.suggestions?.length || 0} suggestions. ===\n`);

        // Return structure compatible with server.ts expectation, plus the new output
        return {
            suggestions: result.suggestions?.map((s: any) => ({
                type: 'task',
                title: s.title,
                details: s.details,
                priority: s.priority
            })) || [],
            context: undefined, // Context is internal to graph
            langGraphOutput: result.analysis_result
        };

    } catch (error) {
        console.error('Batch Run Failed:', error);
        db.prepare("UPDATE runs SET status = 'failed', completed_at = CURRENT_TIMESTAMP, metadata = ? WHERE id = ?")
            .run(JSON.stringify({ error: String(error) }), runId);
        throw error;
    }
}
