# Implementation Plan

Build order is chosen so that **something demoable exists after every phase**, and the riskiest thing (the scheduling engine) is proven early with tests rather than discovered broken at hour 20.

Scope: spec features **1–16, 18, 20** + the two custom reschedule flows. See [01_LOGIC_FLOW.md](01_LOGIC_FLOW.md).

---

## Phase 0 — Skeleton (≈1 hr)
- `npx create-next-app` (TS, Tailwind, App Router), Prisma init with SQLite
- `schema.prisma` exactly as in [02_SYSTEM_ARCHITECTURE.md](02_SYSTEM_ARCHITECTURE.md) §4 → `migrate dev`
- `.env.example`, `lib/db.ts`, base layout, `StaffShell`, `CandidateShell`
- **Done when:** `npm run dev` serves a styled empty dashboard.

## Phase 1 — Auth + RBAC (feature 1) (≈2 hrs)
- `lib/auth.ts`: bcrypt hash/verify, JWT sign/verify (`jose`), httpOnly cookie, `getSession()`, `requireRole()`
- `/login` page + `POST /api/auth/login`, `POST /api/auth/logout`
- Route guards in every protected API handler (server-side, not UI-only)
- **Done when:** each of the 4 roles logs in and lands correctly; an INTERVIEWER calling `/api/requests` gets `403`.

## Phase 2 — The engine, offline (features 5–8, 16, 18, 20) (≈4 hrs) ⚠️ highest risk, do it early
Pure TypeScript, no DB, no network:
- `lib/tz.ts` — `toLocal`, `withinWorkingHours`, `sameLocalDay` (luxon)
- `lib/scheduler.ts` — `generateSlots`, `validateSlot`, `rankSlots` (logic doc §4, §5)
- `lib/selection.ts` — `pickPanel` (logic doc §3: label → skills → availability → cap, then sort by load)
- **Unit tests (vitest)** — this is the part to get right:
  - full overlap → slots found · zero overlap → none
  - buffer violation rejected · working-hours violation rejected (in the *right* timezone)
  - PST↔IST case produces the correct, narrow overlap
  - daily-cap exclusion carries a readable reason
  - ranking never promotes an invalid slot
- **Done when:** `npm test` is green and every rejection carries a human-readable reason string.

## Phase 3 — Adapters + seed (≈3 hrs)
- `lib/adapters/calendar.ts` (`MockCalendar` first — reads/writes `CalendarBusy`), `lib/adapters/mail.ts` (`MockMailer` → writes `Notification` + console)
- `prisma/seed.ts` — the full dataset in [04_SEED_DATA.md](04_SEED_DATA.md), relative to next Monday
- `POST /api/dev/seed` + `npm run seed`
- **Done when:** one command produces 6 interviewers with distinct busy calendars and 8 candidate scenarios, and the printed candidate links open.

## Phase 4 — Core recruiter flow (features 2, 3, 4, 9, 10, 11) (≈5 hrs)
- `POST /api/requests` (creates request + runs `pickPanel` + stores selection reasons)
- `GET /api/requests`, `GET /api/requests/:id`
- `POST /api/requests/:id/availability-request` → generates token link, sends email
- `GET /api/requests/:id/slots` → engine → ranked slots + reasons
- `POST /api/requests/:id/book` → transaction, re-check, `activeKey` insert, calendar event, emails (logic doc §7)
- Pages: `/dashboard`, `/requests/new` (with the live "eligible interviewers" panel), `/requests/[id]`
- **Done when:** recruiter creates a request → sees who was picked and why → books a slot → event + emails exist.

## Phase 5 — Candidate self-service (features 4, 15, 16) (≈4 hrs)
- `GET /api/public/[token]` · `POST .../availability` · `GET .../slots` · `POST .../book`
- Pages: `/s/[token]` → `/days` → `/times` → `/confirmed`, with live timezone switching
- Token validation + expiry + friendly invalid-link page
- **Done when:** the S1 (Dev Menon) link runs end-to-end on a phone screen with no login.

## Phase 6 — Exceptions: accept/decline, cancel, reschedule (features 12, 13, 14) (≈5 hrs)
- `POST /api/assignments/:id/respond` (accept | decline)
- `lib/reschedule.ts`:
  - **§6A-1** same-time replacement → swap panel, keep time, notify new/old interviewer + candidate (interviewer changed only)
  - **§6A-2** no replacement → regenerate from the candidate's existing windows → auto-book rank #1 → email candidate "moved to…"
  - **§6B** candidate-initiated → refine their earlier windows against current availability → book, or flip to `RESCHEDULE_REQUIRED` + email + pipeline marker
- `POST /api/requests/:id/cancel` (event delete + notify, distinct from a decline)
- Pages: `/interviewer`, `/s/[token]/reschedule`, `RESCHEDULE REQUIRED` marker on `/dashboard`
- **Done when:** S4, S8, S7 and S6 each replay exactly as described in the seed doc.

## Phase 7 — Google integration (features 10, 11 for real) (≈3 hrs)
- One Google Cloud project, OAuth consent in **Testing** mode (no verification review needed — only our own account signs in)
- Scopes: `calendar`, `calendar.events`, `gmail.send`; obtain one refresh token for the master account
- Create the six secondary calendars; `GoogleCalendar` adapter (`freebusy.query`, `events.insert` with `conferenceDataVersion=1` for Meet links) + `GmailMailer`
- **Done when:** `PROVIDER_MODE=google` books a real event with a real Meet link and a real email arrives — and flipping back to `mock` still works identically.

## Phase 8 — Polish + verification (≈4 hrs)
- Loading skeletons, empty states, error states, disabled buttons, toasts
- Mobile pass on the candidate flow (the one path that must be perfect on a phone)
- Run the full checklist in logic doc §10; fix what fails
- README: setup, demo accounts, demo script, AI-usage disclosure, known limitations (incl. the open seed endpoint)

**Total ≈ 31 focused hours.** Phases 0–6 in `mock` mode are the complete product; Phase 7 upgrades the demo's credibility; Phase 8 is what makes it look finished.

---

## Parallelisation (3 people)

| Person | Phases |
|---|---|
| **A — engine/backend** | 2 (engine + tests) → 4 (booking APIs) → 6 (reschedule logic) |
| **B — frontend** | 0/1 UI → 4 pages → 5 candidate flow → 8 polish |
| **C — data/integrations** | 3 (adapters + seed) → 7 (Google) → 8 README/demo script |

Contract between them: the API route list in [02_SYSTEM_ARCHITECTURE.md](02_SYSTEM_ARCHITECTURE.md) §3. Agree it in hour one and don't renegotiate it.

---

## Demo script (7 minutes)

1. **Dashboard** — pipeline with 8 real candidates, statuses, one row flagged `RESCHEDULE REQUIRED`. *(1, 2)*
2. **Create request** for a new Technical role — the eligible-interviewers panel shows Alex excluded "at daily cap 2/2", Priya selected. *(18, 20)*
3. **Candidate link** (Dev Menon) in an incognito window on a phone-sized viewport — pick days → pick times, all in **his** timezone. *(4, 15, 16)*
4. **Slot card** — read the reasons aloud: candidate free, interviewer free, working hours in both zones, 15-min buffer respected. *(5, 6, 7, 8)*
5. **Confirm** → calendar event appears (show Google Calendar), Meet link attached, confirmation email shown in the Emails-sent table. *(9, 10, 11)*
6. **Carlos** — open his slots to show the PST↔EST squeeze: only early-morning PST times survive. *(16)*
7. **Sophia** — Priya declines from the interviewer console → system swaps in Rahul at the **same time**, candidate told only the interviewer changed. *(12, 14)*
8. **Ryan** — candidate clicks reschedule → no refined options remain → request flips to `RESCHEDULE REQUIRED` on the recruiter dashboard + candidate emailed. *(14, custom flow)*
9. **Reset demo data** button → everything replays. Close on the one-line architecture: *deterministic engine, adapters at the edges, no AI in the correctness path.*

---

## Risks

| Risk | Mitigation |
|---|---|
| Google OAuth/API fights back on demo day | `PROVIDER_MODE=mock` is the default and is a complete product; Google is an upgrade, never a dependency |
| Timezone bugs (the classic) | Phase 2 unit tests cover PST↔IST and working-hours-in-own-zone explicitly, before any UI exists |
| Scope creep back toward What-If / loops / recovery engine | Those are explicitly **out of scope** in logic doc §0. Don't reopen them |
| Seed data drifting from the demo script | Seed is relative to next Monday and one endpoint rebuilds it; re-run before every rehearsal |
| SQLite write lock under concurrent booking demo | Expected and fine at demo scale; the `activeKey` index is what actually guarantees correctness. Answer for judges: "flip Prisma to Postgres, one line" |
