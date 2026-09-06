/**
 * Creates the 5 secondary Google calendars (one per interviewer) under the
 * master account authorized by GOOGLE_REFRESH_TOKEN, and prints the ids to
 * paste into .env as GOOGLE_CAL_VIKRAM / _ALEX / _PRIYA / _RAHUL / _ANANYA.
 *
 * Safe to re-run: if a calendar with the expected summary already exists
 * (tagged via a matching name), it's reused instead of duplicated.
 *
 * Requires GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REFRESH_TOKEN
 * already in .env — run scripts/mint-google-token.mjs first.
 */
import { google } from 'googleapis';
import { loadEnv } from './lib/load-env.mjs';

loadEnv();

const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN } = process.env;
if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REFRESH_TOKEN) {
  console.error(
    'Missing GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REFRESH_TOKEN in .env.\n' +
    'Run scripts/mint-google-token.mjs first.'
  );
  process.exit(1);
}

const oauth2Client = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET);
oauth2Client.setCredentials({ refresh_token: GOOGLE_REFRESH_TOKEN });
const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

// name -> env var this calendar's id should be pasted into
const WANTED = [
  { name: 'SIRA — Vikram Rao', envVar: 'GOOGLE_CAL_VIKRAM' },
  { name: 'SIRA — Alex Rivera', envVar: 'GOOGLE_CAL_ALEX' },
  { name: 'SIRA — Priya Sharma', envVar: 'GOOGLE_CAL_PRIYA' },
  { name: 'SIRA — Rahul Verma', envVar: 'GOOGLE_CAL_RAHUL' },
  { name: 'SIRA — Ananya Patel', envVar: 'GOOGLE_CAL_ANANYA' },
];

async function findExisting(summary) {
  let pageToken;
  do {
    const res = await calendar.calendarList.list({ pageToken, maxResults: 250 });
    const hit = (res.data.items ?? []).find((c) => c.summary === summary);
    if (hit) return hit.id;
    pageToken = res.data.nextPageToken || undefined;
  } while (pageToken);
  return null;
}

async function main() {
  const results = [];
  for (const { name, envVar } of WANTED) {
    let id = await findExisting(name);
    if (id) {
      console.log(`Reusing existing calendar "${name}" -> ${id}`);
    } else {
      const res = await calendar.calendars.insert({ requestBody: { summary: name } });
      id = res.data.id;
      console.log(`Created "${name}" -> ${id}`);
    }
    results.push({ envVar, id });
  }

  console.log('\nPaste these into .env:\n');
  for (const { envVar, id } of results) {
    console.log(`${envVar}="${id}"`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
