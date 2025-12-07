import { AgentState } from "../state";
import { GmailClient } from "@email-assistant/agent-gmail/src/gmailClient";
import { Email } from "@email-assistant/common/src/types";

const gmailClient = new GmailClient();

function quoteIfNeeded(term: string): string {
    return term.includes(" ") ? `"${term}"` : term;
}

// Legacy query builder (fallback)
function buildLegacyQuery(mustHave: string[], niceToHave: string[], keywords: string[]): string {
    let query = "";

    if (mustHave.length > 0) {
        if (mustHave.length === 1) {
            query = quoteIfNeeded(mustHave[0]);
        } else if (mustHave.length === 2) {
            query = mustHave.map(quoteIfNeeded).join(" ");
        } else {
            query = `(${mustHave.map(quoteIfNeeded).join(" OR ")})`;
        }

        if (niceToHave.length > 0) {
            const niceToHaveQuery = niceToHave.map(quoteIfNeeded).join(" OR ");
            query = `${query} (${niceToHaveQuery})`;
        }
    } else {
        const allKeywords = [...keywords, ...niceToHave];
        query = allKeywords.map(quoteIfNeeded).join(" OR ");
    }

    return query.trim() || "newer_than:1d";
}

function decodeBase64Url(data: string): string {
    const normalized = data.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    return Buffer.from(padded, 'base64').toString('utf-8');
}

function extractBody(msg: any): string {
    if (!msg) return '';
    if (msg.payload?.body?.data) {
        return decodeBase64Url(msg.payload.body.data);
    }
    if (Array.isArray(msg.payload?.parts)) {
        // prefer text/plain, else first part
        const plain = msg.payload.parts.find((p: any) => p.mimeType === 'text/plain' && p.body?.data);
        const part = plain || msg.payload.parts.find((p: any) => p.body?.data);
        if (part?.body?.data) {
            return decodeBase64Url(part.body.data);
        }
    }
    return msg.snippet || '';
}

function tokenize(text: string): string[] {
    const stop = new Set(['the', 'and', 'for', 'from', 'with', 'that', 'this', 'your', 'you', 'about', 'into', 'what', 'when', 'how', 'much', 'should']);
    return text
        .toLowerCase()
        .split(/[^a-z0-9@.]+/)
        .filter(t => t.length > 2 && !stop.has(t))
        .slice(0, 15); // keep it compact for Gmail query
}

async function searchEmails(query: string): Promise<Email[]> {
    await gmailClient.init();

    const messages = await gmailClient.listMessages(query, 60);

    const emails: Email[] = [];
    for (const msg of messages) {
        if (msg.id) {
            const fullMsg = await gmailClient.getMessage(msg.id);
            if (fullMsg) {
                const headers = fullMsg.payload?.headers || [];
                const subject = headers.find(h => h.name === 'Subject')?.value || '(No Subject)';
                const from = headers.find(h => h.name === 'From')?.value || '(Unknown)';
                const dateHeader = headers.find(h => h.name === 'Date')?.value;
                const fullBody = extractBody(fullMsg);
                // keep body short for prompts
                const body = fullBody.substring(0, 4000);

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

    return emails;
}

export const gmailFetcherNode = async (state: AgentState): Promise<Partial<AgentState>> => {
    const { gmail_query, keywords, must_have_keywords, nice_to_have_keywords, user_query } = state;

    const mustHave = must_have_keywords || [];
    const niceToHave = nice_to_have_keywords || [];

    // Mock mode for testing
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
                }
            ]
        };
    }

    let emails: Email[] = [];
    let strictEmails: Email[] = [];
    let broadEmails: Email[] = [];
    let keywordEmails: Email[] = [];
    const usedQueries: string[] = [];

    const llmQuery = gmail_query?.trim();
    const broadQuery = buildLegacyQuery(mustHave, niceToHave, keywords || []);

    // Keyword sweep built from the user's own query/must/nice terms (no domain-specific list)
    const tokenBag = new Set<string>();
    tokenize((user_query || '')).forEach(t => tokenBag.add(t));
    (keywords || []).forEach(k => tokenize(k).forEach(t => tokenBag.add(t)));
    mustHave.forEach(k => tokenize(k).forEach(t => tokenBag.add(t)));
    niceToHave.forEach(k => tokenize(k).forEach(t => tokenBag.add(t)));
    const keywordQuery = Array.from(tokenBag).map(quoteIfNeeded).join(" OR ");

    const queriesToRun: Promise<Email[]>[] = [];

    // 1. Strict Query (LLM)
    if (llmQuery) {
        console.log(`[GmailFetcher] 🤖 Running Strict (LLM) query: "${llmQuery}"`);
        usedQueries.push(llmQuery);
        queriesToRun.push(searchEmails(llmQuery).then(res => {
            strictEmails = res;
            return res;
        }));
    }

    // 2. Broad Query (Legacy)
    if (broadQuery && broadQuery !== llmQuery) {
        console.log(`[GmailFetcher] 🌐 Running Broad (Legacy) query: "${broadQuery}"`);
        usedQueries.push(broadQuery);
        queriesToRun.push(searchEmails(broadQuery).then(res => {
            broadEmails = res;
            return res;
        }));
    }

    // 3. Keyword sweep derived from user language
    if (keywordQuery.length > 0) {
        console.log(`[GmailFetcher] 🔍 Running Keyword sweep query: "${keywordQuery}"`);
        usedQueries.push(keywordQuery);
        queriesToRun.push(searchEmails(keywordQuery).then(res => {
            keywordEmails = res;
            return res;
        }));
    }

    // Wait for all
    await Promise.all(queriesToRun);

    // Merge and Deduplicate
    const allEmails = [...strictEmails, ...broadEmails, ...keywordEmails];
    const seenIds = new Set<string>();
    for (const email of allEmails) {
        if (!seenIds.has(email.id)) {
            emails.push(email);
            seenIds.add(email.id);
        }
    }

    // Sort by date desc (just in case)
    emails.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    // Failsafe: if Union returned 0, try a very broad fallback
    if (emails.length === 0) {
        console.log("[GmailFetcher] ⚠️ Union search returned 0 results. Trying broad keyword OR.");
        const fallbackQuery = (Array.from(tokenBag).length ? Array.from(tokenBag) : ['newer_than:2d'])
            .map(quoteIfNeeded)
            .join(" OR ");
        usedQueries.push(fallbackQuery);
        emails = await searchEmails(fallbackQuery);
    }

    console.log(`[GmailFetcher] ✅ Fetched ${emails.length} emails using queries: "${usedQueries.join('" + "')}"`);
    emails.slice(0, 10).forEach(e => console.log(` - [${e.id}] ${e.subject} (${e.from})`));
    if (emails.length > 10) {
        console.log(` ... and ${emails.length - 10} more`);
    }

    return { emails };
};
