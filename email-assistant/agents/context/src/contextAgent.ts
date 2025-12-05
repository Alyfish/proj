import { Agent, EmailMetadata, UserGoal, EmailInteraction, BehaviorInsight, EmailGoalLink, ContextOutput } from '@email-assistant/common/src/types';
import { db } from '@email-assistant/common/src/db';
import { llm } from '@email-assistant/common/src/llm';

interface ContextInput {
    userId: string;
    emails: EmailMetadata[];
    recentInteractions?: EmailInteraction[];
}


interface InteractionPattern {
    sender: string;
    openCount: number;
    totalDuration: number;
    replyRate: number;
}

interface TopicCluster {
    keywords: string[];
    emailIds: string[];
    frequency: number;
}

export class ContextAgent implements Agent<ContextInput, ContextOutput> {
    name = 'ContextAgent';

    async run(input: ContextInput): Promise<ContextOutput> {
        console.log(`[${this.name}] Analyzing context for user ${input.userId}...`);

        // 1. Get active goals from DB
        const activeGoals = this.getActiveGoals(input.userId);

        // 2. Analyze interaction patterns
        const patterns = await this.analyzeInteractionPatterns(input.userId);

        // 3. Infer new goals from patterns (if confidence is high enough)
        const inferredGoals = await this.inferGoalsFromBehavior(input.userId, patterns);

        // 4. Link emails to goals
        const emailGoalRelevance = await this.linkEmailsToGoals(input.emails, [...activeGoals, ...inferredGoals]);

        // 5. Generate insights
        const insights = this.generateInsights(patterns);

        console.log(`[${this.name}] Found ${activeGoals.length} active goals, inferred ${inferredGoals.length} new goals`);

        return {
            activeGoals: [...activeGoals, ...inferredGoals],
            emailGoalRelevance,
            behaviorInsights: insights
        };
    }

    private getActiveGoals(userId: string): UserGoal[] {
        const rows = db.prepare(`
      SELECT id, user_id, goal_text, status, confidence, source, created_at, updated_at
      FROM user_goals
      WHERE user_id = ? AND status = 'active'
      ORDER BY confidence DESC, created_at DESC
    `).all(userId) as any[];

        return rows.map(row => ({
            id: row.id,
            userId: row.user_id,
            goalText: row.goal_text,
            status: row.status,
            confidence: row.confidence,
            source: row.source,
            createdAt: row.created_at,
            updatedAt: row.updated_at
        }));
    }

    private async analyzeInteractionPatterns(userId: string): Promise<InteractionPattern[]> {
        // Get interaction stats by sender
        const rows = db.prepare(`
      SELECT 
        e.sender,
        COUNT(DISTINCT i.id) as open_count,
        SUM(COALESCE(i.duration_seconds, 0)) as total_duration,
        SUM(CASE WHEN i.interaction_type = 'reply' THEN 1 ELSE 0 END) as reply_count
      FROM email_interactions i
      JOIN emails e ON i.email_id = e.id
      WHERE i.user_id = ?
      GROUP BY e.sender
      HAVING open_count > 2
      ORDER BY open_count DESC
      LIMIT 10
    `).all(userId) as any[];

        return rows.map(row => ({
            sender: row.sender,
            openCount: row.open_count,
            totalDuration: row.total_duration,
            replyRate: row.reply_count / row.open_count
        }));
    }

    private async inferGoalsFromBehavior(userId: string, patterns: InteractionPattern[]): Promise<UserGoal[]> {
        if (patterns.length === 0) {
            return [];
        }

        // Get topic clusters from recent emails
        const topicClusters = await this.detectTopicClusters(userId);

        // Use LLM to infer goals
        const prompt = `
Analyze these email interaction patterns and infer the user's current goals.

Top senders by interaction:
${patterns.slice(0, 5).map(p => `- ${p.sender} (${p.openCount} opens, ${Math.round(p.totalDuration / 60)} min total, ${Math.round(p.replyRate * 100)}% reply rate)`).join('\n')}

Topic clusters:
${topicClusters.slice(0, 5).map(c => `- ${c.keywords.join(', ')} (${c.frequency} emails)`).join('\n')}

Return JSON with inferred goals (only if confidence > 0.6):
{
  "goals": [
    {
      "goal_text": "Complete Q4 financial report",
      "confidence": 0.85,
      "evidence": "Multiple opens and long read time on Q4 report emails"
    }
  ]
}
`;

        try {
            const response = await llm.callModel(
                prompt,
                'You are a goal inference assistant. Only infer goals with high confidence (>0.6). Return valid JSON only.',
                'gpt-5',
                true
            );

            if (!response) return [];

            const parsed = JSON.parse(response);
            const goals: UserGoal[] = [];

            for (const g of parsed.goals || []) {
                if (g.confidence >= 0.6) {
                    // Insert into DB
                    const result = db.prepare(`
            INSERT INTO user_goals (user_id, goal_text, status, confidence, source)
            VALUES (?, ?, 'active', ?, 'inferred')
          `).run(userId, g.goal_text, g.confidence);

                    goals.push({
                        id: Number(result.lastInsertRowid),
                        userId,
                        goalText: g.goal_text,
                        status: 'active',
                        confidence: g.confidence,
                        source: 'inferred'
                    });
                }
            }

            return goals;
        } catch (error) {
            console.error(`[${this.name}] Failed to infer goals:`, error);
            return [];
        }
    }

    private async detectTopicClusters(userId: string): Promise<TopicCluster[]> {
        // Simple keyword extraction from recent emails
        const rows = db.prepare(`
      SELECT id, subject
      FROM emails
      WHERE user_id = ?
      ORDER BY received_at DESC
      LIMIT 50
    `).all(userId) as any[];

        // Group by common keywords (simple implementation)
        const keywordMap = new Map<string, string[]>();

        for (const row of rows) {
            const words = row.subject.toLowerCase()
                .split(/\s+/)
                .filter((w: string) => w.length > 4); // Filter short words

            for (const word of words) {
                if (!keywordMap.has(word)) {
                    keywordMap.set(word, []);
                }
                keywordMap.get(word)!.push(row.id);
            }
        }

        // Convert to clusters
        const clusters: TopicCluster[] = [];
        for (const [keyword, emailIds] of keywordMap.entries()) {
            if (emailIds.length >= 3) {
                clusters.push({
                    keywords: [keyword],
                    emailIds,
                    frequency: emailIds.length
                });
            }
        }

        return clusters.sort((a, b) => b.frequency - a.frequency);
    }

    private async linkEmailsToGoals(emails: EmailMetadata[], goals: UserGoal[]): Promise<Map<string, number[]>> {
        const emailGoalMap = new Map<string, number[]>();

        for (const email of emails) {
            const linkedGoals: number[] = [];

            for (const goal of goals) {
                // Simple keyword matching for relevance
                const emailText = `${email.subject} ${email.snippet}`.toLowerCase();
                const goalKeywords = goal.goalText.toLowerCase().split(/\s+/);

                let matchCount = 0;
                for (const keyword of goalKeywords) {
                    if (keyword.length > 3 && emailText.includes(keyword)) {
                        matchCount++;
                    }
                }

                const relevanceScore = matchCount / goalKeywords.length;

                if (relevanceScore > 0.3 && goal.id) {
                    linkedGoals.push(goal.id);

                    // Store link in DB
                    db.prepare(`
            INSERT OR REPLACE INTO email_goal_links (email_id, goal_id, relevance_score)
            VALUES (?, ?, ?)
          `).run(email.id, goal.id, relevanceScore);
                }
            }

            if (linkedGoals.length > 0) {
                emailGoalMap.set(email.id, linkedGoals);
            }
        }

        return emailGoalMap;
    }

    private generateInsights(patterns: InteractionPattern[]): BehaviorInsight[] {
        const insights: BehaviorInsight[] = [];

        // Insight 1: Top senders
        if (patterns.length > 0) {
            insights.push({
                type: 'sender_frequency',
                description: `You interact most with: ${patterns.slice(0, 3).map(p => p.sender).join(', ')}`,
                confidence: 0.9,
                data: patterns.slice(0, 3)
            });
        }

        // Insight 2: High engagement senders
        const highEngagement = patterns.filter(p => p.replyRate > 0.5);
        if (highEngagement.length > 0) {
            insights.push({
                type: 'sender_frequency',
                description: `High reply rate with: ${highEngagement.map(p => p.sender).join(', ')}`,
                confidence: 0.85,
                data: highEngagement
            });
        }

        return insights;
    }
}
