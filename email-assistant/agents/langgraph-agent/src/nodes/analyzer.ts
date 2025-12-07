import { AgentState } from "../state";
import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { ANALYZER_PROMPT } from "../prompts";

const llm = new ChatOpenAI({
    modelName: "gpt-4-turbo-preview",
    temperature: 0,
});

export const analyzerNode = async (state: AgentState): Promise<Partial<AgentState>> => {
    const { prioritized_emails, user_query } = state;

    if (prioritized_emails.length === 0) {
        return { analysis_result: "No relevant emails found." };
    }

    const emailContent = prioritized_emails.map((e) => `From: ${e.from}\nSubject: ${e.subject}\nBody: ${e.body}`).join("\n---\n");



    const systemPrompt = ANALYZER_PROMPT;

    const response = await llm.invoke([
        new SystemMessage(systemPrompt),
        new HumanMessage(emailContent),
    ]);

    let parsedResult;
    try {
        const content = typeof response.content === 'string' ? response.content : JSON.stringify(response.content);
        // Strip code blocks if present
        const cleanContent = content.replace(/```json/g, "").replace(/```/g, "").trim();
        parsedResult = JSON.parse(cleanContent);
    } catch (e) {
        console.error("[Analyzer] Failed to parse JSON response:", e);
        // Fallback for non-JSON output
        parsedResult = {
            summary: typeof response.content === 'string' ? response.content : JSON.stringify(response.content),
            suggestions: []
        };
    }

    console.log(`[Analyzer] Analysis complete.`);
    console.log(`Summary: ${parsedResult.summary.substring(0, 100)}...`);
    console.log(`Suggestions: ${parsedResult.suggestions?.length || 0} found.`);

    return {
        analysis_result: parsedResult.summary,
        suggestions: parsedResult.suggestions || []
    };
};
