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

        console.log(`[ContextSetter] Extracted keywords: ${JSON.stringify(parsed.keywords)}`);

        return {
            keywords: parsed.keywords || [],
            // We could also store the goal in the state if we added it
        };
    } catch (e) {
        console.error("Failed to parse LLM output", e);
        return { keywords: [] };
    }
};
