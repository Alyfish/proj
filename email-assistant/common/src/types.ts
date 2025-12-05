export interface Email {
    id: string;
    from: string;
    to: string;
    subject: string;
    body: string;
    timestamp: Date;
    labels: string[];
    snippet: string;
}

export interface UserContext {
    goals: string[];
    projects: string[];
    priorities: string[];
}

export interface EmailPriority {
    emailId: string;
    priority: 'high' | 'medium' | 'low' | 'spam';
    reason: string;
}

export interface EmailMetadata {
    id: string;
    threadId: string;
    from: string;
    to: string[];
    subject: string;
    snippet: string;
    receivedAt: string;
    labels: string[];
}

export interface EmailAnalysis {
    emailId: string;
    summary: string;
    actionItems: string[];
    deadline?: string;
    entities: string[];
}

export interface Suggestion {
    type: 'action' | 'reply' | 'info';
    priority: number;
    title: string;
    description: string;
    relatedEmailIds: string[];
}

export interface EmailAnalysisResult {
    emailId: string;
    summary: string;
    actions: { description: string; dueDate?: string | null; priority?: 'high' | 'medium' | 'low' }[];
    entities: string[];
    isUrgent?: boolean;
    relevance?: number;
    replyDraft?: string;
    // New context fields
    answer?: string; // Direct answer to the user's query
    key_facts?: { [key: string]: string | number }; // Structured facts (e.g. "Amount": "$500")
    structuredEntities?: {
        people: string[];
        organizations: string[];
        locations: string[];
        dates: string[];
    };
    // Optional structured domain-specific details (e.g., travel)
    travelDetails?: {
        pnr?: string;
        passengers?: string[];
        legs?: Array<{
            from?: string;
            to?: string;
            departTime?: string;
            arriveTime?: string;
            flight?: string;
            date?: string;
        }>;
        carrier?: string;
        confirmationNumber?: string;
    };
}

export interface SuggestionItem {
    type: 'task' | 'reply' | 'info';
    title: string;
    details: string;
    sourceEmailId?: string;
    priority: 'high' | 'medium' | 'low';
}

// --- New Types for Context Awareness ---

export interface Agent<TInput, TOutput> {
    name: string;
    run(input: TInput): Promise<TOutput>;
}

export interface UserGoal {
    id?: number;
    userId: string;
    goalText: string;
    status: 'active' | 'completed' | 'paused';
    confidence: number;
    source: 'inferred' | 'explicit' | 'llm';
    createdAt?: string;
    updatedAt?: string;
}

export interface EmailInteraction {
    id: number;
    userId: string;
    emailId: string;
    interactionType: 'open' | 'reply' | 'archive' | 'star' | 'delete';
    timestamp: string;
    durationSeconds?: number;
}

export interface BehaviorInsight {
    type: 'sender_frequency' | 'topic_interest' | 'work_hours';
    description: string;
    confidence: number;
    data: any;
}

export interface EmailGoalLink {
    emailId: string;
    goalId: number;
    relevanceScore: number;
}

export interface ContextOutput {
    activeGoals: UserGoal[];
    emailGoalRelevance: Map<string, number[]>;
    behaviorInsights: BehaviorInsight[];
}
