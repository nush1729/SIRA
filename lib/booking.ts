/**
 * ============================================================================
 *  Booking-time assignment + the cross-request double-booking guard.
 *
 *  Two things happen here that did not before pool-based scheduling:
 *
 *  1. WHO runs the interview is decided now, not at request creation. The
 *     server re-asks the engine which pool members are free for the requested
 *     time and uses that answer — it never trusts interviewer ids from the
 *     client.
 *
 *  2. Every booking reserves the 15-minute cells it occupies (interview plus
 *     buffer on both sides) in `InterviewerTimeLock`. Because every slot the
 *     engine emits is snapped to the same SLOT_STEP_MIN grid, any real overlap
 *     between two bookings for the same interviewer must collide on at least
 *     one shared cell — and the composite primary key makes the DATABASE
 *     refuse the loser. There is no check-then-act window to race through.
 * ============================================================================
 */

import { BUFFER_MIN, SLOT_STEP_MIN } from '@/lib/contracts';
import type { Prisma, PrismaClient } from '@prisma/client';

type Tx = Prisma.TransactionClient | PrismaClient;

/**
 * Every grid cell a booking occupies, including the buffer either side — two
 * interviews must not sit back-to-back with no gap for the same person.
 */
export function computeTimeCells(
  startUtc: Date,
  endUtc: Date,
  bufferMin: number = BUFFER_MIN,
  stepMin: number = SLOT_STEP_MIN
): Date[] {
  const stepMs = stepMin * 60_000;
  const from = startUtc.getTime() - bufferMin * 60_000;
  const to = endUtc.getTime() + bufferMin * 60_000;

  // Snap down so a cell is shared even if two bookings are offset within it.
  const firstCell = Math.floor(from / stepMs) * stepMs;
  const cells: Date[] = [];
  for (let t = firstCell; t < to; t += stepMs) cells.push(new Date(t));
  return cells;
}

/** Thrown when a time cell is already held by another booking. */
export class SlotTakenError extends Error {
  constructor() {
    super('ALREADY_BOOKED');
    this.name = 'SlotTakenError';
  }
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002';
}

/**
 * Record who is actually running this booking and lock their time.
 * Must be called inside the same transaction that creates the booking.
 */
export async function reserveInterviewers(
  tx: Tx,
  params: { bookingId: string; interviewerIds: string[]; startUtc: Date; endUtc: Date }
): Promise<void> {
  const { bookingId, interviewerIds, startUtc, endUtc } = params;
  const cells = computeTimeCells(startUtc, endUtc);

  try {
    for (const interviewerId of interviewerIds) {
      await tx.bookingAssignment.create({ data: { bookingId, interviewerId } });
      await tx.interviewerTimeLock.createMany({
        data: cells.map((cellStartUtc) => ({ interviewerId, cellStartUtc, bookingId })),
      });
    }
  } catch (err) {
    // Someone else holds one of these cells. The DB decided, not us.
    if (isUniqueViolation(err)) throw new SlotTakenError();
    throw err;
  }
}

/**
 * Free an interviewer's time when a booking stops being CONFIRMED.
 * Without this a cancelled slot would keep them looking busy forever.
 */
export async function releaseInterviewers(tx: Tx, bookingId: string): Promise<void> {
  await tx.interviewerTimeLock.deleteMany({ where: { bookingId } });
}

/**
 * Point the request's PanelAssignment rows at whoever the engine actually
 * assigned, so the panel the UI shows matches the people who were booked.
 */
export async function syncPanelToBooking(
  tx: Tx,
  params: { requestId: string; interviewerIds: string[]; reason: string }
): Promise<void> {
  const { requestId, interviewerIds, reason } = params;
  const existing = await tx.panelAssignment.findMany({ where: { requestId } });

  for (const interviewerId of interviewerIds) {
    const row = existing.find((e) => e.interviewerId === interviewerId);
    if (row) {
      if (row.status === 'DECLINED' || row.status === 'REPLACED') {
        await tx.panelAssignment.update({ where: { id: row.id }, data: { status: 'PENDING', reason } });
      }
    } else {
      await tx.panelAssignment.create({
        data: { requestId, interviewerId, status: 'PENDING', reason },
      });
    }
  }

  // Anyone previously pencilled in who is not on this booking steps aside.
  for (const row of existing) {
    if (!interviewerIds.includes(row.interviewerId) && row.status !== 'DECLINED') {
      await tx.panelAssignment.update({ where: { id: row.id }, data: { status: 'REPLACED' } });
    }
  }
}
