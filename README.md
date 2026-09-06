# SIRA

**Smart Interview Rescheduling & Availability** — an interview orchestration platform for talent acquisition teams.

Not a booking-link clone: a deterministic, constraint-aware scheduler that coordinates candidates, panels, calendars and timezones, explains every recommendation it makes, and recovers when interviews break.

---

## The problem

Scheduling one interview means satisfying a candidate, 1–3 panelists, a hiring manager, their calendars, their working hours, their timezones, a required buffer between meetings, and interviewer workload limits — all at once. Generic schedulers solve "one host, one guest, find an overlap." This solves the multi-party constraint problem underneath it.

## What makes it different

- **Explainable scheduling** — every recommended slot shows exactly which constraints it satisfied and why it ranked where it did. No black-box "best time."
- **Readable failures** — when nothing works, it names the blocker ("Alex Rivera — conflicts with an existing event, incl. 15-min buffer") instead of showing an empty screen.
- **Skill-aware, fair interviewer selection** — filters by round label and required skills first, *then* balances workload. Fairness never overrides qualification.
- **Real reschedule recovery** — an interviewer declining tries a same-time replacement first (candidate's schedule untouched); only if that fails does it move the interview, choosing from availability the candidate already gave.
- **Deterministic core** — availability, conflicts, buffers, eligibility and booking correctness are decided by tested, pure TypeScript. No AI in the correctness path.
- **No candidate accounts** — candidates act through a secure, scoped, expiring link.

## Status

Design and specification complete; implementation in progress.

## Docs

Read in this order:

| Doc | What it covers |
|---|---|
| [`docs/01_LOGIC_FLOW.md`](docs/01_LOGIC_FLOW.md) | **Driver document** — scope, state machine, scheduling algorithm, reschedule flows, booking safety |
| [`docs/02_SYSTEM_ARCHITECTURE.md`](docs/02_SYSTEM_ARCHITECTURE.md) | Stack, database schema, adapters, environment, deployment |
| [`docs/03_UI_PAGES.md`](docs/03_UI_PAGES.md) | Design system and all 11 pages |
| [`docs/04_SEED_DATA.md`](docs/04_SEED_DATA.md) | Demo dataset — 6 interviewers with clashing calendars, 8 candidate scenarios |
| [`docs/05_IMPLEMENTATION_PLAN.md`](docs/05_IMPLEMENTATION_PLAN.md) | Build phases, demo script, risks |
| [`docs/06_TEAM_SPLIT.md`](docs/06_TEAM_SPLIT.md) | Four parallel workstreams with disjoint file ownership |
| [`docs/07`–`10_ROLE_*.md`](docs/) | Per-person briefs (engine · backend · staff UI · candidate UI) |
| [`docs/11_INTEGRATION.md`](docs/11_INTEGRATION.md) | Merge order, wiring, 14-step smoke test |
| [`docs/contracts/contracts.ts`](docs/contracts/contracts.ts) | The frozen interface contract all four workstreams build against |

## Tech stack

Next.js 14 (App Router) · TypeScript · Tailwind · Prisma + SQLite · Google Calendar & Gmail APIs behind swappable adapters, with mock implementations so the product runs fully offline.

## Running it

Implementation is not yet merged. Once it is:

```bash
npm install
cp .env.example .env
npx prisma migrate dev --name init
npm run seed
npm run dev
```

`PROVIDER_MODE=mock` (the default) runs the entire product — scheduling, conflict detection, booking, state transitions and notification records are all real; only the calendar/mail transport is simulated. No Google credentials needed.

## Known limitations

- `POST /api/dev/seed` is intentionally left unauthenticated for demo convenience. It can wipe the database and **must be removed or role-gated before any real deployment.**
- Skills and labels are stored as comma-separated strings rather than join tables — a deliberate simplification for a small dataset.
- SQLite's single-writer lock is the first thing that would break under real concurrency; the fix is switching Prisma's provider to Postgres.
- `backend/` contains an earlier Express/Postgres scaffold, superseded by the simpler Next.js architecture in `docs/02`. Kept for reference.

## AI usage

Claude was used for architecture and specification drafting, competitor research, documentation, and code scaffolding. All design decisions, scope calls and trade-offs are the team's own, and every contributor can explain any part of the system.
