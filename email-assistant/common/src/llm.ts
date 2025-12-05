import OpenAI from 'openai';
import dotenv from 'dotenv';
import path from 'path';

// Load root-level .env so the backend picks up OPENAI_API_KEY without manual export
dotenv.config({ path: path.resolve(__dirname, '..', '..', '.env') });
dotenv.config(); // fallback to current working dir .env if present

export class LLMClient {
    private client: OpenAI;

    constructor(apiKey?: string) {
        this.client = new OpenAI({
            apiKey: apiKey || process.env.OPENAI_API_KEY,
        });
    }

    async callModel(
        prompt: string,
        systemPrompt: string = 'You are a helpful assistant.',
        model: string = 'gpt-5',
        jsonMode: boolean = false
    ): Promise<string | null> {
        try {
            const response = await this.client.chat.completions.create({
                model,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: prompt },
                ],
                response_format: jsonMode ? { type: 'json_object' } : undefined,
            });

            return response.choices[0].message.content;
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
