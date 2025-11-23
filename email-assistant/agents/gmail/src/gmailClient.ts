import { google, gmail_v1 } from 'googleapis';
import { authorize } from './auth';

export class GmailClient {
    private gmail: gmail_v1.Gmail | null = null;

    async init() {
        const auth = await authorize();
        this.gmail = google.gmail({ version: 'v1', auth });
    }

    async listMessages(query: string = '', maxResults: number = 10): Promise<gmail_v1.Schema$Message[]> {
        if (!this.gmail) await this.init();

        const res = await this.gmail!.users.messages.list({
            userId: 'me',
            q: query,
            maxResults,
        });

        return res.data.messages || [];
    }

    async getMessage(messageId: string): Promise<gmail_v1.Schema$Message | null> {
        if (!this.gmail) await this.init();

        try {
            const res = await this.gmail!.users.messages.get({
                userId: 'me',
                id: messageId,
            });
            return res.data;
        } catch (error) {
            console.error(`Failed to get message ${messageId}:`, error);
            return null;
        }
    }
}
