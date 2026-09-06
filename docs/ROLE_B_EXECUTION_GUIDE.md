# Role B — Complete Step-by-Step Execution Guide & Model Strategy

**Owner:** Role B (Backend, Data & Integration Lead)  
**Branch:** `feat/backend` (or working on branch `rishik`)  
**Mission:** Build the complete data, authentication, adapter, seed, and API layer headlessly against frozen contracts, then lead the final team integration.

---

## Model Strategy Quick Reference

| Phase / Task | Recommended Model | Effort Level | Reasoning |
|---|---|---|---|
| **Hour Zero & App Scaffolding** | **Gemini 3.8 Flash** | Low | Fast package installation, setup commands, configuration boilerplate. |
| **Prisma Schema & Migrations** | **Gemini 3.1 Pro** | Medium | Strict alignment with contract enums, unique indices (`activeKey`), and relations. |
| **Auth & RBAC System** | **Gemini 3.1 Pro** | Medium | Secure password hashing, JWT in httpOnly cookie, strict route-guard helpers. |
| **Mock Adapters & Engine Stub** | **Gemini 3.8 Flash** | Medium | Straightforward in-memory/DB mocks and contract-compliant stubs. |
| **Seed Dataset (8 Scenarios)** | **Gemini 3.8 Flash** | Medium | Large volume of code; calculating dates relative to next Monday and populating 8 scenarios. |
| **Critical API: Booking & Concurrency** | **Gemini 3.1 Pro** *(or Claude Opus)* | High | Atomic Prisma transactions, re-validation rollback, and unique constraint race handling. |
| **Critical API: Reschedule Logic** | **Gemini 3.1 Pro** *(or Claude Opus)* | High | Multi-branch logic (§6A-1 same-time swap, §6A-2 new slot, §6B candidate refine/empty). |
| **Standard CRUD & Candidate APIs** | **Gemini 3.8 Flash** | Medium | Fast, high-throughput implementation of remaining contract routes. |
| **Headless Smoke Test (`api-smoke.sh`)** | **Gemini 3.8 Flash** | Medium | Shell script generation and end-to-end curl scenarios. |
| **Final Integration & Merge** | **Gemini 3.1 Pro** | High | Reconciling imports, removing engine stub, and debugging any contract boundary mismatches. |

---

## Detailed Step-by-Step Execution Order

### STEP 0: Hour Zero (Together with Teammates)
* **Time:** 0:00 – 0:45  
* **Model:** **Gemini 3.8 Flash (Low)**
1. **Initialize Project:**
   ```bash
   npx create-next-app@latest scheduler --typescript --tailwind --app --eslint
   cd scheduler
   npm i @prisma/client bcryptjs jose luxon zod googleapis
   npm i -D prisma vitest @types/bcryptjs @types/luxon tsx
   npx prisma init --datasource-provider sqlite
   ```
2. **Freeze Contracts:**
   - Copy `docs/contracts/contracts.ts` into `lib/contracts.ts`.
   - Announce to the team: **`lib/contracts.ts` is frozen.** Nobody edits it without group consent.
3. **Environment Setup:**
   - Create `.env.example` and `.env`:
     ```bash
     DATABASE_URL="file:./dev.db"
     JWT_SECRET="super-secret-jwt-key-32-characters-minimum"
     APP_URL="http://localhost:3000"
     PROVIDER_MODE="mock"
     USE_ENGINE_STUB="true"
     NEXT_PUBLIC_MOCK_API="false"
     ```
4. **Git Branching:**
   - Push initialized skeleton to `main`.
   - Branch off to `feat/backend` (or work on `rishik`).

---

### STEP 1: Prisma Schema & Initial Migration
* **Time:** 0:45 – 1:45  
* **Model:** **Gemini 3.1 Pro (Medium)**  
* **Files:** `prisma/schema.prisma`, `lib/db.ts`

1. **Implement `prisma/schema.prisma`** exactly as defined in `docs/02_SYSTEM_ARCHITECTURE.md` §4:
   - 5 Enums: `Role`, `RoundType`, `ReqStatus`, `PanelStatus`, `BookStatus`.
   - 9 Models:
     1. `User` (staff only, passwordHash, timezone, labels, skills, dailyLimit)
     2. `Candidate` (no login, timezone, email, name)
     3. `InterviewRequest` (token, roundType, windowStart, windowEnd, blockedReason)
     4. `AvailabilityWindow` (candidate submitted)
     5. `PanelAssignment` (requestId, interviewerId, status, reason)
     6. `Booking` (**CRITICAL:** `activeKey String? @unique` for concurrency locking)
     7. `CalendarBusy` (mock busy blocks)
     8. `Notification` (logged emails)
     9. `EventLog` (audit log helper)
2. **Generate Client & Migrate:**
   ```bash
   npx prisma migrate dev --name init
   ```
3. **Create Prisma Singleton (`lib/db.ts`):**
   - Standard Next.js PrismaClient global singleton to prevent connection leaks during HMR.

---

### STEP 2: Authentication, RBAC & Session Management
* **Time:** 1:45 – 3:00  
* **Model:** **Gemini 3.1 Pro (Medium)**  
* **Files:** `lib/auth.ts`, `app/api/auth/login/route.ts`, `app/api/auth/logout/route.ts`, `app/api/auth/me/route.ts`

1. **Build `lib/auth.ts`:**
   - Password hashing and verification using `bcryptjs`.
   - JWT creation and verification using `jose` (`HS256`, 7-day expiry).
   - Cookie management: set `token` in `httpOnly`, `sameSite=lax`, `secure` (in prod).
   - `getSession(req)`: decodes cookie into `SessionDTO`.
   - `requireRole(req, ...allowedRoles)`: throws or returns `401 Unauthorized` / `403 Forbidden` if user lacks role.
2. **Build Auth API Endpoints:**
   - `POST /api/auth/login`: validates email/password, issues cookie, returns `SessionDTO`.
   - `POST /api/auth/logout`: clears auth cookie.
   - `GET /api/auth/me`: returns current `SessionDTO` or 401.

---

### STEP 3: Engine Stub & Adapter Layer
* **Time:** 3:00 – 4:30  
* **Model:** **Gemini 3.8 Flash (Medium)**  
* **Files:** `lib/engine.ts`, `lib/engine-stub.ts`, `lib/adapters/calendar.ts`, `lib/adapters/mail.ts`, `lib/notify.ts`

1. **Build `lib/engine-stub.ts`:**
   - Implements the exact signatures of `generateSlots`, `validateSlot`, and `pickPanel`.
   - Returns fixed realistic slots (`10:00`, `14:00`, `16:00` UTC) and sample panel selections so the rest of the backend works without Person A.
2. **Build `lib/engine.ts` (Indirection Layer):**
   ```ts
   // Points to engine-stub while USE_ENGINE_STUB === "true"
   export * from process.env.USE_ENGINE_STUB === "true"
     ? "./engine-stub"
     : "./scheduler";
   ```
3. **Build Adapters (`lib/adapters/`):**
   - `CalendarAdapter` interface: `getBusy`, `createEvent`, `updateEvent`, `deleteEvent`.
   - `MockCalendar`: queries and writes to `CalendarBusy` table; returns `https://meet.google.com/mock-[id]`.
   - `MailAdapter` interface: `send`.
   - `MockMailer`: logs to console and writes a record to `Notification` table.
4. **Build Notification Service (`lib/notify.ts`):**
   - Helper function `sendNotification({ requestId, toEmail, template, subject, body })`.
   - Persists every outgoing email into `Notification` table so the UI can display it.

---

### STEP 4: Seed Dataset (8 Scenarios Relative to Next Monday)
* **Time:** 4:30 – 7:30  
* **Model:** **Gemini 3.8 Flash (Medium)**  
* **Files:** `prisma/seed.ts`, `app/api/dev/seed/route.ts`

1. **Calculate Next Monday:**
   ```ts
   // Always seed relative to the upcoming Monday 00:00 UTC
   const now = new Date();
   const daysUntilMonday = ((1 + 7 - now.getUTCDay()) % 7) || 7;
   const MONDAY = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + daysUntilMonday));
   ```
2. **Seed 7 Staff Users (password: `demo1234`):**
   - Jordan Lee (`RECRUITER`, `SCREENING`, Europe/London)
   - Vikram Rao (`HIRING_MANAGER`, `MANAGERIAL`, Asia/Kolkata)
   - Alex Rivera (`INTERVIEWER`, `TECHNICAL,MANAGERIAL`, America/New_York, limit 2)
   - Priya Sharma (`INTERVIEWER`, `TECHNICAL`, Asia/Kolkata, limit 3)
   - Rahul Verma (`INTERVIEWER`, `TECHNICAL`, Asia/Kolkata, limit 3)
   - Ananya Patel (`INTERVIEWER`, `HR`, Asia/Kolkata, limit 3)
   - Admin (`ADMIN`, Asia/Kolkata)
3. **Seed Calendar Busy Blocks (`CalendarBusy`):**
   - Priya lunch + Tue planning.
   - Rahul lunch + Fri release review.
   - Alex Mon/Tue arch review + Wed 1:1s.
   - Alex Mon/Tue existing bookings (load 2/2 cap).
   - Rahul Mon existing booking (load 1/3).
4. **Seed the 8 Candidate Scenarios (S1 to S8):**
   - **S1 (Dev Menon)**: `AWAITING_AVAILABILITY`, live token link.
   - **S2 (Maya Iyer)**: `READY_TO_SCHEDULE`, Mon–Tue window (Alex capped, Priya chosen).
   - **S3 (Carlos Mendes)**: `READY_TO_SCHEDULE`, LA timezone (zero Kolkata overlap).
   - **S4 (Sophia Reddy)**: `SCHEDULED` Thu 15:00 IST (Priya declines -> Rahul swaps).
   - **S5 (Ethan Blake)**: `READY_TO_SCHEDULE`, tight window (visible ranking).
   - **S6 (Chloe Fernandes)**: `SCHEDULED` Wed 11:00 IST (Cancellation demo).
   - **S7 (Ryan Cole)**: `SCHEDULED`, conflict seeded -> reschedule fails -> `RESCHEDULE_REQUIRED`.
   - **S8 (Nikhil Rao)**: `SCHEDULED` Fri 10:00 IST -> Priya declines -> auto-rebooked Fri 14:00 IST.
5. **Implement `POST /api/dev/seed`:**
   - Executes the seed logic and returns `SeedSummary` with URLs for all candidate scenarios.

---

### STEP 5: Core Recruiter & Staff API Routes
* **Time:** 7:30 – 11:30  
* **Model:** **Gemini 3.1 Pro (Medium for general, High for booking & reschedule)**  
* **Files:** `app/api/requests/**`, `app/api/assignments/**`

1. **`GET /api/requests` & `POST /api/requests`:**
   - Role check: `requireRole(req, "RECRUITER", "HIRING_MANAGER", "ADMIN")`.
   - Filters by query `?status=&q=`.
   - Create request validates with `zod`, runs `pickPanel`, and creates `InterviewRequest` + `PanelAssignment` with reasons.
2. **`POST /api/requests/preview-panel`:**
   - Runs `pickPanel` on candidate pool and returns `SelectionResult` (for the live UI card).
3. **`GET /api/requests/:id` & `POST /api/requests/:id/availability-request`:**
   - Generates candidate token, flips status to `AWAITING_AVAILABILITY`, sends email.
4. **`GET /api/requests/:id/slots`:**
   - Fetches candidate windows and panel busy times, invokes `generateSlots()`.
5. **`POST /api/requests/:id/book` (CRITICAL TRANSACTION):**
   ```ts
   // BEGIN TRANSACTION
   // 1. Reload request and validate slot via engine
   // 2. If invalid: rollback, return 409 SLOT_NO_LONGER_VALID
   // 3. Mark existing CONFIRMED booking as SUPERSEDED
   // 4. INSERT Booking with activeKey: requestId (unique index protects race condition)
   // 5. Update request status to SCHEDULED
   // COMMIT
   // Outside TX: create calendar event + notify participants
   ```
6. **`POST /api/assignments/:id/respond` & `POST /api/requests/:id/reschedule`:**
   - Handles `ACCEPT` or `DECLINE`.
   - Implements the 3 outcomes (`RescheduleOutcome`):
     - **Branch 1:** Same-time replacement found (`REPLACED_SAME_TIME`).
     - **Branch 2:** New slot found from existing windows (`REBOOKED_NEW_TIME`).
     - **Branch 3:** No slots found -> status `RESCHEDULE_REQUIRED`, set `blockedReason`, notify candidate.
7. **`POST /api/requests/:id/cancel`:**
   - Cancels booking, deletes calendar event, flips status to `CANCELLED`, notifies all.

---

### STEP 6: Public Candidate API Routes
* **Time:** 11:30 – 13:00  
* **Model:** **Gemini 3.8 Flash (Medium)**  
* **Files:** `app/api/public/[token]/**`

1. **Token Authentication Helper:**
   - Look up `InterviewRequest` by `token`.
   - If not found or expired (`tokenExpiresAt < now`): return `401 INVALID_TOKEN` or `TOKEN_EXPIRED`.
2. **`GET /api/public/:token`:**
   - Returns sanitized `PublicRequestDTO` (no internal staff IDs or notes leaked).
3. **`POST /api/public/:token/availability`:**
   - Saves candidate submitted windows in `AvailabilityWindow`, flips status to `READY_TO_SCHEDULE`.
4. **`GET /api/public/:token/slots`:**
   - Generates ranked slots based on submitted windows.
5. **`POST /api/public/:token/book`:**
   - Candidate booking entry point (delegates to the booking transaction logic).
6. **`GET /api/public/:token/reschedule-slots`:**
   - Refines candidate's earlier windows against current interviewer calendars.
   - If empty: automatically sets request to `RESCHEDULE_REQUIRED`, sends notification, returns empty list.

---

### STEP 7: Standalone Verification & Headless Smoke Testing
* **Time:** 13:00 – 14:30  
* **Model:** **Gemini 3.8 Flash (Medium)**  
* **Files:** `scripts/api-smoke.sh`

1. **Write `scripts/api-smoke.sh`:**
   - Run seed reset.
   - Authenticate as Recruiter, verify cookie.
   - Test RBAC: Alex (Interviewer) accessing `/api/requests` returns `403`.
   - Preview panel: Verify Alex capped reason, Priya selected.
   - Book Maya (S2) slot: Verify 200 + Meet link.
   - Concurrency test: Two parallel curl requests to book the same slot -> exactly one 200, one 409.
   - Candidate public endpoints with valid token and invalid token.
   - Interviewer decline flows for Sophia (S4) and Nikhil (S8).
   - Candidate reschedule failure for Ryan (S7).
2. **Execute and Validate:**
   ```bash
   bash scripts/api-smoke.sh
   ```
   **Definition of Done:** 100% green output with `USE_ENGINE_STUB=true`.

---

### STEP 8: Final Integration & Merge (You are the Lead Integrator)
* **Time:** 15:00 – 19:00  
* **Model:** **Gemini 3.1 Pro (High)**  
* **Location:** Your laptop, all 4 teammates present.

1. **Verify Entry Gates:**
   - Person A: `npm test` green on engine unit tests.
   - Person B (You): `api-smoke.sh` 100% green on your branch.
   - Person C: Staff UI works on fixtures with `NEXT_PUBLIC_MOCK_API=true`.
   - Person D: Candidate flow works at 375px mobile view.
2. **Merge in Exact Order (Run `npm run build` after each):**
   ```bash
   git checkout main
   git merge --no-ff feat/candidate-ui && npm run build
   git merge --no-ff feat/staff-ui     && npm run build
   git merge --no-ff feat/backend      && npm run build
   git merge --no-ff feat/engine       && npm run build
   ```
3. **Wire Real Engine:**
   - Remove `lib/engine-stub.ts`.
   - In `lib/engine.ts`, export real functions from A's files:
     ```ts
     export { generateSlots, validateSlot } from "./scheduler";
     export { pickPanel } from "./selection";
     export { findSameTimeReplacement, refineWindows } from "./reschedule-core";
     ```
   - In `.env.local`: set `USE_ENGINE_STUB=false` and `NEXT_PUBLIC_MOCK_API=false`.
4. **Run Live Database Reset & Smoke Test:**
   ```bash
   rm -f prisma/dev.db
   npx prisma migrate dev --name init
   npm run seed
   bash scripts/api-smoke.sh
   ```
5. **Team Walkthrough:**
   - Execute the 14-step integration smoke test from `docs/11_INTEGRATION.md` §3 in the browser!

---

## What NOT To Do as Role B

- ❌ **Do NOT edit `lib/contracts.ts` unilaterally.** C and D rely on every single field name.
- ❌ **Do NOT write your own slot generation logic.** Always delegate to `engine.generateSlots()` or the stub.
- ❌ **Do NOT rely on client-side button hiding for security.** Always call `requireRole()` in route handlers.
- ❌ **Do NOT let an email failure roll back a database booking.** Calendar and email dispatches happen *outside* the booking transaction.
