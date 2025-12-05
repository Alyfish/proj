import { PrioritizationAgent } from '../../agents/prioritizer/src/prioritizationAgent';
import { SuggestionAgent } from '../../agents/suggester/src/suggestionAgent';
import { EmailMetadata, EmailAnalysisResult } from '@email-assistant/common/src/types';
import { db } from '@email-assistant/common/src/db';
import { v4 as uuidv4 } from 'uuid';

async function runTests() {
    console.log("🧪 Starting Mock Logic Tests...\n");

    // Setup Test User
    const userId = uuidv4();
    // Check if user exists first to avoid unique constraint error
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get('test-logic@example.com') as { id: string } | undefined;

    if (existing) {
        // Use existing user but update prefs just in case
        db.prepare('UPDATE users SET preferences = ? WHERE id = ?').run(
            JSON.stringify({ vipSenders: ['vip@example.com'], urgentKeywords: ['urgent'] }),
            existing.id
        );
        // We must use the existing ID for the test to work if we want to reuse data, 
        // but actually we generated a new userId above. Let's swap.
    } else {
        db.prepare('INSERT INTO users (id, email, preferences) VALUES (?, ?, ?)').run(
            userId,
            'test-logic@example.com',
            JSON.stringify({ vipSenders: ['vip@example.com'], urgentKeywords: ['urgent'] })
        );
    }

    const finalUserId = existing ? existing.id : userId;

    // --- Test 1: Prioritization ---
    console.log("🔹 Test 1: Prioritization Agent");
    const mockEmails: EmailMetadata[] = [
        {
            id: '1', threadId: '1', from: 'vip@example.com', to: ['me'],
            subject: 'Hello', snippet: '', receivedAt: new Date().toISOString(), labels: []
        },
        {
            id: '2', threadId: '2', from: 'random@example.com', to: ['me'],
            subject: 'URGENT: Update', snippet: '', receivedAt: new Date().toISOString(), labels: []
        },
        {
            id: '3', threadId: '3', from: 'random@example.com', to: ['me'],
            subject: 'Newsletter', snippet: '', receivedAt: new Date().toISOString(), labels: []
        }
    ];

    // Insert mock emails into DB so FK constraints work
    const insertEmail = db.prepare(`
    INSERT OR IGNORE INTO emails (id, user_id, thread_id, sender, subject, snippet, received_at, labels, processed)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
  `);

    for (const e of mockEmails) {
        insertEmail.run(e.id, finalUserId, e.threadId, e.from, e.subject, e.snippet, e.receivedAt, JSON.stringify(e.labels));
    }

    const prioritizer = new PrioritizationAgent();
    const pResult = await prioritizer.run({ userId: finalUserId, emails: mockEmails });

    const high = pResult.emails.find(e => e.id === '1');
    const medium = pResult.emails.find(e => e.id === '2');
    const low = pResult.emails.find(e => e.id === '3');

    if (high?.priority === 'medium' || high?.priority === 'high') console.log("✅ VIP email prioritized correctly (Medium/High)");
    else console.error("❌ VIP email failed prioritization", high?.priority);

    if (medium?.priority === 'medium') console.log("✅ Urgent keyword email prioritized correctly (Medium)");
    else console.error("❌ Urgent email failed prioritization", medium?.priority);

    if (low?.priority === 'low') console.log("✅ Normal email prioritized correctly (Low)");
    else console.error("❌ Normal email failed prioritization", low?.priority);


    // --- Test 2: Suggestions ---
    console.log("\n🔹 Test 2: Suggestion Agent");
    const mockAnalysis: EmailAnalysisResult = {
        emailId: '2',
        summary: 'Needs update by Friday',
        entities: [],
        isUrgent: true,
        actions: [
            { description: 'Send report', dueDate: '2025-11-28', priority: 'high' }
        ]
    };

    const suggester = new SuggestionAgent();
    const sResult = await suggester.run({ userId: finalUserId, analyses: [mockAnalysis] });

    if (sResult.suggestions.length === 1) {
        console.log("✅ Suggestion generated");
        const s = sResult.suggestions[0];
        if (s.title === 'Send report' && s.priority === 'high') {
            console.log("✅ Suggestion content matches action");
        } else {
            console.error("❌ Suggestion content mismatch", s);
        }
    } else {
        console.error("❌ No suggestion generated");
    }

    console.log("\n🎉 Tests Completed.");
}

runTests().catch(console.error);
