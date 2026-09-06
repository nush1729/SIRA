-- Prisma's schema DSL can't express a partial unique index, so this is applied as a manual
-- migration alongside the generated ones. This is the single DB-level guarantee that makes
-- double-booking structurally impossible, independent of any application-layer bug —
-- see smart-interview-scheduler-architecture.md Section 6.3.
--
-- Run this after `prisma migrate dev` has created the `bookings` table.

CREATE UNIQUE INDEX IF NOT EXISTS uq_booking_confirmed_slot
  ON bookings (slot_recommendation_id)
  WHERE status = 'CONFIRMED';
