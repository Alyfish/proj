/**
 * Screen Context API Client for Sidebar-OS
 * Connects to the Python screen-context service for screen capture and AI analysis
 */

// Base URL can be overridden with VITE_SCREEN_CONTEXT_API_URL
const API_BASE_URL = import.meta.env.VITE_SCREEN_CONTEXT_API_URL || 'http://localhost:3002';

export interface ScreenContext {
    screenshot?: string;      // Base64 encoded PNG
    selected_text?: string;   // Currently selected text
    browser_url?: string;     // Active browser URL
    active_app?: string;      // Active application name
    captured_at: string;      // ISO timestamp
}

export interface CaptureResponse {
    success: boolean;
    screenshot?: string;
    selected_text?: string;
    browser_url?: string;
    active_app?: string;
    captured_at: string;
    error?: string;
}

export interface AnalyzeResponse {
    success: boolean;
    response?: string;
    context_used: {
        has_screenshot: boolean;
        has_selected_text: boolean;
        has_browser_url: boolean;
        active_app?: string;
    };
    error?: string;
}

export interface PermissionsResponse {
    screen_recording: boolean;
    accessibility: boolean;
    message: string;
}

export class ScreenContextClient {
    private baseUrl: string;

    constructor(baseUrl: string = API_BASE_URL) {
        this.baseUrl = baseUrl;
    }

    private async fetchWithFallback(url: string, init?: RequestInit): Promise<Response> {
        try {
            return await fetch(url, init);
        } catch (err) {
            // Try 127.0.0.1 fallback if localhost fails
            if (this.baseUrl.includes('localhost')) {
                const fallbackUrl = url.replace('localhost', '127.0.0.1');
                return await fetch(fallbackUrl, init);
            }
            throw err;
        }
    }

    /**
     * Check if the screen context service is running
     */
    async healthCheck(): Promise<boolean> {
        try {
            const response = await this.fetchWithFallback(`${this.baseUrl}/health`);
            return response.ok;
        } catch (error) {
            console.error('Screen context health check failed:', error);
            return false;
        }
    }

    /**
     * Check system permissions for screen capture
     */
    async checkPermissions(): Promise<PermissionsResponse> {
        try {
            const response = await this.fetchWithFallback(`${this.baseUrl}/permissions`);
            if (!response.ok) {
                throw new Error(`Server returned ${response.status}`);
            }
            return await response.json();
        } catch (error) {
            console.error('Error checking permissions:', error);
            return {
                screen_recording: false,
                accessibility: false,
                message: 'Could not connect to screen context service'
            };
        }
    }

    /**
     * Capture current screen context (screenshot, selected text, browser URL)
     */
    async captureContext(): Promise<CaptureResponse> {
        try {
            const response = await this.fetchWithFallback(`${this.baseUrl}/capture`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });

            if (!response.ok) {
                throw new Error(`Server returned ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            console.error('Error capturing context:', error);
            return {
                success: false,
                captured_at: new Date().toISOString(),
                error: error instanceof Error ? error.message : 'Failed to capture context'
            };
        }
    }

    /**
     * Capture context and analyze with AI
     */
    async analyzeWithContext(
        query: string,
        options?: {
            includeScreenshot?: boolean;
            includeSelectedText?: boolean;
            includeBrowserUrl?: boolean;
        }
    ): Promise<AnalyzeResponse> {
        try {
            const response = await this.fetchWithFallback(`${this.baseUrl}/analyze`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    query,
                    include_screenshot: options?.includeScreenshot ?? true,
                    include_selected_text: options?.includeSelectedText ?? true,
                    include_browser_url: options?.includeBrowserUrl ?? true
                })
            });

            if (!response.ok) {
                throw new Error(`Server returned ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            console.error('Error analyzing with context:', error);
            return {
                success: false,
                context_used: {
                    has_screenshot: false,
                    has_selected_text: false,
                    has_browser_url: false
                },
                error: error instanceof Error ? error.message : 'Failed to analyze context'
            };
        }
    }
}

// Export singleton instance
export const screenContext = new ScreenContextClient();
