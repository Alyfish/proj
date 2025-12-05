const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly', 'https://www.googleapis.com/auth/gmail.send'];
const CREDENTIALS_PATH = path.join(__dirname, 'credentials.json');
const TOKEN_PATH = path.join(__dirname, 'token.json');

async function exchangeCode() {
    const code = '4/0Ab32j92dGenbGm-Qhf1EwwO_Tmw2yK957VFW0FqkTMNNXGvWt_-he0C-G1up6CzNSz5cew';

    const content = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf-8'));
    const { client_secret, client_id, redirect_uris } = content.web;
    const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

    try {
        console.log('🔄 Exchanging authorization code for tokens...');
        const { tokens } = await oAuth2Client.getToken(code);
        oAuth2Client.setCredentials(tokens);
        fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
        console.log('✅ Token stored to', TOKEN_PATH);
        console.log('🎉 Authentication successful!');
        console.log('\n📧 You can now test Gmail connection with:');
        console.log('   npx ts-node src/testGmail.ts\n');
    } catch (err) {
        console.error('❌ Error retrieving access token:', err.message);
        process.exit(1);
    }
}

exchangeCode();
