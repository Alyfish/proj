import { Email, EmailPriority } from '@email-assistant/common/src/types';

export class PrioritizerAgent {

    prioritize(emails: Email[]): EmailPriority[] {
        return emails.map(email => this.classifyEmail(email));
    }

    private classifyEmail(email: Email): EmailPriority {
        // Check for spam
        if (this.isSpam(email)) {
            return {
                emailId: email.id,
                priority: 'spam',
                reason: 'Detected as spam based on sender/content'
            };
        }

        // Check for high priority
        if (this.isHighPriority(email)) {
            return {
                emailId: email.id,
                priority: 'high',
                reason: this.getHighPriorityReason(email)
            };
        }

        // Check for medium priority
        if (this.isMediumPriority(email)) {
            return {
                emailId: email.id,
                priority: 'medium',
                reason: 'Contains important labels or from known contacts'
            };
        }

        // Default to low priority
        return {
            emailId: email.id,
            priority: 'low',
            reason: 'Standard email'
        };
    }

    private isSpam(email: Email): boolean {
        // Check labels
        if (email.labels.includes('SPAM')) {
            return true;
        }

        // Check suspicious patterns
        const spamKeywords = ['won a million', 'claim your prize', 'click here now', 'not a scam'];
        const hasSpamKeywords = spamKeywords.some(keyword =>
            email.subject.toLowerCase().includes(keyword) ||
            email.body.toLowerCase().includes(keyword)
        );

        return hasSpamKeywords;
    }

    private isHighPriority(email: Email): boolean {
        // IMPORTANT label
        if (email.labels.includes('IMPORTANT')) {
            return true;
        }

        // Urgent keywords in subject
        const urgentKeywords = ['urgent', 'asap', 'critical', 'deadline'];
        if (urgentKeywords.some(keyword => email.subject.toLowerCase().includes(keyword))) {
            return true;
        }

        // From boss or key stakeholders
        const vipSenders = ['boss@', 'ceo@', 'director@'];
        if (vipSenders.some(vip => email.from.includes(vip))) {
            return true;
        }

        return false;
    }

    private isMediumPriority(email: Email): boolean {
        // Has INBOX label but not promotional
        return email.labels.includes('INBOX') && !email.labels.includes('PROMOTIONS');
    }

    private getHighPriorityReason(email: Email): string {
        if (email.labels.includes('IMPORTANT')) {
            return 'Marked as important';
        }
        if (email.subject.toLowerCase().includes('urgent')) {
            return 'Urgent keyword in subject';
        }
        if (email.subject.toLowerCase().includes('deadline')) {
            return 'Contains deadline';
        }
        return 'High priority sender or content';
    }
}
