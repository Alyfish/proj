# User Interaction Agent - Design

## Purpose
A dedicated agent that **proactively engages with the user** to:
1. Understand their current goals and priorities
2. Clarify ambiguous situations
3. Gather context about their work
4. Validate inferred goals from behavior patterns

## Agent Interface

```typescript
interface UserInteractionInput {
  userId: string;
  inferredGoals?: UserGoal[]; // Goals detected from behavior
  ambiguousEmails?: EmailMetadata[]; // Emails that need clarification
  mode?: 'onboarding' | 'confirmation' | 'weekly_checkin';
}

interface UserInteractionOutput {
  confirmedGoals: UserGoal[];
  newGoals: UserGoal[];
  userResponses: Map<string, string>; // question -> answer
}

class UserInteractionAgent implements Agent<UserInteractionInput, UserInteractionOutput> {
  name = 'UserInteractionAgent';
  
  async run(input: UserInteractionInput): Promise<UserInteractionOutput> {
    // 1. Determine mode (if not provided)
    const mode = input.mode || this.determineMode(input);
    
    // 2. Execute specific flow
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
}
```

## Interaction Scenarios

### Scenario 1: Initial Onboarding
**When**: First time user runs the system

```
👋 Welcome to your Email Assistant!

To help me prioritize your emails, I'd like to understand what you're working on.

What are your top 3 priorities right now?
1. _______________
2. _______________
3. _______________
```

### Scenario 2: Goal Confirmation
**When**: System infers goals from behavior with medium confidence

```
🤔 I noticed you've been focusing on these areas:

1. ✅ Q4 Financial Report (high confidence)
   - You've opened 5 related emails in the past 2 days
   
2. ⚠️ Hiring Senior Engineer (medium confidence)
   - 3 emails from recruiter@company.com

Are these accurate?
[✓ Yes] [Update] [+ Add Goal]
```

### Scenario 3: Weekly Check-in
**When**: Every Monday morning

```
📅 Weekly Check-in

Last week you worked on:
✓ Q4 Financial Report (5 emails, 2 tasks completed)
✓ Hiring Senior Engineer (3 emails, 1 interview)

Still focused on these? [Yes] [Update]
```

## Integration Point

The User Interaction Agent runs **between Context Analysis and Prioritization**:

```
Retrieval → Context → USER INTERACTION → Prioritization → Analysis → Suggestion
```

This ensures the system has the latest user goals before prioritizing emails.
