import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
import express, { Request, Response } from 'express';
import cors from 'cors';
import { runBatchForUser } from './runBatch';
import { db } from '@email-assistant/common/src/db';
import { TextFormatter, EmailProcessingResult } from '@email-assistant/sidebar-integration';
import { EmailPriority, EmailAnalysis, SuggestionItem } from '@email-assistant/common/src/types';

const app = express();
const PORT = 3001;

// Middleware
app.use(cors());
app.use(express.json());

const textFormatter = new TextFormatter();

type IntentType = 'search' | 'reply' | 'process';

const classifyIntent = (query: string | undefined): { intent: IntentType; normalizedQuery?: string } => {
    if (!query) return { intent: 'search', normalizedQuery: undefined };
    const q = query.toLowerCase();
    const replyTriggers = ['reply', 'respond', 'draft', 'follow up', 'follow-up', 'response'];
    const isReply = replyTriggers.some(t => q.includes(t));
    return {
        intent: isReply ? 'reply' : 'search',
        normalizedQuery: query.trim(),
    };
};

// Health check endpoint
app.get('/api/health', (req: Request, res: Response) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Process emails endpoint
app.post('/api/process', async (req: Request, res: Response) => {
    try {
        const { userId, query, searchQuery, quick } = req.body;
        const effectiveQuery = query || searchQuery;
        const intent = classifyIntent(effectiveQuery);

        if (!userId) {
            return res.status(400).json({
                error: 'Missing userId',
                message: 'Please provide a userId in the request body'
            });
        }

        console.log(`[API] Processing emails for user: ${userId}`);

        // Ensure user exists to satisfy FK constraints
        const existingUser = db.prepare('SELECT id FROM users WHERE id = ?').get(userId) as { id: string } | undefined;
        if (!existingUser) {
            const email = req.body.email || `${userId}@example.com`;
            db.prepare('INSERT OR IGNORE INTO users (id, email) VALUES (?, ?)').run(userId, email);
            console.log(`[API] Created user record for ${userId} (${email})`);
        }

        // When the user asks a specific query, we want to re-run analysis with fresh embeddings.
        // Do a light reset (drop embeddings, mark unprocessed) but keep existing rows so the UI never goes empty if retrieval finds nothing.
        if (intent.normalizedQuery) {
            console.log(`[API] Resetting embeddings for user ${userId} to reprocess with query "${intent.normalizedQuery}"`);
            db.prepare('DELETE FROM email_embeddings WHERE email_id IN (SELECT id FROM emails WHERE user_id = ?)').run(userId);
            db.prepare('UPDATE emails SET processed = 0 WHERE user_id = ?').run(userId);
        }

        // Run the email assistant pipeline
        const batchResult = await runBatchForUser(userId, {
            searchQuery: intent.normalizedQuery,
            maxAnalyze: intent.intent === 'reply' ? 2 : 5, // Reduced from 3 and 12
            maxRetrieve: intent.intent === 'reply' ? 80 : 250,
            intent: intent.intent,
            quickMode: quick === true
        });

        const suggestions = Array.isArray(batchResult) ? batchResult : batchResult.suggestions;
        const context = (Array.isArray(batchResult) ? undefined : batchResult.context) as any;
        const langGraphOutput = (batchResult as any).langGraphOutput; // Extract LangGraph output


        // Fetch priorities and analyses from database for the latest run
        const latestRun = db.prepare(`
            SELECT id FROM runs 
            WHERE user_id = ? AND status = 'completed'
            ORDER BY started_at DESC 
            LIMIT 1
        `).get(userId) as { id: number } | undefined;

        // Legacy Agent Output Handling (Removed)
        // LangGraph now handles this logic. We don't need to separately fetch priorities, analyses, or suggestions from DB
        // as they are either returned by the agent or essentially replaced by the single-pass analysis.

        const priorities: EmailPriority[] = []; // Will be populated from recentEmails
        const analyses: EmailAnalysis[] = [];   // LangGraph produces a summary, not per-email analysis objects

        // Get recent emails from this run
        // For LangGraph integration: use the prioritized emails from the current run
        let recentEmails: any[] = [];

        // Use the prioritized emails returned directly from LangGraph
        const prioritizedFromRun = (batchResult as any).prioritizedEmails || [];

        if (prioritizedFromRun.length > 0) {
            // Map LangGraph Email format to the format expected by UI
            recentEmails = prioritizedFromRun.slice(0, 5).map((email: any) => ({
                id: email.id,
                subject: email.subject,
                snippet: email.snippet || email.body?.substring(0, 100) || '',
                sender: email.from,
                receivedAt: email.timestamp,
                priority: 'high' // These are the prioritized ones
            }));

            // Populate priorities list from the prioritized emails for stats/UI
            recentEmails.forEach(email => {
                priorities.push({
                    emailId: email.id,
                    user_id: userId,
                    priority: 'high',
                    created_at: new Date(),
                    updated_at: new Date()
                } as any);
            });

            console.log(`[API] Using ${recentEmails.length} prioritized emails from LangGraph run.`);
        } else {
            // Fallback to latest emails from DB if no prioritized emails
            recentEmails = db.prepare(`
                SELECT id, subject, snippet, sender, received_at as receivedAt, priority
                FROM emails
                WHERE user_id = ?
                ORDER BY received_at DESC
                LIMIT 5
            `).all(userId) as any[];
            console.log(`[API] Fallback: Using ${recentEmails.length} recent emails from DB.`);
        }

        // Format as text
        const result: EmailProcessingResult = {
            priorities,
            analyses,
            suggestions: suggestions.map((s: any) => {
                // Handle both string format (from deep analyzer) and object format (from shallow analyzer)
                if (typeof s === 'string') {
                    return {
                        type: 'action',
                        priority: 2,
                        title: s,
                        description: '',
                        relatedEmailIds: []
                    };
                } else {
                    return {
                        type: s.type || 'action',
                        priority: s.priority === 'high' ? 1 : s.priority === 'medium' ? 2 : 3,
                        title: s.title || '',
                        description: s.details || s.description || '',
                        relatedEmailIds: []
                    };
                }
            }),
            processedAt: new Date(),
            recentEmails,
            searchQuery: intent.normalizedQuery
        };

        let textOutput = "";
        if (langGraphOutput) {
            textOutput = langGraphOutput;
        } else {
            textOutput = textFormatter.formatResult(result);
        }
        const quickStatus = textFormatter.formatQuickStatus(
            priorities.length,
            suggestions.length
        );

        // Estimate token usage
        const TOKEN_BUDGET = 10000;
        let estimatedTokens = 0;

        // Estimate tokens from analyses (rough approximation)
        analyses.forEach((analysis: any) => {
            const analysisText = JSON.stringify(analysis);
            estimatedTokens += Math.ceil(analysisText.length / 4);
        });

        // Add prompt overhead estimate (~500 tokens per email analyzed)
        estimatedTokens += analyses.length * 500;

        res.json({
            success: true,
            textOutput,
            quickStatus,
            tokensUsed: estimatedTokens,
            tokenBudget: TOKEN_BUDGET,
            tokenEfficiency: estimatedTokens > 0 ? Math.round((1 - estimatedTokens / TOKEN_BUDGET) * 100) : 100,
            data: {
                emailsProcessed: priorities.length,
                suggestionsGenerated: suggestions.length,
                highPriority: priorities.filter(p => p.priority === 'high').length,
                mediumPriority: priorities.filter(p => p.priority === 'medium').length,
                lowPriority: priorities.filter(p => p.priority === 'low').length,
                recentEmails,
                analyses,
                suggestions,
                intent: intent.intent,
                query: intent.normalizedQuery,
                activeGoals: (context && context.activeGoals) || [],
                emailGoalRelevance: (context && context.emailGoalRelevance) ? Object.fromEntries(context.emailGoalRelevance) : {}
            }
        });

    } catch (error) {
        console.error('[API] Error processing emails:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to process emails',
            message: error instanceof Error ? error.message : String(error)
        });
    }
});

// Get processing status endpoint
app.get('/api/status', (req: Request, res: Response) => {
    try {
        const { userId } = req.query;

        if (!userId || typeof userId !== 'string') {
            return res.status(400).json({
                error: 'Missing userId',
                message: 'Please provide a userId as a query parameter'
            });
        }

        // Get latest run info
        const latestRun = db.prepare(`
            SELECT id, status, started_at AS created_at, completed_at, metadata
            FROM runs 
            WHERE user_id = ? 
            ORDER BY started_at DESC 
            LIMIT 1
        `).get(userId) as any;

        if (!latestRun) {
            return res.json({
                hasRun: false,
                message: 'No processing runs found for this user'
            });
        }

        const metadata = latestRun.metadata ? JSON.parse(latestRun.metadata) : {};

        res.json({
            hasRun: true,
            status: latestRun.status,
            createdAt: latestRun.created_at,
            completedAt: latestRun.completed_at,
            suggestionsCount: metadata.suggestionsCount || 0
        });

    } catch (error) {
        console.error('[API] Error getting status:', error);
        res.status(500).json({
            error: 'Failed to get status',
            message: error instanceof Error ? error.message : String(error)
        });
    }
});

// Start server
// Increase server timeout to 5 minutes to match client
const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🚀 Email Assistant API Server running on http://localhost:${PORT}`);
    console.log(`📊 Health check: http://localhost:${PORT}/api/health`);
    console.log(`📧 Process emails: POST http://localhost:${PORT}/api/process`);
    console.log(`📈 Status check: GET http://localhost:${PORT}/api/status?userId=<userId>\n`);
});
server.setTimeout(300000);

export default app;
