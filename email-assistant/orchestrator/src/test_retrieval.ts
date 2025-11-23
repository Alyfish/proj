
import { EmailRetrievalAgent } from '../../agents/gmail/src/retrievalAgent';

async function testRetrieval() {
    const agent = new EmailRetrievalAgent();
    const userId = 'test-user-id';
    const query = "find me startup investing opportunities through my email check angel squad and brians from angels squads ema";

    console.log(`Testing retrieval with query: "${query}"`);

    try {
        const result = await agent.run({
            userId,
            searchQuery: query,
            forceAll: true,
            maxResults: 10
        });

        console.log('Retrieval Result:', JSON.stringify(result, null, 2));
    } catch (error) {
        console.error('Retrieval Failed:', error);
    }
}

testRetrieval();
