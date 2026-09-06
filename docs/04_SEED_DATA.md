# Seed Data & Demo Dataset

The demo must show every in-scope feature, every clash, and every recovery path **without anyone typing data during the pitch**. This file defines exactly what gets seeded.

All times are seeded **relative to the next Monday** (`MONDAY = next Monday 00:00 UTC from today`), so the dataset never goes stale. Referred to below as Mon/Tue/Wed/Thu/Fri.

---

## 1. Staff accounts (login)

Password for every account: `demo1234` (bcrypt-hashed at seed time, never stored plaintext).

| Name | Email | App role | Timezone | Can interview? |
|---|---|---|---|---|
| Jordan Lee | `demo+jordan@…` | `RECRUITER` | Europe/London | ✅ Screening |
| Vikram Rao | `demo+vikram@…` | `HIRING_MANAGER` | Asia/Kolkata | ✅ Managerial |
| Alex Rivera | `demo+alex@…` | `INTERVIEWER` | America/New_York | ✅ Technical, Managerial |
| Priya Sharma | `demo+priya@…` | `INTERVIEWER` | Asia/Kolkata | ✅ Technical |
| Rahul Verma | `demo+rahul@…` | `INTERVIEWER` | Asia/Kolkata | ✅ Technical |
| Ananya Patel | `demo+ananya@…` | `INTERVIEWER` | Asia/Kolkata | ✅ HR |
| Admin | `demo+admin@…` | `ADMIN` | Asia/Kolkata | ❌ |

> **Eligibility pool = any user with a non-empty `labels` field**, regardless of app role. That's how Jordan (a recruiter) and Vikram (a hiring manager) can also be picked as panelists — matching how real TA teams work, with no extra table.

### Interviewer profiles

| Name | Labels | Skills | Daily limit | Calendar ID |
|---|---|---|---|---|
| Jordan Lee | `SCREENING` | Screening, Sourcing | 4 | `jordan_hr` |
| Vikram Rao | `MANAGERIAL` | System Design, Culture | 2 | `vikram_em` |
| Alex Rivera | `TECHNICAL,MANAGERIAL` | Java, Backend, Go | 2 | `alex_tech` |
| Priya Sharma | `TECHNICAL` | Java, Backend, React, Full Stack | 3 | `priya_tech` |
| Rahul Verma | `TECHNICAL` | Java, Backend | 3 | `rahul_tech` |
| Ananya Patel | `HR` | Behavioral, Policy | 3 | `ananya_hr` |

In `PROVIDER_MODE=google`, these six are **secondary calendars under one master Google account** (`vikram_em@group.calendar.google.com` etc.) — one OAuth consent covers all six, no need for six real accounts. In `mock` mode they're just keys in the `CalendarBusy` table.

---

## 2. Seeded busy calendars (this is what creates the clashes)

Each interviewer gets a *different, realistic* schedule — that's what makes "find the common slot" mean something on screen.

| Interviewer | Recurring busy (local time) | One-off busy |
|---|---|---|
| Priya Sharma (IST) | Mon–Fri 12:00–13:00 "Lunch" | Tue 15:00–16:00 "Sprint planning" |
| Rahul Verma (IST) | Mon–Fri 12:00–13:00 "Lunch" | Fri 09:30–11:00 "Release review" |
| Alex Rivera (EST) | Mon, Tue 13:00–17:00 "Architecture review" | Wed 09:00–12:00 "1:1s" |
| Vikram Rao (IST) | Mon–Fri 09:00–11:00 "Standups" | Wed all-day "Leadership offsite" |
| Jordan Lee (GMT) | Mon–Fri 09:00–10:00 "TA sync" | Thu 14:00–17:00 "Hiring review" |
| Ananya Patel (IST) | — | Tue, Thu 15:00–17:00 "Policy review" |

Plus:
- **two pre-existing bookings for Alex Rivera on Mon and Tue** so his load reads `2/2` (at daily cap) on those days — this is what triggers the load-balancing scenario;
- **one pre-existing booking for Rahul Verma on Mon** (load 1) so that when Alex is capped, load balancing picks **Priya (load 0)** over Rahul deterministically — the demo shows the same answer every run.

**Verified timezone facts this dataset relies on** (checked, not assumed):

| Pair | Working-hours overlap (09:00–18:00 local each) |
|---|---|
| New York ↔ London | ✅ NY 09:00–14:00 |
| Los Angeles ↔ New York | ✅ LA 09:00–15:00 |
| Los Angeles ↔ Kolkata | ❌ **none** |
| New York ↔ Kolkata | ❌ **none** |

The two "no overlap" pairs are load-bearing: they're what genuinely force the interviewer-availability filter in S3 and the "no same-time replacement possible" branch in S4/S8 — those outcomes are real engine results, not scripted.

Working hours are 09:00–18:00 **in each participant's own timezone**, and the 15-minute buffer applies around every busy block.

---

## 3. Candidates & demo scenarios

Eight candidates, each pre-loaded into a specific state so the demo can jump straight to any feature. Candidate emails use plus-addressing (`demo+maya@…`) so every automated email lands in one inbox.

| # | Candidate | TZ | Round / duration | Seeded state | Demonstrates (spec #) |
|---|---|---|---|---|---|
| **S1** | **Dev Menon** | America/New_York | Screening · 30m · panel 1 | `AWAITING_AVAILABILITY` — token link live, no windows yet | The full happy path, live: 4, 5, 6, 7, 8, 9, 10, 11, 15, 16 |
| **S2** | **Maya Iyer** | Asia/Kolkata | Technical · 60m · Java+Backend · panel 1 · window **Mon–Tue only** | `READY_TO_SCHEDULE` — windows submitted | **18 + 20**: three people qualify on label+skills (Alex, Priya, Rahul). Alex is at 2/2 cap Mon & Tue → excluded *with reason*. Rahul carries a seeded Mon booking (load 1) vs Priya (load 0) → **load balancing deterministically picks Priya** |
| **S3** | **Carlos Mendes** | America/Los_Angeles | Technical · 45m · Java · panel 1 · window **Wed–Thu** | `READY_TO_SCHEDULE` | **16 + 6 + 18**: Priya and Rahul are skill-qualified but **Kolkata has zero working-hours overlap with Los Angeles** (verified), so the availability filter removes them with a readable reason — Alex (EST) is selected. Only PDT 09:00–15:00 survives the overlap, and the 15-min buffer trims the start around his Wed 09:00–12:00 EDT 1:1s |
| **S4** | **Sophia Reddy** | Asia/Kolkata | Technical · 60m · panel 1 (Priya) | `SCHEDULED` Thu 15:00 IST | **12 + 14 (§6A branch 1)**: Priya declines → Rahul is free at the *same* time → swap, **time unchanged**, candidate told only that the interviewer changed |
| **S5** | **Ethan Blake** | Europe/London | Screening · 30m · panel 1 (Jordan) | `READY_TO_SCHEDULE` — only two 45-min windows submitted | **7 + 8**: very few valid slots → ranking and reasons are clearly visible |
| **S6** | **Chloe Fernandes** | Asia/Kolkata | HR · 30m · panel 1 (Ananya) | `SCHEDULED` Wed 11:00 IST | **13**: cancellation → calendar event deleted, everyone notified, status `CANCELLED` |
| **S7** | **Ryan Cole** | Asia/Kolkata | Technical · 60m · panel 1 (Rahul) | `SCHEDULED` Tue 16:00 IST, but a **"Production incident" block is seeded onto Rahul's calendar Tue 15:00–17:30**, and Priya/Alex are unavailable/ineligible in that window | **14 (§6B failure branch)**: candidate clicks reschedule → refined list is **empty** → status flips to `RESCHEDULE_REQUIRED`, marker appears in the recruiter pipeline, candidate emailed |
| **S8** | **Nikhil Rao** | Asia/Kolkata | Technical · 60m · panel 1 (Priya) | `SCHEDULED` Fri 10:00 IST; Rahul busy Fri 09:30–11:00 | **14 (§6A branch 2)**: Priya declines → no same-time replacement → engine auto-picks a new time from Nikhil's *existing* windows (Fri 14:00 IST) → candidate emailed "moved to…" |

### Coverage check

| Spec feature | Covered by |
|---|---|
| 1 Auth + RBAC | All 7 staff logins; candidate has no account (token only) |
| 2 Create request | Live during demo + all 8 seeded requests |
| 3 Rounds | Screening (S1, S5), Technical (S2, S3, S4, S7, S8), HR (S6), Managerial available via Vikram/Alex |
| 4 Candidate availability | S1 live; S2/S3/S5 pre-submitted |
| 5 Internal calendar check | Every scenario (six distinct busy calendars) |
| 6 Conflict detection | S3 (buffer + hours), S7 (new conflict after booking) |
| 7 Slot generation | All |
| 8 Ranking | S5 especially (few slots, visible ordering) |
| 9 Booking + re-check | S1 live; concurrency test below |
| 10 Calendar event + Meet link | S1, S4, S8 |
| 11 Communication | Every scenario writes `Notification` rows |
| 12 Accept/decline | S4, S8 |
| 13 Cancellation | S6 |
| 14 Rescheduling | S4 (§6A-1), S8 (§6A-2), S7 (§6B empty → flagged) |
| 15 Self-service links | S1 (book), S7 (reschedule) |
| 16 Timezone | S1 (EST↔GMT), S3 (PST↔EST), S4/S7 (IST) |
| 18 Interviewer selection | S2 (label + skill filtering), S6 (HR-only) |
| 20 Load balancing | S2 (Alex at cap → Priya chosen) |

Every in-scope feature has at least one seeded scenario. Nothing is demoed from an empty screen.

---

## 4. Seed / reset endpoint

```
POST /api/dev/seed        → wipes and rebuilds the entire demo dataset
GET  /api/dev/seed        → returns current seed summary (counts per table)
```

Behaviour:
1. Delete all rows in dependency order (`EventLog`, `Notification`, `Booking`, `PanelAssignment`, `AvailabilityWindow`, `InterviewRequest`, `CalendarBusy`, `Candidate`, `User`).
2. Recreate staff + interviewer profiles (§1) with freshly hashed passwords.
3. Recreate all busy blocks (§2) relative to next Monday.
4. Recreate the 8 candidates and their requests in the exact states in §3, including tokens.
5. In `PROVIDER_MODE=google`: also clear the demo week on all six secondary calendars and re-insert the busy blocks as real events, so Google Calendar visually matches the DB.
6. Return `{ ok, counts, candidateLinks: [{name, url}] }` — the candidate links are printed so the presenter can open any scenario instantly.

Also exposed as `npm run seed` (same code path, runnable from terminal).

There's a **"Reset demo data"** button in the staff top bar (admin only in the UI) that calls this — one click mid-pitch and the whole story replays cleanly.

> ⚠️ **Known, deliberate security exception:** this endpoint is intentionally left **unauthenticated** for demo convenience, per an explicit decision. It can wipe the database. It must be deleted or role-gated before any real deployment. This is documented, not hidden — if a judge asks about security posture, state it plainly.

---

## 5. Extra demo checks worth having ready

- **Concurrency (feature 9):** two browser windows on the same S1 slot, both click Confirm → one succeeds, the other gets a clean "that slot was just taken" message with refreshed options. Prove it with the `Booking.activeKey` unique index.
- **RBAC (feature 1):** log in as Alex (INTERVIEWER) and hit `/api/requests` → `403`, even though the dashboard link is hidden. Server-side enforcement, not hidden buttons.
- **Token scope (feature 15):** take Dev's candidate link, change the token by one character → clean "link expired/invalid" page, never a stack trace.
