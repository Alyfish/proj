// Email Assistant API Client for Sidebar-OS
// Base URL can be overridden with VITE_EMAIL_ASSISTANT_API_BASE_URL to point at a remote or non-default server.
const API_BASE_URL = import.meta.env.VITE_EMAIL_ASSISTANT_API_BASE_URL || 'http://localhost:3001/api';

export interface EmailAssistantResponse {
    success: boolean;
    textOutput?: string;
    quickStatus?: string;
    data?: {
        emailsProcessed: number;
        suggestionsGenerated: number;
        highPriority: number;
        mediumPriority: number;
        lowPriority: number;
        recentEmails?: Array<{
            id: string;
            subject: string;
            snippet: string;
            sender: string;
            receivedAt: string;
            priority?: string;
        }>;
        analyses?: Array<{
            emailId: string;
            summary: string;
            actionItems: string[];
            deadline?: string;
            entities: string[];
            relevance?: number;
        }>;
        suggestions?: Array<{
            type: 'task' | 'reply' | 'info';
            title: string;
            details: string;
            sourceEmailId?: string;
            priority: 'high' | 'medium' | 'low';
        }>;
        intent?: string;
        query?: string;
        activeGoals?: Array<{
            id?: number;
            goalText: string;
            confidence: number;
        }>;
        emailGoalRelevance?: Record<string, number[]>;
    };
    error?: string;
    message?: string;
}

export interface StatusResponse {
    hasRun: boolean;
    status?: string;
    createdAt?: string;
    completedAt?: string;
    suggestionsCount?: number;
    message?: string;
    error?: string;
}

export class EmailAssistantClient {
    private baseUrl: string;

    constructor(baseUrl: string = API_BASE_URL) {
        this.baseUrl = baseUrl;
    }

    private async withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), ms);
        try {
            // @ts-ignore signal is supported in fetch init
            const result = await promise;
            clearTimeout(timeout);
            return result;
        } catch (err) {
            clearTimeout(timeout);
            throw err;
        }
    }

    private async fetchWithRetry(url: string, init: RequestInit, retries = 1, timeoutMs = 300000): Promise<Response> {
        try {
            return await this.withTimeout(fetch(url, { ...init, signal: (init as any)?.signal }), timeoutMs);
        } catch (error) {
            if (retries > 0) {
                await new Promise(res => setTimeout(res, 1500));
                return this.fetchWithRetry(url, init, retries - 1, timeoutMs);
            }
            throw error;
        }
    }

    /**
     * Process emails for a user
     */
    async processEmails(userId: string, query?: string, quick?: boolean): Promise<EmailAssistantResponse> {
        const tryFetch = async (urlBase: string) => {
            return await this.fetchWithRetry(
                `${urlBase}/process`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ userId, query, quick }),
                },
                1, // one retry on network failure
                300000 // up to 300s (5 min) to allow long-running processing
            );
        };

        try {
            let response: Response;
            try {
                response = await tryFetch(this.baseUrl);
            } catch (err) {
                // If localhost fails, try 127.0.0.1 as fallback if we're using default localhost
                if (this.baseUrl.includes('localhost')) {
                    console.warn('Failed to connect to localhost, trying 127.0.0.1...');
                    const fallbackUrl = this.baseUrl.replace('localhost', '127.0.0.1');
                    response = await tryFetch(fallbackUrl);
                } else {
                    throw err;
                }
            }

            if (!response.ok) {
                const errorData = await response.json();
                return {
                    success: false,
                    error: errorData.error || 'Failed to process emails',
                    message: errorData.message || `Server returned ${response.status}`
                };
            }

            return await response.json();
        } catch (error) {
            console.error('Error calling email assistant API:', error);
            return {
                success: false,
                error: 'Network error',
                message: error instanceof Error ? error.message : String(error)
            };
        }
    }

    /**
     * Get processing status for a user
     */
    async getStatus(userId: string): Promise<StatusResponse> {
        const tryFetch = async (urlBase: string) => {
            return await fetch(`${urlBase}/status?userId=${encodeURIComponent(userId)}`);
        };

        try {
            let response: Response;
            try {
                response = await tryFetch(this.baseUrl);
            } catch (err) {
                if (this.baseUrl.includes('localhost')) {
                    const fallbackUrl = this.baseUrl.replace('localhost', '127.0.0.1');
                    response = await tryFetch(fallbackUrl);
                } else {
                    throw err;
                }
            }

            if (!response.ok) {
                const errorData = await response.json();
                return {
                    hasRun: false,
                    error: errorData.error || 'Failed to get status',
                    message: errorData.message || `Server returned ${response.status}`
                };
            }

            return await response.json();
        } catch (error) {
            console.error('Error getting status from email assistant API:', error);
            return {
                hasRun: false,
                error: 'Network error',
                message: error instanceof Error ? error.message : String(error)
            };
        }
    }

    /**
     * Check if the API server is running
     */
    async healthCheck(): Promise<boolean> {
        const tryFetch = async (urlBase: string) => {
            const response = await fetch(`${urlBase}/health`);
            return response.ok;
        };

        try {
            try {
                return await tryFetch(this.baseUrl);
            } catch (err) {
                if (this.baseUrl.includes('localhost')) {
                    const fallbackUrl = this.baseUrl.replace('localhost', '127.0.0.1');
                    return await tryFetch(fallbackUrl);
                }
                throw err;
            }
        } catch (error) {
            console.error('Health check failed:', error);
            return false;
        }
    }
}

// Export a singleton instance
export const emailAssistant = new EmailAssistantClient();
