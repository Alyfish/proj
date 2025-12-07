import { AgentState } from "../state";
import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { DEEP_ANALYZER_PROMPT } from "../prompts";

const llm = new ChatOpenAI({
    modelName: "gpt-4-turbo-preview",
    temperature: 0,
});

export const deepAnalyzerNode = async (state: AgentState): Promise<Partial<AgentState>> => {
    console.log(`\n[DeepAnalyzer] 🧠 STARTING DEEP ANALYSIS...`);
    const { prioritized_emails, user_query } = state;

    if (prioritized_emails.length === 0) {
        return { analysis_result: "No relevant emails found for deep analysis." };
    }

    // Include full body for deep analysis
    const emailContent = prioritized_emails.map((e) => `From: ${e.from}\nSubject: ${e.subject}\nDate: ${e.timestamp}\nBody: ${e.body}`).join("\n---\n");

    const response = await llm.invoke([
        new SystemMessage(DEEP_ANALYZER_PROMPT),
        new HumanMessage(`Query: ${user_query}\n\nEmails:\n${emailContent}`),
    ]);

    let parsedResult;
    try {
        const content = typeof response.content === 'string' ? response.content : JSON.stringify(response.content);
        const cleanContent = content.replace(/```json/g, "").replace(/```/g, "").trim();
        parsedResult = JSON.parse(cleanContent);
    } catch (e) {
        console.error("[DeepAnalyzer] Failed to parse JSON response:", e);

        // Attempt to recover partial JSON or extract typical fields
        const rawContent = typeof response.content === 'string' ? response.content : JSON.stringify(response.content);

        // Regex to find "suggestions": ["...", "..."] pattern even if broken
        const suggestionsMatch = rawContent.match(/"suggestions"\s*:\s*\[([\s\S]*?)\]/);
        let extractedSuggestions: string[] = [];

        if (suggestionsMatch && suggestionsMatch[1]) {
            try {
                // Try to parse the array content
                const arrayContent = "[" + suggestionsMatch[1] + "]";
                // Remove trailing commas which are invalid JSON but common in LLM output
                const fixedArray = arrayContent.replace(/,\s*\]/, "]");
                extractedSuggestions = JSON.parse(fixedArray);
            } catch (err) {
                console.log("[DeepAnalyzer] Could not parse suggestions array from regex match");
            }
        }

        // Fallback result
        parsedResult = {
            summary: rawContent.substring(0, 1000) + "...\n(Analysis truncated)", // Use raw content as summary
            suggestions: extractedSuggestions,
            key_insights: [],
            entities: { items: [], notes: "" }
        };
    }

    console.log(`[DeepAnalyzer] Analysis complete.`);
    console.log(`Summary: ${parsedResult.summary.substring(0, 100)}...`);

    return {
        // Format deeply analyzed result as the main result
        analysis_result: parsedResult.summary,
        suggestions: parsedResult.suggestions || [],
        key_insights: parsedResult.key_insights || [],
        entities: parsedResult.entities || { items: [], notes: "" }
    };
};
