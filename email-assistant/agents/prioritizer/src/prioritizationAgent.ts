import { Agent, EmailMetadata, ContextOutput } from '@email-assistant/common/src/types';
import { db } from '@email-assistant/common/src/db';

interface PrioritizationInput {
    userId: string;
    emails: EmailMetadata[];
    context?: ContextOutput;
    searchQuery?: string;
}

interface PrioritizationOutput {
    emails: (EmailMetadata & { priority: 'high' | 'medium' | 'low' })[];
}

export class PrioritizationAgent implements Agent<PrioritizationInput, PrioritizationOutput> {
    name = 'PrioritizationAgent';

    async run(input: PrioritizationInput): Promise<PrioritizationOutput> {
        console.log(`[${this.name}] Prioritizing ${input.emails.length} emails...`);

        // Normalize search query tokens to allow intent-based boosting (general-purpose, not tied to any brand)
        const queryTokens = (input.searchQuery || '')
            .toLowerCase()
            .split(/\s+/)
            .filter(t => t.length > 2 && !['the', 'and', 'for', 'from', 'with', 'that', 'this', 'your', 'you'].includes(t));

        // 1. Fetch user preferences
        const userRow = db.prepare('SELECT preferences FROM users WHERE id = ?').get(input.userId) as { preferences: string } | undefined;

        let vipSenders: string[] = [];
        let urgentKeywords: string[] = ['urgent', 'asap', 'deadline', 'important', 'action required'];

        if (userRow && userRow.preferences) {
            try {
                const prefs = JSON.parse(userRow.preferences);
                if (prefs.vipSenders) vipSenders = prefs.vipSenders;
                if (prefs.urgentKeywords) urgentKeywords = [...urgentKeywords, ...prefs.urgentKeywords];
            } catch (e) {
                console.error(`[${this.name}] Failed to parse user preferences`, e);
            }
        }

        const prioritizedEmails = input.emails.map(email => {
            let score = 0;

            // Heuristic 1: VIP Sender (+3)
            if (vipSenders.some(vip => email.from.toLowerCase().includes(vip.toLowerCase()))) {
                score += 3;
            }

            // Heuristic 2: Urgent Keywords (+2)
            const subjectLower = email.subject.toLowerCase();
            if (urgentKeywords.some(kw => subjectLower.includes(kw))) {
                score += 2;
            }

            // Heuristic 3: Recency (< 12 hours) (+1)
            const hoursOld = (Date.now() - new Date(email.receivedAt).getTime()) / (1000 * 60 * 60);
            if (hoursOld < 12) {
                score += 1;
            }

            // Heuristic 3b: Intent-matched sender/subject boost based on the active query tokens (+2 per match)
            if (queryTokens.length) {
                const senderLower = email.from.toLowerCase();
                const subjLower = email.subject.toLowerCase();
                const hasSenderMatch = queryTokens.some(t => senderLower.includes(t));
                const hasSubjectMatch = queryTokens.some(t => subjLower.includes(t));
                if (hasSenderMatch) score += 2;
                if (hasSubjectMatch) score += 2;
            }

            // Heuristic 4: Context - Goal Relevance
            if (input.context) {
                const goalIds = input.context.emailGoalRelevance.get(email.id);
                if (goalIds && goalIds.length > 0) {
                    // Find the highest confidence goal linked to this email
                    const goals = input.context.activeGoals.filter(g => goalIds.includes(g.id!));
                    const bestGoal = goals.sort((a, b) => b.confidence - a.confidence)[0];

                    if (bestGoal) {
                        if (bestGoal.confidence >= 0.7) score += 4;
                        else score += 2;
                    }
                }

                // Heuristic 5: Context - Sender Engagement
                const senderInsight = input.context.behaviorInsights.find(i => i.type === 'sender_frequency');
                if (senderInsight && senderInsight.data) {
                    const patterns = senderInsight.data as any[]; // InteractionPattern[]
                    const pattern = patterns.find(p => p.sender === email.from);
                    if (pattern && pattern.replyRate > 0.5) {
                        score += 3;
                    }
                }
            }

            let priority: 'high' | 'medium' | 'low' = 'low';
            if (score >= 4) priority = 'high';
            else if (score >= 2) priority = 'medium';

            return { ...email, priority };
        });

        // 2. Update DB
        const updateStmt = db.prepare('UPDATE emails SET priority = ? WHERE id = ?');
        const updateTransaction = db.transaction((emails: typeof prioritizedEmails) => {
            for (const email of emails) {
                updateStmt.run(email.priority, email.id);
            }
        });
        updateTransaction(prioritizedEmails);

        console.log(`[${this.name}] Completed. High: ${prioritizedEmails.filter(e => e.priority === 'high').length}, Medium: ${prioritizedEmails.filter(e => e.priority === 'medium').length}, Low: ${prioritizedEmails.filter(e => e.priority === 'low').length}`);

        return { emails: prioritizedEmails };
    }
}
