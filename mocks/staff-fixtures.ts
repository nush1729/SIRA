/**
 * ============================================================================
 *  Role C — staff fixtures.
 *
 *  Mirrors the seeded dataset in docs/04_SEED_DATA.md: 7 staff logins, 6
 *  interviewer profiles and all 8 candidate scenarios (S1..S8), including the
 *  awkward ones the role doc insists on:
 *    - a RESCHEDULE_REQUIRED row with a blockedReason        -> S7 (Ryan Cole)
 *    - a request with zero slots and populated rejections[]   -> S7
 *    - a panel member with status DECLINED                    -> S8 (Nikhil Rao)
 *
 *  Everything is dated relative to *next Monday*, exactly like the seed, so the
 *  fixtures never go stale. All times stored as UTC ISO — formatting into a
 *  timezone happens in the UI, never here.
 * ============================================================================
 */

import type {
  AssignmentDTO,
  CalendarDTO,
  CalendarEventDTO,
  CalendarSource,
  CandidateDTO,
  GenerateSlotsResult,
  NotificationDTO,
  RequestDetailDTO,
  RequestListItemDTO,
  Role,
  SeedSummary,
  SelectionResult,
  SessionDTO,
  TimeWindow,
} from "@/lib/contracts";

/* ---------------------------------------------------------------------------
 * Date helpers — local-time-in-a-zone -> UTC ISO, relative to next Monday.
 * ------------------------------------------------------------------------ */

const DAY_MS = 86_400_000;

function nextMondayUtcMidnight(from = new Date()): number {
  const d = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
  const dow = new Date(d).getUTCDay(); // 0 = Sun
  const delta = ((8 - dow) % 7) || 7; // strictly the *next* Monday
  return d + delta * DAY_MS;
}

export const MONDAY_UTC = nextMondayUtcMidnight();

/** Offset (minutes) of `tz` from UTC at instant `ms`. */
function zoneOffsetMin(ms: number, tz: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const p = Object.fromEntries(dtf.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
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

/** "Wall clock time in `tz` on demo day `day` (0 = Mon)" -> UTC ISO string. */
function local(day: number, hour: number, minute: number, tz: string): string {
  const guess = MONDAY_UTC + day * DAY_MS + hour * 3_600_000 + minute * 60_000;
  const off = zoneOffsetMin(guess, tz);
  const ms = guess - off * 60_000;
  // re-resolve once, in case the guess landed on the far side of a DST edge
  const ms2 = guess - zoneOffsetMin(ms, tz) * 60_000;
  return new Date(ms2).toISOString();
}

const IST = "Asia/Kolkata";
const NY = "America/New_York";
const LA = "America/Los_Angeles";
const LDN = "Europe/London";

const win = (a: string, b: string): TimeWindow => ({ start: a, end: b });
const plusMin = (iso: string, min: number) => new Date(Date.parse(iso) + min * 60_000).toISOString();

/* ---------------------------------------------------------------------------
 * 1. Staff accounts (docs/04 §1) — password for all of them is `demo1234`.
 * ------------------------------------------------------------------------ */

export const DEMO_PASSWORD = "demo1234";

export const sessions: (SessionDTO & { password: string })[] = [
  // ADMIN — the only role that can create requests or book slots.
  { id: "u_jordan", name: "Jordan Lee", email: "demo+jordan@sira.app", role: "ADMIN", timezone: LDN, password: DEMO_PASSWORD },
  // INTERVIEWER — panels, accept/decline, own calendar.
  { id: "u_vikram", name: "Vikram Rao", email: "demo+vikram@sira.app", role: "INTERVIEWER", timezone: IST, password: DEMO_PASSWORD },
  { id: "u_alex", name: "Alex Rivera", email: "demo+alex@sira.app", role: "INTERVIEWER", timezone: NY, password: DEMO_PASSWORD },
  { id: "u_priya", name: "Priya Sharma", email: "demo+priya@sira.app", role: "INTERVIEWER", timezone: IST, password: DEMO_PASSWORD },
  { id: "u_rahul", name: "Rahul Verma", email: "demo+rahul@sira.app", role: "INTERVIEWER", timezone: IST, password: DEMO_PASSWORD },
  { id: "u_ananya", name: "Ananya Patel", email: "demo+ananya@sira.app", role: "INTERVIEWER", timezone: IST, password: DEMO_PASSWORD },
  { id: "u_admin", name: "Admin", email: "demo+admin@sira.app", role: "ADMIN", timezone: IST, password: DEMO_PASSWORD },
];

export const demoLogins: { email: string; role: Role; password: string }[] = sessions.map((s) => ({
  email: s.email,
  role: s.role,
  password: s.password,
}));

/* ---------------------------------------------------------------------------
 * 2. Candidates (docs/04 §3)
 * ------------------------------------------------------------------------ */

export const candidates: Record<string, CandidateDTO> = {
  dev: { id: "c_dev", name: "Dev Menon", email: "demo+dev@sira.app", timezone: NY },
  maya: { id: "c_maya", name: "Maya Iyer", email: "demo+maya@sira.app", timezone: IST },
  carlos: { id: "c_carlos", name: "Carlos Mendes", email: "demo+carlos@sira.app", timezone: LA },
  sophia: { id: "c_sophia", name: "Sophia Reddy", email: "demo+sophia@sira.app", timezone: IST },
  ethan: { id: "c_ethan", name: "Ethan Blake", email: "demo+ethan@sira.app", timezone: LDN },
  chloe: { id: "c_chloe", name: "Chloe Fernandes", email: "demo+chloe@sira.app", timezone: IST },
  ryan: { id: "c_ryan", name: "Ryan Cole", email: "demo+ryan@sira.app", timezone: IST },
  nikhil: { id: "c_nikhil", name: "Nikhil Rao", email: "demo+nikhil@sira.app", timezone: IST },
};

/* ---------------------------------------------------------------------------
 * 3. Notification helper
 * ------------------------------------------------------------------------ */

let notifSeq = 0;

/** Emails were sent in the *past* — unlike the interviews, which are next week. */
const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();

function notif(
  toEmail: string,
  subject: string,
  template: string,
  sentHoursAgo: number,
  status = "SENT"
): NotificationDTO {
  return { id: `n_${++notifSeq}`, toEmail, subject, template, status, createdAt: hoursAgo(sentHoursAgo) };
}

/* ---------------------------------------------------------------------------
 * 4. The eight requests (docs/04 §3)
 * ------------------------------------------------------------------------ */

export const requestDetails: Record<string, RequestDetailDTO> = {
  /* -- S1 · Dev Menon — awaiting availability, the live happy path --------- */
  r_dev: {
    id: "r_dev",
    candidate: candidates.dev,
    jobTitle: "Product Engineer",
    roundType: "SCREENING",
    durationMin: 30,
    status: "AWAITING_AVAILABILITY",
    blockedReason: null,
    booking: null,
    requiredSkills: ["Screening"],
    panelSize: 1,
    window: win(local(0, 9, 0, NY), local(4, 18, 0, NY)),
    candidateWindows: [],
    panel: [
      {
        assignmentId: "a_dev_ananya",
        interviewerId: "u_ananya",
        name: "Ananya Patel",
        labels: ["SCREENING", "HR"],
        skills: ["Screening", "Sourcing", "Behavioral", "Policy"],
        load: "0/3",
        status: "PENDING",
        reason: "SCREENING label · skills Screening · lowest load 0/3",
      },
    ],
    notifications: [
      notif("demo+dev@sira.app", "Share your availability — Product Engineer screening", "availability_request", 96),
    ],
    candidateLink: "/s/demo-dev",
  },

  /* -- S2 · Maya Iyer — READY_TO_SCHEDULE, load balancing on show --------- */
  r_maya: {
    id: "r_maya",
    candidate: candidates.maya,
    jobTitle: "Sr Backend Engineer",
    roundType: "TECHNICAL",
    durationMin: 60,
    status: "READY_TO_SCHEDULE",
    blockedReason: null,
    booking: null,
    requiredSkills: ["Java", "Backend"],
    panelSize: 1,
    window: win(local(0, 9, 0, IST), local(1, 18, 0, IST)),
    candidateWindows: [
      win(local(0, 14, 0, IST), local(0, 18, 0, IST)),
      win(local(1, 10, 0, IST), local(1, 13, 0, IST)),
    ],
    panel: [
      {
        assignmentId: "a_maya_priya",
        interviewerId: "u_priya",
        name: "Priya Sharma",
        labels: ["TECHNICAL"],
        skills: ["Java", "Backend", "React", "Full Stack"],
        load: "0/3",
        status: "PENDING",
        reason: "TECHNICAL label · skills Java, Backend · lowest load 0/3",
      },
    ],
    notifications: [
      notif("demo+maya@sira.app", "Share your availability — Sr Backend Engineer", "availability_request", 91),
      notif("demo+jordan@sira.app", "Maya Iyer submitted availability", "availability_submitted", 86),
    ],
    candidateLink: "/s/demo-maya",
  },

  /* -- S3 · Carlos Mendes — LA↔Kolkata has zero overlap -------------------- */
  r_carlos: {
    id: "r_carlos",
    candidate: candidates.carlos,
    jobTitle: "Platform Engineer",
    roundType: "TECHNICAL",
    durationMin: 45,
    status: "READY_TO_SCHEDULE",
    blockedReason: null,
    booking: null,
    requiredSkills: ["Java"],
    panelSize: 1,
    window: win(local(2, 9, 0, LA), local(3, 18, 0, LA)),
    candidateWindows: [
      win(local(2, 9, 0, LA), local(2, 15, 0, LA)),
      win(local(3, 9, 0, LA), local(3, 15, 0, LA)),
    ],
    panel: [
      {
        assignmentId: "a_carlos_alex",
        interviewerId: "u_alex",
        name: "Alex Rivera",
        labels: ["TECHNICAL", "MANAGERIAL"],
        skills: ["Java", "Backend", "Go"],
        load: "0/2",
        status: "ACCEPTED",
        reason: "TECHNICAL label · skills Java · only pool member with working-hours overlap with America/Los_Angeles",
      },
    ],
    notifications: [
      notif("demo+carlos@sira.app", "Share your availability — Platform Engineer", "availability_request", 81),
      notif("demo+alex@sira.app", "You have been added to a panel — Carlos Mendes", "panel_assigned", 76),
    ],
    candidateLink: "/s/demo-carlos",
  },

  /* -- S4 · Sophia Reddy — SCHEDULED, decline -> same-time replacement ----- */
  r_sophia: {
    id: "r_sophia",
    candidate: candidates.sophia,
    jobTitle: "Backend Engineer",
    roundType: "TECHNICAL",
    durationMin: 60,
    status: "SCHEDULED",
    blockedReason: null,
    booking: {
      id: "b_sophia",
      startUtc: local(3, 15, 0, IST),
      endUtc: local(3, 16, 0, IST),
      status: "CONFIRMED",
      meetLink: "https://meet.google.com/sira-demo-sop",
    },
    requiredSkills: ["Java", "Backend"],
    panelSize: 1,
    window: win(local(0, 9, 0, IST), local(4, 18, 0, IST)),
    candidateWindows: [
      win(local(3, 14, 0, IST), local(3, 18, 0, IST)),
      win(local(4, 10, 0, IST), local(4, 14, 0, IST)),
    ],
    panel: [
      {
        assignmentId: "a_sophia_priya",
        interviewerId: "u_priya",
        name: "Priya Sharma",
        labels: ["TECHNICAL"],
        skills: ["Java", "Backend", "React", "Full Stack"],
        load: "1/3",
        status: "ACCEPTED",
        reason: "TECHNICAL label · skills Java, Backend · lowest load 1/3",
      },
    ],
    notifications: [
      notif("demo+sophia@sira.app", "Your interview is confirmed — Thu 3:00 PM IST", "booking_confirmed", 71),
      notif("demo+priya@sira.app", "Interview scheduled — Sophia Reddy", "interviewer_booked", 66),
    ],
    candidateLink: "/s/demo-sophia",
  },

  /* -- S5 · Ethan Blake — very few valid slots, ranking is visible --------- */
  r_ethan: {
    id: "r_ethan",
    candidate: candidates.ethan,
    jobTitle: "Solutions Engineer",
    roundType: "SCREENING",
    durationMin: 30,
    status: "READY_TO_SCHEDULE",
    blockedReason: null,
    booking: null,
    requiredSkills: ["Screening"],
    panelSize: 1,
    window: win(local(0, 9, 0, LDN), local(4, 18, 0, LDN)),
    candidateWindows: [
      win(local(1, 11, 0, LDN), local(1, 11, 45, LDN)),
      win(local(3, 15, 0, LDN), local(3, 15, 45, LDN)),
    ],
    panel: [
      {
        assignmentId: "a_ethan_ananya",
        interviewerId: "u_ananya",
        name: "Ananya Patel",
        labels: ["SCREENING", "HR"],
        skills: ["Screening", "Sourcing", "Behavioral", "Policy"],
        load: "1/3",
        status: "ACCEPTED",
        reason: "SCREENING label · skills Screening · lowest load 1/3",
      },
    ],
    notifications: [
      notif("demo+ethan@sira.app", "Share your availability — Solutions Engineer", "availability_request", 61),
      notif("demo+jordan@sira.app", "Ethan Blake submitted availability", "availability_submitted", 56),
    ],
    candidateLink: "/s/demo-ethan",
  },

  /* -- S6 · Chloe Fernandes — SCHEDULED, the cancellation demo ------------- */
  r_chloe: {
    id: "r_chloe",
    candidate: candidates.chloe,
    jobTitle: "Customer Success Manager",
    roundType: "HR",
    durationMin: 30,
    status: "SCHEDULED",
    blockedReason: null,
    booking: {
      id: "b_chloe",
      startUtc: local(2, 11, 0, IST),
      endUtc: local(2, 11, 30, IST),
      status: "CONFIRMED",
      meetLink: "https://meet.google.com/sira-demo-chl",
    },
    requiredSkills: ["Behavioral"],
    panelSize: 1,
    window: win(local(0, 9, 0, IST), local(4, 18, 0, IST)),
    candidateWindows: [win(local(2, 10, 0, IST), local(2, 14, 0, IST))],
    panel: [
      {
        assignmentId: "a_chloe_ananya",
        interviewerId: "u_ananya",
        name: "Ananya Patel",
        labels: ["HR"],
        skills: ["Behavioral", "Policy"],
        load: "1/3",
        status: "ACCEPTED",
        reason: "HR label · skills Behavioral · lowest load 1/3",
      },
    ],
    notifications: [
      notif("demo+chloe@sira.app", "Your interview is confirmed — Wed 11:00 AM IST", "booking_confirmed", 51),
      notif("demo+ananya@sira.app", "Interview scheduled — Chloe Fernandes", "interviewer_booked", 46),
    ],
    candidateLink: "/s/demo-chloe",
  },

  /* -- S7 · Ryan Cole — the RESCHEDULE_REQUIRED marker + zero-slot state --- */
  r_ryan: {
    id: "r_ryan",
    candidate: candidates.ryan,
    jobTitle: "Data Engineer",
    roundType: "TECHNICAL",
    durationMin: 60,
    status: "RESCHEDULE_REQUIRED",
    blockedReason:
      "Ryan's earlier windows no longer work — a production incident took Rahul Verma out and no eligible interviewer is free in those windows.",
    booking: null,
    requiredSkills: ["Java", "Backend"],
    panelSize: 1,
    window: win(local(0, 9, 0, IST), local(4, 18, 0, IST)),
    candidateWindows: [
      win(local(1, 15, 0, IST), local(1, 18, 0, IST)),
      win(local(2, 16, 0, IST), local(2, 18, 0, IST)),
    ],
    panel: [
      {
        assignmentId: "a_ryan_rahul",
        interviewerId: "u_rahul",
        name: "Rahul Verma",
        labels: ["TECHNICAL"],
        skills: ["Java", "Backend"],
        load: "2/3",
        status: "DECLINED",
        reason: "TECHNICAL label · skills Java, Backend · lowest load 1/3 at selection time",
      },
    ],
    notifications: [
      notif("demo+ryan@sira.app", "Your interview is confirmed — Tue 4:00 PM IST", "booking_confirmed", 41),
      notif("demo+ryan@sira.app", "We need to find a new time for your interview", "reschedule_required_candidate", 36),
      notif("demo+jordan@sira.app", "Action needed — Ryan Cole has no remaining options", "reschedule_required_recruiter", 31),
    ],
    candidateLink: "/s/demo-ryan",
  },

  /* -- S8 · Nikhil Rao — decline -> rebooked at a new time ----------------- */
  r_nikhil: {
    id: "r_nikhil",
    candidate: candidates.nikhil,
    jobTitle: "Backend Engineer",
    roundType: "TECHNICAL",
    durationMin: 60,
    status: "SCHEDULED",
    blockedReason: null,
    booking: {
      id: "b_nikhil",
      startUtc: local(4, 10, 0, IST),
      endUtc: local(4, 11, 0, IST),
      status: "CONFIRMED",
      meetLink: "https://meet.google.com/sira-demo-nik",
    },
    requiredSkills: ["Java", "Backend"],
    panelSize: 1,
    window: win(local(0, 9, 0, IST), local(4, 18, 0, IST)),
    candidateWindows: [
      win(local(4, 9, 0, IST), local(4, 12, 0, IST)),
      win(local(4, 14, 0, IST), local(4, 17, 0, IST)),
    ],
    panel: [
      {
        assignmentId: "a_nikhil_priya",
        interviewerId: "u_priya",
        name: "Priya Sharma",
        labels: ["TECHNICAL"],
        skills: ["Java", "Backend", "React", "Full Stack"],
        load: "2/3",
        status: "PENDING",
        reason: "TECHNICAL label · skills Java, Backend · lowest load 1/3 at selection time",
      },
    ],
    notifications: [
      notif("demo+nikhil@sira.app", "Your interview is confirmed — Fri 10:00 AM IST", "booking_confirmed", 26),
      notif("demo+priya@sira.app", "Interview scheduled — Nikhil Rao", "interviewer_booked", 21),
      notif("demo+nikhil@sira.app", "Your interview has moved to Fri 2:00 PM IST", "interview_moved", 16),
    ],
    candidateLink: "/s/demo-nikhil",
  },
};

/** Dashboard order — the pipeline reads best when the blocked row is near the top. */
export const requestOrder = ["r_maya", "r_ryan", "r_dev", "r_carlos", "r_ethan", "r_sophia", "r_nikhil", "r_chloe"];

export const requests: RequestListItemDTO[] = requestOrder.map((id) => {
  const d = requestDetails[id];
  return {
    id: d.id,
    candidate: d.candidate,
    jobTitle: d.jobTitle,
    roundType: d.roundType,
    durationMin: d.durationMin,
    status: d.status,
    blockedReason: d.blockedReason,
    booking: d.booking,
  };
});

/* ---------------------------------------------------------------------------
 * 5. Slots per request (what A's engine would return)
 * ------------------------------------------------------------------------ */

function slot(startIso: string, durationMin: number, rank: number, score: number, reasons: string[]) {
  return { start: startIso, end: plusMin(startIso, durationMin), score, rank, reasons };
}

export const slotsByRequest: Record<string, GenerateSlotsResult> = {
  r_maya: {
    slots: [
      slot(local(0, 15, 0, IST), 60, 1, 0.96, [
        "Maya Iyer available 3:00 PM IST",
        "Priya Sharma free 3:00 PM IST",
        "Within working hours in Asia/Kolkata",
        "15-min buffer respected",
      ]),
      slot(local(0, 16, 30, IST), 60, 2, 0.88, [
        "Maya Iyer available 4:30 PM IST",
        "Priya Sharma free 4:30 PM IST",
        "Within working hours in Asia/Kolkata",
        "15-min buffer respected",
      ]),
      slot(local(1, 10, 0, IST), 60, 3, 0.81, [
        "Maya Iyer available 10:00 AM IST",
        "Priya Sharma free 10:00 AM IST",
        "Within working hours in Asia/Kolkata",
        "15-min buffer respected",
      ]),
      slot(local(1, 11, 30, IST), 60, 4, 0.74, [
        "Maya Iyer available 11:30 AM IST",
        "Priya Sharma free 11:30 AM IST",
        "Ends 15 min before Priya Sharma's 1:00 PM lunch block",
      ]),
    ],
    rejections: [
      { participantId: "u_alex", participantName: "Alex Rivera", reason: "at daily cap 2/2 on Mon and Tue", count: 16 },
      { participantId: "u_rahul", participantName: "Rahul Verma", reason: "higher load (1/3) than the selected interviewer", count: 0 },
    ],
  },

  r_carlos: {
    slots: [
      slot(local(2, 12, 30, LA), 45, 1, 0.91, [
        "Carlos Mendes available 12:30 PM PDT",
        "Alex Rivera free 3:30 PM EDT",
        "Within working hours in both America/Los_Angeles and America/New_York",
        "15-min buffer after Alex Rivera's 1:1s respected",
      ]),
      slot(local(3, 9, 30, LA), 45, 2, 0.85, [
        "Carlos Mendes available 9:30 AM PDT",
        "Alex Rivera free 12:30 PM EDT",
        "Within working hours in both zones",
        "15-min buffer respected",
      ]),
      slot(local(3, 11, 0, LA), 45, 3, 0.78, [
        "Carlos Mendes available 11:00 AM PDT",
        "Alex Rivera free 2:00 PM EDT",
        "Within working hours in both zones",
      ]),
    ],
    rejections: [
      {
        participantId: "u_priya",
        participantName: "Priya Sharma",
        reason: "no working-hours overlap between Asia/Kolkata and America/Los_Angeles",
        count: 24,
      },
      {
        participantId: "u_rahul",
        participantName: "Rahul Verma",
        reason: "no working-hours overlap between Asia/Kolkata and America/Los_Angeles",
        count: 24,
      },
    ],
  },

  r_ethan: {
    slots: [
      slot(local(1, 11, 0, LDN), 30, 1, 0.93, [
        "Ethan Blake available 11:00 AM BST",
        "Jordan Lee free 11:00 AM BST",
        "Within working hours in Europe/London",
        "15-min buffer after the 9:00 AM TA sync respected",
      ]),
      slot(local(3, 15, 0, LDN), 30, 2, 0.72, [
        "Ethan Blake available 3:00 PM BST",
        "Jordan Lee free 3:00 PM BST",
        "Overlaps the tail of Thursday's hiring review window — ranked lower",
      ]),
    ],
    rejections: [],
  },

  /* Zero slots + rejections — this is the state the role doc calls out. */
  r_ryan: {
    slots: [],
    rejections: [
      {
        participantId: "u_rahul",
        participantName: "Rahul Verma",
        reason: "conflicts with existing event (incl. 15min buffer)",
        count: 12,
      },
      {
        participantId: "u_priya",
        participantName: "Priya Sharma",
        reason: "at daily cap 3/3 on Tue and Wed",
        count: 8,
      },
      {
        participantId: "u_alex",
        participantName: "Alex Rivera",
        reason: "outside working hours in America/New_York",
        count: 8,
      },
    ],
  },

  r_dev: { slots: [], rejections: [] },
  r_sophia: { slots: [], rejections: [] },
  r_chloe: { slots: [], rejections: [] },
  r_nikhil: { slots: [], rejections: [] },
};

/**
 * Slots that lose a race the first time you book them. Drives the
 * 409 SLOT_NO_LONGER_VALID path (docs/09 §5) without needing a second browser.
 */
export const contestedSlotStarts = new Set<string>([slotsByRequest.r_maya.slots[1].start]);

/* ---------------------------------------------------------------------------
 * 6. Interviewer console — assignments for whoever is signed in
 * ------------------------------------------------------------------------ */

export const assignmentsByUser: Record<string, AssignmentDTO[]> = {
  u_priya: [
    {
      assignmentId: "a_sophia_priya",
      requestId: "r_sophia",
      candidateName: "Sophia Reddy",
      jobTitle: "Backend Engineer",
      roundType: "TECHNICAL",
      status: "ACCEPTED",
      startUtc: requestDetails.r_sophia.booking!.startUtc,
      endUtc: requestDetails.r_sophia.booking!.endUtc,
      viewerTimezone: IST,
    },
    {
      assignmentId: "a_nikhil_priya",
      requestId: "r_nikhil",
      candidateName: "Nikhil Rao",
      jobTitle: "Backend Engineer",
      roundType: "TECHNICAL",
      status: "PENDING",
      startUtc: requestDetails.r_nikhil.booking!.startUtc,
      endUtc: requestDetails.r_nikhil.booking!.endUtc,
      viewerTimezone: IST,
    },
    {
      assignmentId: "a_maya_priya",
      requestId: "r_maya",
      candidateName: "Maya Iyer",
      jobTitle: "Sr Backend Engineer",
      roundType: "TECHNICAL",
      status: "PENDING",
      startUtc: null,
      endUtc: null,
      viewerTimezone: IST,
    },
  ],
  u_alex: [
    {
      assignmentId: "a_carlos_alex",
      requestId: "r_carlos",
      candidateName: "Carlos Mendes",
      jobTitle: "Platform Engineer",
      roundType: "TECHNICAL",
      status: "ACCEPTED",
      startUtc: null,
      endUtc: null,
      viewerTimezone: NY,
    },
  ],
  u_rahul: [
    {
      assignmentId: "a_ryan_rahul",
      requestId: "r_ryan",
      candidateName: "Ryan Cole",
      jobTitle: "Data Engineer",
      roundType: "TECHNICAL",
      status: "DECLINED",
      startUtc: null,
      endUtc: null,
      viewerTimezone: IST,
    },
  ],
  u_ananya: [
    {
      assignmentId: "a_ethan_ananya",
      requestId: "r_ethan",
      candidateName: "Ethan Blake",
      jobTitle: "Solutions Engineer",
      roundType: "SCREENING",
      status: "ACCEPTED",
      startUtc: null,
      endUtc: null,
      viewerTimezone: IST,
    },
    {
      assignmentId: "a_dev_ananya",
      requestId: "r_dev",
      candidateName: "Dev Menon",
      jobTitle: "Product Engineer",
      roundType: "SCREENING",
      status: "PENDING",
      startUtc: null,
      endUtc: null,
      viewerTimezone: IST,
    },
    {
      assignmentId: "a_chloe_ananya",
      requestId: "r_chloe",
      candidateName: "Chloe Fernandes",
      jobTitle: "Customer Success Manager",
      roundType: "HR",
      status: "ACCEPTED",
      startUtc: requestDetails.r_chloe.booking!.startUtc,
      endUtc: requestDetails.r_chloe.booking!.endUtc,
      viewerTimezone: IST,
    },
  ],

};

/**
 * Which RescheduleOutcome each assignment produces on DECLINE — one per branch
 * of logic doc §6A so all three banners are demonstrable from fixtures.
 */
export const declineOutcomes: Record<string, import("@/lib/contracts").RescheduleOutcome> = {
  // §6A-1 — a free replacement at the same time
  a_sophia_priya: {
    outcome: "REPLACED_SAME_TIME",
    message: "Rahul Verma took this over. The time hasn't changed.",
    newInterviewerName: "Rahul Verma",
  },
  // §6A-2 — no same-time replacement, new time from the candidate's own windows
  a_nikhil_priya: {
    outcome: "REBOOKED_NEW_TIME",
    message: "Moved to Fri 2:00 PM IST. The candidate has been notified.",
    newInterviewerName: "Rahul Verma",
    newStartUtc: local(4, 14, 0, IST),
    newEndUtc: local(4, 15, 0, IST),
  },
  // §6B — nothing worked
  a_ryan_rahul: {
    outcome: "RESCHEDULE_REQUIRED",
    message: "No replacement found — the recruiter has been notified.",
  },
};

export const defaultDeclineOutcome: import("@/lib/contracts").RescheduleOutcome = {
  outcome: "RESCHEDULE_REQUIRED",
  message: "No replacement found — the recruiter has been notified.",
};


/* ---------------------------------------------------------------------------
 * 6b. Interviewer calendars (docs/04 §2)
 *
 * The six busy schedules that create the clashes, plus whatever SIRA has
 * already booked for that person. In `PROVIDER_MODE=google` these same blocks
 * live on six secondary Google calendars under one master account; in mock
 * mode they are just rows. The UI reads whichever source you pick.
 * ------------------------------------------------------------------------ */

/** Google calendar id per interviewer (docs/04 §1). */
export const googleCalendarId: Record<string, string> = {
  u_vikram: "vikram_em@group.calendar.google.com",
  u_alex: "alex_tech@group.calendar.google.com",
  u_priya: "priya_tech@group.calendar.google.com",
  u_rahul: "rahul_tech@group.calendar.google.com",
  u_ananya: "ananya_hr@group.calendar.google.com",
};

let calSeq = 0;
function busy(day: number, from: [number, number], to: [number, number], tz: string, title: string): CalendarEventDTO {
  return {
    id: `cal_${++calSeq}`,
    title,
    startUtc: local(day, from[0], from[1], tz),
    endUtc: local(day, to[0], to[1], tz),
    kind: "BUSY",
  };
}

/** Mon–Fri recurrence, written once. */
function weekdays(from: [number, number], to: [number, number], tz: string, title: string): CalendarEventDTO[] {
  return [0, 1, 2, 3, 4].map((d) => busy(d, from, to, tz, title));
}

/**
 * The six seeded busy schedules. These never change — they're the fixed
 * obstacles the engine schedules around. Interview events are NOT in here:
 * those are derived from live booking state so the calendar stays correct
 * when something is booked, declined, moved or cancelled.
 */
export const seededBusy: Record<string, CalendarEventDTO[]> = {
  u_priya: [
    ...weekdays([12, 0], [13, 0], IST, "Lunch"),
    busy(1, [15, 0], [16, 0], IST, "Sprint planning"),
  ],
  u_rahul: [
    ...weekdays([12, 0], [13, 0], IST, "Lunch"),
    busy(4, [9, 30], [11, 0], IST, "Release review"),
    busy(1, [15, 0], [17, 30], IST, "Production incident"),
  ],
  u_alex: [
    busy(0, [13, 0], [17, 0], NY, "Architecture review"),
    busy(1, [13, 0], [17, 0], NY, "Architecture review"),
    busy(2, [9, 0], [12, 0], NY, "1:1s"),
  ],
  u_vikram: [
    ...weekdays([9, 0], [11, 0], IST, "Standups"),
    busy(2, [9, 0], [18, 0], IST, "Leadership offsite"),
  ],
  u_ananya: [
    busy(1, [15, 0], [17, 0], IST, "Policy review"),
    busy(3, [15, 0], [17, 0], IST, "Policy review"),
  ],
};

/**
 * Assemble one interviewer's calendar. `interviewEvents` comes from whatever
 * is booked *right now* — the caller derives it from live state, which is what
 * keeps the calendar honest after a booking, decline or cancellation.
 */
export function buildCalendar(
  userId: string,
  timezone: string,
  source: CalendarSource,
  interviewEvents: CalendarEventDTO[]
): CalendarDTO {
  const events = [...(seededBusy[userId] ?? []), ...interviewEvents].sort(
    (a, b) => Date.parse(a.startUtc) - Date.parse(b.startUtc)
  );

  if (source === "google") {
    const calendarId = googleCalendarId[userId];
    // PROVIDER_MODE=mock: the transport is simulated, the rows are the same.
    // When B ships PROVIDER_MODE=google this branch returns the live feed.
    return {
      source: "google",
      connected: Boolean(calendarId),
      accountLabel: calendarId ?? null,
      timezone,
      events: calendarId ? events : [],
    };
  }

  return { source: "mock", connected: true, accountLabel: "Seeded demo calendar", timezone, events };
}

/**
 * Fresh options after a reschedule. Seeded per request rather than computed —
 * the engine produces these for real; the fixture just needs believable data.
 * r_ryan is deliberately absent: an empty list is the whole point of S7.
 */
export const rescheduleSlotsByRequest: Record<string, GenerateSlotsResult> = {
  r_sophia: {
    slots: [
      slot(local(3, 16, 30, IST), 60, 1, 0.9, [
        "Sophia Reddy available 4:30 PM IST",
        "Panel free 4:30 PM IST",
        "Within working hours in Asia/Kolkata",
        "15-min buffer respected",
      ]),
      slot(local(4, 11, 0, IST), 60, 2, 0.83, [
        "Sophia Reddy available 11:00 AM IST",
        "Panel free 11:00 AM IST",
        "Ends 15 min before the 1:00 PM lunch block",
      ]),
    ],
    rejections: [],
  },
  r_chloe: {
    slots: [
      slot(local(2, 12, 30, IST), 30, 1, 0.88, [
        "Chloe Fernandes available 12:30 PM IST",
        "Ananya Patel free 12:30 PM IST",
        "Within working hours in Asia/Kolkata",
      ]),
      slot(local(2, 13, 30, IST), 30, 2, 0.79, [
        "Chloe Fernandes available 1:30 PM IST",
        "Ananya Patel free 1:30 PM IST",
      ]),
    ],
    rejections: [],
  },
  r_nikhil: {
    slots: [
      slot(local(4, 14, 0, IST), 60, 1, 0.92, [
        "Nikhil Rao available 2:00 PM IST",
        "Rahul Verma free 2:00 PM IST",
        "Clears Rahul Verma's 9:30–11:00 release review",
        "15-min buffer respected",
      ]),
      slot(local(4, 15, 30, IST), 60, 2, 0.84, [
        "Nikhil Rao available 3:30 PM IST",
        "Rahul Verma free 3:30 PM IST",
        "Within working hours in Asia/Kolkata",
      ]),
    ],
    rejections: [],
  },
};

/* ---------------------------------------------------------------------------
 * 7. Eligibility preview (#18 + #20) — what pickPanel() returns
 * ------------------------------------------------------------------------ */

type PoolMember = {
  id: string;
  name: string;
  labels: string[];
  skills: string[];
  load: number;
  dailyLimit: number;
  timezone: string;
};

const pool: PoolMember[] = [
  { id: "u_vikram", name: "Vikram Rao", labels: ["MANAGERIAL"], skills: ["System Design", "Culture"], load: 0, dailyLimit: 2, timezone: IST },
  { id: "u_alex", name: "Alex Rivera", labels: ["TECHNICAL", "MANAGERIAL"], skills: ["Java", "Backend", "Go"], load: 2, dailyLimit: 2, timezone: NY },
  { id: "u_priya", name: "Priya Sharma", labels: ["TECHNICAL"], skills: ["Java", "Backend", "React", "Full Stack"], load: 0, dailyLimit: 3, timezone: IST },
  { id: "u_rahul", name: "Rahul Verma", labels: ["TECHNICAL"], skills: ["Java", "Backend"], load: 1, dailyLimit: 3, timezone: IST },
  // Screening moved here when Jordan became an ADMIN — admins don't interview.
  { id: "u_ananya", name: "Ananya Patel", labels: ["HR", "SCREENING"], skills: ["Behavioral", "Policy", "Screening", "Sourcing"], load: 0, dailyLimit: 3, timezone: IST },
];

/**
 * A deliberately small stand-in for A's `pickPanel`: label -> skills -> daily
 * cap -> load, in that order, with the same reason strings the engine emits.
 * The real endpoint replaces this wholesale at integration.
 */
export function previewPanelFixture(input: {
  roundType: string;
  requiredSkills: string[];
  panelSize: number;
}): SelectionResult {
  const selected: SelectionResult["selected"] = [];
  const rejected: SelectionResult["rejected"] = [];

  const eligible: PoolMember[] = [];

  for (const p of pool) {
    if (!p.labels.includes(input.roundType)) {
      rejected.push({ id: p.id, name: p.name, reason: `no ${input.roundType} label` });
      continue;
    }
    const missing = input.requiredSkills.filter((s) => !p.skills.includes(s));
    if (missing.length) {
      rejected.push({ id: p.id, name: p.name, reason: `missing skill${missing.length > 1 ? "s" : ""} ${missing.join(", ")}` });
      continue;
    }
    if (p.load >= p.dailyLimit) {
      rejected.push({ id: p.id, name: p.name, reason: `at daily cap ${p.load}/${p.dailyLimit}` });
      continue;
    }
    eligible.push(p);
  }

  eligible.sort((a, b) => a.load - b.load || a.name.localeCompare(b.name));

  eligible.forEach((p, i) => {
    if (i < input.panelSize) {
      selected.push({ id: p.id, name: p.name, reason: `selected · load ${p.load}/${p.dailyLimit}` });
    } else {
      rejected.push({ id: p.id, name: p.name, reason: `higher load (${p.load}/${p.dailyLimit}) than the selected panel` });
    }
  });

  return { selected, rejected, insufficient: selected.length < input.panelSize };
}

export const SKILL_OPTIONS = [
  "Java",
  "Backend",
  "React",
  "Full Stack",
  "Go",
  "System Design",
  "Culture",
  "Screening",
  "Sourcing",
  "Behavioral",
  "Policy",
];

/* ---------------------------------------------------------------------------
 * 8. Seed summary — what "Reset demo data" reports back
 * ------------------------------------------------------------------------ */

export const seedSummary: SeedSummary = {
  ok: true,
  counts: {
    User: sessions.length,
    Candidate: Object.keys(candidates).length,
    InterviewRequest: requestOrder.length,
    PanelAssignment: requestOrder.reduce((n, id) => n + requestDetails[id].panel.length, 0),
    Booking: requestOrder.filter((id) => requestDetails[id].booking).length,
    Notification: requestOrder.reduce((n, id) => n + requestDetails[id].notifications.length, 0),
  },
  candidateLinks: requestOrder.map((id, i) => ({
    name: requestDetails[id].candidate.name,
    scenario: `S${i + 1}`,
    url: requestDetails[id].candidateLink,
  })),
  logins: demoLogins,
};

export const staffFixtures = {
  sessions,
  candidates,
  requests,
  requestDetails,
  slotsByRequest,
  assignmentsByUser,
  declineOutcomes,
  seedSummary,
};
