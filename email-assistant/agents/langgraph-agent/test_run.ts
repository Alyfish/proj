import * as dotenv from "dotenv";
import { AgentState } from "./src/state";

dotenv.config({ path: "../../.env" });

// Force Mock Mode for testing
process.env.MOCK_GMAIL = "true";

async function main() {
    console.log("Starting test run (MOCK_GMAIL=true)...");

    // Dynamic import to ensure env vars are loaded first
    const { graph } = await import("./src/graph");

    const inputs = {
        user_query: "Find important emails about Project X",
        messages: []
    };

    console.log("Invoking graph with input:", inputs);

    try {
        const result = await graph.invoke(inputs);
        console.log("\n--- Graph Execution Complete ---\n");
        console.log("Final State Review Status:", result.review_status);
        console.log("Final State Review Attempts:", result.review_attempts);

        // Assertions
        console.log("\n--- Assertions ---");

        assert(result.keywords.length > 0, "Keywords should be extracted");
        console.log("✅ Keywords extracted:", result.keywords);

        assert(result.emails.length > 0, "Emails should be fetched (mocked)");
        console.log("✅ Emails fetched:", result.emails.length);

        assert(result.prioritized_emails !== undefined, "Prioritizer should run");
        console.log("✅ Prioritized emails count:", result.prioritized_emails.length);

        if (result.review_status === 'fail') {
            console.log("⚠️ Review failed (expected if loop limit reached or logic rejected).");
        } else {
            console.log("✅ Review passed.");
        }

        assert(result.analysis_result !== undefined, "Analyzer should produce a result");
        console.log("✅ Analysis result present");

        console.log("\n--- Final Analysis ---");
        console.log(result.analysis_result);

    } catch (error) {
        console.error("Graph execution failed:", error);
        process.exit(1);
    }
}

function assert(condition: boolean, message: string) {
    if (!condition) {
        console.error(`❌ Assertion Failed: ${message}`);
        process.exit(1);
    }
}

main();
