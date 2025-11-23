import { GmailClient } from "./gmailClient";

async function main() {
    console.log("🚀 Starting Gmail API Test...");

    try {
        const gmail = new GmailClient();

        // 1. List Messages
        console.log("\n📥 Listing recent unread messages...");
        const msgs = await gmail.listMessages("label:INBOX is:unread", 5);

        if (msgs.length === 0) {
            console.log("No unread messages found. Trying to list any 5 messages...");
            const anyMsgs = await gmail.listMessages("label:INBOX", 5);
            if (anyMsgs.length === 0) {
                console.log("No messages found in INBOX at all.");
                return;
            }
            console.log(`Found ${anyMsgs.length} messages.`);

            // 2. Get Message Details
            const id = anyMsgs[0].id!;
            console.log(`\n🔍 Fetching details for message ID: ${id}`);
            const msg = await gmail.getMessage(id);
            console.log("Subject:", msg?.payload?.headers?.find(h => h.name === 'Subject')?.value);
            console.log("Snippet:", msg?.snippet);
        } else {
            console.log(`Found ${msgs.length} unread messages.`);

            // 2. Get Message Details
            const id = msgs[0].id!;
            console.log(`\n🔍 Fetching details for message ID: ${id}`);
            const msg = await gmail.getMessage(id);
            console.log("Subject:", msg?.payload?.headers?.find(h => h.name === 'Subject')?.value);
            console.log("Snippet:", msg?.snippet);
        }

        console.log("\n✅ Gmail API Test Completed Successfully!");
    } catch (error) {
        console.error("\n❌ Gmail API Test Failed:", error);
    }
}

main().catch(console.error);
