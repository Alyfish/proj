import OpenAI from 'openai';
import dotenv from 'dotenv';
import path from 'path';

// Load root-level .env so the backend picks up OPENAI_API_KEY without manual export
dotenv.config({ path: path.resolve(__dirname, '..', '..', '.env') });
dotenv.config(); // fallback to current working dir .env if present

export class LLMClient {
    private client: OpenAI;
    private responseCache: Map<string, { response: string; timestamp: number }> = new Map();
    private readonly CACHE_TTL = 1000 * 60 * 60; // 1 hour

    constructor(apiKey?: string) {
        this.client = new OpenAI({
            apiKey: apiKey || process.env.OPENAI_API_KEY,
        });
    }

    /**
     * Estimate token count for text
     * Rough approximation: 1 token ≈ 4 characters for English text
     */
    estimateTokens(text: string): number {
        return Math.ceil(text.length / 4);
    }

    /**
     * Create cache key from inputs
     */
    private getCacheKey(prompt: string, systemPrompt: string, model: string): string {
        const combined = `${model}:${systemPrompt}:${prompt}`;
        // Simple hash function
        let hash = 0;
        for (let i = 0; i < combined.length; i++) {
            const char = combined.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        return hash.toString(36);
    }

    /**
     * Clear expired cache entries
     */
    private cleanCache(): void {
        const now = Date.now();
        for (const [key, value] of this.responseCache.entries()) {
            if (now - value.timestamp > this.CACHE_TTL) {
                this.responseCache.delete(key);
            }
        }
    }

    async callModel(
        prompt: string,
        systemPrompt: string = 'You are a helpful assistant.',
        model: string = 'gpt-5',
        jsonMode: boolean = false
    ): Promise<string | null> {
        // Check cache first
        const cacheKey = this.getCacheKey(prompt, systemPrompt, model);
        const cached = this.responseCache.get(cacheKey);

        if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
            console.log('[LLM] Cache hit, returning cached response');
            return cached.response;
        }

        // Clean old cache entries periodically
        if (this.responseCache.size > 100) {
            this.cleanCache();
        }

        try {
            const response = await this.client.chat.completions.create({
                model,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: prompt },
                ],
                response_format: jsonMode ? { type: 'json_object' } : undefined,
            });

            const result = response.choices[0].message.content;

            // Cache the response
            if (result) {
                this.responseCache.set(cacheKey, {
                    response: result,
                    timestamp: Date.now()
                });
            }

            return result;
        } catch (error) {
            console.error('Error calling LLM:', error);
            return null;
        }
    }

    async embed(text: string): Promise<number[] | null> {
        try {
            const res = await this.client.embeddings.create({
                model: 'text-embedding-3-small',
                input: text,
            });
            return res.data?.[0]?.embedding || null;
        } catch (error) {
            console.error('Error generating embedding:', error);
            return null;
        }
    }
}

export const llm = new LLMClient();
