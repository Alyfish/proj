import { AgentState } from "../state";
import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { REVIEWER_PROMPT } from "../prompts";
import * as dotenv from "dotenv";
import * as path from "path";

// Load .env from project root
dotenv.config({ path: path.resolve(__dirname, '../../../../../.env') });
dotenv.config(); // fallback to current working dir .env if present

const llm = new ChatOpenAI({
    modelName: "gpt-4-turbo-preview",
    temperature: 0,
});

export const reviewerNode = async (state: AgentState): Promise<Partial<AgentState>> => {
    const { prioritized_emails, user_query, review_attempts } = state;

    // Simple check: if no emails prioritized, maybe we missed something?
    // Or we can ask LLM to verify if the selected emails match the query.
    // For now, let's just pass through or maybe re-prioritize if empty?

    // In a real scenario, this node would critique the prioritization and potentially route back.
    // We'll implement a simple pass/fail check.

    const emailSummaries = prioritized_emails.map((e) => `Subject: ${e.subject}`).join("\n");

    const systemPrompt = REVIEWER_PROMPT;

    const response = await llm.invoke([
        new SystemMessage(systemPrompt),
        new HumanMessage(`Query: "${user_query}"\n\nSelected Emails:\n${emailSummaries}`),
    ]);

    try {
        let content = typeof response.content === 'string' ? response.content : JSON.stringify(response.content);
        // Strip markdown code blocks if present
        content = content.replace(/```json/g, "").replace(/```/g, "").trim();

        const parsed = JSON.parse(content);

        console.log(`[Reviewer] Status: ${parsed.status}`);
        if (parsed.status === "FAIL") {
            console.log(`[Reviewer] Feedback: ${parsed.feedback}`);
        }

        return {
            review_status: parsed.status === "PASS" ? "pass" : "fail",
            review_feedback: parsed.feedback || "",
            review_attempts: (review_attempts || 0) + 1
        };
    } catch (e) {
        console.error("Failed to parse Reviewer output", e);
        return {
            review_status: "fail",
            review_feedback: "Failed to parse reviewer output",
            review_attempts: (review_attempts || 0) + 1
        };
    }
};

export const checkReview = (state: AgentState) => {
    return state.review_status || "fail";
};
