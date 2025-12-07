import { StateGraph, END } from "@langchain/langgraph";
import { AgentState } from "./state";
import { contextSetterNode } from "./nodes/context_setter";
import { gmailFetcherNode } from "./nodes/gmail_fetcher";
import { prioritizerNode } from "./nodes/prioritizer";
import { reviewerNode, checkReview } from "./nodes/reviewer";
import { analyzerNode } from "./nodes/analyzer";

// Define the graph
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
        analysis_mode: {
            value: (x: any, y: any) => y ?? x,
            default: () => "shallow",
        },
        analysis_mode_reason: {
            value: (x: any, y: any) => y ?? x,
            default: () => "",
        },
        suggestions: {
            value: (x: any, y: any) => y ?? x,
            default: () => [],
        },
        key_insights: {
            value: (x: any, y: any) => y ?? x,
            default: () => [],
        },
        entities: {
            value: (x: any, y: any) => y ?? x,
            default: () => undefined,
        },
        must_have_keywords: {
            value: (x: any, y: any) => y ?? x,
            default: () => [],
        },
        nice_to_have_keywords: {
            value: (x: any, y: any) => y ?? x,
            default: () => [],
        },
        search_strategy: {
            value: (x: any, y: any) => y ?? x,
            default: () => "broad",
        },
        gmail_query: {
            value: (x: any, y: any) => y ?? x,
            default: () => "",
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

// Import new nodes
import { routerNode } from "./nodes/router";
import { deepAnalyzerNode } from "./nodes/deep_analyzer";

// Add nodes
workflow.addNode("context_setter", contextSetterNode);
workflow.addNode("router", routerNode); // New Node
workflow.addNode("gmail_fetcher", gmailFetcherNode);
workflow.addNode("prioritizer", prioritizerNode);
workflow.addNode("reviewer", reviewerNode);
workflow.addNode("analyzer", analyzerNode); // Shallow Analyzer
workflow.addNode("deep_analyzer", deepAnalyzerNode); // Deep Analyzer

// Add edges
workflow.setEntryPoint("context_setter");
workflow.addEdge("context_setter", "router");
workflow.addEdge("router", "gmail_fetcher");
workflow.addEdge("gmail_fetcher", "prioritizer");
workflow.addEdge("prioritizer", "reviewer");

// Conditional edge from reviewer
workflow.addConditionalEdges(
    "reviewer",
    (state: AgentState) => {
        const attempts = state.review_attempts || 0;
        const MAX_ATTEMPTS = 2;

        if (state.review_status === "pass") {
            const mode = state.analysis_mode;
            console.log(`[Graph] Review passed. Routing to ${mode} analysis.`);
            return mode === "deep" ? "deep" : "shallow";
        }

        if (attempts < MAX_ATTEMPTS) {
            console.log(`[Graph] Review failed, looping back to prioritizer (attempt ${attempts}/${MAX_ATTEMPTS}). Feedback: ${state.review_feedback}`);
            return "fail";
        }

        console.log(`[Graph] Max review attempts reached (${attempts}). Proceeding to ${state.analysis_mode} analyzer despite failure.`);
        return state.analysis_mode === "deep" ? "deep" : "shallow";
    },
    {
        shallow: "analyzer",
        deep: "deep_analyzer",
        fail: "prioritizer",
    }
);

workflow.addEdge("analyzer", END);
workflow.addEdge("deep_analyzer", END);

// Compile
export const graph = workflow.compile();
