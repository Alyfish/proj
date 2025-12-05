import { Email, EmailPriority, EmailAnalysis, UserContext, Suggestion } from '@email-assistant/common/src/types';
import { PrioritizerAgent } from '../agents/prioritizer';
import { AnalyzerAgent } from '../agents/analyzer';
import { SuggesterAgent } from '../agents/suggester';

export class Orchestrator {
    private prioritizer: PrioritizerAgent;
    private analyzer: AnalyzerAgent;
    private suggester: SuggesterAgent;

    constructor() {
        this.prioritizer = new PrioritizerAgent();
        this.analyzer = new AnalyzerAgent();
        this.suggester = new SuggesterAgent();
    }

    async processEmails(emails: Email[], userContext: UserContext): Promise<Suggestion[]> {
        console.log(`\n[Orchestrator] Processing ${emails.length} emails...`);

        // Step 1: Prioritize emails
        console.log('\n[Step 1] Prioritizing emails...');
        const priorities = this.prioritizer.prioritize(emails);

        // Filter out spam
        const relevantEmails = emails.filter((email, index) =>
            priorities[index].priority !== 'spam'
        );
        console.log(`  → ${relevantEmails.length} relevant emails (${emails.length - relevantEmails.length} spam filtered)`);

        // Step 2: Analyze each relevant email
        console.log('\n[Step 2] Analyzing emails...');
        const analyses: EmailAnalysis[] = [];
        for (const email of relevantEmails) {
            const analysis = await this.analyzer.analyze(email);
            analyses.push(analysis);
            console.log(`  → Analyzed email ${email.id}: ${analysis.actionItems.length} action items found`);
        }

        // Step 3: Generate suggestions based on analysis and user context
        console.log('\n[Step 3] Generating suggestions...');
        const suggestions = this.suggester.generateSuggestions(analyses, userContext);
        console.log(`  → Generated ${suggestions.length} suggestions`);

        return suggestions;
    }

    // Method to get detailed results for logging
    async processEmailsDetailed(emails: Email[], userContext: UserContext) {
        const priorities = this.prioritizer.prioritize(emails);
        const relevantEmails = emails.filter((email, index) =>
            priorities[index].priority !== 'spam'
        );

        const analyses: EmailAnalysis[] = [];
        for (const email of relevantEmails) {
            const analysis = await this.analyzer.analyze(email);
            analyses.push(analysis);
        }

        const suggestions = this.suggester.generateSuggestions(analyses, userContext);

        return {
            priorities,
            analyses,
            suggestions
        };
    }
}
