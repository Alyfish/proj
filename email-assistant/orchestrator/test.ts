import { Orchestrator } from './index';
import { mockEmails, mockUserContext } from '@email-assistant/common/src/mockData';

async function main() {
    console.log('===================================');
    console.log('Email Assistant - Mock Test');
    console.log('===================================');

    const orchestrator = new Orchestrator();

    // Process mock emails
    const result = await orchestrator.processEmailsDetailed(mockEmails, mockUserContext);

    // Display results
    console.log('\n\n📊 RESULTS');
    console.log('===================================\n');

    console.log('📧 Email Priorities:');
    result.priorities.forEach(priority => {
        const email = mockEmails.find(e => e.id === priority.emailId);
        const icon = priority.priority === 'high' ? '🔴' :
            priority.priority === 'medium' ? '🟡' :
                priority.priority === 'spam' ? '⛔' : '🟢';
        console.log(`${icon} [${priority.priority.toUpperCase()}] ${email?.subject}`);
        console.log(`   Reason: ${priority.reason}\n`);
    });

    console.log('\n🔍 Email Analyses:');
    result.analyses.forEach(analysis => {
        const email = mockEmails.find(e => e.id === analysis.emailId);
        console.log(`\n📄 ${email?.subject}`);
        console.log(`   Summary: ${analysis.summary}`);
        if (analysis.deadline) {
            console.log(`   ⏰ Deadline: ${analysis.deadline}`);
        }
        if (analysis.actionItems.length > 0) {
            console.log(`   ✓ Action Items:`);
            analysis.actionItems.forEach(item => console.log(`     - ${item}`));
        }
        if (analysis.entities.length > 0) {
            console.log(`   🏷️  Entities: ${analysis.entities.join(', ')}`);
        }
    });

    console.log('\n\n💡 SUGGESTIONS FOR USER:');
    console.log('===================================\n');

    if (result.suggestions.length === 0) {
        console.log('No actionable suggestions at this time.');
    } else {
        result.suggestions.forEach((suggestion, index) => {
            console.log(`${index + 1}. [${suggestion.type.toUpperCase()}] ${suggestion.title}`);
            console.log(`   Priority: ${suggestion.priority}`);
            console.log(`   ${suggestion.description}\n`);
        });
    }

    console.log('===================================');
    console.log('✅ Test Complete!');
    console.log('===================================\n');
}

main().catch(console.error);
