import { AgentState } from "../state";
import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import { CONTEXT_SETTER_PROMPT } from "../prompts";

const llm = new ChatOpenAI({
    modelName: "gpt-4-turbo-preview",
    temperature: 0,
});

export const contextSetterNode = async (state: AgentState): Promise<Partial<AgentState>> => {
    const { user_query } = state;

    const systemPrompt = CONTEXT_SETTER_PROMPT;

    const response = await llm.invoke([
        new SystemMessage(systemPrompt),
        new HumanMessage(user_query),
    ]);

    try {
        let content = typeof response.content === 'string' ? response.content : JSON.stringify(response.content);
        // Strip markdown code blocks if present
        content = content.replace(/```json/g, "").replace(/```/g, "").trim();

        const parsed = JSON.parse(content);

        // Trim and sanity-check gmail_query
        const gmailQuery = (parsed.gmail_query || "").trim();

        console.log(`[ContextSetter] Extracted goal: ${parsed.goal}`);
        console.log(`[ContextSetter] 🔍 Gmail Query: "${gmailQuery}"`);
        console.log(`[ContextSetter] Must Have: ${JSON.stringify(parsed.must_have)}`);
        console.log(`[ContextSetter] Nice to Have: ${JSON.stringify(parsed.nice_to_have)}`);

        // Force 'precise' if we have must_haves
        const computedStrategy = (parsed.must_have?.length > 0) ? "precise" : "broad";

        return {
            gmail_query: gmailQuery.length > 0 ? gmailQuery : undefined,
            keywords: parsed.keywords || [],
            must_have_keywords: parsed.must_have || [],
            nice_to_have_keywords: parsed.nice_to_have || [],
            search_strategy: computedStrategy
        };
    } catch (e) {
        console.error("[ContextSetter] Failed to parse LLM output", e);
        // Fallback: let gmail_fetcher use legacy logic
        return { gmail_query: undefined, keywords: [] };
    }
};
