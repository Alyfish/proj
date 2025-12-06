/**
 * EmailSummarizer - Lightweight email summarization for token optimization
 * 
 * Provides fast, low-token methods for filtering and truncating emails
 * before expensive LLM analysis.
 */

import { EmailMetadata } from '@email-assistant/common/src/types';

export class EmailSummarizer {
    /**
     * Create ultra-short summary for quick filtering (50-100 chars)
     * Uses heuristics, no LLM calls
     */
    createQuickSummary(email: EmailMetadata): string {
        const subject = email.subject || 'No subject';
        const snippet = email.snippet || '';
        const from = email.from || 'Unknown';

        // Extract sender name (before @ or <)
        const senderName = from.split('@')[0].split('<')[0].trim();

        // Combine subject + snippet, prioritize subject
        const combined = `${subject}. ${snippet}`.substring(0, 150);

        return `From ${senderName}: ${combined}`;
    }

    /**
     * Extract key terms without LLM (regex-based)
     * Useful for quick relevance matching
     */
    extractKeyTerms(text: string): string[] {
        const terms: Set<string> = new Set();

        // Extract capitalized words (likely proper nouns)
        const capitalizedWords = text.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g) || [];
        capitalizedWords.forEach(word => {
            if (word.length > 3) terms.add(word);
        });

        // Extract numbers with context (amounts, dates, etc.)
        const numbersWithContext = text.match(/\$[\d,]+(?:\.\d{2})?|\b\d{1,2}\/\d{1,2}\/\d{2,4}\b|\b\d+%\b/g) || [];
        numbersWithContext.forEach(num => terms.add(num));

        // Extract email addresses
        const emails = text.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g) || [];
        emails.forEach(email => terms.add(email));

        // Extract common action words
        const actionWords = ['invoice', 'payment', 'meeting', 'deadline', 'urgent', 'asap', 'confirm', 'review'];
        actionWords.forEach(word => {
            if (text.toLowerCase().includes(word)) {
                terms.add(word);
            }
        });

        return Array.from(terms).slice(0, 20); // Limit to top 20 terms
    }

    /**
     * Smart truncation that preserves important content
     * Prioritizes: subject, first paragraph, key terms
     */
    intelligentTruncate(text: string, maxChars: number): string {
        if (text.length <= maxChars) return text;

        // Split into lines
        const lines = text.split('\n').filter(line => line.trim().length > 0);

        if (lines.length === 0) return text.substring(0, maxChars);

        // Always include first few lines (usually subject + greeting)
        let result = '';
        let charsUsed = 0;

        // Take first 3 lines (subject, greeting, first sentence)
        for (let i = 0; i < Math.min(3, lines.length); i++) {
            const line = lines[i];
            if (charsUsed + line.length + 1 <= maxChars * 0.4) { // Use 40% for header
                result += line + '\n';
                charsUsed += line.length + 1;
            }
        }

        // Find lines with key indicators (amounts, dates, important keywords)
        const importantLines: string[] = [];
        const keyPatterns = [
            /\$[\d,]+(?:\.\d{2})?/, // Money
            /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/, // Dates
            /\b(invoice|payment|deadline|urgent|meeting|confirm)\b/i, // Keywords
        ];

        for (let i = 3; i < lines.length; i++) {
            const line = lines[i];
            if (keyPatterns.some(pattern => pattern.test(line))) {
                importantLines.push(line);
            }
        }

        // Add important lines until we hit the limit
        for (const line of importantLines) {
            if (charsUsed + line.length + 1 <= maxChars) {
                result += line + '\n';
                charsUsed += line.length + 1;
            } else {
                break;
            }
        }

        // If we still have space, add more context from middle
        if (charsUsed < maxChars * 0.8 && lines.length > 5) {
            const middleStart = Math.floor(lines.length / 2);
            for (let i = middleStart; i < lines.length; i++) {
                const line = lines[i];
                if (charsUsed + line.length + 1 <= maxChars) {
                    result += line + '\n';
                    charsUsed += line.length + 1;
                } else {
                    break;
                }
            }
        }

        return result.trim();
    }

    /**
     * Create embedding-friendly text (optimized for semantic search)
     * Shorter than full email but captures key semantic content
     */
    createEmbeddingText(email: EmailMetadata, fullBody?: string): string {
        const parts: string[] = [];

        // Subject is most important
        if (email.subject) {
            parts.push(`Subject: ${email.subject}`);
        }

        // Sender context
        if (email.from) {
            parts.push(`From: ${email.from}`);
        }

        // First paragraph of body or snippet
        if (fullBody) {
            const firstParagraph = fullBody.split('\n\n')[0];
            parts.push(firstParagraph.substring(0, 500));
        } else if (email.snippet) {
            parts.push(email.snippet);
        }

        // Limit to 1500 chars for efficient embedding
        return parts.join('\n').substring(0, 1500);
    }

    /**
     * Create LLM-optimized text (for analysis stage)
     * Balances context with token efficiency
     */
    createAnalysisText(email: EmailMetadata, fullBody: string, maxChars: number = 2000): string {
        const parts: string[] = [];

        // Metadata header (concise)
        parts.push(`From: ${email.from}`);
        parts.push(`Subject: ${email.subject}`);
        parts.push('---');

        const headerLength = parts.join('\n').length;
        const remainingChars = maxChars - headerLength - 50; // Leave buffer

        // Intelligently truncated body
        const truncatedBody = this.intelligentTruncate(fullBody, remainingChars);
        parts.push(truncatedBody);

        return parts.join('\n');
    }
}
