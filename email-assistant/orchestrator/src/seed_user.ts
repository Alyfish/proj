import { db } from '@email-assistant/common/src/db';
import { v4 as uuidv4 } from 'uuid';

const email = process.argv[2] || 'me@example.com';
const vip = process.argv[3] || 'boss@example.com';

console.log(`Seeding user: ${email} with VIP: ${vip}`);

let user = db.prepare('SELECT id FROM users WHERE email = ?').get(email) as { id: string } | undefined;

if (user) {
    console.log(`User already exists (ID: ${user.id}). Updating preferences...`);
    db.prepare('UPDATE users SET preferences = ? WHERE id = ?').run(
        JSON.stringify({ vipSenders: [vip], urgentKeywords: ['urgent', 'asap'] }),
        user.id
    );
} else {
    const newId = uuidv4();
    db.prepare('INSERT INTO users (id, email, preferences) VALUES (?, ?, ?)').run(
        newId,
        email,
        JSON.stringify({ vipSenders: [vip], urgentKeywords: ['urgent', 'asap'] })
    );
    console.log(`Created new user (ID: ${newId})`);
}

console.log('Done.');
