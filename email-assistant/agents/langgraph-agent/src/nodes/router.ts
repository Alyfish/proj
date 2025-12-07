import { AgentState } from "../state";
import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { ROUTER_PROMPT } from "../prompts";

const llm = new ChatOpenAI({
    modelName: "gpt-4-turbo-preview",
    temperature: 0,
});

export const routerNode = async (state: AgentState): Promise<Partial<AgentState>> => {
    const { user_query, keywords } = state;

    const response = await llm.invoke([
        new SystemMessage(ROUTER_PROMPT),
        new HumanMessage(`Query: "${user_query}"\nKeywords: ${keywords.join(", ")}`),
    ]);

    try {
        let content = typeof response.content === 'string' ? response.content : JSON.stringify(response.content);
        content = content.replace(/```json/g, "").replace(/```/g, "").trim();
        const parsed = JSON.parse(content);

        const mode = parsed.mode === "deep" ? "deep" : "shallow";
        console.log(`\n=================================================`);
        console.log(`[Router] 🧭 DECISION: ${mode.toUpperCase()} MODE`);
        console.log(`[Router] 💭 Reason: ${parsed.reasoning}`);
        console.log(`=================================================\n`);

        return {
            analysis_mode: mode,
            analysis_mode_reason: parsed.reasoning || "No reasoning provided"
        };
    } catch (e) {
        console.error("[Router] Failed to parse output, defaulting to shallow.", e);
        return { analysis_mode: "shallow" };
    }
};
