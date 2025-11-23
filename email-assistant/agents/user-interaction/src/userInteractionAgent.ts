import { Agent, UserGoal, EmailMetadata } from '@email-assistant/common/src/types';
import { db } from '@email-assistant/common/src/db';
import * as readline from 'readline';

interface UserInteractionInput {
    userId: string;
    inferredGoals?: UserGoal[];
    ambiguousEmails?: EmailMetadata[];
    mode?: 'onboarding' | 'confirmation' | 'weekly_checkin';
}

interface UserInteractionOutput {
    confirmedGoals: UserGoal[];
    newGoals: UserGoal[];
    userResponses: Map<string, string>;
}

export class UserInteractionAgent implements Agent<UserInteractionInput, UserInteractionOutput> {
    name = 'UserInteractionAgent';

    async run(input: UserInteractionInput): Promise<UserInteractionOutput> {
        console.log(`\n[${this.name}] Starting user interaction...`);

        const mode = input.mode || this.determineMode(input);

        switch (mode) {
            case 'onboarding':
                return await this.onboardUser(input.userId);
            case 'confirmation':
                return await this.confirmGoals(input.userId, input.inferredGoals || []);
            case 'weekly_checkin':
                return await this.weeklyCheckin(input.userId);
            default:
                return { confirmedGoals: [], newGoals: [], userResponses: new Map() };
        }
    }

    private determineMode(input: UserInteractionInput): 'onboarding' | 'confirmation' | 'weekly_checkin' {
        // Check if user has any goals
        const goalCount = db.prepare('SELECT COUNT(*) as count FROM user_goals WHERE user_id = ?')
            .get(input.userId) as { count: number };

        if (goalCount.count === 0) {
            return 'onboarding';
        }

        // Check if there are medium-confidence inferred goals
        if (input.inferredGoals && input.inferredGoals.some(g => g.confidence >= 0.6 && g.confidence < 0.8)) {
            return 'confirmation';
        }

        return 'weekly_checkin';
    }

    private async onboardUser(userId: string): Promise<UserInteractionOutput> {
        console.log('\n👋 Welcome to your Email Assistant!\n');
        console.log('To help me prioritize your emails, I\'d like to understand what you\'re working on.\n');

        const goals: UserGoal[] = [];

        // Ask for top 3 priorities
        for (let i = 1; i <= 3; i++) {
            const goal = await this.askQuestion(`Priority ${i} (or press Enter to skip):`);
            if (goal.trim()) {
                const result = db.prepare(`
          INSERT INTO user_goals (user_id, goal_text, status, confidence, source)
          VALUES (?, ?, 'active', 1.0, 'explicit')
        `).run(userId, goal.trim());

                goals.push({
                    id: Number(result.lastInsertRowid),
                    userId,
                    goalText: goal.trim(),
                    status: 'active',
                    confidence: 1.0,
                    source: 'explicit'
                });
            }
        }

        console.log(`\n✅ Great! I'll prioritize emails related to these goals.\n`);

        return {
            confirmedGoals: goals,
            newGoals: goals,
            userResponses: new Map()
        };
    }

    private async confirmGoals(userId: string, inferredGoals: UserGoal[]): Promise<UserInteractionOutput> {
        console.log('\n🤔 I noticed you\'ve been focusing on these areas:\n');

        const mediumConfidenceGoals = inferredGoals.filter(g => g.confidence >= 0.6 && g.confidence < 0.8);

        for (let i = 0; i < mediumConfidenceGoals.length; i++) {
            const goal = mediumConfidenceGoals[i];
            const icon = goal.confidence >= 0.75 ? '✅' : '⚠️';
            console.log(`${i + 1}. ${icon} ${goal.goalText} (${Math.round(goal.confidence * 100)}% confidence)`);
        }

        console.log('');
        const response = await this.askQuestion('Are these accurate? [y/n/edit]:');

        const confirmedGoals: UserGoal[] = [];

        if (response.toLowerCase() === 'y' || response.toLowerCase() === 'yes') {
            // Confirm all goals
            for (const goal of mediumConfidenceGoals) {
                if (goal.id) {
                    db.prepare('UPDATE user_goals SET confidence = 1.0, source = "confirmed" WHERE id = ?')
                        .run(goal.id);
                    confirmedGoals.push({ ...goal, confidence: 1.0, source: 'confirmed' });
                }
            }
            console.log('\n✅ Goals confirmed!\n');
        } else if (response.toLowerCase() === 'edit') {
            // Allow editing individual goals
            for (let i = 0; i < mediumConfidenceGoals.length; i++) {
                const goal = mediumConfidenceGoals[i];
                const keep = await this.askQuestion(`Keep "${goal.goalText}"? [y/n]:`);

                if (keep.toLowerCase() === 'y' || keep.toLowerCase() === 'yes') {
                    if (goal.id) {
                        db.prepare('UPDATE user_goals SET confidence = 1.0, source = "confirmed" WHERE id = ?')
                            .run(goal.id);
                        confirmedGoals.push({ ...goal, confidence: 1.0, source: 'confirmed' });
                    }
                } else {
                    // Remove goal
                    if (goal.id) {
                        db.prepare('DELETE FROM user_goals WHERE id = ?').run(goal.id);
                    }
                }
            }
        }

        // Ask if they want to add new goals
        const addNew = await this.askQuestion('\nAdd a new goal? [y/n]:');
        const newGoals: UserGoal[] = [];

        if (addNew.toLowerCase() === 'y' || addNew.toLowerCase() === 'yes') {
            const newGoalText = await this.askQuestion('New goal:');
            if (newGoalText.trim()) {
                const result = db.prepare(`
          INSERT INTO user_goals (user_id, goal_text, status, confidence, source)
          VALUES (?, ?, 'active', 1.0, 'explicit')
        `).run(userId, newGoalText.trim());

                newGoals.push({
                    id: Number(result.lastInsertRowid),
                    userId,
                    goalText: newGoalText.trim(),
                    status: 'active',
                    confidence: 1.0,
                    source: 'explicit'
                });
            }
        }

        return {
            confirmedGoals,
            newGoals,
            userResponses: new Map()
        };
    }

    private async weeklyCheckin(userId: string): Promise<UserInteractionOutput> {
        console.log('\n📅 Weekly Check-in\n');

        // Get current goals
        const currentGoals = db.prepare(`
      SELECT id, goal_text, status, confidence, source
      FROM user_goals
      WHERE user_id = ? AND status = 'active'
    `).all(userId) as any[];

        if (currentGoals.length === 0) {
            console.log('No active goals found. Let\'s set some up!\n');
            return await this.onboardUser(userId);
        }

        console.log('Your current goals:');
        currentGoals.forEach((g, i) => {
            console.log(`${i + 1}. ${g.goal_text}`);
        });

        console.log('');
        const response = await this.askQuestion('Still focused on these? [y/update]:');

        if (response.toLowerCase() === 'update') {
            // Mark completed goals
            for (const goal of currentGoals) {
                const status = await this.askQuestion(`"${goal.goal_text}" - [active/completed/paused]:`);
                if (status.toLowerCase() === 'completed' || status.toLowerCase() === 'paused') {
                    db.prepare('UPDATE user_goals SET status = ? WHERE id = ?')
                        .run(status.toLowerCase(), goal.id);
                }
            }
        }

        // Ask for new goals
        const addNew = await this.askQuestion('\nAny new goals for this week? [y/n]:');
        const newGoals: UserGoal[] = [];

        if (addNew.toLowerCase() === 'y' || addNew.toLowerCase() === 'yes') {
            const newGoalText = await this.askQuestion('New goal:');
            if (newGoalText.trim()) {
                const result = db.prepare(`
          INSERT INTO user_goals (user_id, goal_text, status, confidence, source)
          VALUES (?, ?, 'active', 1.0, 'explicit')
        `).run(userId, newGoalText.trim());

                newGoals.push({
                    id: Number(result.lastInsertRowid),
                    userId,
                    goalText: newGoalText.trim(),
                    status: 'active',
                    confidence: 1.0,
                    source: 'explicit'
                });
            }
        }

        console.log('\n✅ Check-in complete!\n');

        return {
            confirmedGoals: currentGoals.map(g => ({
                id: g.id,
                userId,
                goalText: g.goal_text,
                status: g.status,
                confidence: g.confidence,
                source: g.source
            })),
            newGoals,
            userResponses: new Map()
        };
    }

    private askQuestion(prompt: string): Promise<string> {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        return new Promise((resolve) => {
            rl.question(prompt + ' ', (answer) => {
                rl.close();
                resolve(answer);
            });
        });
    }
}
