import { graph } from "./graph";
import { AgentState } from "./state";

export async function runAgent(query: string) {
    const initialState: Partial<AgentState> = {
        user_query: query,
        messages: [],
    };

    const result = await graph.invoke(initialState);
    return result;
}

// Example usage if run directly
if (require.main === module) {
    (async () => {
        const query = process.argv[2] || "Summarize important emails";
        console.log(`Running agent with query: ${query}`);
        try {
            const result = await runAgent(query);
            console.log("Result:", JSON.stringify(result, null, 2));
        } catch (error) {
            console.error("Error running agent:", error);
        }
    })();
}
