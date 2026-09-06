/**
 * One-off local OAuth flow to mint a Google refresh token for PROVIDER_MODE=google.
 *
 * You must run this yourself in a real browser under the Google account that
 * owns the six secondary calendars — Claude cannot grant OAuth consent on
 * your behalf. This script only builds the consent URL and exchanges the
 * resulting code for tokens; it never touches your Google login.
 *
 * Before running:
 *   1. GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must already be in .env
 *      (from Google Cloud Console → Credentials → OAuth client ID → Web app).
 *   2. In that OAuth client's "Authorized redirect URIs", add exactly:
 *        http://localhost:8765/oauth/callback
 *      (or set GOOGLE_REDIRECT_URI in .env to a different local URI you've
 *      also added there — this script reads it from the same env var).
 *
 * Usage:
 *   node scripts/mint-google-token.mjs
 *   -> prints a URL. Open it yourself, log in, click Allow.
 *   -> script prints GOOGLE_REFRESH_TOKEN=... — paste that line into .env.
 */
import http from 'node:http';
import { google } from 'googleapis';
import { loadEnv } from './lib/load-env.mjs';

loadEnv();

const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:8765/oauth/callback';
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('Missing GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET in .env — set those first.');
  process.exit(1);
}

const url = new URL(REDIRECT_URI);
const port = Number(url.port) || 80;

const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  prompt: 'consent', // forces a refresh_token even if you've consented before
  scope: [
    'https://www.googleapis.com/auth/calendar',
    'https://www.googleapis.com/auth/gmail.send',
  ],
});

console.log('\nOpen this URL yourself in a browser signed into the Google account\nthat owns the six secondary calendars, and click Allow:\n');
console.log(authUrl + '\n');
console.log(`Waiting for the redirect on ${REDIRECT_URI} ...\n`);

const server = http.createServer(async (req, res) => {
  const reqUrl = new URL(req.url, REDIRECT_URI);
  if (reqUrl.pathname !== url.pathname) {
    res.writeHead(404).end();
    return;
  }
  const code = reqUrl.searchParams.get('code');
  const error = reqUrl.searchParams.get('error');

  if (error) {
    res.writeHead(400, { 'Content-Type': 'text/plain' }).end(`Google returned an error: ${error}`);
    console.error('Google returned an error:', error);
    server.close();
    process.exit(1);
  }

  if (!code) {
    res.writeHead(400, { 'Content-Type': 'text/plain' }).end('No code in callback.');
    return;
  }

  try {
    const { tokens } = await oauth2Client.getToken(code);
    res.writeHead(200, { 'Content-Type': 'text/plain' }).end(
      'Success — you can close this tab and go back to the terminal.'
    );
    console.log('Success. Add this line to your .env:\n');
    console.log(`GOOGLE_REFRESH_TOKEN="${tokens.refresh_token}"\n`);
    if (!tokens.refresh_token) {
      console.warn(
        'No refresh_token came back — this happens if you\'ve already granted consent before.\n' +
        'Revoke access at https://myaccount.google.com/permissions and run this script again.'
      );
    }
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'text/plain' }).end('Token exchange failed — see terminal.');
    console.error('Token exchange failed:', err.message);
  } finally {
    server.close();
  }
});

server.listen(port, () => {});
