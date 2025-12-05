import { google } from 'googleapis';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config();

const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly', 'https://www.googleapis.com/auth/gmail.send'];
const CREDENTIALS_PATH = process.env.GMAIL_CREDENTIALS_PATH || path.join(process.cwd(), 'credentials.json');
const TOKEN_PATH = process.env.GMAIL_TOKEN_PATH || path.join(process.cwd(), 'token.json');

function normalizeCode(raw: string) {
  // Google sometimes returns the full query string; take only the code parameter and URL-decode
  const trimmed = raw.trim();
  // If it looks like a URL or contains &, split on code=
  if (trimmed.includes('code=')) {
    const params = new URLSearchParams(trimmed.split('?')[1] || trimmed);
    const codeParam = params.get('code');
    if (codeParam) return decodeURIComponent(codeParam);
  }
  // If it looks like raw URL-encoded code, decode it
  if (trimmed.includes('%')) {
    return decodeURIComponent(trimmed.split('&')[0]);
  }
  return trimmed;
}

async function setup() {
  if (!fs.existsSync(CREDENTIALS_PATH)) {
    console.error('Error: credentials.json not found. Provide GMAIL_CREDENTIALS_PATH or place credentials.json in agents/gmail/');
    process.exit(1);
  }

  const content = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf-8'));
  const { client_secret, client_id, redirect_uris } = content.installed || content.web;
  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
  });

  console.log('Authorize this app by visiting this url:', authUrl);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  rl.question('Enter the code from that page here: ', async (rawCode) => {
    rl.close();
    try {
      const code = normalizeCode(rawCode);
      const { tokens } = await oAuth2Client.getToken(code);
      oAuth2Client.setCredentials(tokens);
      fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens));
      console.log('Token stored to', TOKEN_PATH);
    } catch (err) {
      console.error('Error retrieving access token', err);
    }
  });
}

setup();
