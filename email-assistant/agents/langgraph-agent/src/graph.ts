import { StateGraph, END } from "@langchain/langgraph";
import { AgentState } from "./state";
import { contextSetterNode } from "./nodes/context_setter";
import { gmailFetcherNode } from "./nodes/gmail_fetcher";
import { prioritizerNode } from "./nodes/prioritizer";
import { reviewerNode, checkReview } from "./nodes/reviewer";
import { analyzerNode } from "./nodes/analyzer";

// Define the graph
const workflow = new StateGraph<AgentState>({
    channels: {
        messages: {
            value: (x: any, y: any) => x.concat(y),
            default: () => [],
        },
        user_query: {
            value: (x: any, y: any) => y ?? x,
            default: () => "",
        },
        keywords: {
            value: (x: any, y: any) => y ?? x,
            default: () => [],
        },
        emails: {
            value: (x: any, y: any) => y ?? x,
            default: () => [],
        },
        prioritized_emails: {
            value: (x: any, y: any) => y ?? x,
            default: () => [],
        },
        analysis_result: {
            value: (x: any, y: any) => y ?? x,
            default: () => "",
        },
        suggestions: {
            value: (x: any, y: any) => y ?? x,
            default: () => [],
        },
        review_feedback: {
            value: (x: any, y: any) => y ?? x,
            default: () => "",
        },
        review_status: {
            value: (x: any, y: any) => y ?? x,
            default: () => "pending",
        },
        review_attempts: {
            value: (x: number, y: number) => y ?? x,
            default: () => 0,
        },
    },
});

// Add nodes
workflow.addNode("context_setter", contextSetterNode);
workflow.addNode("gmail_fetcher", gmailFetcherNode);
workflow.addNode("prioritizer", prioritizerNode);
workflow.addNode("reviewer", reviewerNode);
workflow.addNode("analyzer", analyzerNode);

// Add edges
workflow.setEntryPoint("context_setter");
workflow.addEdge("context_setter", "gmail_fetcher");
workflow.addEdge("gmail_fetcher", "prioritizer");
workflow.addEdge("prioritizer", "reviewer");

// Conditional edge from reviewer
workflow.addConditionalEdges(
    "reviewer",
    (state: AgentState) => {
        const attempts = state.review_attempts || 0;
        const MAX_ATTEMPTS = 2;

        if (state.review_status === "pass") {
            console.log(`[Graph] Review passed.`);
            return "pass";
        }

        if (attempts < MAX_ATTEMPTS) {
            console.log(`[Graph] Review failed, looping back to prioritizer (attempt ${attempts}/${MAX_ATTEMPTS}). Feedback: ${state.review_feedback}`);
            return "fail";
        }

        console.log(`[Graph] Max review attempts reached (${attempts}). Proceeding to analyzer despite failure.`);
        return "pass"; // Proceed if max attempts reached
    },
    {
        pass: "analyzer",
        fail: "prioritizer",
    }
);

workflow.addEdge("analyzer", END);

// Compile
export const graph = workflow.compile();
