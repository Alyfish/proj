import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import * as fs from 'fs';
import * as path from 'path';
import dotenv from 'dotenv';

// Load env from repo root and cwd so hosted deployments can inject secrets without manual file copy
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config();

const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly', 'https://www.googleapis.com/auth/gmail.send'];

// Allow overriding credential/token locations or inlining JSON via environment variables
// Fallback to files living in agents/gmail/ so orchestrator can run from anywhere.
const TOKEN_PATH = process.env.GMAIL_TOKEN_PATH || path.resolve(__dirname, '..', 'token.json');
const CREDENTIALS_PATH = process.env.GMAIL_CREDENTIALS_PATH || path.resolve(__dirname, '..', 'credentials.json');
const INLINE_CREDENTIALS = process.env.GMAIL_CREDENTIALS_JSON;
const INLINE_TOKEN = process.env.GMAIL_TOKEN_JSON;

/**
 * Load or request or authorization to call APIs.
 */
export async function authorize(): Promise<OAuth2Client> {
  let client: OAuth2Client;

  // Prefer inline credentials if provided (e.g., hosted env via .env)
  let credentials: any = null;
  if (INLINE_CREDENTIALS) {
    try {
      credentials = JSON.parse(INLINE_CREDENTIALS);
    } catch (e) {
      console.error('Failed to parse GMAIL_CREDENTIALS_JSON env:', e);
    }
  }
  if (!credentials) {
    if (!fs.existsSync(CREDENTIALS_PATH)) {
      throw new Error('credentials.json not found. Set GMAIL_CREDENTIALS_JSON or GMAIL_CREDENTIALS_PATH env, or place credentials.json alongside the Gmail agent.');
    }
    credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf-8'));
  }

  const token = (() => {
    if (INLINE_TOKEN) {
      try {
        return JSON.parse(INLINE_TOKEN);
      } catch (e) {
        console.error('Failed to parse GMAIL_TOKEN_JSON env:', e);
      }
    }
    if (fs.existsSync(TOKEN_PATH)) {
      return JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf-8'));
    }
    return null;
  })();

  if (token) {
    const { client_secret, client_id, redirect_uris } = credentials.installed || credentials.web;
    client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
    client.setCredentials(token);
    return client;
  }

  // If no token, we need to authenticate (CLI flow)
  // In hosted environments, prefer setting GMAIL_TOKEN_JSON env to avoid interactive setup.
  throw new Error('Token not found. Provide GMAIL_TOKEN_JSON or ensure token.json exists (run setupAuth.ts once).');
}

export async function getCredentials() {
  if (INLINE_CREDENTIALS) {
    return JSON.parse(INLINE_CREDENTIALS);
  }
  if (!fs.existsSync(CREDENTIALS_PATH)) {
    throw new Error('credentials.json not found. Please download it from Google Cloud Console or set GMAIL_CREDENTIALS_JSON.');
  }
  return JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf-8'));
}
