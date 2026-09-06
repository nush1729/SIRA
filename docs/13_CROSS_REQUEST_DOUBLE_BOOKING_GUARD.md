# Cross-Request Double-Booking Guard

**For Role B.** Closes the one concurrency gap flagged in [12_CONTRACT_DIFF_POOL_BASED_SCHEDULING.md](12_CONTRACT_DIFF_POOL_BASED_SCHEDULING.md): two different candidates can currently book the same interviewer at overlapping times, because pool-based assignment makes the same person reachable from more requests than before.

---

## 1. Why the existing guard doesn't cover this

`Booking.activeKey @unique` already prevents two people from booking the **same request** twice — it's an equality check ("is there already a row with this `requestId`"), and a DB unique index enforces equality trivially and atomically.

This case needs an **overlap** check — "does interviewer X already have a booking whose time range intersects this one." Plain unique constraints can't express range overlap. Postgres has `EXCLUDE USING gist` for exactly this, but SQLite has nothing equivalent, and reaching for Redis contradicts the "no Redis, simplest DB" decision already made for this project ([02_SYSTEM_ARCHITECTURE.md](02_SYSTEM_ARCHITECTURE.md)).

## 2. The fix — turn overlap into equality using the grid you already have

`SLOT_STEP_MIN = 15` is already in the contract — every slot the engine produces starts on a 15-minute boundary. So instead of asking the database to understand time *ranges*, decompose every booking into the **discrete 15-minute cells it occupies**, and let a plain equality unique constraint do the work — same pattern as `activeKey`, one dimension deeper.

Any two bookings for the same interviewer that genuinely overlap in time are, by construction, both snapped to the same 15-minute grid — so they are **guaranteed** to share at least one cell. A unique constraint on `(interviewerId, cellStartUtc)` catches every real overlap, with zero false negatives.

### Why this is airtight, not just "usually works"

The classic bug here is **check-then-act**: query for conflicts, see none, then insert — leaving a race window between the query and the insert where two concurrent transactions can both pass the check. This design has **no check-then-act gap**: the guarantee comes purely from the database refusing a duplicate primary key on insert. Two transactions racing to book the same interviewer for overlapping times will both try to insert the same `(interviewerId, cellStartUtc)` row for at least one shared cell, and the storage engine — not application logic — decides which insert wins. This is the exact trust boundary `activeKey` already gives you for the same-request case.

---

## 3. Schema — two new tables

```prisma
model BookingAssignment {
  id            String  @id @default(cuid())
  bookingId     String
  interviewerId String
  booking       Booking @relation(fields: [bookingId], references: [id], onDelete: Cascade)
  interviewer   User    @relation(fields: [interviewerId], references: [id])

  // Who's actually running this interview. Filled from slot.interviewerIds at
  // BOOKING time — not from PanelAssignment, which (post pool-based scheduling)
  // only records the round's eligible pool, not a binding assignment.
}

model InterviewerTimeLock {
  interviewerId String
  cellStartUtc  DateTime
  bookingId     String   // for cleanup/tracing only — NOT part of the guarantee

  @@id([interviewerId, cellStartUtc])   // ← this line is the entire concurrency fix
}
```

`BookingAssignment` answers "who is this interview with" (for notifications, the recruiter's detail page, the interviewer's own dashboard). `InterviewerTimeLock` exists purely to make double-booking structurally impossible — don't merge these into one table; one is data, the other is a constraint.

---

## 4. Booking transaction — exact sequence

Applies to both `POST /api/requests/:id/book` and `POST /api/public/:token/book`.

```
cells(interviewerId, start, end, bufferMin) =
    every 15-min-aligned timestamp from (start - bufferMin) to (end + bufferMin)
    // buffer matters here too — two interviews for the same person
    // shouldn't be allowed to sit back-to-back with no gap between them

BEGIN TRANSACTION
  1. validateSlot() re-check                              ← already exists, unchanged
  2. INSERT Booking { activeKey: requestId }               ← already exists, unchanged
  3. INSERT BookingAssignment for each id in slot.interviewerIds
  4. for each assigned interviewer:
       INSERT InterviewerTimeLock rows for every cell in
       cells(interviewerId, booking.start, booking.end, BUFFER_MIN)
     → if ANY of these violate the @@id unique constraint,
       the WHOLE transaction fails atomically (Prisma throws P2002)
COMMIT

catch P2002 on the InterviewerTimeLock insert:
  ROLLBACK (automatic — you're inside $transaction)
  return 409 ALREADY_BOOKED + fresh recommendations
  // identical response shape to the existing activeKey double-book case —
  // no new error code needed unless you want to distinguish the two in logs
```

This slots directly into the transaction you already have for `activeKey` — same `$transaction` block, two more inserts before `COMMIT`.

---

## 5. Releasing locks — cancel, decline, reschedule

Whenever a `Booking` leaves `CONFIRMED` (cancelled, or superseded by a reschedule), delete its `InterviewerTimeLock` rows in the **same transaction** as that status change. Skip this and a cancelled slot stays locked forever — that interviewer looks permanently busy.

```
BEGIN TRANSACTION
  1. UPDATE Booking SET status = CANCELLED | SUPERSEDED, activeKey = NULL
  2. DELETE FROM InterviewerTimeLock WHERE bookingId = :id
  3. DELETE FROM BookingAssignment WHERE bookingId = :id   (optional — or keep for audit history)
COMMIT
```

**Reschedule specifically** (same interviewer, new time, or a same-time-replacement swap per §6A): delete the old cells and insert the new ones **inside one transaction**. Doing it as two separate transactions creates a window where the interviewer is either double-locked (briefly blocking their own new slot) or fully unlocked (briefly allowing a third party to steal the gap) — neither is correct, and both are avoidable by keeping delete+insert atomic.

---

## 6. How to prove it actually holds (not just that it compiles)

Extend `scripts/api-smoke.sh` with a cross-request version of the concurrency test you already have:

```
1. Create Request A (Technical/Java) → generate slots → Priya available Tue 3pm
2. Create Request B (Technical/Java) → generate slots → Priya available Tue 3pm
   (same slot, TWO DIFFERENT requestIds — this is the case activeKey can't catch)
3. Fire both booking requests concurrently (same & trick already used for the
   same-request test)
4. Assert: exactly one 200, one 409 — identical shape to the existing test,
   just crossing the request boundary
```

If that test isn't green, the guard isn't actually working — the schema and transaction code above are necessary but the proof is this test passing under real concurrency, not just under sequential calls.

---

## 7. Scope check

| Touches | Owner |
|---|---|
| `prisma/schema.prisma` (2 new tables) | B |
| Booking transaction (both `book` routes) | B |
| Cancel / decline / reschedule transactions (lock cleanup) | B |
| Smoke test extension | B |
| `lib/scheduler.ts` (`slot.interviewerIds`) | Already done (A) — this doc only consumes that field, no engine changes needed |

Nothing here requires a contract change — `slot.interviewerIds` already exists from the pool-based scheduling work. This is purely a Role B database/API change.
