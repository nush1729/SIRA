# The minimal happy path — demo script (PROVIDER_MODE=google only)

This assumes `FRIEND_SETUP_PROMPT.md` is already done: `.env` has
`PROVIDER_MODE="google"`, a real refresh token, the 5 `GOOGLE_CAL_*`
calendars, and `DEMO_CANDIDATE_INBOX` / `DEMO_INTERVIEWER_INBOX` are real
Gmail addresses. **Do not run this in mock mode** — if `PROVIDER_MODE` isn't
`"google"` in `.env`, or the dev server hasn't been restarted since it was
set, every step below still "works" but nothing real gets created. Check
first: `grep PROVIDER_MODE .env` should print `PROVIDER_MODE="google"`.

Every step below cites the exact page/endpoint it exercises — this is a
script for driving the real app, not aspirational.

---

## Step 1 — Scheduler creates a request and assigns the round-type flag

Log in at `/login` as `jordan@example.com` / `demo1234` (ADMIN). Go to
**New Request** ([app/(staff)/requests/new](<app/(staff)/requests/new/page.tsx>)).

Pick (or create) a candidate, then set:
- **Round type**: click one of `SCREENING` / `TECHNICAL` / `MANAGERIAL` / `HR`
- **Required skills**, panel size, duration, and the scheduling window

As soon as round type + skills are set, the **eligibility panel** on the
right updates live (debounced, calls `POST /api/requests/preview-panel`) —
this is "seeing the calendar data": it shows every interviewer who
qualifies, their `load X/Y` against their real confirmed bookings in that
window (not a placeholder — this was a real bug I just fixed, verify it
isn't showing `load 0/N` for everyone), and *why* anyone was excluded
(wrong label, missing skill, or at cap).

Submit with **"Send availability request"** checked.

## Step 2 — the candidate gets the invite email

This fires `POST /api/requests` → `sendNotification()` with the
`availabilityRequest` template ([lib/email-templates.ts:64](lib/email-templates.ts:64)).
Open `DEMO_CANDIDATE_INBOX` in Gmail — you should see:

> **Subject: Share your availability — [Job Title] interview**
> Hi [Candidate], let's find a time
> We'd like to schedule your **[round type]** interview for **[job title]** ([N] minutes).
> Pick the times that work for you — there's no account to create, and every
> time is shown in your own timezone ([tz]).
> This link is personal to you and expires on [date].
> **[Choose your times →]**

Click through — this is the real candidate link (`/s/:token`), not a demo
fixture.

## Step 3 — candidate picks a day, then a time

On the token link: **Get started** → pick day(s) on the calendar (this hits
`GET /api/public/:token/feasible-days`, which is real-engine-computed, not
guessed) → **Continue to times**. The times page calls
`GET /api/public/:token/slots`, which is where the real Google Calendar
free/busy actually gets read (`buildPool()` in
[lib/scheduling-context.ts](lib/scheduling-context.ts) calls
`adapter.getBusy()` against the interviewer's real secondary calendar) — the
ranked slots you see are only possible times where a real qualified
interviewer is actually free.

Candidate clicks a slot → **Confirm**. This calls
`POST /api/public/:token/book`.

## Step 4 — booking creates the real event, and two confirmation emails go out

`POST /api/public/:token/book` (or the admin equivalent) does three things
for real, right now, not simulated:

1. **Creates a real Google Calendar event** with a real Meet link
   ([lib/adapters/google.ts:58](lib/adapters/google.ts:58) — `conferenceData`
   requests the Meet link, `attendees` lists the candidate + interviewer,
   `sendUpdates: 'all'` triggers Google's own native invite emails).
2. Sends the **candidate confirmation** (`bookingConfirmed` template,
   [lib/email-templates.ts:98](lib/email-templates.ts:98)) to `DEMO_CANDIDATE_INBOX`:

   > **Subject: Confirmed — [day, time, timezone]**
   > You're booked in, [Candidate]
   > **[Day, time]** with [Interviewer name].
   > [Job title] · [round type] · [N] minutes.
   > Need a different time? [Reschedule here] ← real link back to `/s/:token/reschedule`
   > **[Join meeting →]** ← the real Meet link

3. Sends the **interviewer notification** (`interviewerAssigned` template,
   [lib/email-templates.ts:127](lib/email-templates.ts:127)) to `DEMO_INTERVIEWER_INBOX`:

   > **Subject: Interview scheduled — [Candidate], [day, time]**
   > You're interviewing [Candidate]
   > **[Day, time]** (your time).
   > [Job title] · [round type].
   > If you can't make it, decline from your SIRA console — we'll try to find
   > cover at the same time before moving the candidate.
   > **[Join meeting →]**

Open both inboxes side by side — each got its own email, each with the same
real Meet link, sent within moments of the booking. You'll also see a
**separate, native Google Calendar invite** land in both (from
`calendar-notification@google.com`, not SIRA) — that's Google itself
notifying the attendees, on top of SIRA's own email.

## Step 5 — show the actual Calendar event

Open Google Calendar logged in as the **scheduler** account
(`GOOGLE_SENDER_EMAIL`). The event is on its primary calendar, at the booked
time, with the Meet link attached, both attendees listed — this is the
canonical event; everything in Step 4 is a copy of what's sitting right here.

## Step 6 — interviewer sees their OWN Google Calendar inside SIRA

Log in as the interviewer who got booked (their seeded login, `demo1234`).
Land on `/interviewer` → **My calendar** card
([components/staff/CalendarPanel.tsx](components/staff/CalendarPanel.tsx)).
There's a toggle: **Demo calendar** / **Google Calendar**. Click
**Google Calendar** — this calls `GET /api/calendar/mine?source=google`,
which reads the interviewer's real secondary calendar
(`adapter.getBusy()` again, same code path as Step 3) and renders their
actual busy blocks for the week, including the interview that was just
booked. This is the "interviewers see their own calendar" requirement —
already built, just point at this toggle.

## Step 7 (optional, closes the loop) — cancel and confirm the event disappears

From the admin dashboard, cancel the request. `DELETE`-equivalent calls
`adapter.deleteEvent()` — check the scheduler's Google Calendar again: the
event is gone. Both inboxes get the `interviewCancelled` template.

---

## If any email/event doesn't show up

1. `grep PROVIDER_MODE .env` — must say `"google"`.
2. Was the dev server restarted after the last `.env` edit? Next.js only
   reads `.env` at startup.
3. Check the terminal running `npm run dev` for a line like
   `[calendar] PROVIDER_MODE=google but Google credentials are missing —
   using MockCalendar.` — if you see that, one of `GOOGLE_CLIENT_ID` /
   `GOOGLE_CLIENT_SECRET` / `GOOGLE_REFRESH_TOKEN` is still blank.
4. Check the interviewer/candidate involved actually has a real
   `GOOGLE_CAL_*` / `DEMO_*_INBOX`-derived email — a freshly created
   candidate you typed in by hand needs a real address typed in too; only
   the *seeded* demo people get the env-var substitution automatically.
