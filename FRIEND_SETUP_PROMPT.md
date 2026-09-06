# Prompt for your friend's AI coding agent

Copy everything below the line into her agent (Claude Code, Cursor, etc.) in the
project directory after she's cloned/pulled `main` (commit `c96c20c` or later).

---

I'm picking up the SIRA interview-scheduling project on this machine. I have
the Google account that will own the interview-scheduling calendars and
send real emails, so my job is to get `PROVIDER_MODE=google` working end to
end, verify it, and keep the local dev server reachable from other devices
via a tunnel since we're not deploying this anywhere.

## Step 1 — basic setup, verify it runs first

```bash
npm install
npx prisma migrate deploy
npm run seed
npm run dev
```

Confirm `npm test` passes (85 tests) and the app loads at `http://localhost:3000`.
Log in as `jordan@example.com` / `demo1234` (ADMIN) to sanity-check the dashboard
shows 8 seeded requests. Don't proceed to Google setup until this base case works.

## Step 2 — expose localhost publicly (so real email links work from any device)

```bash
node scripts/start-tunnel.mjs 3000
```

This starts a Cloudflare quick tunnel (no account needed — it downloads the
`cloudflared` binary via `npx` on first run) and automatically writes the
public URL into `.env` as `APP_URL`. After it prints the URL, restart
`npm run dev` once so the new `APP_URL` takes effect. Leave the tunnel process
running for the whole session — restarting it mints a NEW random URL and
breaks any candidate link already sent.

## Step 3 — Google Cloud Console setup (I do this myself, using my own Google account)

I need **one Google account** that will own:
- 5 secondary calendars (one per interviewer: Vikram, Alex, Priya, Rahul, Ananya)
- The "scheduler" identity that sends real emails and creates real Calendar events with Meet links

1. Go to [console.cloud.google.com](https://console.cloud.google.com) → create or pick a project.
2. **APIs & Services → Library** → enable **Google Calendar API** and **Gmail API**.
3. **APIs & Services → OAuth consent screen** → choose External → add my own Google account as a Test user (no verification needed for testing).
4. **APIs & Services → Credentials → Create Credentials → OAuth client ID** → type **Web application**.
   - Under "Authorized redirect URIs" add exactly: `http://localhost:8765/oauth/callback`
   - Save. Copy the **Client ID** and **Client Secret** it gives me.

## Step 4 — fill in `.env` (first batch)

Open `.env` in the project root (copy from `.env.example` if it doesn't exist yet)
and fill in:

```bash
GOOGLE_CLIENT_ID="<Client ID from step 4 above>"
GOOGLE_CLIENT_SECRET="<Client Secret from step 4 above>"
GOOGLE_SENDER_EMAIL="<my Google account's email address>"
PROVIDER_MODE="google"
```

Leave `GOOGLE_REFRESH_TOKEN` and the five `GOOGLE_CAL_*` vars blank for now —
the next two steps fill those in automatically.

## Step 5 — mint the refresh token (I do this myself — it's my Google login)

```bash
node scripts/mint-google-token.mjs
```

This prints a URL. I open it myself in my browser, make sure I'm signed into
the Google account from Step 3, and click **Allow**. The script then prints:

```
GOOGLE_REFRESH_TOKEN="..."
```

Paste that exact line into `.env`, replacing the blank `GOOGLE_REFRESH_TOKEN=""`.

> If nothing gets printed after "Allow," it usually means Google didn't return
> a refresh token because I'd already granted this app access before. Fix:
> go to [myaccount.google.com/permissions](https://myaccount.google.com/permissions),
> revoke access for this app, and run `mint-google-token.mjs` again.

## Step 6 — create the 5 interviewer calendars automatically

```bash
node scripts/create-google-calendars.mjs
```

This creates 5 secondary calendars under my Google account (named
`SIRA — Vikram Rao`, `SIRA — Alex Rivera`, etc.) and prints 5 lines like:

```
GOOGLE_CAL_VIKRAM="abc123...@group.calendar.google.com"
GOOGLE_CAL_ALEX="def456...@group.calendar.google.com"
GOOGLE_CAL_PRIYA="..."
GOOGLE_CAL_RAHUL="..."
GOOGLE_CAL_ANANYA="..."
```

Paste all 5 lines into `.env`, replacing the blank ones.

## Step 7 — point seeded emails at real inboxes I can actually check

`@example.com` (what the seed data uses by default) is a reserved,
non-deliverable domain — fine for mock mode where nothing is really sent,
but in Google mode every email would just vanish into a domain nobody owns.
I need real inboxes to show mail landing during the demo.

I only need **two** real Gmail addresses (not one per person) — Gmail's
plus-addressing (`base+tag@gmail.com`) delivers every variant to the same
inbox, so all 8 candidates land in one inbox and all 5 interviewers land in
another, each clearly labeled by name. Add to `.env`:

```bash
DEMO_CANDIDATE_INBOX="<a real gmail address I can check>"
DEMO_INTERVIEWER_INBOX="<a different real gmail address I can check>"
```

These can be two of my own real Gmail accounts (or two aliases of one), and
they're independent of the OAuth "scheduler" account from Step 3 — they
never need any API key, they're just recipient inboxes.

## Step 8 — point the seed data at the real calendars + emails, then populate calendars

```bash
npm run seed
node scripts/seed-google-calendars.mjs
```

The first command re-seeds the database so each interviewer's `calendarId`
points at the real Google calendar from Step 6, AND every seeded person's
email becomes a plus-addressed variant of the two inboxes from Step 7
(e.g. `mycandidates+dev@gmail.com`, `myinterviewers+priya@gmail.com`) instead
of the unreachable `@example.com` placeholders. The second command copies
the same demo busy-blocks (lunches, standups, etc. from
`docs/04_SEED_DATA.md`) into the real calendars, so every seeded demo
scenario (S1–S8) produces the identical result in Google mode as it did in
mock mode.

## Step 9 — restart and verify everything for real

```bash
npm run dev
```
(restart it if it was already running, so it picks up `PROVIDER_MODE=google`
and the new `.env` values)

Then run:
```bash
node scripts/verify.mjs
node scripts/concurrency-test.mjs
```
Both should pass exactly as they did in mock mode (8/8 scenarios correct,
one booking wins the race).

Finally, prove Google mode itself works, not just the scheduling logic:
1. Log in as `jordan@example.com` / `demo1234`, open any `READY_TO_SCHEDULE`
   request, and book a slot.
2. Confirm a **real event appears in my Google Calendar** with a working
   **Google Meet link**.
3. Confirm a **real email** shows up in the `DEMO_INTERVIEWER_INBOX` inbox and
   a separate one in the `DEMO_CANDIDATE_INBOX` inbox, each with that Meet
   link and (for the candidate) a working reschedule link.
4. Cancel that request from the dashboard and confirm the Calendar event
   disappears.

If any of steps 1–4 fail, check `PROVIDER_MODE=google` is actually set in
`.env` and that the dev server was restarted after the last `.env` edit —
Next.js only reads `.env` at server startup, not live.

## What NOT to do

- Don't run `scripts/mint-google-token.mjs`'s printed URL through anything
  other than my own browser — it needs my actual Google login and consent
  click, nobody else can do that step for me.
- Don't restart `scripts/start-tunnel.mjs` once real candidate links are out —
  it mints a new URL and breaks them.
- Don't commit `.env` — it's already gitignored and holds real credentials.
