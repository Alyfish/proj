import { BaseMessage } from "@langchain/core/messages";
import { Email } from "@email-assistant/common/src/types";

export interface AgentState {
    messages: BaseMessage[];
    user_query: string;
    keywords: string[];
    emails: Email[];
    prioritized_emails: Email[];
    analysis_result: string;
    analysis_mode: "shallow" | "deep";
    analysis_mode_reason?: string;
    suggestions: Array<{ title: string; details: string; priority: "high" | "medium" | "low" }>;
    key_insights?: string[];
    entities?: {
        items: Array<{ name: string; type: string; details: string }>;
        notes?: string;
    };
    must_have_keywords?: string[];
    nice_to_have_keywords?: string[];
    search_strategy?: "precise" | "broad";
    gmail_query?: string;  // LLM-generated Gmail search query
    review_feedback: string;
    review_status: "pass" | "fail" | "pending";
    review_attempts: number;
}
