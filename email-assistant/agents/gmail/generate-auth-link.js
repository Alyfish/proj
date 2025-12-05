#!/usr/bin/env node
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

const SCOPES = [
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/gmail.send'
];
const CREDENTIALS_PATH = path.join(__dirname, 'credentials.json');

function generateAuthLink() {
    if (!fs.existsSync(CREDENTIALS_PATH)) {
        console.error('❌ Error: credentials.json not found');
        console.error('📍 Expected location:', CREDENTIALS_PATH);
        process.exit(1);
    }

    const content = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf-8'));
    const { client_secret, client_id, redirect_uris } = content.installed || content.web;

    const oAuth2Client = new google.auth.OAuth2(
        client_id,
        client_secret,
        redirect_uris[0]
    );

    const authUrl = oAuth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES,
    });

    console.log('\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║         GMAIL API AUTHENTICATION LINK                         ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');
    console.log('📋 Click the link below to authenticate:\n');
    console.log(authUrl);
    console.log('\n📝 Instructions:');
    console.log('   1. Open the link above in your browser');
    console.log('   2. Sign in with your Gmail account');
    console.log('   3. Grant the requested permissions');
    console.log('   4. Copy the authorization code from the redirect page');
    console.log('   5. Run: npx ts-node src/setupAuth.ts');
    console.log('   6. Paste the code when prompted\n');
    console.log('🔐 Required permissions:');
    console.log('   • gmail.readonly - Read emails');
    console.log('   • gmail.send - Send emails\n');
    console.log('📍 Redirect URI:', redirect_uris[0]);
    console.log('🆔 Client ID:', client_id);
    console.log('\n');
}

generateAuthLink();
