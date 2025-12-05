import { runBatchForUser } from './runBatch';
import { db } from '@email-assistant/common/src/db';
import { v4 as uuidv4 } from 'uuid';

async function main() {
    // Ensure a user exists for testing
    const testEmail = 'test@example.com';
    let user = db.prepare('SELECT id FROM users WHERE email = ?').get(testEmail) as { id: string } | undefined;

    if (!user) {
        const newId = uuidv4();
        db.prepare('INSERT INTO users (id, email, preferences) VALUES (?, ?, ?)').run(
            newId,
            testEmail,
            JSON.stringify({ vipSenders: ['boss@company.com'], urgentKeywords: ['urgent'] })
        );
        user = { id: newId };
        console.log(`Created test user ${newId}`);
    }

    await runBatchForUser(user.id);
}

main().catch(console.error);
