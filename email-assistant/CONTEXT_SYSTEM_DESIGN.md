# User Behavior Tracking & Context System - Design

## Problem Statement
Currently, prioritization is based only on static heuristics (VIP senders, keywords). We need to:
1. Track **how users interact** with emails (opens, time spent, replies)
2. Infer **user goals** from behavior patterns
3. Use this context to **improve prioritization** dynamically
4. Enable the system to **ask clarifying questions** about goals

## Proposed Solution

### 1. New Database Schema

#### `email_interactions` Table
Tracks every time a user opens/interacts with an email.

```sql
CREATE TABLE email_interactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  email_id TEXT NOT NULL,
  interaction_type TEXT, -- 'open', 'reply', 'archive', 'star', 'delete'
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  duration_seconds INTEGER, -- How long email was open
  FOREIGN KEY(user_id) REFERENCES users(id),
  FOREIGN KEY(email_id) REFERENCES emails(id)
);
```

#### `user_goals` Table
Stores inferred or explicitly stated user goals.

```sql
CREATE TABLE user_goals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  goal_text TEXT NOT NULL, -- "Complete Q4 report", "Hire new engineer"
  status TEXT DEFAULT 'active', -- 'active', 'completed', 'paused'
  confidence REAL, -- 0.0-1.0, how sure we are this is a goal
  source TEXT, -- 'inferred', 'explicit', 'llm'
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id)
);
```

#### `email_goal_links` Table
Links emails to relevant goals.

```sql
CREATE TABLE email_goal_links (
  email_id TEXT NOT NULL,
  goal_id INTEGER NOT NULL,
  relevance_score REAL, -- 0.0-1.0
  PRIMARY KEY(email_id, goal_id),
  FOREIGN KEY(email_id) REFERENCES emails(id),
  FOREIGN KEY(goal_id) REFERENCES user_goals(id)
);
```

### 2. New Agent: Context Agent

**Purpose**: Analyze user behavior and maintain goal context.

```typescript
interface ContextInput {
  userId: string;
  emails: EmailMetadata[];
  interactions?: EmailInteraction[]; // Optional: recent interactions
}

interface ContextOutput {
  activeGoals: UserGoal[];
  emailGoalRelevance: Map<string, GoalRelevance[]>; // emailId -> goals
  behaviorInsights: BehaviorInsight[];
}

class ContextAgent implements Agent<ContextInput, ContextOutput> {
  name = 'ContextAgent';
  
  async run(input: ContextInput): Promise<ContextOutput> {
    // 1. Analyze interaction patterns
    const patterns = await this.analyzeInteractionPatterns(input.userId);
    
    // 2. Infer goals from patterns
    const inferredGoals = await this.inferGoalsFromBehavior(patterns);
    
    // 3. Link emails to goals
    const emailGoalLinks = await this.linkEmailsToGoals(input.emails, inferredGoals);
    
    // 4. Generate insights
    const insights = this.generateInsights(patterns, inferredGoals);
    
    return {
      activeGoals: inferredGoals,
      emailGoalRelevance: emailGoalLinks,
      behaviorInsights: insights
    };
  }
}
```

### 3. Enhanced Prioritization Logic

**New Scoring Factors:**

```typescript
// Existing
+3 VIP sender
+2 Urgent keywords
+1 Recent (< 12 hours)

// NEW: Behavior-based
+4 Email relates to active high-priority goal
+3 Sender has high interaction rate (user opens their emails often)
+2 Subject matches recent search/focus patterns
+1 Thread user has opened 3+ times
-1 Sender user frequently archives without reading
```

### 4. Goal Inference Algorithm

**Signals for Goal Detection:**

1. **Email Clustering**
   - Emails with similar subjects opened repeatedly
   - Example: 5 emails about "Q4 report" → Goal: "Complete Q4 report"

2. **Sender Patterns**
   - Frequent interactions with specific sender
   - Example: 10 opens from "recruiter@company.com" → Goal: "Hiring process"

3. **Time Investment**
   - Emails user spends 5+ minutes reading
   - Example: Long email about "Project Alpha" read for 8 min → Goal: "Project Alpha delivery"

4. **Action Patterns**
   - Emails that lead to replies or tasks
   - Example: Email → Reply → Calendar event → Goal: "Meeting preparation"

**LLM-Assisted Goal Extraction:**

```typescript
async inferGoalsFromBehavior(patterns: InteractionPattern[]): Promise<UserGoal[]> {
  const prompt = `
    Analyze these email interaction patterns and infer the user's current goals:
    
    Top 10 most-opened emails:
    - "Q4 Financial Report - Draft Review" (opened 5x, 12 min total)
    - "Interview: Senior Engineer Candidate" (opened 3x, 8 min total)
    - "Project Alpha Deadline Extension Request" (opened 4x, 15 min total)
    
    Top senders by interaction:
    - boss@company.com (15 opens, 80% reply rate)
    - recruiter@company.com (8 opens, 60% reply rate)
    
    Return JSON:
    {
      "goals": [
        {
          "goal_text": "Complete Q4 financial report",
          "confidence": 0.9,
          "evidence": "Multiple opens and long read time on Q4 report emails"
        }
      ]
    }
  `;
  
  const response = await llm.callModel(prompt, 'You are a goal inference assistant.', 'gpt-4o', true);
  return JSON.parse(response).goals;
}
```

### 5. User Goal Clarification Flow

**Interactive Goal Confirmation:**

When confidence is medium (0.5-0.8), ask user:

```
🤔 I noticed you've been focusing on these areas:
1. Q4 Financial Report (high confidence)
2. Hiring a Senior Engineer (medium confidence)
3. Project Alpha Deadline (medium confidence)

Are these your current priorities? 
[Yes] [No] [Add Goal]
```

**Explicit Goal Setting:**

```typescript
interface GoalInput {
  userId: string;
  goalText: string;
  priority: 'high' | 'medium' | 'low';
  deadline?: string;
}

async function setUserGoal(input: GoalInput) {
  db.prepare(`
    INSERT INTO user_goals (user_id, goal_text, status, confidence, source)
    VALUES (?, ?, 'active', 1.0, 'explicit')
  `).run(input.userId, input.goalText);
}
```

### 6. Integration with Existing Pipeline

**Updated Orchestrator Flow:**

```typescript
async function runBatchForUser(userId: string) {
  // 1. Retrieval (unchanged)
  const retrievalResult = await emailRetrievalAgent.run({ userId });
  
  // 2. NEW: Context Analysis
  const contextResult = await contextAgent.run({
    userId,
    emails: retrievalResult.emails
  });
  
  // 3. Enhanced Prioritization (uses context)
  const prioritized = await prioritizationAgent.run({
    userId,
    emails: retrievalResult.emails,
    context: contextResult // NEW parameter
  });
  
  // 4. Analysis (unchanged)
  const analyzed = await analysisAgent.run({ userId, emails: prioritized.emails });
  
  // 5. Suggestion (uses goals)
  const suggestions = await suggestionAgent.run({
    userId,
    analyses: analyzed.analyses,
    activeGoals: contextResult.activeGoals // NEW parameter
  });
  
  return suggestions;
}
```

### 7. Data Collection Points

**Where to track interactions:**

1. **Email Client Integration** (Future)
   - Browser extension tracks opens
   - Desktop app tracks read time
   - Mobile app tracks interactions

2. **Gmail API Metadata** (Current)
   - Use Gmail's `historyId` to detect reads
   - Track label changes (UNREAD → READ)
   - Monitor thread activity

3. **Manual Logging** (Interim)
   - User can mark emails as "important to me"
   - CLI command: `mark-important <email-id>`

### 8. Privacy & Security

- All interaction data stored locally in SQLite
- No tracking data sent to external services
- User can clear interaction history anytime
- Goals are private and encrypted at rest

## Implementation Phases

### Phase A: Database Schema (Immediate)
- Add `email_interactions` table
- Add `user_goals` table
- Add `email_goal_links` table

### Phase B: Context Agent (Next)
- Implement basic interaction pattern analysis
- Build goal inference logic
- Create LLM-based goal extraction

### Phase C: Enhanced Prioritization (After B)
- Update `PrioritizationAgent` to use context
- Add behavior-based scoring
- Test with real data

### Phase D: User Interface (Future)
- Goal management UI
- Interaction tracking dashboard
- Goal clarification prompts

## Example Scenario

**User Behavior:**
- Opens 5 emails about "Q4 Report" in 2 days
- Spends 15 minutes total reading them
- Replies to 2 of them
- Sender: boss@company.com (VIP)

**System Response:**
1. **Infers Goal**: "Complete Q4 Financial Report" (confidence: 0.85)
2. **Asks User**: "I noticed you're working on the Q4 report. Is this a priority?"
3. **User Confirms**: Yes
4. **Future Prioritization**: All emails mentioning "Q4" or from boss@ get +4 score
5. **Suggestion**: "Focus on Q4 report emails first - 3 new messages"

## Benefits

1. **Adaptive**: System learns user's actual priorities, not just static rules
2. **Contextual**: Understands what user is working on right now
3. **Proactive**: Can surface relevant emails before user searches
4. **Transparent**: User can see and edit inferred goals
5. **Privacy-First**: All data stays local

## Next Steps

1. Implement database schema changes
2. Build basic Context Agent
3. Update Prioritization Agent to use context
4. Test with simulated interaction data
5. Add user goal management interface
