import * as dotenv from 'dotenv';
dotenv.config();
import { GmailClient } from './src/gmailClient';

async function main() {
    console.log("Starting Gmail Agent...");
    const client = new GmailClient();
    try {
        await client.init();
        console.log("Gmail Client initialized successfully.");
        const messages = await client.listMessages();
        console.log(`Found ${messages.length} messages.`);
    } catch (error) {
        console.error("Error initializing Gmail Client:", error);
    }
}

main().catch(console.error);
