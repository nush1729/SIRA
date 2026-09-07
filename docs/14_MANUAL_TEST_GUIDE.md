# Manual Test Guide — API + UI Walkthrough

This is the click-by-click / curl-by-curl script for demoing and manually verifying SIRA end-to-end. It assumes a freshly seeded database. Companion to `scripts/verify.mjs` and `scripts/concurrency-test.mjs`, which do the same checks by script instead of by hand.

---

## 0. Setup

```bash
npm install
npx prisma migrate deploy
npm run seed        # or: curl -X POST http://localhost:3000/api/dev/seed
npm run dev
```

App runs at `http://localhost:3000`.

**Logins** (password for all: `demo1234`):

| Email | Role | Can do |
|---|---|---|
| `jordan@example.com` | ADMIN | Create/book/cancel/reschedule requests |
| `admin@example.com` | ADMIN | Same as Jordan |
| `alex@example.com` | INTERVIEWER | View/accept/decline own assignments, own calendar |
| `priya@example.com` | INTERVIEWER | Same |
| `rahul@example.com` | INTERVIEWER | Same |
| `ananya@example.com` | INTERVIEWER | Same |
| `vikram@example.com` | INTERVIEWER | Same |

Candidates have **no login** — they only get a one-time token link (`/s/<token>`). Get all 8 demo candidate links without reseeding:

```bash
curl http://localhost:3000/api/dev/seed | jq '.candidateLinks'
```

To restart the whole demo mid-session: `POST /api/dev/seed` again, or the **"Reset demo data"** button in the staff top bar (admin only) — asks for confirmation, then re-seeds everything.

---

## 1. API testing (curl)

Every route needs a session cookie except the `public/:token/*` ones (token-authenticated) and `dev/seed`. Save cookies across calls:

```bash
JAR=/tmp/sira.cookies
curl -c $JAR -b $JAR -s -X POST http://localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"jordan@example.com","password":"demo1234"}' | jq
```

From here every admin call reuses `-b $JAR -c $JAR`.

### 1.1 Auth

```bash
# Who am I
curl -b $JAR http://localhost:3000/api/auth/me | jq

# Bad password -> 401 UNAUTHORIZED
curl -s -X POST http://localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"jordan@example.com","password":"wrong"}' | jq

# Logout
curl -b $JAR -c $JAR -X POST http://localhost:3000/api/auth/logout | jq
```

### 1.2 RBAC (feature 1) — server-side enforcement, not just hidden buttons

```bash
# Log in as an INTERVIEWER, then hit an admin-only route
curl -c /tmp/alex.cookies -s -X POST http://localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' -d '{"email":"alex@example.com","password":"demo1234"}' > /dev/null

curl -b /tmp/alex.cookies http://localhost:3000/api/requests
# Expect: 403 FORBIDDEN — the dashboard link is hidden for interviewers, but the route itself refuses regardless
```

### 1.3 List + inspect requests

```bash
curl -b $JAR http://localhost:3000/api/requests | jq '.data[] | {name: .candidate.name, status, jobTitle}'

# grab one id (Maya Iyer, S2)
REQID=$(curl -b $JAR http://localhost:3000/api/requests | jq -r '.data[] | select(.candidate.name=="Maya Iyer") | .id')
curl -b $JAR http://localhost:3000/api/requests/$REQID | jq
```

### 1.4 S2 — pool selection + load balancing (features 18, 20)

```bash
curl -b $JAR http://localhost:3000/api/requests/$REQID/slots | jq '.data.slots[0]'
```
Expect: `interviewerNames` = `["Priya Sharma"]` on the top slot, not Alex (at 2/2 cap) or Rahul (has a seeded booking, so higher load than Priya's 0). Check `.data.rejections` for Alex's cap reason.

Also try the panel preview used by the "new request" form, without creating anything:
```bash
curl -b $JAR -X POST http://localhost:3000/api/requests/preview-panel \
  -H 'Content-Type: application/json' \
  -d '{"roundType":"TECHNICAL","requiredSkills":["Java","Backend"],"panelSize":1,"durationMin":60,"window":{"start":"2026-01-01T00:00:00.000Z","end":"2026-01-03T00:00:00.000Z"}}' | jq '.data.pool'
```
Expect all 3 qualified interviewers listed in `.pool`, ranked by load; `.selected` is just the top `panelSize`.

### 1.5 S3 — timezone filtering (features 6, 16, 18)

```bash
CARLOS=$(curl -b $JAR http://localhost:3000/api/requests | jq -r '.data[] | select(.candidate.name=="Carlos Mendes") | .id')
curl -b $JAR http://localhost:3000/api/requests/$CARLOS/slots | jq '.data.slots[] | {start, interviewerNames}'
```
Expect: only Alex Rivera ever appears (Priya/Rahul in Kolkata have zero working-hours overlap with Los Angeles — verify their rejection reason in `.data.rejections` says something like "no working-hours overlap").

### 1.6 Full candidate happy path — S1, live (features 4, 5, 6, 7, 8, 9, 10, 11, 15, 16)

```bash
DEV_TOKEN=$(curl -s http://localhost:3000/api/dev/seed | jq -r '.candidateLinks[] | select(.name=="Dev Menon") | .url' | sed 's#/s/##')

# Public view — no auth needed
curl http://localhost:3000/api/public/$DEV_TOKEN | jq
# status: AWAITING_AVAILABILITY, booking: null

# Which days are even feasible before picking anything (greys out bad days)
curl http://localhost:3000/api/public/$DEV_TOKEN/feasible-days | jq

# Candidate submits availability windows (server time is UTC; adjust to a weekday in the seeded window)
curl -X POST http://localhost:3000/api/public/$DEV_TOKEN/availability \
  -H 'Content-Type: application/json' \
  -d '{"windows":[{"start":"<MON>T14:00:00.000Z","end":"<MON>T18:00:00.000Z"}]}' | jq
# status flips to READY_TO_SCHEDULE

# Get generated, ranked slots
curl http://localhost:3000/api/public/$DEV_TOKEN/slots | jq '.data.slots'

# Book the top slot
START=$(curl -s http://localhost:3000/api/public/$DEV_TOKEN/slots | jq -r '.data.slots[0].start')
END=$(curl -s http://localhost:3000/api/public/$DEV_TOKEN/slots | jq -r '.data.slots[0].end')
curl -X POST http://localhost:3000/api/public/$DEV_TOKEN/book \
  -H 'Content-Type: application/json' \
  -d "{\"startUtc\":\"$START\",\"endUtc\":\"$END\"}" | jq
# expect ok:true, meetLink present, status now SCHEDULED
```

### 1.7 Token scope (feature 15)

```bash
curl "http://localhost:3000/api/public/${DEV_TOKEN}x" 
# expect 401 INVALID_TOKEN, never a stack trace
```

### 1.8 S4 — interviewer declines, same-time replacement (feature 14, §6A branch 1)

```bash
# Log in as Priya, find her assignment for Sophia Reddy, decline it
curl -c /tmp/priya.cookies -s -X POST http://localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' -d '{"email":"priya@example.com","password":"demo1234"}' > /dev/null

AID=$(curl -b /tmp/priya.cookies http://localhost:3000/api/assignments/mine | jq -r '.data[] | select(.candidateName=="Sophia Reddy") | .assignmentId')
curl -b /tmp/priya.cookies -X POST http://localhost:3000/api/assignments/$AID/respond \
  -H 'Content-Type: application/json' -d '{"action":"DECLINE"}' | jq
```
Expect: booking time **unchanged** (still Thu 15:00 IST), interviewer swapped to Rahul (free at the same time). Confirm via `GET /api/requests/<sophia-id>` — `booking.startUtc` is identical to before, panel now shows Rahul.

### 1.9 S8 — decline, auto-rebook to a new time (feature 14, §6A branch 2)

Same pattern as 1.8 but for Nikhil Rao — decline Priya's assignment. Expect: **no same-time replacement possible**, so the booking moves to a different time drawn from Nikhil's own previously-submitted windows (Fri 14:00 IST). Check the candidate got a "moved to…" email (`GET /api/requests/<nikhil-id>` → notifications, or check `Notification` table / server logs depending on `PROVIDER_MODE`).

### 1.10 S7 — reschedule with no options (feature 14, §6B failure branch)

```bash
RYAN_TOKEN=$(curl -s http://localhost:3000/api/dev/seed | jq -r '.candidateLinks[] | select(.name=="Ryan Cole") | .url' | sed 's#/s/##')
curl "http://localhost:3000/api/public/$RYAN_TOKEN/reschedule-slots" | jq
```
Expect: `slots: []`. Request status flips to `RESCHEDULE_REQUIRED` (Rahul has a seeded "Production incident" clashing with Ryan's only other windows). Verify:
```bash
curl -b $JAR "http://localhost:3000/api/requests?status=RESCHEDULE_REQUIRED" | jq '.data[] | .candidate.name'
```

### 1.11 S6 — cancellation (feature 13)

```bash
CHLOE=$(curl -b $JAR http://localhost:3000/api/requests | jq -r '.data[] | select(.candidate.name=="Chloe Fernandes") | .id')
curl -b $JAR -X POST http://localhost:3000/api/requests/$CHLOE/cancel | jq
curl -b $JAR http://localhost:3000/api/requests/$CHLOE | jq '.data.status'
# expect CANCELLED, booking status CANCELLED, calendar event deleted
```

### 1.12 Cross-request double-booking guard (concurrency, docs/13)

Fully scripted already:
```bash
node scripts/concurrency-test.mjs
```
Expect: `PASS — exactly one booking won` (one `200`, one `409 ALREADY_BOOKED`).

Manual version of the same idea (feature 9, single-request race):
```bash
node scripts/verify.mjs   # sanity check every S1-S8 scenario returns the documented result in one shot
```
Or two terminals, same candidate token, both racing the same slot:
```bash
curl -X POST http://localhost:3000/api/public/$DEV_TOKEN/book -H 'Content-Type: application/json' -d "{...}" &
curl -X POST http://localhost:3000/api/public/$DEV_TOKEN/book -H 'Content-Type: application/json' -d "{...}" &
wait
```
Expect one `ok:true`, one `409 SLOT_NO_LONGER_VALID` / `ALREADY_BOOKED`.

### 1.13 Interviewer's own calendar (feature: calendar view)

```bash
curl -b /tmp/priya.cookies "http://localhost:3000/api/calendar/mine?source=mock" | jq '.data.events'
```
Expect Priya's seeded busy blocks (Lunch, Sprint planning) plus any interview she's now assigned to, sorted by time.

---

## 2. UI walkthrough (click-by-click)

Open `http://localhost:3000` in a browser.

### 2.1 Landing page

- Shows the SIRA wordmark and a list of live candidate demo links (pulled from `GET /api/dev/seed`, not hardcoded) — click any candidate name to jump straight into their scenario as if you were them.
- A "Staff login" link goes to `/login`.

### 2.2 Staff login

- Go to `/login`. Fields: **Work email**, **Password** (placeholders `you@company.com` / `••••••••`).
- Log in as `jordan@example.com` / `demo1234` → lands on the staff dashboard.
- Try `alex@example.com` / `demo1234` in a separate/incognito window to see the interviewer-only view (no "New request" button, no pipeline table).

### 2.3 Staff dashboard (`/dashboard`, admin)

- Top bar: SIRA wordmark, nav, avatar menu, **"Reset demo data"** button (admin only — click it, confirm in the dialog, watch the whole pipeline table repopulate with the 8 fresh scenarios).
- Main table: every `InterviewRequest`, filterable by status and searchable by candidate/job title (mirrors `GET /api/requests?status=&q=`).
- Click any row to open its detail page.

### 2.4 Create a new request (`/requests/new`, admin)

- Toggle between "existing candidate" and "new candidate" mode.
- New candidate fields: Name (`Maya Iyer` placeholder), Email (`maya@example.com` placeholder), Timezone.
- Job title (`Sr Backend Engineer` placeholder), round-type chips (SCREENING/TECHNICAL/MANAGERIAL/HR), duration chips, panel-size chips, From/To date range.
- As you fill in round type + skills + panel size, the page live-previews the eligible pool (calls `preview-panel` under the hood) — watch it change as you flip round type between TECHNICAL and HR.
- Two submit buttons:
  - **"Create & send availability request"** → status `AWAITING_AVAILABILITY`, candidate emailed a token link.
  - **"Create as draft"** → status `DRAFT`, nothing sent yet.
- After submit you land on the new request's detail page.

### 2.5 Request detail page (`/requests/[id]`, admin)

Sections to check per scenario:
- **Candidate info** (name, email, timezone).
- **Eligibility panel** — who qualifies and who was rejected, with the human-readable reason (label mismatch, skill mismatch, at daily cap, etc.) — this is `SelectionResult.pool` / `.rejected` rendered directly, not paraphrased.
- **Slot cards** — ranked generated slots, each showing which interviewer(s) would actually run it and the reasons it ranked where it did (comfortable hours / first-choice window / load balance). Click a slot to book it.
- **Panel card** — current assigned interviewer(s) and their accept/decline status.
- **Reschedule outcome banner** — appears after a decline/reschedule event, explaining what happened (same-time swap, new time, or "no options" flag).
- **Cancel button** (admin) — cancels the request; confirm the row disappears from active views and shows `CANCELLED` status.

Walk each seeded scenario here to see every state at once:
- **Dev Menon (S1)** — `AWAITING_AVAILABILITY`, no slots yet (candidate hasn't submitted windows).
- **Maya Iyer (S2)** — open the eligibility panel: Alex rejected "at daily cap 2/2", Rahul shown with a nonzero load, top slot assigned to Priya.
- **Carlos Mendes (S3)** — only Alex ever appears in slots; Priya/Rahul rejected for zero timezone overlap.
- **Sophia Reddy (S4)** — already `SCHEDULED` with Priya; this is the one to decline live (see 2.7).
- **Ethan Blake (S5)** — very few slots — good for showing the ranking/reasons UI with a sparse result set.
- **Chloe Fernandes (S6)** — `SCHEDULED`; click Cancel here to demo feature 13.
- **Ryan Cole (S7)** — `SCHEDULED`; this is the one whose reschedule fails (see 2.8).
- **Nikhil Rao (S8)** — `SCHEDULED`; decline here to see the auto-rebook-to-new-time branch.

### 2.6 Candidate self-service flow (no login — open a `/s/<token>` link in an incognito window)

Use Dev Menon's link from the landing page or `GET /api/dev/seed`.

1. **Intro page** (`/s/[token]`) — greets the candidate by name, shows job title/round/duration, "Get started" button.
2. **Days page** (`/s/[token]/days`) — a calendar; infeasible days are greyed out (backed by `feasible-days`). Pick one or more days.
3. Submit availability windows for those days.
4. **Times page** (`/s/[token]/times`) — ranked slot cards generated live from the real engine against the real pool. Pick one and confirm.
5. **Confirmed page** (`/s/[token]/confirmed`) — shows the booked time in the candidate's own timezone, interviewer name(s), and the mock Meet link.
6. Try mistyping the token in the URL bar → clean "invalid or expired link" page, never a crash/stack trace.

### 2.7 Same-time replacement, live (S4 — Sophia Reddy)

1. In one window, log in as `priya@example.com`.
2. Go to the interviewer view (`/interviewer`), find the Sophia Reddy assignment, click **Decline**.
3. Switch to the admin window, open Sophia's request detail page (or refresh it) — the reschedule outcome banner should say the interviewer changed but the **time did not**; panel now shows Rahul Verma.

### 2.8 Reschedule-with-no-options, live (S7 — Ryan Cole)

1. As the candidate, open Ryan Cole's token link and go to the reschedule page (`/s/[token]/reschedule`).
2. It calls `reschedule-slots` and finds zero options (Rahul's seeded incident blocks the only viable window).
3. Expect a clear "we couldn't find a new time, the team will reach out" message on the candidate side, and on the admin dashboard Ryan's row now shows `RESCHEDULE_REQUIRED` with a visible flag/marker.

### 2.9 Auto-rebook to a new time, live (S8 — Nikhil Rao)

1. Log in as `priya@example.com`, decline the Nikhil Rao assignment from the interviewer view.
2. Refresh Nikhil's request detail page as admin — booking time has moved to Fri 14:00 IST (drawn from his own previously-submitted windows), interviewer unchanged conceptually (still drawn from the same pool) or reassigned per whoever's free then.
3. Check the candidate would have received a "your interview moved to…" email (inspect via API/notification log if no real SMTP is wired).

### 2.10 Cancellation, live (S6 — Chloe Fernandes)

1. As admin, open Chloe's request, click **Cancel**, confirm.
2. Status becomes `CANCELLED`; the mock calendar event is deleted; dashboard row reflects it.

### 2.11 Interviewer's own view (`/interviewer`)

Log in as `alex@example.com`, `priya@example.com`, etc.
- **Assignments list** — every request they're on, accept/decline buttons, status.
- **Calendar panel** — their own week, toggle between mock and Google source (Google will show "(PROVIDER_MODE=mock — transport simulated)" unless real credentials are configured).
- Confirm there is **no** "New request" / "Cancel" / admin-only control visible anywhere on this role's screens.

### 2.12 RBAC via the browser

- While logged in as an interviewer, manually navigate to `/requests/new` or `/dashboard` admin-only sections/routes — confirm you're redirected or blocked, not shown a broken admin page.

### 2.13 Concurrency, live in two browser windows (feature 9)

1. Open the same candidate's `/s/[token]/times` page in two separate browser windows (or two browsers).
2. Pick the same slot in both, click Confirm in both as close together as possible.
3. Expect: one window shows the confirmed booking page; the other shows a clean "that time was just taken — here are refreshed options" message, not an error page.

---

## 3. Quick reference — coverage checklist

| # | Feature | Verify via |
|---|---|---|
| 1 | Auth + RBAC | §1.1, §1.2, §2.2, §2.12 |
| 2 | Create request | §1.4 (preview-panel), §2.4 |
| 3 | Round types | §2.4 chips; S1/S5 screening, S2-4/S7/S8 technical, S6 HR |
| 4 | Candidate availability | §1.6, §2.6 |
| 5 | Internal calendar check | §1.13, every scenario |
| 6 | Conflict detection | §1.5 (S3 timezone), §1.10 (S7 incident) |
| 7 | Slot generation | §1.4, §1.6, §2.5 |
| 8 | Ranking | S5 (Ethan) in §2.5 |
| 9 | Booking + re-check | §1.6, §1.12, §2.13 |
| 10 | Calendar event + Meet link | §1.6 booking response, §2.6 step 5 |
| 11 | Communication | Notification rows after any booking/decline/cancel |
| 12 | Accept/decline | §1.8, §1.9, §2.7, §2.9 |
| 13 | Cancellation | §1.11, §2.10 |
| 14 | Rescheduling | §1.8, §1.9, §1.10, §2.7, §2.8, §2.9 |
| 15 | Self-service links | §1.7, §2.6 |
| 16 | Timezone | §1.5, S1 (EST↔GMT), S4/S7 (IST) |
| 18 | Interviewer selection | §1.4, §1.5, §2.5 eligibility panel |
| 20 | Load balancing | §1.4 (S2) |

Nothing here should require typing data live except the "create a request" and "concurrency race" demos — everything else is pre-seeded so the pitch never depends on a live network/DB write going right the first time.
