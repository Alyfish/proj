import { AgentState } from "../state";
import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { Email } from "@email-assistant/common/src/types";
import * as dotenv from "dotenv";
import * as path from "path";

// Load .env from project root
dotenv.config({ path: path.resolve(__dirname, '../../../../../.env') });
dotenv.config(); // fallback to current working dir .env if present

const llm = new ChatOpenAI({
    modelName: "gpt-4o",
    temperature: 0,
});

import { PRIORITIZER_PROMPT } from "../prompts";

export const prioritizerNode = async (state: AgentState): Promise<Partial<AgentState>> => {
    const { emails, user_query, review_feedback } = state;

    if (emails.length === 0) {
        return { prioritized_emails: [] };
    }

    const emailSummaries = emails.map((e, i) => `ID: ${e.id}\nFrom: ${e.from}\nSubject: ${e.subject}\nSnippet: ${e.snippet}`).join("\n---\n");

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
        const prioritizedIds = parsed.prioritized_ids || [];
        const prioritized_emails = emails.filter(e => prioritizedIds.includes(e.id));

        console.log(`[Prioritizer] Selected ${prioritized_emails.length} emails as high priority:`);
        prioritized_emails.forEach(e => console.log(` - [${e.id}] ${e.subject}`));

        return { prioritized_emails };
    } catch (e) {
        console.error("Failed to parse Prioritizer output", e);
        return { prioritized_emails: [] };
    }
};
