import { AgentState } from "../state";
import { GmailClient } from "@email-assistant/agent-gmail/src/gmailClient";
import { Email } from "@email-assistant/common/src/types";

const gmailClient = new GmailClient();

export const gmailFetcherNode = async (state: AgentState): Promise<Partial<AgentState>> => {
    const { keywords } = state;

    // Join keywords with OR to maximize recall (Prioritizer will filter later)
    // But keep explicit filters like 'from:', 'subject:', 'after:' separate if possible?
    // For now, simple OR join is better than AND (default space)
    const query = keywords.join(" OR ");

    if (process.env.MOCK_GMAIL === "true") {
        console.log("[GmailFetcher] Using MOCK mode.");
        return {
            emails: [
                {
                    id: "mock-1",
                    subject: "Project X Update",
                    from: "boss@company.com",
                    to: "me@company.com",
                    timestamp: new Date(),
                    snippet: "Here is the latest on Project X...",
                    body: "Here is the latest on Project X. We need to review.",
                    labels: ["INBOX", "IMPORTANT"]
                },
                {
                    id: "mock-2",
                    subject: "Lunch?",
                    from: "colleague@company.com",
                    to: "me@company.com",
                    timestamp: new Date(),
                    snippet: "Lunch at 12 today?",
                    body: "Lunch at 12 today?",
                    labels: ["INBOX"]
                }
            ]
        };
    }

    await gmailClient.init();

    console.log(`[GmailFetcher] Searching Gmail with query: "${query}"`);

    const messages = await gmailClient.listMessages(query, 50); // Increased limit to 50

    const emails: Email[] = [];
    for (const msg of messages) {
        if (msg.id) {
            const fullMsg = await gmailClient.getMessage(msg.id);
            if (fullMsg) {
                // Map Gmail message to Email type
                const headers = fullMsg.payload?.headers || [];
                const subject = headers.find(h => h.name === 'Subject')?.value || '(No Subject)';
                const from = headers.find(h => h.name === 'From')?.value || '(Unknown)';
                const dateHeader = headers.find(h => h.name === 'Date')?.value;
                const body = fullMsg.snippet || '';

                emails.push({
                    id: msg.id,
                    subject,
                    from,
                    to: '',
                    timestamp: dateHeader ? new Date(dateHeader) : new Date(),
                    snippet: fullMsg.snippet || '',
                    body,
                    labels: fullMsg.labelIds || []
                });
            }
        }
    }

    console.log(`[GmailFetcher] Fetched ${emails.length} emails:`);
    emails.forEach(e => console.log(` - [${e.id}] ${e.subject} (${e.from})`));

    return { emails };
};
