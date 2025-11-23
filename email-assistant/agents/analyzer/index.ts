import { Email, EmailAnalysis } from '@email-assistant/common/src/types';

export class AnalyzerAgent {

    async analyze(email: Email): Promise<EmailAnalysis> {
        return {
            emailId: email.id,
            summary: this.generateSummary(email),
            actionItems: this.extractActionItems(email),
            deadline: this.extractDeadline(email),
            entities: this.extractEntities(email)
        };
    }

    private generateSummary(email: Email): string {
        // For now, use the snippet
        // In production, this would use an LLM
        const sender = email.from.split('@')[0];
        return `Email from ${sender}: ${email.snippet}`;
    }

    private extractActionItems(email: Email): string[] {
        const actionItems: string[] = [];
        const body = email.body.toLowerCase();

        // Look for action keywords
        if (body.includes('need') || body.includes('can you')) {
            const sentences = email.body.split(/[.!?]/);
            sentences.forEach(sentence => {
                const lower = sentence.toLowerCase();
                if (lower.includes('need') || lower.includes('can you') || lower.includes('please')) {
                    actionItems.push(sentence.trim());
                }
            });
        }

        return actionItems;
    }

    private extractDeadline(email: Email): string | undefined {
        const body = email.body.toLowerCase();

        // Look for deadline patterns
        const deadlinePatterns = [
            /by ([a-z]+ (?:this|next) week)/i,
            /by (friday|monday|tuesday|wednesday|thursday|saturday|sunday)/i,
            /deadline[: ]([^.!?]+)/i
        ];

        for (const pattern of deadlinePatterns) {
            const match = email.body.match(pattern);
            if (match) {
                return match[1];
            }
        }

        return undefined;
    }

    private extractEntities(email: Email): string[] {
        const entities: string[] = [];

        // Extract project names (simple pattern matching)
        const projectPattern = /Project [A-Z]/g;
        const projects = email.body.match(projectPattern);
        if (projects) {
            entities.push(...projects);
        }

        // Extract capitalized words (potential names/places)
        const capitalizedPattern = /\b[A-Z][a-z]+\b/g;
        const capitalized = email.body.match(capitalizedPattern);
        if (capitalized) {
            // Filter out common words
            const filtered = capitalized.filter(word =>
                !['The', 'This', 'Please', 'Thanks', 'Hi', 'Hello'].includes(word)
            );
            entities.push(...filtered.slice(0, 5)); // Limit to 5
        }

        return [...new Set(entities)]; // Remove duplicates
    }
}
