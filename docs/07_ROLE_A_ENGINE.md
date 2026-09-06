# Role A — Scheduling Engine

You own the part the whole product is judged on: **deciding when an interview can legally happen, and who can run it.** Pure TypeScript. No database, no network, no React. You can build and prove your entire workstream without anyone else's code existing.

Implements spec features **5, 6, 7, 8, 16, 18, 20** and the decision core of **14**.

---

## Files you create (nobody else touches these)

```
lib/tz.ts                     timezone helpers
lib/scheduler.ts              generateSlots, validateSlot, rankSlots
lib/selection.ts              pickPanel  (#18 eligibility → #20 balancing)
lib/reschedule-core.ts        pure decision helpers for logic doc §6
lib/__tests__/tz.test.ts
lib/__tests__/scheduler.test.ts
lib/__tests__/selection.test.ts
lib/__tests__/reschedule.test.ts
scripts/engine-demo.ts        CLI harness that prints slots for a fixture scenario
vitest.config.ts
```

You import **only** from `lib/contracts.ts`. Nothing else. If you find yourself importing Prisma or `next/*`, you've stepped outside your lane.

---

## What to build

### 1. `lib/tz.ts` (luxon)
```ts
toLocal(utcIso: string, tz: string): DateTime
formatLocal(utcIso: string, tz: string): string        // "Tue 14 Nov · 3:00 PM IST"
withinWorkingHours(w: TimeWindow, tz: string, start="09:00", end="18:00"): boolean
sameLocalDay(w: TimeWindow, tz: string): boolean
localDayKey(utcIso: string, tz: string): string        // "2026-03-09" — for daily caps
```
Rules: a slot crossing local midnight is **invalid**. Working hours are evaluated in **each participant's own zone**, never the server's.

### 2. `lib/scheduler.ts`
`generateSlots(config, participants) → GenerateSlotsResult` — per logic doc §4:
step through every candidate window in `stepMin` increments; for each candidate slot, check every participant for working hours, same-local-day, calendar conflict **expanded by `bufferMin` on both sides**, and daily cap. Keep a human-readable reason for every rejection and aggregate them into `rejections[]` (top reasons first) so the UI can explain an empty result.

`rankSlots` — logic doc §5 scoring. Ranking **only reorders valid slots**; it can never rescue an invalid one. Attach `reasons[]` to each surviving slot ("Priya Sharma available 3:00 PM IST", "15-min buffer respected").

`validateSlot(slot, config, participants)` — the same hard checks for exactly one slot. B calls this immediately before committing a booking.

### 3. `lib/selection.ts`
`pickPanel(input, pool) → SelectionResult` — logic doc §3, strict order:
`label matches round` → `has all required skills` → `has any free time in window` → `currentLoad < dailyLimit` → sort by `currentLoad` asc, then name → take `panelSize`.

Every filtered-out person lands in `rejected[]` with a sentence a recruiter can read: `"Alex Rivera — at daily cap 2/2"`, `"Ananya Patel — no TECHNICAL label"`, `"Priya Sharma — no working-hours overlap with candidate's timezone"`. **This array is a feature, not debug output** — C renders it directly.

Set `insufficient: true` when fewer than `panelSize` survive.

### 4. `lib/reschedule-core.ts`
Pure decision helpers (B does the DB/email side effects):
```ts
findSameTimeReplacement(bookedSlot, pool, input): SelectionResult   // §6A step 1
refineWindows(candidateWindows, config, participants): GenerateSlotsResult  // §6B
```
`refineWindows` is just `generateSlots` restricted to the candidate's already-submitted windows — reuse, don't duplicate.

---

## Prove it — your standalone test story

**1. Unit tests (`npm run test`) — these are your deliverable as much as the code is.**

Minimum cases, all with hand-built fixtures:

| Test | Expect |
|---|---|
| full overlap, no busy | slots found, ranked |
| zero overlap | `slots: []`, `rejections` names the blocker |
| busy block dead-centre | slots before/after survive, overlapping ones don't |
| busy block + 15-min buffer | the slot *adjacent* to the busy block is rejected too |
| slot outside working hours **in the participant's own zone** | rejected (not the server's zone) |
| candidate LA 09:00–18:00 vs interviewer Kolkata | **zero valid slots** — verified: these zones have no working-hours overlap |
| candidate LA vs interviewer New York | valid slots exist, only within LA 09:00–15:00 |
| slot crossing local midnight | rejected |
| interviewer already at daily cap | excluded, reason string present |
| ranking | never reorders an invalid slot into the list; rank 1 has the highest score |
| `pickPanel` | HR-only interviewer excluded from a TECHNICAL round; among two qualified, the lower-load one is chosen |
| `pickPanel` insufficient | `insufficient: true` when panelSize can't be met |

**2. CLI harness** — `npx tsx scripts/engine-demo.ts` prints, for a fixture scenario, the ranked slots with their reasons and the rejection list, in readable local times. This is what you show the team (and potentially a judge) without any UI existing.

**Definition of done:** `npm run test` green, every rejection carries a sentence a non-engineer understands, and `engine-demo.ts` prints a believable schedule.

---

## What you must NOT do

- Don't read from Prisma or `process.env` — everything arrives as function arguments.
- Don't format times for display beyond `formatLocal` (C and D handle presentation).
- Don't add a "clever" optimiser. Deterministic and explainable beats fast; the search space here is a few hundred slots.
- Don't let ranking influence validity, ever. That's the one rule a judge will probe.

## What you can assume

- All timestamps arriving are UTC ISO strings; every participant has a valid IANA timezone.
- `currentLoad` and `existingBookings` are supplied by B — you never compute them from a DB.
- Buffer is a fixed 15 min (`BUFFER_MIN` in contracts); the configurable-buffer UI is out of scope.
