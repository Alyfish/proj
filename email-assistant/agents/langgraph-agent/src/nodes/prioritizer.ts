import { AgentState } from "../state";
import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { Email } from "@email-assistant/common/src/types";

const llm = new ChatOpenAI({
    modelName: "gpt-4o",
    temperature: 0,
});

import { PRIORITIZER_PROMPT } from "../prompts";

export const prioritizerNode = async (state: AgentState): Promise<Partial<AgentState>> => {
    const { emails, user_query, review_feedback, keywords, must_have_keywords, nice_to_have_keywords } = state;

    if (emails.length === 0) {
        return { prioritized_emails: [] };
    }

    const emailSummaries = emails.map((e, i) => {
        const shortBody = (e as any).body ? String((e as any).body).substring(0, 350) : '';
        return `ID: ${e.id}\nFrom: ${e.from}\nSubject: ${e.subject}\nSnippet: ${e.snippet}\nBody: ${shortBody}`;
    }).join("\n---\n");

    let systemPrompt = PRIORITIZER_PROMPT;
    if (review_feedback) {
        systemPrompt += `\n\nIMPORTANT: Your previous prioritization was rejected. Feedback: "${review_feedback}". Fix this in your new selection.`;
    }


    const response = await llm.invoke([
        new SystemMessage(systemPrompt),
        new HumanMessage(`Query: ${user_query}\n\nEmails:\n${emailSummaries}`),
    ]);

    try {
        console.log(`[Prioritizer] Full LLM Response:`, JSON.stringify(response));
        let content = typeof response.content === 'string' ? response.content : JSON.stringify(response.content);
        console.log(`[Prioritizer] Raw LLM content:`, content);

        // Strip markdown code blocks if present
        content = content.replace(/```json/g, "").replace(/```/g, "").trim();

        const parsed = JSON.parse(content);
        let prioritizedIds = parsed.prioritized_ids || [];

        // Fallback: if LLM returned nothing or too few, use heuristic keyword scoring to pick top matches
        if (!Array.isArray(prioritizedIds) || prioritizedIds.length === 0) {
            prioritizedIds = [];
        }

        if (prioritizedIds.length < 3) {
            const tokenBag = new Set<string>();
            const collect = (txt: string) => {
                txt
                    .toLowerCase()
                    .split(/[^a-z0-9@.]+/)
                    .filter(t => t.length > 2)
                    .forEach(t => tokenBag.add(t));
            };
            collect(user_query || "");
            keywords?.forEach(k => collect(k));
            must_have_keywords?.forEach(k => collect(k));
            nice_to_have_keywords?.forEach(k => collect(k));

            // generic high-signal terms (not domain-specific)
            ['urgent', 'action', 'required', 'follow', 'up', 'reply', 'confirmation', 'invoice', 'receipt', 'meeting', 'deadline'].forEach(t => tokenBag.add(t));

            const tokenList = Array.from(tokenBag);

            const scoreEmail = (e: any) => {
                const haystack = `${e.subject} ${e.snippet} ${(e.body || '')}`.toLowerCase();
                const sender = (e.from || '').toLowerCase();
                const hits = tokenList.reduce((acc, k) => acc + (haystack.includes(k) ? 1 : 0), 0);
                const senderHits = tokenList.reduce((acc, k) => acc + (sender.includes(k) ? 1 : 0), 0);
                if (hits === 0 && senderHits === 0) return -1; // filter out obvious non-matches
                const recencyBoost = (() => {
                    const ts = (e as any).timestamp ? new Date((e as any).timestamp).getTime() : Date.now();
                    const hours = (Date.now() - ts) / 3_600_000;
                    if (hours < 24) return 2;
                    if (hours < 72) return 1;
                    return 0;
                })();
                return hits * 3 + senderHits * 2 + recencyBoost;
            };

            const fallback = [...emails]
                .map(e => ({ e, score: scoreEmail(e) }))
                .filter(x => x.score >= 0) // only keep plausible matches
                .sort((a, b) => b.score - a.score)
                .slice(0, 8)
                .map(x => x.e.id);
            // merge unique
            const merged = [...new Set([...prioritizedIds, ...fallback])];
            prioritizedIds = merged;
            console.log(`[Prioritizer] Applied heuristic fallback. Selected IDs: ${merged.join(', ')}`);
        }

        const prioritized_emails = emails.filter(e => prioritizedIds.includes(e.id));

        console.log(`[Prioritizer] Selected ${prioritized_emails.length} emails as high priority:`);
        prioritized_emails.forEach(e => console.log(` - [${e.id}] ${e.subject}`));

        return { prioritized_emails };
    } catch (e) {
        console.error("Failed to parse Prioritizer output", e);
        return { prioritized_emails: [] };
    }
};
