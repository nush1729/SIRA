/**
 * ============================================================================
 *  Demo dataset — docs/04_SEED_DATA.md.
 *
 *  Everything is relative to NEXT MONDAY so the data never goes stale, and
 *  every wall-clock time is written in the participant's own zone and
 *  converted to UTC here. Writing UTC by hand is how the previous version
 *  ended up with interviews outside working hours.
 *
 *  Two things this file must get right or the engine returns nothing:
 *    1. Interviewers need `skills` — pool selection filters on them.
 *    2. Candidate windows must overlap the panel's working hours.
 * ============================================================================
 */

import prisma from './db';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';

const DAY_MS = 86_400_000;

const IST = 'Asia/Kolkata';
const NY = 'America/New_York';
const LA = 'America/Los_Angeles';
const LDN = 'Europe/London';

/**
 * Calendar IDs for the five interviewer secondary calendars. Defaults are
 * mock keys (used by MockCalendar against the CalendarBusy table). Set the
 * GOOGLE_CAL_* env vars to the real secondary-calendar ids once they exist
 * (docs/04 §1) so PROVIDER_MODE=google reads free/busy from the real
 * calendars instead — no code change needed to switch modes.
 */
const CAL = {
  vikram: process.env.GOOGLE_CAL_VIKRAM || 'vikram_em',
  alex: process.env.GOOGLE_CAL_ALEX || 'alex_tech',
  priya: process.env.GOOGLE_CAL_PRIYA || 'priya_tech',
  rahul: process.env.GOOGLE_CAL_RAHUL || 'rahul_tech',
  ananya: process.env.GOOGLE_CAL_ANANYA || 'ananya_hr',
};

/**
 * `@example.com` is a reserved, non-deliverable domain (RFC 2606) — fine for
 * mock mode (nothing is actually sent), but in PROVIDER_MODE=google every
 * seeded email would just vanish, since nobody can receive mail there. Set
 * DEMO_CANDIDATE_INBOX / DEMO_INTERVIEWER_INBOX to a real Gmail address and
 * every seeded person gets a plus-addressed variant of it (`base+dev@...`,
 * `base+priya@...`) that all lands in that one real, checkable inbox —
 * standard Gmail plus-addressing, no per-person mailbox needed. Left unset,
 * everyone keeps the harmless `@example.com` placeholder.
 */
function plusAddress(base: string | undefined, tag: string, fallback: string): string {
  const at = base?.indexOf('@') ?? -1;
  if (!base || at === -1) return fallback;
  return `${base.slice(0, at)}+${tag}${base.slice(at)}`;
}
const CANDIDATE_INBOX = process.env.DEMO_CANDIDATE_INBOX;
const INTERVIEWER_INBOX = process.env.DEMO_INTERVIEWER_INBOX;
const candidateEmail = (tag: string) => plusAddress(CANDIDATE_INBOX, tag, `${tag}@example.com`);
const interviewerEmail = (tag: string) => plusAddress(INTERVIEWER_INBOX, tag, `${tag}@example.com`);

/** Offset of `tz` from UTC, in minutes, at instant `ms`. DST-correct. */
function zoneOffsetMin(ms: number, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(ms));
  const p = Object.fromEntries(parts.map((x) => [x.type, x.value]));
  const asUtc = Date.UTC(
    Number(p.year),
    Number(p.month) - 1,
    Number(p.day),
    Number(p.hour) === 24 ? 0 : Number(p.hour),
    Number(p.minute),
    Number(p.second)
  );
  return (asUtc - ms) / 60_000;
}

export async function runSeed() {
  const now = new Date();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const daysUntilMonday = ((8 - new Date(today).getUTCDay()) % 7) || 7;
  const MONDAY = today + daysUntilMonday * DAY_MS;

  /** Wall-clock time in `tz` on demo day `d` (0 = Monday) → real Date (UTC). */
  const at = (d: number, hour: number, minute: number, tz: string): Date => {
    const guess = MONDAY + d * DAY_MS + hour * 3_600_000 + minute * 60_000;
    const once = guess - zoneOffsetMin(guess, tz) * 60_000;
    return new Date(guess - zoneOffsetMin(once, tz) * 60_000);
  };
  /** Midnight UTC on demo day `d` — for scheduling-window bounds. */
  const day = (d: number) => new Date(MONDAY + d * DAY_MS);

  // Children before parents, or the FKs bite (docs/11 §5).
  await prisma.eventLog.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.interviewerTimeLock.deleteMany();
  await prisma.bookingAssignment.deleteMany();
  await prisma.booking.deleteMany();
  await prisma.panelAssignment.deleteMany();
  await prisma.availabilityWindow.deleteMany();
  await prisma.interviewRequest.deleteMany();
  await prisma.candidate.deleteMany();
  await prisma.calendarBusy.deleteMany();
  await prisma.user.deleteMany();

  const passwordHash = await bcrypt.hash('demo1234', 10);

  /* -- 1. Staff (docs/04 §1) ----------------------------------------------
   * Three roles. Jordan runs scheduling as ADMIN and is therefore NOT in the
   * interviewer pool, so Ananya carries SCREENING.                          */
  const users = await Promise.all([
    prisma.user.create({
      data: { email: 'jordan@example.com', name: 'Jordan Lee', role: 'ADMIN', passwordHash, timezone: LDN },
    }),
    prisma.user.create({
      data: {
        email: interviewerEmail('vikram'), name: 'Vikram Rao', role: 'INTERVIEWER', passwordHash, timezone: IST,
        calendarId: CAL.vikram, labels: 'MANAGERIAL', skills: 'System Design,Culture,Leadership', dailyLimit: 2,
      },
    }),
    prisma.user.create({
      data: {
        email: interviewerEmail('alex'), name: 'Alex Rivera', role: 'INTERVIEWER', passwordHash, timezone: NY,
        // SCREENING moved here with Jordan's promotion to ADMIN — he is the
        // only interviewer with any working-hours overlap with New York.
        calendarId: CAL.alex, labels: 'TECHNICAL,MANAGERIAL,SCREENING',
        skills: 'Java,Backend,Go,Leadership,Screening,Sourcing', dailyLimit: 2,
      },
    }),
    prisma.user.create({
      data: {
        email: interviewerEmail('priya'), name: 'Priya Sharma', role: 'INTERVIEWER', passwordHash, timezone: IST,
        calendarId: CAL.priya, labels: 'TECHNICAL', skills: 'Java,Backend,React,Full Stack', dailyLimit: 3,
      },
    }),
    prisma.user.create({
      data: {
        email: interviewerEmail('rahul'), name: 'Rahul Verma', role: 'INTERVIEWER', passwordHash, timezone: IST,
        calendarId: CAL.rahul, labels: 'TECHNICAL', skills: 'Java,Backend,React', dailyLimit: 3,
      },
    }),
    prisma.user.create({
      data: {
        email: interviewerEmail('ananya'), name: 'Ananya Patel', role: 'INTERVIEWER', passwordHash, timezone: IST,
        calendarId: CAL.ananya, labels: 'HR,SCREENING', skills: 'Behavioral,Policy,Screening,Sourcing,Design', dailyLimit: 3,
      },
    }),
    prisma.user.create({
      data: { email: 'admin@example.com', name: 'Admin', role: 'ADMIN', passwordHash, timezone: IST },
    }),
  ]);

  const [, vikram, alex, priya, rahul, ananya] = users;

  /* -- 2. Busy calendars (docs/04 §2) — this is what creates the clashes -- */
  const busy: { calendarId: string; title: string; startUtc: Date; endUtc: Date }[] = [];
  const addBusy = (cal: string, title: string, d: number, from: [number, number], to: [number, number], tz: string) =>
    busy.push({ calendarId: cal, title, startUtc: at(d, from[0], from[1], tz), endUtc: at(d, to[0], to[1], tz) });

  for (const d of [0, 1, 2, 3, 4]) {
    addBusy(CAL.priya, 'Lunch', d, [12, 0], [13, 0], IST);
    addBusy(CAL.rahul, 'Lunch', d, [12, 0], [13, 0], IST);
    addBusy(CAL.vikram, 'Standups', d, [9, 0], [11, 0], IST);
  }
  addBusy(CAL.priya, 'Sprint planning', 1, [15, 0], [16, 0], IST);
  addBusy(CAL.rahul, 'Release review', 4, [9, 30], [11, 0], IST);
  // S7: the incident that makes Ryan's reschedule fail.
  addBusy(CAL.rahul, 'Production incident', 1, [15, 0], [17, 30], IST);
  addBusy(CAL.alex, 'Architecture review', 0, [13, 0], [17, 0], NY);
  addBusy(CAL.alex, 'Architecture review', 1, [13, 0], [17, 0], NY);
  addBusy(CAL.alex, '1:1s', 2, [9, 0], [12, 0], NY);
  addBusy(CAL.vikram, 'Leadership offsite', 2, [9, 0], [18, 0], IST);
  addBusy(CAL.ananya, 'Policy review', 1, [15, 0], [17, 0], IST);
  addBusy(CAL.ananya, 'Policy review', 3, [15, 0], [17, 0], IST);
  await prisma.calendarBusy.createMany({ data: busy });

  /* -- 3. Candidates and their scenarios (docs/04 §3) --------------------- */
  const token = () => randomBytes(24).toString('base64url');
  const scenarios: { name: string; scenario: string; token: string }[] = [];

  const mk = async (
    name: string,
    email: string,
    timezone: string,
    req: {
      jobTitle: string;
      roundType: 'SCREENING' | 'TECHNICAL' | 'MANAGERIAL' | 'HR';
      durationMin: number;
      requiredSkills: string;
      windowStart: Date;
      windowEnd: Date;
      status: 'AWAITING_AVAILABILITY' | 'READY_TO_SCHEDULE' | 'SCHEDULED' | 'RESCHEDULE_REQUIRED';
      blockedReason?: string;
    },
    windows: { startUtc: Date; endUtc: Date }[] = [],
    label = ''
  ) => {
    const candidate = await prisma.candidate.create({ data: { name, email, timezone } });
    const t = token();
    const request = await prisma.interviewRequest.create({
      data: { ...req, candidateId: candidate.id, panelSize: 1, token: t, tokenExpiresAt: day(14) },
    });
    if (windows.length) {
      await prisma.availabilityWindow.createMany({
        data: windows.map((w) => ({ requestId: request.id, ...w })),
      });
    }
    scenarios.push({ name, scenario: label, token: t });
    return request;
  };

  // S1 — the live happy path: link is live, no windows yet.
  await mk('Dev Menon', candidateEmail('dev'), NY, {
    jobTitle: 'Product Engineer', roundType: 'SCREENING', durationMin: 30, requiredSkills: 'Screening',
    windowStart: day(0), windowEnd: day(5), status: 'AWAITING_AVAILABILITY',
  }, [], 'Full candidate journey');

  // S2 — Maya: three qualify on label+skills; load balancing decides.
  await mk('Maya Iyer', candidateEmail('maya'), IST, {
    jobTitle: 'Sr Backend Engineer', roundType: 'TECHNICAL', durationMin: 60, requiredSkills: 'Java,Backend',
    windowStart: day(0), windowEnd: day(2), status: 'READY_TO_SCHEDULE',
  }, [
    { startUtc: at(0, 14, 0, IST), endUtc: at(0, 18, 0, IST) },
    { startUtc: at(1, 10, 0, IST), endUtc: at(1, 13, 0, IST) },
  ], 'Pool + load balancing');

  // S3 — Carlos: LA. Kolkata has ZERO working-hours overlap, so only Alex works.
  await mk('Carlos Mendes', candidateEmail('carlos'), LA, {
    jobTitle: 'Platform Engineer', roundType: 'TECHNICAL', durationMin: 45, requiredSkills: 'Java',
    windowStart: day(2), windowEnd: day(4), status: 'READY_TO_SCHEDULE',
  }, [
    { startUtc: at(2, 9, 0, LA), endUtc: at(2, 15, 0, LA) },
    { startUtc: at(3, 9, 0, LA), endUtc: at(3, 15, 0, LA) },
  ], 'Timezone filtering');

  // S4 — Sophia: booked Thu 15:00 IST; decline → same-time replacement.
  const req4 = await mk('Sophia Reddy', candidateEmail('sophia'), IST, {
    jobTitle: 'Backend Engineer', roundType: 'TECHNICAL', durationMin: 60, requiredSkills: 'Java,Backend',
    windowStart: day(0), windowEnd: day(5), status: 'SCHEDULED',
  }, [
    { startUtc: at(3, 14, 0, IST), endUtc: at(3, 18, 0, IST) },
    { startUtc: at(4, 10, 0, IST), endUtc: at(4, 14, 0, IST) },
  ], 'Same-time replacement');
  await prisma.panelAssignment.create({
    data: { requestId: req4.id, interviewerId: priya.id, status: 'ACCEPTED', reason: 'TECHNICAL · Java, Backend · lowest load' },
  });
  await prisma.booking.create({
    data: {
      requestId: req4.id, startUtc: at(3, 15, 0, IST), endUtc: at(3, 16, 0, IST),
      activeKey: req4.id, meetLink: 'https://meet.google.com/mock-s4',
    },
  });

  // S5 — Ethan: very few valid slots, so ranking is visible.
  await mk('Ethan Blake', candidateEmail('ethan'), LDN, {
    jobTitle: 'Solutions Engineer', roundType: 'SCREENING', durationMin: 30, requiredSkills: 'Screening',
    windowStart: day(0), windowEnd: day(5), status: 'READY_TO_SCHEDULE',
  }, [
    // London 09:00-13:30 is the only overlap with Kolkata working hours.
    { startUtc: at(1, 9, 30, LDN), endUtc: at(1, 10, 15, LDN) },
    { startUtc: at(3, 9, 0, LDN), endUtc: at(3, 9, 45, LDN) },
  ], 'Few slots, clear ranking');

  // S6 — Chloe: the cancellation demo.
  const req6 = await mk('Chloe Fernandes', candidateEmail('chloe'), IST, {
    jobTitle: 'Customer Success Manager', roundType: 'HR', durationMin: 30, requiredSkills: 'Behavioral',
    windowStart: day(0), windowEnd: day(5), status: 'SCHEDULED',
  }, [{ startUtc: at(2, 10, 0, IST), endUtc: at(2, 14, 0, IST) }], 'Cancellation');
  await prisma.panelAssignment.create({
    data: { requestId: req6.id, interviewerId: ananya.id, status: 'ACCEPTED', reason: 'HR · Behavioral · lowest load' },
  });
  await prisma.booking.create({
    data: {
      requestId: req6.id, startUtc: at(2, 11, 0, IST), endUtc: at(2, 11, 30, IST),
      activeKey: req6.id, meetLink: 'https://meet.google.com/mock-s6',
    },
  });

  // S7 — Ryan: booked Tue 16:00 IST, but Rahul now has a production incident
  // across it, and his earlier windows can't be covered → reschedule fails.
  const req7 = await mk('Ryan Cole', candidateEmail('ryan'), IST, {
    jobTitle: 'Data Engineer', roundType: 'TECHNICAL', durationMin: 60, requiredSkills: 'Java,Backend',
    windowStart: day(0), windowEnd: day(5), status: 'SCHEDULED',
  }, [{ startUtc: at(1, 15, 0, IST), endUtc: at(1, 18, 0, IST) }], 'Reschedule with no options');
  await prisma.panelAssignment.create({
    data: { requestId: req7.id, interviewerId: rahul.id, status: 'ACCEPTED', reason: 'TECHNICAL · Java, Backend' },
  });
  await prisma.booking.create({
    data: {
      requestId: req7.id, startUtc: at(1, 16, 0, IST), endUtc: at(1, 17, 0, IST),
      activeKey: req7.id, meetLink: 'https://meet.google.com/mock-s7',
    },
  });

  // S8 — Nikhil: booked Fri 10:00 IST; decline → rebooked from his own windows.
  const req8 = await mk('Nikhil Rao', candidateEmail('nikhil'), IST, {
    jobTitle: 'Backend Engineer', roundType: 'TECHNICAL', durationMin: 60, requiredSkills: 'Java,Backend',
    windowStart: day(0), windowEnd: day(5), status: 'SCHEDULED',
  }, [
    { startUtc: at(4, 9, 0, IST), endUtc: at(4, 12, 0, IST) },
    { startUtc: at(4, 14, 0, IST), endUtc: at(4, 17, 0, IST) },
  ], 'Auto-rebooked to a new time');
  await prisma.panelAssignment.create({
    data: { requestId: req8.id, interviewerId: priya.id, status: 'PENDING', reason: 'TECHNICAL · Java, Backend' },
  });
  await prisma.booking.create({
    data: {
      requestId: req8.id, startUtc: at(4, 10, 0, IST), endUtc: at(4, 11, 0, IST),
      activeKey: req8.id, meetLink: 'https://meet.google.com/mock-s8',
    },
  });

  // Alex carries two prior bookings Mon+Tue so his load reads 2/2 and the
  // load-balancing story in S2 has something to actually balance against.
  for (const [i, d] of [0, 0, 1, 1].entries()) {
    const filler = await prisma.candidate.create({
      data: { name: `Prior Candidate ${i + 1}`, email: `prior${i + 1}@example.com`, timezone: NY },
    });
    const fillerReq = await prisma.interviewRequest.create({
      data: {
        candidateId: filler.id, jobTitle: 'Platform Engineer', roundType: 'TECHNICAL', durationMin: 60,
        requiredSkills: 'Java', panelSize: 1, windowStart: day(0), windowEnd: day(5),
        status: 'SCHEDULED', token: token(), tokenExpiresAt: day(14),
      },
    });
    await prisma.panelAssignment.create({
      data: { requestId: fillerReq.id, interviewerId: alex.id, status: 'ACCEPTED', reason: 'Pre-existing booking' },
    });
    await prisma.booking.create({
      data: {
        requestId: fillerReq.id, startUtc: at(d, i % 2 === 0 ? 10 : 15, 0, NY), endUtc: at(d, i % 2 === 0 ? 11 : 16, 0, NY),
        activeKey: fillerReq.id, meetLink: `https://meet.google.com/mock-prior-${i + 1}`,
      },
    });
  }

  void vikram;

  const logins = users.map((u) => ({ email: u.email, role: u.role, password: 'demo1234' }));
  const candidateLinks = scenarios.map((s) => ({
    name: s.name,
    scenario: s.scenario,
    url: `/s/${s.token}`,
  }));

  return {
    ok: true,
    counts: {
      users: users.length,
      candidates: scenarios.length + 2,
      requests: scenarios.length + 2,
      busyBlocks: busy.length,
    },
    candidateLinks,
    logins,
  };
}
