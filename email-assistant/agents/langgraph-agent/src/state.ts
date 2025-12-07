import { BaseMessage } from "@langchain/core/messages";
import { Email } from "@email-assistant/common/src/types";

export interface AgentState {
    messages: BaseMessage[];
    user_query: string;
    keywords: string[];
    emails: Email[];
    prioritized_emails: Email[];
    analysis_result: string;
    suggestions: Array<{ title: string; details: string; priority: "high" | "medium" | "low" }>;
    review_feedback: string;
    review_status: "pass" | "fail" | "pending";
    review_attempts: number;
}
