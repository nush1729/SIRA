# Integration Guide

Run on **B's laptop**, with all four people present, in a **4-hour window**. Nobody starts new features during integration.

---

## 0. Entry gate — nobody merges until all four pass

Each person demonstrates their own standalone proof (from their role doc) on their own machine. Tick it in front of the group. **If a box is unticked, that person fixes it while the others merge around them** — do not merge broken work and "sort it out later."

| Person | Gate |
|---|---|
| **A** | `npm run test` green (incl. the LA↔Kolkata zero-overlap and buffer-adjacency cases); `npx tsx scripts/engine-demo.ts` prints believable ranked slots with reasons |
| **B** | `npm run seed` twice cleanly; `scripts/api-smoke.sh` passes every line (incl. the 409 double-book and the 403 RBAC lines) with `USE_ENGINE_STUB=true` |
| **C** | Every staff screen clickable on fixtures, all 3 reschedule banners shown, zero direct `fetch` outside `api-client.ts` |
| **D** | Full candidate journey clickable at 375px, D0 components complete, `demo-ryan` empty-reschedule state renders |

Also confirm out loud: **has anyone edited `lib/contracts.ts`?** If yes, that diff gets reviewed by all four right now, before merging.

---

## 1. Merge order (this order, for a reason)

Merge one branch at a time. After each, run `npm run build` — if it fails, fix before the next merge. Never merge two branches then debug.

```
main
 └─1. feat/candidate-ui   (D)  → layout, globals, design system, /s pages
 └─2. feat/staff-ui       (C)  → depends on D's components
 └─3. feat/backend        (B)  → schema, auth, routes, seed, adapters
 └─4. feat/engine         (A)  → pure lib, touches nothing else
```

D first because everything visual sits on their layout/tokens. A last because it's the only branch that can't conflict with anything (it's isolated pure files).

```bash
git checkout main
git merge --no-ff feat/candidate-ui && npm run build
git merge --no-ff feat/staff-ui     && npm run build
git merge --no-ff feat/backend      && npm run build
git merge --no-ff feat/engine       && npm run build
```

**Expected conflicts and who resolves them** (the owner decides, not the integrator):

| File | Likely conflict | Resolution |
|---|---|---|
| `package.json` / lockfile | someone added a dep after Hour Zero | union of deps, single `npm install`, commit the lockfile once |
| `app/layout.tsx` | C added something to the root layout | D's version wins; C moves it into `app/(staff)/layout.tsx` |
| `.env.example` | B vs D both added a var | union |
| `tsconfig.json` / `next.config.js` | path aliases | union, then `npm run build` |

---

## 2. Wire the real pieces in (the actual integration, ~30 min)

### 2a. Engine stub → real engine
```bash
rm lib/engine-stub.ts
```
In `lib/engine.ts`, point the re-exports at A's modules:
```ts
export { generateSlots, validateSlot } from "./scheduler";
export { pickPanel } from "./selection";
export { findSameTimeReplacement, refineWindows } from "./reschedule-core";
```
Delete `USE_ENGINE_STUB` from `.env`. Run `npx tsc --noEmit` — the contract types should make any mismatch a compile error, not a runtime surprise. **This is the moment the contract pays for itself.**

### 2b. Mock API → real API
```bash
# .env.local
NEXT_PUBLIC_MOCK_API=false
PROVIDER_MODE=mock          # still mock calendar/mail — that's correct for now
```
C and D each open their pages and confirm real data appears. Keep the fixture files in the repo — they're your fallback if something breaks 10 minutes before the pitch.

### 2c. Fresh database
```bash
rm -f prisma/dev.db
npx prisma migrate dev --name init
npm run seed
```
Seed prints the candidate links and logins — paste them into the group chat, everyone needs them for testing.

---

## 3. Integration smoke test (the real checklist, ~45 min)

Do these **in order**, on the merged app, out loud, one person driving and the others watching. Each maps to a seeded scenario from [04_SEED_DATA.md](04_SEED_DATA.md).

| # | Step | Expected | Covers |
|---|---|---|---|
| 1 | Log in as Jordan (recruiter) | dashboard, 8 rows, correct status pills | 1 |
| 2 | Log in as Alex (interviewer) in a private window | lands on `/interviewer`; hitting `/dashboard` API → 403 | 1 |
| 3 | Create a Technical/Java request | eligibility panel: Alex "at daily cap 2/2", Priya selected — **from the real engine now** | 2, 3, 18, 20 |
| 4 | Open **Maya (S2)** → slots | ranked slots with real reasons, both timezones shown | 5, 6, 7, 8, 16 |
| 5 | Open **Carlos (S3)** → slots | only LA 09:00–15:00 times appear; IST interviewers absent with a reason | 16, 18 |
| 6 | Book Maya's rank-1 slot | booking created, Meet link present, emails appear in the Emails-sent table | 9, 10, 11 |
| 7 | Book that same slot again (2nd tab, simultaneously) | exactly one 200, one clean "just taken" message | 9 |
| 8 | Open **Dev (S1)** candidate link on a phone-sized window | intro → days → times → confirmed, all in his timezone, no login | 4, 15, 16 |
| 9 | As Priya, decline **Sophia (S4)** | banner: replaced by Rahul, **time unchanged**; candidate email says interviewer changed | 12, 14 |
| 10 | As Priya, decline **Nikhil (S8)** | banner: rebooked to a new time from his existing windows; candidate emailed "moved to…" | 12, 14 |
| 11 | Open **Ryan (S7)** candidate link → reschedule | empty-options card; dashboard now shows `RESCHEDULE REQUIRED` + reason; candidate emailed | 14, 15 |
| 12 | Cancel **Chloe (S6)** | status CANCELLED, calendar event gone, everyone notified | 13 |
| 13 | Tamper with a candidate token (change one char) | friendly invalid-link page | 15 |
| 14 | Click **Reset demo data** | everything returns to the seeded state, links still work | seed |

Anything that fails: the **owner** of that layer fixes it, on the integrated branch, immediately. Log each failure in a shared list so nothing gets silently skipped.

---

## 4. Google mode (optional, only after §3 is fully green)

Do **not** attempt this until the mock-mode demo works end to end.

```bash
PROVIDER_MODE=google
GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=... GOOGLE_REFRESH_TOKEN=...
```
Then re-run smoke steps 6, 8 and 12 only, and confirm: a real event appears in Google Calendar with a Meet link, a real email lands in the plus-addressed inbox, and cancelling removes the event.

**Rollback rule:** if anything is flaky, set `PROVIDER_MODE=mock` and demo that. Mock mode is a complete, honest product — the scheduling, conflict detection, booking and state transitions are all real; only the calendar/mail transport is simulated. Say exactly that if a judge asks.

---

## 5. Common breakages

| Symptom | Cause | Fix |
|---|---|---|
| Type errors everywhere after merging A | someone edited `contracts.ts` locally | diff both versions, reconcile, `npx tsc --noEmit` |
| Slots always empty after stub removal | real engine gets UTC ISO strings, stub returned Dates | check B's DTO mapping at the engine boundary — strings in, strings out |
| Times off by hours | somewhere formatting in server-local time | all formatting goes through A's `formatLocal(utcIso, tz)` |
| Pages blank with 401 | `NEXT_PUBLIC_MOCK_API` still `true` in someone's `.env.local` | it's a client var — restart `npm run dev` after changing |
| Double-book didn't 409 | `activeKey` unique index missing | check the migration actually applied; `npx prisma studio` and inspect |
| Two visual styles on screen | C shipped their own primitives | swap to `components/ui/*`, delete the duplicates |
| Seed fails second time | delete order violates FKs | delete children before parents (EventLog → Notification → Booking → PanelAssignment → AvailabilityWindow → InterviewRequest → CalendarBusy → Candidate → User) |

---

## 6. After integration

1. **Freeze features.** Only bug-fixes from here.
2. Each person rehearses their part of the demo script ([05_IMPLEMENTATION_PLAN.md](05_IMPLEMENTATION_PLAN.md)) on the integrated build.
3. Run **Reset demo data** before every rehearsal and before the real pitch.
4. Write the README together (setup, demo logins, AI-usage disclosure, known limitations — including the deliberately unauthenticated seed endpoint).
5. Everyone must be able to explain **any** part of the system, not just their own — spend the last 30 minutes walking each other through your code. That's what the technical-ownership criterion actually tests.
