# Role B — Backend & Data

You own the database, authentication, every API route, the external adapters, and the demo dataset. You are also the **integrator** on merge day.

Implements spec features **1, 2, 3, 4, 9, 10, 11, 12, 13, 14, 15** (side-effect halves) and the seed/reset tooling.

---

## Files you create (nobody else touches these)

```
prisma/schema.prisma
prisma/seed.ts
lib/db.ts
lib/auth.ts                   hash, JWT, getSession, requireRole
lib/notify.ts                 render + send + record notifications
lib/engine.ts                 one-line re-export indirection (stub ⇄ real engine)
lib/engine-stub.ts            ⚠️ temporary — deleted at integration
lib/adapters/calendar.ts      CalendarAdapter | MockCalendar | GoogleCalendar
lib/adapters/mail.ts          MailAdapter | MockMailer | GmailMailer
app/api/**                    every route in the contract's endpoint map
scripts/api-smoke.sh
.env.example
```

You import from `lib/contracts.ts` for all types. You import the **engine through one file only**:

```ts
// lib/engine.ts  ← you create this tiny indirection on day one
export * from process.env.USE_ENGINE_STUB === "true"
  ? "./engine-stub"      // your fake, while A is still building
  : "./scheduler";       // A's real engine, after integration
```
Practically: write `lib/engine.ts` as a explicit re-export module and flip two import lines at integration. That one indirection is what lets you build every route before A finishes.

---

## What to build

### 1. Schema + migrate (first, everything depends on it)
Exactly the 9 models in [02_SYSTEM_ARCHITECTURE.md](02_SYSTEM_ARCHITECTURE.md) §4. Enum values must match `lib/contracts.ts` **string-for-string**.
Non-negotiable detail: `Booking.activeKey String? @unique` — set to `requestId` while `CONFIRMED`, `null` otherwise. That single index is the double-booking guarantee.

### 2. Auth + RBAC (#1)
bcrypt hashing, `jose` JWT in an httpOnly + sameSite cookie, `getSession()`, and `requireRole(...roles)` used at the **top of every protected route handler**. Server-side always — a hidden button is not access control. Candidate endpoints use token lookup instead of a session and are scoped to exactly one request.

### 3. Adapters
Both implement the interfaces in the architecture doc. **Build the Mock ones first** — they're what the demo runs on:
- `MockCalendar` reads/writes `CalendarBusy` rows, returns `https://meet.google.com/mock-xxxx` links.
- `MockMailer` writes a `Notification` row + console log, sends nothing.
`GoogleCalendar` / `GmailMailer` come later (Phase 7) and must be switchable by `PROVIDER_MODE` alone.

### 4. Seed (#all — this is what makes the demo possible)
`prisma/seed.ts` builds the exact dataset in [04_SEED_DATA.md](04_SEED_DATA.md): 7 logins, 6 interviewer profiles with distinct busy calendars, 8 candidate scenarios in their specific states, all relative to **next Monday**. Return `SeedSummary` including the candidate links so the presenter can jump to any scenario.
Expose as `npm run seed` **and** `POST /api/dev/seed` (unauthenticated by explicit team decision — put the ⚠️ comment in the file so nobody thinks it was an accident).

### 5. Routes
Implement the endpoint map in `lib/contracts.ts` §3 exactly — paths, bodies and DTO shapes. C and D are writing against those shapes right now, so a rename breaks them silently.

The two that carry real weight:

**`POST /api/requests/:id/book`** — logic doc §7:
```
BEGIN TX
  reload request + panel + windows
  validateSlot(...)            ← A's engine (or stub)
    → invalid: ROLLBACK, 409 SLOT_NO_LONGER_VALID
  supersede any existing CONFIRMED booking
  INSERT Booking { CONFIRMED, activeKey: requestId }
COMMIT
then, outside the tx (failures logged, not fatal):
  calendar.createEvent() → store eventId + meetLink
  notify.send() × participants → Notification rows
```

**`POST /api/assignments/:id/respond`** with `DECLINE`, and `POST /api/requests/:id/reschedule` — logic doc §6A/§6B. Return the `RescheduleOutcome` union so C can render one banner for all three outcomes. Order matters: same-time replacement → new time from existing windows → `RESCHEDULE_REQUIRED` + candidate email + `blockedReason` set for the dashboard marker.

### 6. Validation + safety
`zod` on every request body. Never return a stack trace. Every state change writes an `EventLog` row (one helper, called everywhere).

---

## Prove it — your standalone test story

You can verify **everything** without a single page existing.

**1. `npm run seed && npx prisma studio`** — eyeball the data: 6 interviewers with different busy blocks, 8 requests in the right statuses, Alex at 2/2 on Mon/Tue.

**2. `scripts/api-smoke.sh`** — a curl script that runs the whole product headlessly and prints pass/fail per step:
```bash
# login as recruiter → cookie
# GET  /api/requests                     → 8 items
# POST /api/requests/preview-panel       → Alex rejected "at daily cap", Priya selected
# GET  /api/requests/<S2>/slots          → non-empty, ranked, reasons present
# POST /api/requests/<S2>/book           → 200 + booking id + meetLink
# POST /api/requests/<S2>/book (again)   → 409 ALREADY_BOOKED        ← concurrency proof
# GET  /api/public/<devToken>            → PublicRequestDTO, no internal fields leaked
# POST /api/public/<badToken>/book       → 401 INVALID_TOKEN
# GET  /api/requests as INTERVIEWER      → 403 FORBIDDEN             ← RBAC proof
# POST /api/assignments/<sophia>/respond DECLINE → REPLACED_SAME_TIME
# POST /api/assignments/<nikhil>/respond DECLINE → REBOOKED_NEW_TIME
# GET  /api/public/<ryanToken>/reschedule-slots  → empty + request now RESCHEDULE_REQUIRED
```
That script *is* your demo before the UI exists, and it doubles as the integration smoke test later.

**3. Concurrency check:** fire two `book` requests at the same slot with `&` in bash — exactly one 200, one 409.

**Definition of done:** smoke script passes every line with `USE_ENGINE_STUB=true`, and the seed rebuilds cleanly from scratch twice in a row.

---

## What you must NOT do

- Don't implement scheduling logic yourself. If you're writing a loop over time slots, you're doing A's job — call the engine (or the stub).
- Don't change DTO field names in `contracts.ts` unilaterally; C and D are rendering them.
- Don't skip `requireRole` on a route because "the UI won't call it that way."
- Don't let a failed email roll back a successful booking.

## Your engine stub (delete at integration)

Keep it dumb and *slightly wrong on purpose* so nobody mistakes it for the real thing: return 3 fixed slots at 10:00 / 14:00 / 16:00 UTC with `reasons: ["stub slot"]`, and a `pickPanel` that returns the first N of the pool with `reason: "stub selection"`. Real engine plugs into the same signatures.
