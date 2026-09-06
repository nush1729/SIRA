# Integration handoff — read this first

Written by the integrating Claude session at commit `cfc18a1`, right after
merging A (engine) + B (backend) + C (staff UI) + D (candidate UI) into `main`
and fixing what the merge exposed. If you're a fresh Claude session picking
this up on a new machine, read this whole file before touching code.

## Where things stand

`main` is at commit `cfc18a1` on `github.com/nush1729/SIRA`, builds clean,
85 engine tests pass, and runs end-to-end against a real SQLite DB (not mock
fixtures) with the real scheduling engine. Verified from a freshly deleted
database:

```bash
npm install
npx prisma migrate deploy
npm run seed
npm run dev
```

Login as `jordan@example.com` / `demo1234` (ADMIN) or
`priya@example.com` / `demo1234` (INTERVIEWER). All passwords are `demo1234`.

## The big decisions made this session (all at the user's explicit request)

1. **Three roles only**: `ADMIN` and `INTERVIEWER`. Candidates have no login —
   token link only. This required editing the frozen `lib/contracts.ts`
   (announced, not silent), the Prisma schema, every `requireRole(...)` call,
   and the seed. Jordan Lee moved from RECRUITER to ADMIN and left the
   interviewer pool; Alex Rivera and Ananya Patel absorbed his SCREENING
   coverage (Alex is the only interviewer with NY overlap, Ananya covers the
   rest).
2. **Scheduling is admin-only.** Interviewers can view, accept/decline/request
   reschedule, and see their own calendar — never create/book/cancel/reschedule
   a request. Enforced server-side (`requireRole("ADMIN")`), not just hidden
   in the UI.
3. **Interviewer calendar with two sources** (mock demo data / Google), new
   `GET /api/calendar/mine?source=`. Interview events are DERIVED from live
   booking state, not stored separately — book/decline/cancel updates the
   right calendars automatically with no bookkeeping to drift.
4. **Pool-based scheduling was already landed by Role A** before I started
   integrating (see `docs/12_CONTRACT_DIFF_POOL_BASED_SCHEDULING.md`) — WHO
   runs an interview is decided per-slot at booking time from the whole
   qualified pool, not pinned at request creation. I wired B's routes to
   actually use this (they were still using the old single-panel path, which
   defeated the entire point of A's fix).
5. **Cross-request double-booking guard**, exactly per B's own spec (see the
   long message from B in conversation history, and it's now implemented):
   `BookingAssignment` + `InterviewerTimeLock` tables, every booking reserves
   its 15-min grid cells (interview + buffer), the composite primary key makes
   the DB refuse a second writer — no check-then-act race window. Verified
   live: two candidates racing for the same interviewer/time get exactly one
   200 and one 409.
6. **Real Google transport exists now** (`lib/adapters/google.ts`) — Calendar
   v3 free/busy + event creation with Meet links, Gmail v1 send. Selected by
   `PROVIDER_MODE=google`, falls back to mock with a console warning if
   credentials are missing (never crashes). **Not tested against real Google**
   — no credentials in this environment. See `.env.example` for full setup
   steps (OAuth consent screen, six secondary calendars, refresh token).
7. **Real email copy** replacing one-line bodies — `lib/email-templates.ts`.

## Bugs found and fixed during integration (not obvious, worth knowing)

- **B's seed gave every interviewer `skills: ""`**, but every request requires
  a skill. `pickPanel` filtered the whole pool out, so wiring routes to the
  real pool (item 4 above) initially made everything return ZERO slots. Fixed
  by rewriting `lib/seed.ts` from scratch against `docs/04_SEED_DATA.md` with
  real skills, all six busy calendars, correct timezones per participant.
- **`dailyLimit` is a DAILY cap** but load was computed as a total across the
  whole scheduling window — this permanently capped Alex Rivera, who is the
  ONLY interviewer with any working-hours overlap with Los Angeles (the S3
  scenario). Fixed: `currentLoad` in `lib/scheduling-context.ts` is now the
  load on the person's quietest single day in the window.
- **An interviewer's own confirmed interviews weren't counted as busy time**
  in the engine's view of them — so it would propose slots the booking
  concurrency guard would then always refuse. Fixed in `buildPool()` in
  `lib/scheduling-context.ts`.
- **D's landing page linked hardcoded fixture tokens** (`/s/demo-dev`) that
  don't exist in the real DB (tokens are random per seed). Added
  `GET /api/dev/seed` (read-only summary, spec'd in docs/04 §4 but missing)
  and wired the landing page to fetch live tokens.
- **D's day picker didn't grey out infeasible days** — wired to the
  `feasible-days` endpoint A had already built for exactly this.

## What is verified vs. what is only "should work"

Verified live against the real API + real DB + real engine:
- All 8 seeded scenarios (`docs/04_SEED_DATA.md` S1-S8) return correct
  results — see `scripts/verify.mjs`, just run `node scripts/verify.mjs`
  after seeding and logging in.
- Cross-request concurrency race — see `scripts/concurrency-test.mjs`.
- RBAC 403s server-side for the wrong role.
- Full candidate journey on a real token: intro -> days (with greyed-out
  infeasible days) -> confirmed real slots from the real engine.
- `npm run build` and `npm test` (85 passing) both clean.

NOT verified (no way to, in this environment):
- Real Google Calendar / Gmail sending. The code path exists and degrades
  safely without credentials, but nobody has run it against a live Google
  account yet. When credentials exist, re-run smoke steps 6, 8, 12 from
  `docs/11_INTEGRATION.md`.
- Anything requiring a second real device/browser for the "two people editing
  at once" UX (as opposed to the scripted concurrency test, which does prove
  the DB-level guarantee).

## Loose ends for the team, not yet done

- **`docs/04_SEED_DATA.md` section 1 is now stale** — still describes 4 roles
  and Jordan as a SCREENING interviewer. The code is source of truth now;
  someone should update this doc to match (Jordan=ADMIN, Alex+Ananya cover
  screening).
- No one has set up real Google credentials yet — see `.env.example` for the
  exact steps (create project, enable 2 APIs, OAuth consent screen, mint a
  refresh token, create 6 secondary calendars).

## Where to find things

- `lib/contracts.ts` — the (no longer literally "frozen", but still shared)
  type contract. Mirrored at `docs/contracts/contracts.ts`.
- `lib/scheduling-context.ts` — shared helper every slot-producing route uses
  to build the candidate/pool/config the engine needs. Read this first if
  slots ever look wrong again.
- `lib/booking.ts` — the concurrency guard (`reserveInterviewers`,
  `releaseInterviewers`, `syncPanelToBooking`).
- `lib/seed.ts` — the demo dataset, rewritten this session against
  `docs/04_SEED_DATA.md`. If a scenario looks wrong, this is probably why.
- `components/staff/kit.tsx` — Role C's adapter over Role D's
  `components/ui/*` design system. Not a second design system — read the
  file header before adding a new staff UI primitive here; it likely belongs
  in `components/ui/` instead.
- `scripts/verify.mjs`, `scripts/concurrency-test.mjs` — quick live-API
  checks, not a formal test suite. Run them after any seed/engine change.

## One process note

Whoever continues this: the four-way ownership split in `docs/06_TEAM_SPLIT.md`
is effectively over now that everything is merged and cross-wired (e.g. B's
routes now import from files an "integration" pass added, not strictly A's or
B's originally-owned files). Treat `main` as shared from here — coordinate
before big structural changes, but the "don't touch files you don't own" rule
from Hour Zero no longer cleanly applies post-merge.
