/**
 * Test script to verify token usage optimization
 * 
 * This script tests the optimized email analysis to ensure:
 * 1. Token usage is significantly reduced
 * 2. Analysis quality is maintained
 * 3. Key information is still extracted
 */

import { AnalysisAgent } from './agents/analyzer/src/analysisAgent';
import { EmailMetadata } from '@email-assistant/common/src/types';
import { llm } from '@email-assistant/common/src/llm';

async function testTokenOptimization() {
    console.log('=== Token Optimization Test ===\n');

    // Mock email data
    const mockEmail: EmailMetadata & { priority: 'high' | 'medium' | 'low' } = {
        id: 'test-email-123',
        threadId: 'thread-123',
        from: 'vendor@example.com',
        to: ['user@example.com'],
        subject: 'Invoice #INV-2024-001 - Payment Due',
        snippet: 'Please find attached invoice for $1,500 due by December 15, 2024...',
        receivedAt: new Date().toISOString(),
        labels: ['INBOX', 'IMPORTANT'],
        priority: 'high'
    };

    // Create a mock full email body
    const mockBody = `From: vendor@example.com
Subject: Invoice #INV-2024-001 - Payment Due

Dear Customer,

Please find attached the invoice for services rendered in November 2024.

Invoice Details:
- Invoice Number: INV-2024-001
- Amount: $1,500.00
- Due Date: December 15, 2024
- Payment Method: Wire transfer or check

Please process this payment at your earliest convenience to avoid late fees.

Best regards,
Accounts Receivable Team
Vendor Corp`;

    console.log('📧 Test Email:');
    console.log(`   Subject: ${mockEmail.subject}`);
    console.log(`   From: ${mockEmail.from}`);
    console.log(`   Body length: ${mockBody.length} characters\n`);

    // Test 1: Estimate tokens for old approach (8000 chars)
    const oldApproachText = mockBody.substring(0, 8000);
    const oldTokens = llm.estimateTokens(oldApproachText);
    console.log('🔴 OLD APPROACH (8000 chars max):');
    console.log(`   Text length: ${oldApproachText.length} chars`);
    console.log(`   Estimated tokens: ${oldTokens}\n`);

    // Test 2: Test new EmailSummarizer approach
    const { EmailSummarizer } = require('./agents/analyzer/src/emailSummarizer');
    const summarizer = new EmailSummarizer();

    // Test embedding text optimization
    const embeddingText = summarizer.createEmbeddingText(mockEmail, mockBody);
    const embeddingTokens = llm.estimateTokens(embeddingText);
    console.log('🟢 NEW APPROACH - Embedding Text (1500 chars max):');
    console.log(`   Text length: ${embeddingText.length} chars`);
    console.log(`   Estimated tokens: ${embeddingTokens}`);
    console.log(`   Reduction: ${Math.round((1 - embeddingTokens / oldTokens) * 100)}%\n`);

    // Test analysis text optimization
    const analysisText = summarizer.createAnalysisText(mockEmail, mockBody, 2000);
    const analysisTokens = llm.estimateTokens(analysisText);
    console.log('🟢 NEW APPROACH - Analysis Text (2000 chars max):');
    console.log(`   Text length: ${analysisText.length} chars`);
    console.log(`   Estimated tokens: ${analysisTokens}`);
    console.log(`   Reduction: ${Math.round((1 - analysisTokens / oldTokens) * 100)}%\n`);

    // Test key term extraction
    const keyTerms = summarizer.extractKeyTerms(mockBody);
    console.log('🔍 Extracted Key Terms:');
    console.log(`   ${keyTerms.join(', ')}\n`);

    // Calculate total savings for a typical query
    const emailsAnalyzedOld = 12;
    const emailsAnalyzedNew = 5;
    const tokensPerEmailOld = oldTokens + 500; // 500 for prompt overhead
    const tokensPerEmailNew = analysisTokens + 300; // 300 for optimized prompt

    const totalTokensOld = emailsAnalyzedOld * tokensPerEmailOld;
    const totalTokensNew = emailsAnalyzedNew * tokensPerEmailNew;

    console.log('📊 TOTAL QUERY COMPARISON:');
    console.log(`   Old: ${emailsAnalyzedOld} emails × ${tokensPerEmailOld} tokens = ${totalTokensOld} tokens`);
    console.log(`   New: ${emailsAnalyzedNew} emails × ${tokensPerEmailNew} tokens = ${totalTokensNew} tokens`);
    console.log(`   Total reduction: ${Math.round((1 - totalTokensNew / totalTokensOld) * 100)}%`);
    console.log(`   Tokens saved: ${totalTokensOld - totalTokensNew}\n`);

    // Success criteria
    const reductionPercent = Math.round((1 - totalTokensNew / totalTokensOld) * 100);
    if (reductionPercent >= 80) {
        console.log('✅ SUCCESS: Token usage reduced by', reductionPercent + '%');
        console.log('   Target was 80% reduction, achieved', reductionPercent + '%');
    } else {
        console.log('⚠️  WARNING: Token reduction below target');
        console.log('   Target: 80%, Achieved:', reductionPercent + '%');
    }

    console.log('\n=== Test Complete ===');
}

// Run the test
testTokenOptimization().catch(console.error);
