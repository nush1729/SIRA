# Contract Diff — Pool-Based Interviewer Assignment

**For the whole team, before anyone codes against `lib/contracts.ts` further.** This changes what "who's on the panel" means. Read before touching interview-request or slot-picking code.

---

## The problem this fixes

Until now, `pickPanel()` picked **one fixed person** at request-creation time, and every downstream slot required exactly them. If that person turned out to be busy for the candidate's actual dates, the request failed — even if two other equally-qualified interviewers were free the whole time. With `panelSize: 1` and 3 qualified people, we were only ever using 1.

**The fix:** interviewers are pooled by round-type label (a TECHNICAL round draws on the TECHNICAL pool). The pool is computed at creation time, but **who actually runs the interview is decided per-slot, at booking time** — whoever in the pool is free for that specific time, least-loaded first.

---

## `lib/contracts.ts` — exact diff

### `SelectionResult` — new required field `pool`

```diff
 export interface SelectionResult {
+  /** EVERY interviewer qualified for this round (correct label + skills +
+   *  some availability + under cap), ranked least-loaded first. THIS is what
+   *  slot generation actually draws on. */
+  pool: { id: string; name: string; reason: string; currentLoad: number; dailyLimit: number }[];
   /** top panelSize of the pool — a PREVIEW only, not a binding assignment */
   selected: { id: string; name: string; reason: string }[];
   rejected: { id: string; name: string; reason: string }[];
   insufficient: boolean;  // now means "pool < panelSize", not "selected < panelSize" (same value, clearer meaning)
 }
```

**If you're rendering `SelectionResult` anywhere (C's create-request panel): show `pool`, not just `selected`.** `selected` still exists for a quick preview, but the pool is the honest picture — it's what actually gets used.

### `GeneratedSlot` — two new fields

```diff
 export interface GeneratedSlot {
   start: string;
   end: string;
   score: number;
   rank: number;
   reasons: string[];
+  interviewerIds: string[];    // who the engine proposes for THIS specific slot
+  interviewerNames: string[];  // — different slots may have different people
 }
```

**D: the `/times` page must show this** — e.g. "Tue 3:00 PM · with Rahul Verma" — this is new information that didn't exist before, and it can differ slot-to-slot.

### `EngineParticipant` — two new optional fields (non-breaking)

```diff
 export interface EngineParticipant {
   ...
+  isRequired?: boolean;   // defaults true; set false for interchangeable pool members
+  currentLoad?: number;   // interviewer only, used to prefer least-loaded when several could cover a slot
 }
```

### New functions (additive — old ones still exist and still work)

```ts
generateSlotsFromPool(config, candidate, pool, panelSize, required?) → GenerateSlotsResult
computeFeasibleDays(config, candidateTimezone, pool, panelSize, required?) → FeasibleDaysResult
refineWindowsFromPool(candidateWindows, config, candidate, pool, panelSize, required?) → GenerateSlotsResult  // §6B, pool-aware version
```

`generateSlots`, `pickPanel`, `refineWindows`, `validateSlot`, `findSameTimeReplacement` are **unchanged in behavior** for existing callers — this is additive, not a rewrite of what's there. `generateSlots` is still correct for a genuinely fixed, non-substitutable assignment; `generateSlotsFromPool` is what the product should actually use for a normal round.

### New endpoint in the map

```
GET /api/public/:token/feasible-days → FeasibleDaysResult
```

`FeasibleDaysResult = { days: string[]; timezone: string; blocked: { day: string; reason: string }[] }`. `days` are local calendar-day keys **in the candidate's own timezone** — don't reinterpret them in another zone.

---

## What each of you needs to do

| Role | Change needed |
|---|---|
| **B** | Booking flow moves from "assign panel at request creation" to "assign at booking time, from `slot.interviewerIds`." This is a real schema shift: `PanelAssignment` rows for the *actual* interviewer should be created when a slot is booked, not when the request is created. Also: new `GET /api/public/:token/feasible-days` route, calling `computeFeasibleDays()`. |
| **C** | Create-request "eligible interviewers" panel: render `result.pool` (the whole bench with load), not just `result.selected`. More honest, and it's what's actually available. |
| **D** | `/times` page: show `slot.interviewerNames` per slot card. `/days` page: call the new feasible-days endpoint once B ships it, grey out everything not in `days`. |
| **A (me)** | Done — `generateSlotsFromPool`, `computeFeasibleDays`, `refineWindowsFromPool` implemented and tested (85 tests passing). |

## Not yet done (called out so nobody assumes it's covered)

- **Cross-request double-booking** — two different candidates both booking the same interviewer at the same time isn't prevented anywhere yet. This becomes *more* likely now that the same pool serves more candidates. This needs a DB-level fix (Role B) — happy to spec the exact constraint on request.
- Panel composition rules ("1 senior + 1 peer") and interviewer time-of-day preferences — explicitly out of scope, agreed earlier.
