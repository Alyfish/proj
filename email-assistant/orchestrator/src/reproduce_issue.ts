
import { db } from '../../common/src/db';

const userId = 'test-user-id';

try {
    console.log('Starting cleanup...');

    // 1. Delete dependent records first (Child tables)
    console.log('Disabling FKs...');
    db.prepare('PRAGMA foreign_keys = OFF').run();

    try {
        console.log('Deleting email_embeddings...');
        db.prepare('DELETE FROM email_embeddings WHERE email_id IN (SELECT id FROM emails WHERE user_id = ?)').run(userId);

        console.log('Deleting tasks...');
        db.prepare('DELETE FROM tasks WHERE user_id = ?').run(userId);

        console.log('Deleting email_interactions...');
        db.prepare('DELETE FROM email_interactions WHERE user_id = ?').run(userId);

        console.log('Deleting email_goal_links...');
        db.prepare('DELETE FROM email_goal_links WHERE email_id IN (SELECT id FROM emails WHERE user_id = ?)').run(userId);

        // 2. Delete parent records
        console.log('Deleting emails...');
        db.prepare('DELETE FROM emails WHERE user_id = ?').run(userId);

        console.log('Deleting runs...');
        db.prepare('DELETE FROM runs WHERE user_id = ?').run(userId);
    } finally {
        console.log('Enabling FKs...');
        db.prepare('PRAGMA foreign_keys = ON').run();
    }

    console.log('Cleanup successful!');
} catch (error) {
    console.error('Cleanup failed:', error);
}
