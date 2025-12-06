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
        const context = Array.isArray(batchResult) ? undefined : batchResult.context;

        // Fetch priorities and analyses from database for the latest run
        const latestRun = db.prepare(`
            SELECT id FROM runs 
            WHERE user_id = ? AND status = 'completed'
            ORDER BY started_at DESC 
            LIMIT 1
        `).get(userId) as { id: number } | undefined;

        // Fetch email priorities
        const priorities = db.prepare(`
            SELECT id as emailId, priority, '' as reason
            FROM emails 
            WHERE user_id = ? 
            ORDER BY received_at DESC 
            LIMIT 50
        `).all(userId) as EmailPriority[];

        // Enrich priorities with context reasons
        if (context) {
            priorities.forEach(p => {
                const goalIds = context.emailGoalRelevance.get(p.emailId);
                if (goalIds && goalIds.length > 0) {
                    const goals = context.activeGoals.filter(g => goalIds.includes(g.id!));
                    const bestGoal = goals.sort((a, b) => b.confidence - a.confidence)[0];
                    if (bestGoal) {
                        p.reason = `Related to: ${bestGoal.goalText}`;
                    }
                }
            });
        }

        // Fetch analyses
        const analyses = db.prepare(`
            SELECT id as emailId, analysis 
            FROM emails 
            WHERE user_id = ? AND analysis IS NOT NULL
            ORDER BY received_at DESC 
            LIMIT 50
        `).all(userId).map((row: any) => {
            const parsed = JSON.parse(row.analysis);
            return {
                emailId: row.emailId,
                summary: parsed.summary || '',
                actionItems: parsed.actions?.map((a: any) => a.description) || [],
                deadline: parsed.actions?.[0]?.dueDate,
                entities: parsed.entities || [],
                relevance: parsed.relevance,
                travelDetails: parsed.travelDetails,
                answer: parsed.answer,
                key_facts: parsed.key_facts,
                structuredEntities: parsed.structuredEntities
            } as any;
        });

        // Prefer to show emails that were actually analyzed and most relevant to the query
        const rankedAnalysisIds = analyses
            .sort((a: any, b: any) => (b.relevance ?? 0) - (a.relevance ?? 0))
            .map((a: any) => a.emailId);

        let recentEmails: any[] = [];
        if (rankedAnalysisIds.length > 0) {
            const placeholders = rankedAnalysisIds.slice(0, 8).map(() => '?').join(',');
            recentEmails = db.prepare(`
                SELECT id, subject, snippet, sender, received_at as receivedAt, priority
                FROM emails
                WHERE user_id = ?
                AND id IN (${placeholders})
            `).all(userId, ...rankedAnalysisIds.slice(0, 8)) as any[];
            // Preserve original relevance order
            const orderMap = new Map<string, number>();
            rankedAnalysisIds.slice(0, 8).forEach((id: string, idx: number) => orderMap.set(id, idx));
            recentEmails.sort((a, b) => (orderMap.get(a.id) ?? 0) - (orderMap.get(b.id) ?? 0));
        }

        // Fallback to latest emails if no analyses yet
        if (recentEmails.length === 0) {
            recentEmails = db.prepare(`
                SELECT id, subject, snippet, sender, received_at as receivedAt, priority
                FROM emails
                WHERE user_id = ?
                ORDER BY received_at DESC
                LIMIT 5
            `).all(userId) as any[];
        }

        // Format as text
        const result: EmailProcessingResult = {
            priorities,
            analyses,
            suggestions: suggestions.map(s => ({
                type: s.type === 'task' ? 'action' : s.type,
                priority: s.priority === 'high' ? 1 : s.priority === 'medium' ? 2 : 3,
                title: s.title,
                description: s.details,
                relatedEmailIds: s.sourceEmailId ? [s.sourceEmailId] : []
            })),
            processedAt: new Date(),
            recentEmails,
            searchQuery: intent.normalizedQuery
        };

        const textOutput = textFormatter.formatResult(result);
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
                activeGoals: context?.activeGoals || [],
                emailGoalRelevance: context ? Object.fromEntries(context.emailGoalRelevance) : {}
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
