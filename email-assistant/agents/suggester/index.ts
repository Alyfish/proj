import { EmailAnalysis, UserContext, Suggestion } from '@email-assistant/common/src/types';

export class SuggesterAgent {

    generateSuggestions(
        analyses: EmailAnalysis[],
        userContext: UserContext
    ): Suggestion[] {
        const suggestions: Suggestion[] = [];

        // Process each email analysis
        analyses.forEach(analysis => {
            // Check if email relates to user's goals/projects
            const relevantToGoals = this.isRelevantToContext(analysis, userContext);

            if (relevantToGoals && analysis.actionItems.length > 0) {
                suggestions.push({
                    type: 'action',
                    priority: analysis.deadline ? 1 : 2,
                    title: this.extractTitle(analysis),
                    description: this.formatDescription(analysis),
                    relatedEmailIds: [analysis.emailId]
                });
            }
        });

        // Sort by priority (lower number = higher priority)
        return suggestions.sort((a, b) => a.priority - b.priority);
    }

    private isRelevantToContext(analysis: EmailAnalysis, userContext: UserContext): boolean {
        // Check if any entities match user's projects or goals
        const allContext = [...userContext.projects, ...userContext.goals, ...userContext.priorities];

        return analysis.entities.some(entity =>
            allContext.some(contextItem =>
                contextItem.toLowerCase().includes(entity.toLowerCase()) ||
                entity.toLowerCase().includes(contextItem.toLowerCase())
            )
        );
    }

    private extractTitle(analysis: EmailAnalysis): string {
        if (analysis.actionItems.length > 0) {
            // Use first action item as title
            const firstAction = analysis.actionItems[0];
            return firstAction.length > 50
                ? firstAction.substring(0, 50) + '...'
                : firstAction;
        }
        return analysis.summary.substring(0, 50) + '...';
    }

    private formatDescription(analysis: EmailAnalysis): string {
        let description = analysis.summary;

        if (analysis.deadline) {
            description += `\n**Deadline:** ${analysis.deadline}`;
        }

        if (analysis.actionItems.length > 0) {
            description += `\n**Action Items:**\n${analysis.actionItems.map(item => `- ${item}`).join('\n')}`;
        }

        return description;
    }
}
