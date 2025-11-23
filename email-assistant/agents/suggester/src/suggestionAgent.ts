import { Agent, EmailAnalysisResult, SuggestionItem } from '@email-assistant/common/src/types';
import { db } from '@email-assistant/common/src/db';

type IntentType = 'search' | 'reply' | 'process';

interface SuggestionInput {
    userId: string;
    analyses: EmailAnalysisResult[];
    searchQuery?: string;
    intent?: IntentType;
}

interface SuggestionOutput {
    suggestions: SuggestionItem[];
}

export class SuggestionAgent implements Agent<SuggestionInput, SuggestionOutput> {
    name = 'SuggestionAgent';

    async run(input: SuggestionInput): Promise<SuggestionOutput> {
        console.log(`[${this.name}] Generating suggestions from ${input.analyses.length} analyses...`);

        const suggestions: SuggestionItem[] = [];
        const insertStmt = db.prepare(`
      INSERT INTO tasks (user_id, source_email_id, title, description, due_date, priority, status)
      VALUES (?, ?, ?, ?, ?, ?, 'pending')
    `);

        let travelSummaryAdded = false;

        for (const analysis of input.analyses) {
            const actions = Array.isArray((analysis as any).actions) ? analysis.actions : [];

            // 1. Turn Actions into Suggestions
            for (const action of actions) {
                const suggestion: SuggestionItem = {
                    type: 'task',
                    title: action.description, // Could use LLM to shorten if needed
                    details: `From email summary: ${analysis.summary}`,
                    sourceEmailId: analysis.emailId,
                    priority: action.priority || (analysis.isUrgent ? 'high' : 'medium'),
                };

                insertStmt.run(
                    input.userId,
                    suggestion.sourceEmailId,
                    suggestion.title,
                    suggestion.details,
                    action.dueDate || null,
                    suggestion.priority
                );

                suggestions.push(suggestion);
            }

            // 2. If urgent but no specific actions, create a "Review" task
            if (analysis.isUrgent && actions.length === 0) {
                const suggestion: SuggestionItem = {
                    type: 'task',
                    title: `Review Urgent Email`,
                    details: analysis.summary,
                    sourceEmailId: analysis.emailId,
                    priority: 'high',
                };

                insertStmt.run(
                    input.userId,
                    suggestion.sourceEmailId,
                    suggestion.title,
                    suggestion.details,
                    null,
                    'high'
                );
                suggestions.push(suggestion);
            }

            // 3. For general runs we add per-email review; for search we prefer an aggregated next-step summary.
            if (actions.length === 0 && input.intent !== 'search') {
                const suggestion: SuggestionItem = {
                    type: 'info',
                    title: `Review: ${analysis.summary.substring(0, 60)}${analysis.summary.length > 60 ? '…' : ''}`,
                    details: 'No explicit actions detected. Consider replying or archiving.',
                    sourceEmailId: analysis.emailId,
                    priority: 'medium',
                };
                insertStmt.run(
                    input.userId,
                    suggestion.sourceEmailId,
                    suggestion.title,
                    suggestion.details,
                    null,
                    suggestion.priority
                );
                suggestions.push(suggestion);
            }

            // 4. If intent is reply and a draft exists, surface a reply suggestion
            if (input.intent === 'reply' && (analysis as any).replyDraft) {
                const replyText = (analysis as any).replyDraft as string;
                const suggestion: SuggestionItem = {
                    type: 'reply',
                    title: `Suggested Reply`,
                    details: replyText,
                    sourceEmailId: analysis.emailId,
                    priority: 'medium',
                };
                insertStmt.run(
                    input.userId,
                    suggestion.sourceEmailId,
                    suggestion.title,
                    suggestion.details,
                    null,
                    suggestion.priority
                );
                suggestions.push(suggestion);
            }
        }

        // Travel-specific summary card if any analysis has travel details
        if (input.intent === 'search') {
            const travelAnalyses = input.analyses.filter(a => (a as any).travelDetails);
            if (travelAnalyses.length > 0) {
                const best = travelAnalyses[0] as any;
                const td = best.travelDetails as any;
                const legs = Array.isArray(td?.legs) ? td.legs : [];
                const pnr = td?.pnr || td?.confirmationNumber;
                const legsText = legs.length
                    ? legs.map((l: any) => `- ${l.from || '?'} → ${l.to || '?'} ${l.date ? `(${l.date})` : ''} ${l.departTime || ''} ${l.arriveTime ? `→ ${l.arriveTime}` : ''}`.trim()).join('\n')
                    : '';
                const actions = [
                    pnr ? `Add PNR ${pnr} to your calendar/notes and keep it handy for check-in.` : 'Add this trip to your calendar and set a check-in reminder.',
                    'Check baggage allowances and seat assignments before departure.',
                    'Open the airline/OTA link to manage or change seats if needed.'
                ].join('\n');
                const details = [
                    pnr ? `Confirmation/PNR: ${pnr}` : '',
                    legsText ? `Legs:\n${legsText}` : '',
                    actions
                ].filter(Boolean).join('\n\n');

                const suggestion: SuggestionItem = {
                    type: 'info',
                    title: 'Trip summary',
                    details,
                    priority: 'high',
                };
                insertStmt.run(
                    input.userId,
                    null,
                    suggestion.title,
                    suggestion.details,
                    null,
                    suggestion.priority
                );
                suggestions.push(suggestion);
                travelSummaryAdded = true;
            }
        }

        // If no actionable suggestions were created for search intent, surface a concise next-steps card
        if (input.intent === 'search' && !travelSummaryAdded && input.analyses.length > 0) {
            const sorted = [...input.analyses].sort((a, b) => (b.relevance ?? 0) - (a.relevance ?? 0));
            const top = sorted.slice(0, 6);
            const bullets = top.map(a => `- ${a.summary.substring(0, 180)}${a.summary.length > 180 ? '…' : ''}`).join('\n');
            const title = 'Next steps for your search';
            const followUps = [
                'Reply or forward key emails that match your query.',
                'Save important links/codes into your tracker.',
                'Set reminders for any dates or deadlines mentioned.'
            ].join('\n');
            const suggestion: SuggestionItem = {
                type: 'info',
                title,
                details: `Top matches:\n${bullets}\n\nRecommended actions:\n${followUps}`,
                priority: 'medium',
            };
            insertStmt.run(
                input.userId,
                null,
                suggestion.title,
                suggestion.details,
                null,
                suggestion.priority
            );
            suggestions.push(suggestion);
        }

        console.log(`[${this.name}] Generated ${suggestions.length} suggestions.`);
        return { suggestions };
    }
}
