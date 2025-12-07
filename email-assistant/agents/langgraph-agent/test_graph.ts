import { runAgent } from "./src/index";

async function test() {
    console.log("Testing LangGraph Agent...");

    // Mock query
    const query = "Find important emails about Project X";

    try {
        const result = await runAgent(query);
        console.log("Agent finished successfully.");
        console.log("Final State:", JSON.stringify(result, null, 2));
    } catch (error) {
        console.error("Agent failed:", error);
    }
}

test();
