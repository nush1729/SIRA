# System Architecture — MVP

Optimised for **fastest to build, simplest to explain, easiest to demo**. Implements [01_LOGIC_FLOW.md](01_LOGIC_FLOW.md).

---

## 1. The whole system in one picture

```
┌─────────────────────────────────────────────────────────┐
│                  ONE Next.js 14 app                     │
│                                                         │
│  Pages (React + Tailwind)      API routes (/app/api/*)  │
│  ├─ staff UI (auth cookie)  →  ├─ auth                  │
│  └─ candidate UI (token)    →  ├─ requests              │
│                                ├─ slots                 │
│                                ├─ book / cancel         │
│                                ├─ reschedule            │
│                                ├─ interviewer accept    │
│                                └─ dev/seed              │
│                                       │                 │
│                    ┌──────────────────┴──────────────┐  │
│                    │        lib/  (plain TS)         │  │
│                    │  scheduler.ts   ← the engine    │  │
│                    │  selection.ts   ← #18 + #20     │  │
│                    │  auth.ts        ← JWT + RBAC    │  │
│                    │  adapters/calendar.ts           │  │
│                    │  adapters/mail.ts               │  │
│                    └──────────────────┬──────────────┘  │
└───────────────────────────────────────┼─────────────────┘
                                        │
                    ┌───────────────────┼────────────────────┐
                    ▼                   ▼                    ▼
             Prisma + SQLite     Google Calendar API    Gmail API
             (one file, no       (5 secondary cals)     (real emails)
              server needed)            ▲                    ▲
                                        └─ MOCK MODE ────────┘
                                   (PROVIDER_MODE=mock → DB-backed
                                    fake busy times, emails to console+DB.
                                    Demo works with zero Google setup.)
```

**That is the entire architecture.** No Redis, no queue, no microservices, no separate backend server. Everything a judge asks about can be traced in one repo.

---

## 2. Stack + why

| Choice | Why (hackathon reasoning) |
|---|---|
| **Next.js 14 (App Router) + TypeScript** | One app = one deploy, one `npm run dev`. API routes sit next to pages, no CORS, no second server to run. |
| **Tailwind CSS** | Fast, no CSS files to maintain, keeps the UI consistent (see [03_UI_PAGES.md](03_UI_PAGES.md)). |
| **Prisma + SQLite** | Zero setup — the DB is a file. `npx prisma migrate dev` and you're running. Swap `provider = "postgresql"` + one env var for Vercel/Neon deploy; no code change. |
| **JWT in an httpOnly cookie** (`jose` + `bcryptjs`) | Auth in ~60 lines. NextAuth adds config surface we don't need for 4 roles. |
| **Google Calendar API v3 + Gmail API v1** | Real integration for the demo — free tier, no billing account (Calendar ~1M req/day, Gmail 500 sends/day). |
| **Adapter interfaces for Calendar + Mail** | `PROVIDER_MODE=mock` runs the entire product with no Google credentials — the demo can never be broken by an OAuth hiccup, and CI/tests run offline. |
| **No Redis** | Double-booking is prevented by a DB unique index inside a transaction (§4). Redis would be a second service to install and explain for zero added safety at this scale. |

**What breaks first at scale:** SQLite's single-writer lock. Fix = flip Prisma to Postgres (one line + env var). Say exactly this if asked.

---

## 3. Folder layout

```
app/
  (staff)/
    login/page.tsx
    dashboard/page.tsx
    requests/new/page.tsx
    requests/[id]/page.tsx
    interviewer/page.tsx
  s/[token]/                     ← candidate, no auth
    page.tsx                     ← intro
    days/page.tsx
    times/page.tsx
    confirmed/page.tsx
    reschedule/page.tsx
  api/
    auth/login/route.ts
    auth/logout/route.ts
    requests/route.ts                    GET list, POST create
    requests/[id]/route.ts               GET detail
    requests/[id]/availability-request/route.ts   POST send link
    requests/[id]/slots/route.ts         GET ranked slots
    requests/[id]/book/route.ts          POST confirm
    requests/[id]/cancel/route.ts        POST
    requests/[id]/reschedule/route.ts    POST (recruiter-side)
    assignments/[id]/respond/route.ts    POST accept|decline
    public/[token]/route.ts              GET request info (candidate)
    public/[token]/availability/route.ts POST candidate windows
    public/[token]/slots/route.ts        GET refined slots
    public/[token]/book/route.ts         POST candidate confirm
    dev/seed/route.ts                    POST reset demo data
lib/
  db.ts            prisma client
  auth.ts          hash, sign, verify, requireRole()
  scheduler.ts     generateSlots, validateSlot, rankSlots   ← pure functions
  selection.ts     pickPanel (#18 eligibility, #20 balancing)
  reschedule.ts    interviewer-side + candidate-side flows (§6 of logic doc)
  notify.ts        renders + sends + records notifications
  adapters/
    calendar.ts    CalendarAdapter | GoogleCalendar | MockCalendar
    mail.ts        MailAdapter | GmailMailer | MockMailer
  tz.ts            luxon helpers: toLocal, withinWorkingHours, sameLocalDay
prisma/
  schema.prisma
  seed.ts          demo dataset (see 04_SEED_DATA.md)
```

`lib/scheduler.ts` and `lib/selection.ts` are **pure functions with no DB/network calls** — they take data in, return slots/panels out. That makes them unit-testable and is the thing to show during a code walkthrough.

---

## 4. Database — 9 tables, nothing more

```prisma
enum Role      { RECRUITER INTERVIEWER HIRING_MANAGER ADMIN }
enum RoundType { SCREENING TECHNICAL MANAGERIAL HR }
enum ReqStatus { DRAFT AWAITING_AVAILABILITY READY_TO_SCHEDULE SCHEDULED
                 RESCHEDULE_REQUIRED CANCELLED }
enum PanelStatus { PENDING ACCEPTED DECLINED REPLACED }
enum BookStatus  { CONFIRMED CANCELLED SUPERSEDED }

model User {                      // staff only — candidates are NOT users
  id           String @id @default(cuid())
  email        String @unique
  name         String
  passwordHash String
  role         Role
  timezone     String  @default("Asia/Kolkata")
  // interviewer-only fields:
  calendarId   String?            // Google secondary calendar id, or mock key
  labels       String  @default("")   // csv: "TECHNICAL,MANAGERIAL"
  skills       String  @default("")   // csv: "Java,Backend"
  dailyLimit   Int     @default(3)
  assignments  PanelAssignment[]
}

model Candidate {                 // no password, no login
  id       String @id @default(cuid())
  name     String
  email    String
  timezone String @default("America/New_York")
  requests InterviewRequest[]
}

model InterviewRequest {
  id             String    @id @default(cuid())
  candidateId    String
  jobTitle       String
  roundType      RoundType
  durationMin    Int
  requiredSkills String    @default("")    // csv
  panelSize      Int       @default(1)
  windowStart    DateTime                   // scheduling window (UTC)
  windowEnd      DateTime
  status         ReqStatus @default(DRAFT)
  token          String    @unique          // candidate secure link
  tokenExpiresAt DateTime
  blockedReason  String?                    // why RESCHEDULE_REQUIRED
  createdAt      DateTime  @default(now())

  candidate  Candidate            @relation(fields: [candidateId], references: [id])
  windows    AvailabilityWindow[]
  panel      PanelAssignment[]
  bookings   Booking[]
  notifications Notification[]
  events     EventLog[]
}

model AvailabilityWindow {        // candidate-submitted (#4)
  id        String   @id @default(cuid())
  requestId String
  startUtc  DateTime
  endUtc    DateTime
  request   InterviewRequest @relation(fields: [requestId], references: [id], onDelete: Cascade)
}

model PanelAssignment {
  id            String      @id @default(cuid())
  requestId     String
  interviewerId String
  status        PanelStatus @default(PENDING)
  reason        String?                       // why this person was picked (#18/#20 explainability)
  request     InterviewRequest @relation(fields: [requestId], references: [id], onDelete: Cascade)
  interviewer User             @relation(fields: [interviewerId], references: [id])
  @@unique([requestId, interviewerId])
}

model Booking {
  id         String     @id @default(cuid())
  requestId  String
  startUtc   DateTime
  endUtc     DateTime
  status     BookStatus @default(CONFIRMED)
  activeKey  String?    @unique   // = requestId while CONFIRMED, NULL otherwise → blocks double-booking
  eventId    String?               // external calendar event id
  meetLink   String?
  createdAt  DateTime   @default(now())
  request InterviewRequest @relation(fields: [requestId], references: [id], onDelete: Cascade)
}

model CalendarBusy {              // used ONLY by MockCalendar (seeded fake schedules)
  id         String   @id @default(cuid())
  calendarId String
  title      String
  startUtc   DateTime
  endUtc     DateTime
}

model Notification {              // every email we send is recorded so the UI can show it
  id        String   @id @default(cuid())
  requestId String
  toEmail   String
  template  String
  subject   String
  body      String
  status    String   @default("SENT")   // SENT | FAILED
  createdAt DateTime @default(now())
  request InterviewRequest @relation(fields: [requestId], references: [id], onDelete: Cascade)
}

model EventLog {                  // minimal audit trail
  id        String   @id @default(cuid())
  requestId String
  actor     String                 // user id, "candidate", or "system"
  action    String                 // "REQUEST_CREATED", "PANEL_SELECTED", "BOOKED", ...
  detail    String
  createdAt DateTime @default(now())
  request InterviewRequest @relation(fields: [requestId], references: [id], onDelete: Cascade)
}
```

Notes:
- CSV strings instead of join tables for skills/labels — SQLite-friendly and perfectly adequate for a 5-interviewer demo. Say so if asked; it's a deliberate simplification, not an oversight.
- `Booking.activeKey` is the **only** double-booking protection needed (see logic doc §7).
- No `Job`/`Skill`/`Organization` tables — single-org MVP.

---

## 5. Adapters

```ts
interface CalendarAdapter {
  getBusy(calendarId: string, from: Date, to: Date): Promise<{start: Date; end: Date}[]>;
  createEvent(i: EventInput): Promise<{ eventId: string; meetLink: string | null }>;
  updateEvent(eventId: string, i: Partial<EventInput>): Promise<void>;
  deleteEvent(eventId: string): Promise<void>;
}

interface MailAdapter {
  send(m: { to: string; subject: string; html: string }): Promise<{ ok: boolean }>;
}
```

| `PROVIDER_MODE` | Calendar | Mail |
|---|---|---|
| `mock` (default) | reads/writes `CalendarBusy` rows; fake Meet link `https://meet.google.com/mock-xxxx` | writes `Notification` row + console log |
| `google` | Google Calendar v3 (`freebusy.query`, `events.insert` with `conferenceDataVersion=1`) against 5 **secondary calendars** under ONE master account | Gmail `users.messages.send` from the master account, to plus-addressed aliases |

Both modes write the same `Notification`/`Booking` rows, so the UI is identical. Switch with one env var.

---

## 6. Environment variables

```bash
DATABASE_URL="file:./dev.db"
JWT_SECRET="<random 32+ chars>"
APP_URL="http://localhost:3000"

PROVIDER_MODE="mock"              # mock | google

# only needed when PROVIDER_MODE=google
GOOGLE_CLIENT_ID=""
GOOGLE_CLIENT_SECRET=""
GOOGLE_REFRESH_TOKEN=""           # one master account, obtained once
GOOGLE_SENDER_EMAIL="team@gmail.com"
```

No secrets committed. `.env.example` ships with `PROVIDER_MODE=mock` so a fresh clone runs immediately.

---

## 7. Setup + deploy

```bash
npm install
cp .env.example .env
npx prisma migrate dev --name init
npm run seed          # loads the demo dataset
npm run dev           # http://localhost:3000
```

Deploy (optional): Vercel + Neon Postgres — change `provider` to `postgresql`, set `DATABASE_URL`, redeploy. Nothing else changes.

---

## 8. Security (what we actually do)

- Passwords hashed with bcrypt; JWT in an httpOnly, sameSite cookie.
- **RBAC checked server-side in every protected route handler** via `requireRole()` — never by hiding UI buttons.
- Candidate token: random 32-byte, stored hashed-at-rest is overkill for MVP but the token is single-request-scoped and expiring; it can only read/write its own request.
- All request bodies validated with `zod` before touching the DB.
- No secrets in the repo; `.env` gitignored.
- ⚠️ **Known, deliberate exception:** `POST /api/dev/seed` is left **unauthenticated** for demo convenience. This is a security hole and is documented as such — it must be deleted or role-gated before any real deployment. It is not an oversight.
