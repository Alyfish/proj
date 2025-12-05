import { EmailPriority, EmailAnalysis, Suggestion } from '@email-assistant/common/src/types';

export interface EmailProcessingResult {
    priorities: EmailPriority[];
    analyses: EmailAnalysis[];
    suggestions: Suggestion[];
    processedAt: Date;
    recentEmails?: {
        id: string;
        subject: string;
        snippet: string;
        sender: string;
        receivedAt: string;
        priority?: string;
    }[];
    searchQuery?: string;
}

export class TextFormatter {
    /**
     * Formats the complete email processing result as simple, readable text
     */
    formatResult(result: EmailProcessingResult): string {
        const sections: string[] = [];

        // Header
        sections.push('=== EMAIL ASSISTANT REPORT ===');
        if (result.searchQuery) {
            sections.push(`Intent: ${result.searchQuery}`);
        }
        sections.push(`Processed at: ${result.processedAt.toLocaleString()}`);
        sections.push('');

        // Priority Summary
        sections.push(this.formatPrioritySummary(result.priorities));
        sections.push('');

        // Quick glance at recent emails (top 5)
        if (result.recentEmails && result.recentEmails.length > 0) {
            sections.push(this.formatRecentEmails(result.recentEmails));
            sections.push('');
        }

        // Analyses Summary
        if (result.analyses.length > 0) {
            sections.push(this.formatAnalysesSummary(result.analyses));
            sections.push('');
        }

        // Suggestions
        if (result.suggestions.length > 0) {
            sections.push(this.formatSuggestions(result.suggestions));
            sections.push('');
        } else {
            sections.push('ℹ️  No actionable suggestions were generated. No high/medium priority items detected.');
            sections.push('');
        }

        sections.push('=== END REPORT ===');

        return sections.join('\n');
    }

    /**
     * Format priority summary section
     */
    private formatPrioritySummary(priorities: EmailPriority[]): string {
        const lines: string[] = ['📊 PRIORITY SUMMARY'];

        const counts = {
            high: priorities.filter(p => p.priority === 'high').length,
            medium: priorities.filter(p => p.priority === 'medium').length,
            low: priorities.filter(p => p.priority === 'low').length,
            spam: priorities.filter(p => p.priority === 'spam').length,
        };

        lines.push(`  • High Priority: ${counts.high} emails`);
        lines.push(`  • Medium Priority: ${counts.medium} emails`);
        lines.push(`  • Low Priority: ${counts.low} emails`);
        lines.push(`  • Spam: ${counts.spam} emails`);

        return lines.join('\n');
    }

    /**
     * Format recent emails for a quick glance
     */
    private formatRecentEmails(emails: NonNullable<EmailProcessingResult['recentEmails']>): string {
        const lines: string[] = ['🗂️  RECENT EMAILS (latest 5)'];
        const iconFor = (priority?: string) => {
            if (priority === 'high') return '🔴';
            if (priority === 'medium') return '🟠';
            return '🟢';
        };
        emails.slice(0, 5).forEach((e) => {
            lines.push(`${iconFor(e.priority)} ${e.subject} — ${e.sender}`);
            if (e.snippet) {
                lines.push(`    ${e.snippet.substring(0, 120)}${e.snippet.length > 120 ? '…' : ''}`);
            }
            lines.push(`    Received: ${new Date(e.receivedAt).toLocaleString()}`);
        });
        return lines.join('\n');
    }

    /**
     * Format analyses summary section
     */
    private formatAnalysesSummary(analyses: EmailAnalysis[]): string {
        const lines: string[] = ['📧 EMAIL ANALYSES'];

        for (const analysis of analyses) {
            lines.push('');
            lines.push(`  Email ID: ${analysis.emailId}`);
            lines.push(`  Summary: ${analysis.summary}`);

            if (analysis.actionItems && analysis.actionItems.length > 0) {
                lines.push(`  Action Items:`);
                analysis.actionItems.forEach(item => {
                    lines.push(`    - ${item}`);
                });
            }

            if (analysis.deadline) {
                lines.push(`  ⏰ Deadline: ${analysis.deadline}`);
            }

            if (analysis.entities && analysis.entities.length > 0) {
                lines.push(`  Entities: ${analysis.entities.join(', ')}`);
            }
        }

        return lines.join('\n');
    }

    /**
     * Format suggestions section
     */
    private formatSuggestions(suggestions: Suggestion[]): string {
        const lines: string[] = ['💡 SUGGESTED ACTIONS'];

        // Group by type
        const byType = {
            action: suggestions.filter(s => s.type === 'action'),
            reply: suggestions.filter(s => s.type === 'reply'),
            info: suggestions.filter(s => s.type === 'info'),
        };

        if (byType.action.length > 0) {
            lines.push('');
            lines.push('  🎯 ACTIONS:');
            byType.action.forEach((s, i) => {
                lines.push(`    ${i + 1}. ${s.title}`);
                lines.push(`       ${s.description}`);
                if (s.relatedEmailIds.length > 0) {
                    lines.push(`       Related emails: ${s.relatedEmailIds.join(', ')}`);
                }
            });
        }

        if (byType.reply.length > 0) {
            lines.push('');
            lines.push('  📝 SUGGESTED REPLIES:');
            byType.reply.forEach((s, i) => {
                lines.push(`    ${i + 1}. ${s.title}`);
                lines.push(`       ${s.description}`);
            });
        }

        if (byType.info.length > 0) {
            lines.push('');
            lines.push('  ℹ️  INFORMATION:');
            byType.info.forEach((s, i) => {
                lines.push(`    ${i + 1}. ${s.title}`);
                lines.push(`       ${s.description}`);
            });
        }

        return lines.join('\n');
    }

    /**
     * Format a quick status message
     */
    formatQuickStatus(emailCount: number, suggestionCount: number): string {
        return `Processed ${emailCount} emails, generated ${suggestionCount} suggestions.`;
    }
}
