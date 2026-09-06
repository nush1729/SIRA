# Logic Flow — Driver Document

**This is the master document for the project.** Every other doc (architecture, UI, seed, plan) implements what is written here. If there is a conflict between docs, this one wins.

---

## 0. Scope (locked)

Implementing spec features: **A (1–4), B (5–9), C (10–15), 16, 18, 20.**

| # | Feature | In scope |
|---|---|---|
| 1 | Auth + RBAC | ✅ |
| 2 | Create Interview Request | ✅ |
| 3 | Interview Rounds (Screening/Technical/Managerial/HR) | ✅ (round = a field on the request, not a separate pipeline) |
| 4 | Candidate Availability Collection | ✅ |
| 5 | Internal Calendar Availability Check | ✅ |
| 6 | Conflict Detection | ✅ |
| 7 | Smart Slot Generation | ✅ |
| 8 | Slot Recommendation (ranking) | ✅ |
| 9 | Interview Booking (re-check + commit) | ✅ |
| 10 | Calendar Event Creation | ✅ |
| 11 | Automated Communication | ✅ |
| 12 | Interviewer Accept / Decline | ✅ |
| 13 | Cancellation | ✅ |
| 14 | Rescheduling | ✅ (+ custom flows in §6) |
| 15 | Candidate Self-Service + Public Booking Links | ✅ |
| 16 | Timezone-Aware Scheduling | ✅ |
| 18 | Smart Interviewer Selection | ✅ |
| 20 | Label/Skill-Aware Load Balancing | ✅ |
| 17 | Configurable buffer **UI** | ❌ — but buffer IS enforced as a hard constraint (fixed org default 15 min) inside #6/#7 |
| 19, 21, 22, 23, 25, 26, 27 | What-If, Recovery Engine, Relaxation, Multi-round orchestration, Loop Builder, Day Hub, Bulk | ❌ out of scope |
| 24 | Audit log | ⚠️ Minimal `EventLog` table only (one insert helper). Beyond stated scope but costs ~20 lines and makes the demo legible. |
| 28 | Deterministic core + adapters | ✅ architectural principle, always applies |

**Core principle (from spec):** availability, conflicts, eligibility, buffers, booking correctness and authorization are decided by deterministic, testable backend code. No AI in the correctness path.

---

## 1. End-to-end flow

```
Recruiter creates request
  → system picks eligible interviewers   (#18 eligibility → #20 load balancing)
  → availability request emailed to candidate (secure token link)   (#11, #15)
  → candidate picks days, then times     (#4, #16)
  → engine checks internal calendars     (#5)
  → engine rejects conflicting times     (#6)
  → engine generates valid slots         (#7)
  → engine ranks slots                   (#8)
  → candidate (or recruiter) confirms one
  → engine RE-CHECKS, then books         (#9)
  → calendar event + Meet link created   (#10)
  → confirmations emailed to all         (#11)
  → dashboard status → SCHEDULED
```

Then the exception paths: interviewer accept/decline (#12), cancellation (#13), reschedule by interviewer or candidate (#14, §6 below).

---

## 2. State machine

`InterviewRequest.status`:

```
DRAFT
  └─(recruiter sends availability request)→ AWAITING_AVAILABILITY
        └─(candidate submits windows)→ READY_TO_SCHEDULE
              └─(slot confirmed + booked)→ SCHEDULED
                    ├─(cancelled by recruiter/candidate)→ CANCELLED
                    ├─(reschedule resolved automatically)→ SCHEDULED  (stays)
                    └─(reschedule cannot be resolved)→ RESCHEDULE_REQUIRED
                            └─(recruiter re-runs / candidate re-picks)→ SCHEDULED
              └─(no valid slots at all)→ RESCHEDULE_REQUIRED
        └─(cancelled before booking)→ CANCELLED
```

`PanelAssignment.status`: `PENDING → ACCEPTED | DECLINED | REPLACED`
`Booking.status`: `CONFIRMED → CANCELLED | SUPERSEDED`

**Rule:** exactly one `CONFIRMED` booking may exist per request at any time. Enforced by a DB unique index (see §7).

---

## 3. Interviewer selection (#18) then load balancing (#20)

Strict order. **Fairness never overrides qualification.**

```
eligible = allInterviewers
  .filter(labelMatchesRound)        // e.g. TECHNICAL round needs TECHNICAL label
  .filter(hasAllRequiredSkills)     // e.g. ["Java","Backend"]
  .filter(hasAnyFreeTimeInWindow)   // cheap pre-check against calendar busy
  .filter(dailyLoad < dailyLimit)   // policy constraint

if eligible.length < panelSize → request goes to RESCHEDULE_REQUIRED with reason
                                  "not enough eligible interviewers"

panel = eligible
  .sort(byCurrentLoadAsc, thenByNameAsc)   // ← load balancing only among the qualified
  .slice(0, panelSize)
```

`currentLoad` = count of that interviewer's non-cancelled bookings in the request's scheduling window.

Every filter step records a reason (`"Alex Rivera — at daily cap 2/2"`) so the UI can show *why* someone was or wasn't picked. This is what makes selection explainable without any AI.

---

## 4. Slot generation (#7) + conflict detection (#6) + timezone (#16)

All timestamps stored **UTC**. Every user/candidate has an IANA timezone. Display always converts and labels the zone — never show a bare "10:00 AM".

```
generateSlots(request):
  step      = 15 min
  duration  = request.durationMin
  buffer    = ORG_BUFFER_MIN (15)          // hard constraint, not configurable in UI (#17 out of scope)
  panel     = request.panelAssignments (non-declined)
  required  = [candidate, ...panel]

  slots = []
  for window in request.availabilityWindows:          // candidate-submitted (#4)
    for t = window.start; t + duration <= window.end; t += step:
      slot = { start: t, end: t + duration }
      reasons = []

      for p in required:
        // working hours, evaluated in p's OWN timezone (#16)
        if !withinWorkingHours(slot, p.timezone, 09:00, 18:00):
            reject(slot, `${p.name}: outside working hours (${localTime(slot, p.timezone)})`)

        // must not cross local midnight
        if !sameLocalDay(slot, p.timezone): reject(...)

        // calendar conflicts + buffer (#5, #6)
        busy = calendarAdapter.getBusy(p, window)      // cached per generation run
        if overlaps(expand(slot, buffer), busy):
            reject(slot, `${p.name}: conflicts with existing event (incl. ${buffer}min buffer)`)

        // policy: daily cap
        if bookingsOnLocalDay(p, slot) >= p.dailyLimit:
            reject(slot, `${p.name}: at daily cap`)

        reasons.push(`${p.name} available ${localTime(slot, p.timezone)}`)

      if not rejected: slots.push({ slot, reasons })

  return slots
```

**Rules from spec:** generation answers *validity*, not preference. A rejection reason is always retained — that's what the UI shows when there are few/zero slots.

---

## 5. Ranking (#8)

Ranking only reorders already-valid slots. **A high score can never make an invalid slot valid.**

```
score(slot) =
    + 30  if inside candidate's first-choice window (the earliest window they picked)
    + 20 * (1 - positionInWindowRange)     // earlier in the allowed range scores higher
    + 15  if all panel members' local time is between 10:00–17:00 (comfortable hours)
    + 10 / (1 + avgPanelLoad)              // prefers less-loaded panels
    -  8  if any participant's local time < 09:30 or > 17:00 (edge hours)
```

Output: top N (default 5) sorted desc, each carrying its `reasons[]` for display.

---

## 6. Reschedule flows (#14 + custom logic)

### 6A. Interviewer wants to reschedule / declines (#12 → #14)

```
interviewer declines or requests reschedule
  → mark PanelAssignment DECLINED, audit
  → STEP 1: try same-time replacement
       candidates = eligibleInterviewers(round, skills)   // §3, excluding the decliner
                    .filter(free at the SAME booked slot, incl. buffer)
                    .filter(dailyLoad < dailyLimit)
                    .sort(byLoadAsc)
       if found:
          - swap the panel member, keep the booked time
          - update calendar event attendees
          - email NEW interviewer (assignment) + old one (released)
          - email CANDIDATE: "your interviewer changed, time is unchanged"
          - status stays SCHEDULED
  → STEP 2: no same-time replacement → find a NEW interviewer AND a NEW time
       - re-run pickPanel() excluding the decliner  → gives the replacement interviewer
         (if pickPanel returns nobody → skip straight to RESCHEDULE_REQUIRED below)
       - re-run generateSlots() for [candidate + replacement interviewer] using the
         candidate's ALREADY-SUBMITTED availability windows (do not ask the candidate again)
       - if slots exist: auto-pick rank #1, re-book (§7), update calendar event
         email CANDIDATE: "your interview has been moved to <new time in their tz>,
                           chosen from the availability you gave us"
       - if zero slots: status → RESCHEDULE_REQUIRED
         email CANDIDATE: "we need to find a new time, we'll be in touch / pick again"
         recruiter dashboard shows the RESCHEDULE REQUIRED marker
```

### 6B. Candidate wants to reschedule (#15)

The candidate's original email contains their secure token link. That same link (and a dedicated "I need to reschedule" link on the confirmation page) opens the reschedule view.

```
candidate opens /s/<token>/reschedule
  → take the candidate's PREVIOUSLY SUBMITTED availability windows (unchanged)
  → re-run generateSlots() against CURRENT interviewer availability
      (i.e. refine the old windows down to what is still schedulable now)
  → show only those refined slots, in the candidate's timezone
  → candidate picks one → re-check → re-book → update calendar event
      → email candidate (new confirmation) + panel (updated time)
      → status stays SCHEDULED

  → if the refined list is EMPTY (nothing they originally chose still works,
     and no eligible interviewer is free in those windows):
        - status → RESCHEDULE_REQUIRED
        - request reappears in the recruiter's pipeline with a
          "RESCHEDULE REQUIRED" marker
        - email candidate: "we couldn't find a new time in your earlier availability —
          our team will send you fresh options"
        - recruiter can then send a NEW availability request (back to AWAITING_AVAILABILITY)
```

### 6C. Cancellation (#13) — distinct from a decline
```
recruiter or candidate cancels
  → Booking.status = CANCELLED
  → delete calendar event
  → InterviewRequest.status = CANCELLED
  → email all participants
```
**Rule:** one interviewer declining ≠ cancelling the interview (§6A handles it).

---

## 7. Booking safety (#9)

```
POST /api/requests/:id/book { slotStart, slotEnd }

BEGIN TRANSACTION
  1. reload request + panel + candidate windows
  2. RE-RUN validateSlot(slot)      // calendars may have changed since generation
     → if invalid: ROLLBACK, return 409 SLOT_NO_LONGER_VALID + fresh recommendations
  3. supersede any existing CONFIRMED booking for this request
  4. INSERT Booking { status: CONFIRMED, activeKey: requestId }
     → unique index on activeKey makes a second concurrent confirm fail deterministically
COMMIT

then (outside the transaction, failures are logged not fatal):
  5. calendarAdapter.createEvent()  → store eventId + meetLink
  6. mailAdapter.send() x N          → store Notification rows
```

`activeKey` = `requestId` when `CONFIRMED`, `NULL` otherwise. One unique index, portable across SQLite/Postgres, no Redis needed.

**Rule:** recommendations are proposals; booking is the state transition.

---

## 8. Notification policy (#11)

| Situation | Candidate emailed? | Panel emailed? |
|---|---|---|
| Availability requested | ✅ (token link) | ❌ |
| Interview booked | ✅ confirmation + Meet link | ✅ assignment |
| Interviewer accepts | ❌ | ❌ (recruiter sees it in UI) |
| Interviewer declines, **same-time replacement found** | ✅ "interviewer changed, time unchanged" | ✅ new + released interviewer |
| Interviewer declines, **new time chosen automatically** | ✅ "moved to \<new time\>" | ✅ |
| No resolution → RESCHEDULE_REQUIRED | ✅ "we'll send fresh options" | ❌ |
| Candidate reschedules successfully | ✅ new confirmation | ✅ updated time |
| Cancellation | ✅ | ✅ |

Every email is also written to the `Notification` table so the UI can display exactly what was sent (this is what makes the demo legible without opening a real inbox).

---

## 9. RBAC (#1)

| Role | Can do |
|---|---|
| RECRUITER | create/manage requests, send availability requests, book, cancel, reschedule, view all |
| INTERVIEWER | view own assignments, accept/decline, request reschedule |
| HIRING_MANAGER | read-only pipeline view |
| ADMIN | everything + seed/reset |
| *(candidate)* | **no account** — secure token link only, scoped to one request |

Enforced **server-side on every protected route**, not by hiding buttons. A candidate token can only ever touch its own request.

---

## 10. Verification checklist (definition of done)

- [ ] Recruiter can create a request and the system explains which interviewers it picked and why
- [ ] Candidate opens emailed link with no account, picks days → times, sees times in their own timezone
- [ ] Slots that violate working hours / buffer / calendar conflicts / daily caps never appear
- [ ] Booking creates a real (or mock) calendar event with a Meet link and emails everyone
- [ ] Two concurrent confirms → exactly one succeeds, the other gets a clean 409
- [ ] Interviewer declines → same-time replacement found → candidate told time is unchanged
- [ ] Interviewer declines → no replacement → new time auto-picked from candidate's windows → candidate emailed
- [ ] Candidate reschedules → sees refined slots from their earlier windows only
- [ ] Candidate reschedule with no valid options → request flagged RESCHEDULE_REQUIRED in recruiter pipeline + candidate emailed
- [ ] Cancellation clears the calendar event and notifies everyone
- [ ] `POST /api/dev/seed` resets the whole demo to a known state
