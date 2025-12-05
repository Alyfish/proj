
// @ts-nocheck
import { AnalysisAgent } from '../../agents/analyzer/src/analysisAgent';
import { llm } from '@email-assistant/common/src/llm';
import { db } from '@email-assistant/common/src/db';
import { EmailMetadata } from '@email-assistant/common/src/types';

// Mock db
const mockRun = () => ({ lastInsertRowid: 1 });
const mockGet = () => null;
const mockAll = () => [];
const mockPrepare = () => ({
    run: mockRun,
    get: mockGet,
    all: mockAll
});

// @ts-ignore
db.prepare = mockPrepare;

// Mock LLM response
llm.callModel = async () => {
    return JSON.stringify({
        summary: "This is a test summary.",
        answer: "The invoice amount is $500.",
        actions: [],
        key_facts: { "Amount": "$500", "Date": "2023-12-01" },
        structuredEntities: {
            people: ["John Doe"],
            organizations: ["Acme Corp"],
            locations: ["New York"],
            dates: ["2023-12-01"]
        },
        relevance: 9
    });
};

// Mock embedding
llm.embed = async () => [0.1, 0.2, 0.3];

async function runTest() {
    // Subclass to mock getFullText
    class TestAnalysisAgent extends AnalysisAgent {
        constructor() {
            super();
            // Pre-populate gmail to avoid loading real client
            (this as any).gmail = {
                getMessage: async () => ({})
            };
        }

        // @ts-ignore
        async getFullText(email: EmailMetadata): Promise<string> {
            return "Subject: Invoice\n\nHi, here is the invoice for $500 due on 2023-12-01.";
        }
    }

    const testAgent = new TestAnalysisAgent();

    const input = {
        userId: 'test-user',
        emails: [{
            id: '123',
            threadId: '123',
            from: 'test@example.com',
            to: ['me@example.com'],
            subject: 'Invoice',
            snippet: 'Invoice for $500',
            receivedAt: new Date().toISOString(),
            labels: [],
            priority: 'high' as const
        }],
        searchQuery: 'invoice amount'
    };

    console.log('Running analysis...');
    const result = await testAgent.run(input);

    if (result.analyses.length === 0) {
        console.error('❌ No analysis results returned');
        process.exit(1);
    }

    const analysis = result.analyses[0];
    console.log('Analysis Result:', JSON.stringify(analysis, null, 2));

    if (analysis.answer === "The invoice amount is $500." &&
        analysis.key_facts?.Amount === "$500" &&
        analysis.structuredEntities?.people[0] === "John Doe") {
        console.log('✅ Verification PASSED');
    } else {
        console.error('❌ Verification FAILED');
        process.exit(1);
    }
}

runTest().catch(console.error);
