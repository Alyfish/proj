import { Email } from '@email-assistant/common/src/types';

export const mockEmails: Email[] = [
    {
        id: '1',
        from: 'alice@company.com',
        to: 'user@example.com',
        subject: 'URGENT: Project X Deadline',
        body: 'Hi, we need the updated report for Project X by Friday this week. This is critical for the stakeholder meeting. Can you confirm you can deliver?',
        timestamp: new Date('2025-11-22T10:00:00'),
        labels: ['INBOX', 'IMPORTANT'],
        snippet: 'Hi, we need the updated report for Project X by Friday...'
    },
    {
        id: '2',
        from: 'bob@vendor.com',
        to: 'user@example.com',
        subject: 'Re: Meeting Reschedule',
        body: 'Thanks for letting me know. Thursday 3pm works for me. See you then!',
        timestamp: new Date('2025-11-22T09:30:00'),
        labels: ['INBOX'],
        snippet: 'Thanks for letting me know. Thursday 3pm works...'
    },
    {
        id: '3',
        from: 'newsletter@marketing.com',
        to: 'user@example.com',
        subject: '50% Off Weekend Sale!',
        body: 'Shop now and save big! This weekend only, get 50% off all items. Click here to browse our catalog.',
        timestamp: new Date('2025-11-22T08:00:00'),
        labels: ['INBOX', 'PROMOTIONS'],
        snippet: 'Shop now and save big! This weekend only...'
    },
    {
        id: '4',
        from: 'boss@company.com',
        to: 'user@example.com',
        subject: 'Q4 Planning Session',
        body: 'Please review the attached Q4 roadmap and come prepared with your team\'s capacity estimates for next Monday\'s planning session.',
        timestamp: new Date('2025-11-21T16:00:00'),
        labels: ['INBOX', 'IMPORTANT'],
        snippet: 'Please review the attached Q4 roadmap...'
    },
    {
        id: '5',
        from: 'spam@random.com',
        to: 'user@example.com',
        subject: 'You won a million dollars!!!',
        body: 'Congratulations! Click here to claim your prize. This is not a scam, we promise!',
        timestamp: new Date('2025-11-22T07:00:00'),
        labels: ['SPAM'],
        snippet: 'Congratulations! Click here to claim...'
    },
    {
        id: '6',
        from: 'charlie@client.com',
        to: 'user@example.com',
        subject: 'Project Y - Budget Approval',
        body: 'The budget for Project Y has been approved. Let\'s schedule a kickoff meeting next week to get started.',
        timestamp: new Date('2025-11-21T14:00:00'),
        labels: ['INBOX'],
        snippet: 'The budget for Project Y has been approved...'
    }
];

export const mockUserContext = {
    goals: [
        'Complete Project X report by Friday',
        'Prepare for Q4 planning',
        'Follow up on Project Y kickoff'
    ],
    projects: ['Project X', 'Project Y', 'Q4 Planning'],
    priorities: ['Project X deadline', 'Q4 roadmap review']
};
