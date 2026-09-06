# Smart Interview Scheduler — UI/UX Page Inventory & Design Spec

**Document type:** Frontend design reference (sitemap, page-by-page spec, navigation, motion, API bindings)
**Companion to:** `smart-interview-scheduler-architecture.md` (system architecture, API contract, data model)
**Design direction (per master prompt):** Editorial SaaS + premium recruiting platform + intelligent scheduling system. Not a generic AI dashboard. AI is invisible/enabling, never the visual identity.

---

## Table of Contents

1. [Full Sitemap](#1-full-sitemap)
2. [Global Design System Primitives](#2-global-design-system-primitives)
3. [Global Navigation Shell](#3-global-navigation-shell)
4. [Public Pages](#4-public-pages)
5. [Auth Pages](#5-auth-pages)
6. [Onboarding](#6-onboarding)
7. [Recruiter Pages](#7-recruiter-pages)
8. [Candidate Portal Pages](#8-candidate-portal-pages)
9. [Interviewer Portal Pages](#9-interviewer-portal-pages)
10. [Hiring Manager Pages](#10-hiring-manager-pages)
11. [Admin Pages](#11-admin-pages)
12. [Shared Pages](#12-shared-pages)
13. [Global Component Library](#13-global-component-library)
14. [Page → API Map (quick reference)](#14-page--api-map-quick-reference)

---

## 1. Full Sitemap

```
PUBLIC (unauthenticated)
├── /                          Landing page
├── /login                     Sign in
├── /signup                    Sign up
├── /forgot-password           Request reset
├── /reset-password/:token     Set new password
├── /auth/callback              OAuth redirect handler (no visible UI, spinner + redirect)
├── /book/:linkToken            Public candidate booking link (magic-link entry, no full account required)
└── /404, /500                 Error pages

AUTHENTICATED — shared app shell (role-aware sidebar/navbar)
├── /onboarding                 First-login role/profile setup
├── /dashboard                   Role-aware landing after login
├── /notifications                Notification center (full page)
├── /settings                     Profile, password, connected calendar, notification prefs
│
├── RECRUITER
│   ├── /interviews                Pipeline / list view
│   ├── /interviews/new             Create Interview Request (multi-step)
│   ├── /interviews/:id             Interview detail (tabbed)
│   ├── /interviews/:id/reschedule  Reschedule flow (drawer, routable for deep-link)
│   ├── /interviews/:id/loop/new     Loop Builder — bundle ≥2 rounds into one atomic same-day schedule
│   └── /loops/:loopId                Loop detail (itinerary, recommendations, confirm) — see §7.7
│
├── CANDIDATE PORTAL
│   ├── /portal                      My interviews list
│   ├── /portal/interviews/:id            Interview detail (candidate view)
│   ├── /portal/interviews/:id/availability   Submit availability
│   ├── /portal/interviews/:id/book            Slot selection & confirm
│   └── /portal/loops/:loopId                   Loop itinerary view (candidate) — see §8.5
│
├── INTERVIEWER PORTAL
│   ├── /interviewer                    Upcoming + pending invitations
│   ├── /interviewer/availability        Working hours & availability settings
│   ├── /interviewer/interviews/:id       Invitation detail / accept-decline
│   └── /interviewer/workload             Workload view
│
├── HIRING MANAGER
│   ├── /manager/pipeline                Pipeline overview (read-heavy)
│   └── /manager/workload                Interviewer workload across panel
│
├── ADMIN
│   ├── /admin/users                     Users & role management
│   ├── /admin/skills                     Interviewer skills taxonomy
│   ├── /admin/policy                     Working hours, buffer, scheduling rules
│   ├── /admin/integrations               Provider connections (Calendar/Meet/Email/SMS)
│   └── /admin/audit                      Audit log explorer
│
└── SHARED
    └── /analytics                        Scheduling analytics (Recruiter/HM/Admin, scoped by role)
```

**Route-guarding rule:** every authenticated route is wrapped by a role check resolved from the server-issued JWT claims (never a client-only guard) — a Candidate hitting `/admin/users` gets a 403 page, not a hidden-but-loaded admin UI.

---

## 2. Global Design System Primitives

| Token category | Values (starting point — refine visually, keep semantics) |
|---|---|
| Typography | One display/serif-adjacent headline face for hero/marketing moments (editorial feel) + one clean grotesk for UI/body (e.g., Inter or similar) — never more than 2 families |
| Color roles | `surface`, `surface-raised`, `border`, `text-primary`, `text-secondary`, `accent` (single brand accent, not a gradient soup), `success`, `warning`, `danger`, `info` — each with light/dark pair |
| Status colors (scheduling-specific) | `pending` (amber), `awaiting-response` (blue), `confirmed` (green), `conflict` (red), `rescheduled` (violet), `cancelled` (gray) — used consistently as badges everywhere |
| Spacing scale | 4/8/12/16/24/32/48/64px |
| Radius | Small (buttons/inputs) + medium (cards) only — avoid the "everything is a huge rounded blob" look the brief warns against |
| Elevation | Two levels max: flat surface, and one subtle raised-card shadow. No huge glows. |
| Motion durations | Micro (120–150ms) for hover/press, standard (200–250ms) for panel/modal transitions, emphasis (350–400ms) for page-level/hero moments — never longer |
| Breakpoints | mobile <640px, tablet 640–1024px, desktop >1024px |

---

## 3. Global Navigation Shell

### 3.1 Top navbar (all authenticated app pages)
- **Left:** Product mark (wordmark, not a big logo lockup) + current organization name (switchable if user belongs to >1 org — P2)
- **Center-left:** Primary nav items, role-filtered (see per-role sections below) — active item gets an underline/indicator with a short slide-in transition, not a hard color swap
- **Right, in order:**
  1. Global search (Cmd/Ctrl+K) — searches interviews/candidates by name (Recruiter/HM/Admin only)
  2. Notification bell — badge count, opens a dropdown preview (last 5) with "View all" → `/notifications`
  3. Help icon (optional, links to docs/support)
  4. User avatar menu → Profile, Settings, Switch role view (if multi-role), Sign out

### 3.2 Left sidebar (desktop ≥1024px) / collapses to bottom tab bar or hamburger drawer (mobile/tablet)
Role-specific item sets — see each role section. Icons from a single consistent icon set (Lucide), never mixed styles.

### 3.3 Candidate/Interviewer simplified shell
Candidates and Interviewers get a **lighter shell**: no sidebar, just a slim top bar (logo + avatar menu + notification bell) — their task set is narrow (view/act on their own interviews), so a dense sidebar would be clutter, not utility. This directly serves the brief's "candidate UX should be extremely simple" requirement.

### 3.4 Navbar micro-interactions
- Notification bell: badge pulses once (subtle scale, not infinite loop) when a new notification arrives via websocket/poll
- Active nav item: 150ms underline slide on route change
- Avatar menu: fade+scale-in dropdown, closes on outside click or Escape
- Mobile drawer: slide-in from left with backdrop fade, focus-trapped for accessibility

---

## 4. Public Pages

### 4.1 Landing Page — `/`

**Purpose:** Communicate the product in one scroll, without requiring a paragraph read, per the master prompt's hero direction.

**Sections (in order):**

1. **Hero**
   - Headline: *"Schedule interviews without the scheduling chaos."*
   - Subhead: one sentence on coordinating candidates, interviewers, calendars, time zones, rescheduling
   - Primary CTA button: **Start Scheduling** → `/signup`
   - Secondary CTA (ghost/outline button): **See How It Works** → smooth-scrolls to §2
   - Visual composition (not a static gradient): an animated mini-scheduling scene — candidate availability blocks and interviewer availability blocks visually merging into one highlighted "recommended slot" card, connection lines drawing between avatar chips and a calendar grid, on a subtle moving-grid background. Respects `prefers-reduced-motion` (falls back to a static composed illustration).

2. **How It Works** (3–4 step horizontal/vertical timeline)
   - Step cards: "Recruiter creates a request" → "Candidate shares availability" → "Engine finds the best slot" → "Everyone's calendar updates automatically" — each icon-led, each animates in on scroll (staggered fade+slide, once, not looping)

3. **Scheduling Intelligence** (differentiation section)
   - Explainable Scheduling preview card: a mock "Recommended slot" card showing the checklist UI (✓ candidate available, ✓ panel available, ✓ buffer maintained...) — this is the single most important visual proof of the product's USP
   - Conflict Recovery preview: a small "before/after" pair — "No slots available" (crossed out) → "Bottleneck: Interviewer B unavailable Tue. Try Wednesday or Interviewer C." 

4. **Built for every role** (3–4 column persona cards: Candidate / Recruiter / Interviewer / Hiring Manager) — one line of value per persona, small icon-illustration, no stock photos of people

5. **Time-zone awareness** — a simple visual: same event shown as "7:30 PM IST" / "9:00 AM PST" side by side

6. **Security & trust** — short row of trust markers: RBAC, encrypted tokens, audit history, "your data stays yours" — no fake certification badges

7. **Final CTA band** — headline repeat + **Start Scheduling** button, full-width accent-colored band

8. **Footer** — product links, "How AI is used" link (transparency, per hackathon AI-disclosure requirement), contact/GitHub link

**Buttons/CTAs on this page:**
| Element | Action |
|---|---|
| Start Scheduling (hero) | → `/signup` |
| See How It Works | Smooth scroll to §2 |
| Start Scheduling (footer band) | → `/signup` |
| Nav "Sign In" (top-right, always visible) | → `/login` |

**Animations:** scroll-triggered staggered fade/slide for section entrances (once per section, not on every scroll pass), hero composition has slow ambient motion (connection lines drawing, ~4–6s loop, GPU-cheap CSS/SVG animation, not WebGL), buttons have a 120ms press-scale.

**APIs required:** none (fully static/marketing) — except the CTA buttons routing into the app.

---

## 5. Auth Pages

### 5.1 Sign Up — `/signup`

**Layout:** centered card (max ~420px) on a subtle branded background (reuse a quieter version of the landing hero motif, not empty white).

**Fields:**
- Full name
- Work email
- Password (with strength indicator, inline validation)
- Confirm password
- Organization name (only if this is the first user for a new org) OR "Join existing organization" via invite-link flow (P1)
- Checkbox: Terms/Privacy acceptance (required to submit)

**Buttons:**
- **Create Account** (primary, full-width) — disabled until required fields valid; shows inline spinner on submit
- **Continue with Google** (secondary, OAuth) — icon + label, full-width, sits above or below the divider ("or sign up with email")
- Link: "Already have an account? **Sign in**" → `/login`

**States:** field-level validation errors appear inline on blur (not just on submit); submit button shows a loading spinner and disables to prevent double-submit (explicit rapid-click edge case); server error (e.g., email already exists) shown as a dismissible inline banner above the form, not a toast that disappears before it's read.

**Post-submit:** redirect to `/onboarding` (role assignment / profile completion) rather than straight to dashboard.

**APIs:** `POST /auth/signup`, `GET /auth/oauth/google` (redirect), `GET /auth/oauth/google/callback`.

---

### 5.2 Sign In — `/login`

**Layout:** same centered-card pattern as Sign Up for visual consistency.

**Fields:** Email, Password.

**Buttons:**
- **Sign In** (primary, full-width)
- **Continue with Google** (secondary, OAuth)
- Link: "Forgot password?" → `/forgot-password`
- Link: "Don't have an account? **Sign up**" → `/signup`

**States:** invalid credentials → inline banner ("Incorrect email or password") — never reveal whether the email exists (security: prevents user enumeration); rate-limited after repeated failures with a clear "too many attempts, try again in Xm" message; loading spinner on submit.

**APIs:** `POST /auth/login`, `GET /auth/oauth/google`.

---

### 5.3 Forgot Password — `/forgot-password`
Single email field, **Send Reset Link** button, success state ("If an account exists for that email, a reset link has been sent" — deliberately non-revealing). Link back to `/login`.

**APIs:** `POST /auth/forgot-password` *(add to contract as a companion to reset — see note below)*.

### 5.4 Reset Password — `/reset-password/:token`
New password + confirm fields, **Reset Password** button, expired/invalid token → clear error state with a "Request a new link" CTA back to `/forgot-password`.

**APIs:** `POST /auth/reset-password` *(companion endpoint to add alongside `/auth/refresh` in the contract)*.

### 5.5 OAuth Callback — `/auth/callback`
No real UI — a centered spinner + "Signing you in…" — resolves the OAuth code, sets session, redirects to `/onboarding` (new user) or `/dashboard` (returning user). Error state (denied consent, provider error) shows a friendly message with a **Back to Sign In** button.

---

## 6. Onboarding — `/onboarding`

**Purpose:** completes the profile and, for a first-org-user, sets initial org policy defaults — avoids dumping a blank dashboard on a brand-new user.

**Steps (progress indicator at top, 2–3 steps max):**
1. **Confirm role** — Recruiter / Interviewer / Hiring Manager (Admin is granted, not self-selected, for the first org creator by default) — role determines which shell/nav they land in
2. **Profile basics** — time zone (auto-detected, editable), and if Interviewer role: skills multi-select, working hours
3. **Connect calendar (optional, skippable)** — "Connect Google Calendar" button with a clear **Skip for now** secondary option (never force a third-party OAuth before the user has seen value)

**Buttons:** **Continue** per step, **Back**, final step is **Go to Dashboard**.

**APIs:** `PATCH /users/:id`, `PUT /users/:id/skills`, `PUT /users/:id/availability`, `POST /calendar/connect`.

---

## 7. Recruiter Pages

### 7.1 Recruiter sidebar items
Dashboard · Interviews · Analytics · Settings (Admin items appear too if the user also holds Admin role).

### 7.2 Recruiter Dashboard — `/dashboard`

**Purpose:** answer "what needs my attention, what's happening, what's going wrong, what's the system accomplishing" in one glance (per brief §27).

**Layout — 4 zones:**
1. **Needs Attention** row of alert cards: "4 awaiting candidate availability," "2 scheduling conflicts," "3 awaiting interviewer response" — each card clickable, filters the Interviews list
2. **Today / Upcoming** — compact list of next interviews with countdown chips
3. **Recently Scheduled** feed — small activity list (booked, rescheduled, declined) with relative timestamps
4. **At-a-glance metrics** strip — avg time-to-schedule, conflict rate, reschedule rate (small stat tiles, real numbers from `/analytics/scheduling`, honest empty state if no data yet — never fabricated)

**Buttons:** **+ New Interview Request** (primary, top-right, always visible) → `/interviews/new`.

**Empty state:** if organization has zero interviews yet, replace all 4 zones with a single friendly "Create your first interview request" prompt + illustration + the same **+ New Interview Request** button.

**APIs:** `GET /interviews?status=...`, `GET /analytics/scheduling`, `GET /analytics/conflicts`, `GET /notifications` (recent feed subset).

---

### 7.3 Interview Pipeline / List — `/interviews`

**Layout:** table/board toggle.
- **Table view:** columns — Candidate, Role, Round, Status badge, Panel avatars (stacked), Scheduled time (local to viewer), Actions (⋮ menu: View / Reschedule / Cancel)
- **Board (kanban) view:** columns = pipeline status (Pending → Awaiting Response → Confirmed → Reschedule Requested → Completed / Cancelled) — cards draggable is P3/nice-to-have, not required; clicking a card is sufficient for MVP

**Tabs/filters:** status filter chips (All / Pending / Conflicts / Confirmed / Completed / Cancelled), search box, date-range filter, job/role filter.

**Buttons:** **+ New Interview Request** (top-right), row-level **⋮** menu.

**States:** loading skeleton rows, empty state per filter ("No interviews match these filters" + **Clear filters** button), error state with **Retry** button on fetch failure.

**APIs:** `GET /interviews` (with query params for filters/pagination).

---

### 7.4 Create Interview Request — `/interviews/new`

**Layout:** multi-step form (stepper at top), not one giant form — reduces cognitive load and lets validation be step-scoped.

**Step 1 — Candidate & Role**
- Candidate select/search (or "+ Add new candidate" inline)
- Job/role select
- Interview round type: Screening / Technical / Managerial / HR (chips)

**Step 2 — Round Details**
- Duration (preset chips: 30/45/60/90 min + custom)
- Date range (from/to date pickers)
- Buffer time (org default pre-filled, editable if policy allows — chips: 5/10/15/30 min)
- Time-zone preference display (candidate's detected zone, editable)
- Meeting preference (Google Meet auto / in-person / TBD)

**Step 3 — Panel Selection**
- Required interviewers: search + multi-select, each result shows skill tags + current workload indicator (small badge, e.g., "3 this week") — this is where **Intelligent Interviewer Selection** surfaces visually: a **Suggest Interviewers** button that calls the matching service and pre-populates qualified, load-balanced candidates, which the recruiter can accept or override
- Optional: Hiring Manager attendee toggle

**Step 4 — Review & Send**
- Summary card of everything above
- **Send to Candidate** button (primary) — triggers request creation + candidate availability-request notification
- **Save as Draft** (secondary) — P2, only if time permits; otherwise omit rather than fake it
- **+ Add Another Round** (secondary, returns to Step 1 pre-filled with the same candidate/job) — once a request has ≥2 rounds, a **Bundle into a Same-Day Loop** button appears here and on the Interview Detail page, launching the Loop Builder (§7.7) instead of scheduling each round independently

**Buttons:** **Back**, **Next**, **Suggest Interviewers** (step 3), **Send to Candidate** (final step, disabled + spinner while submitting, single-click guarded), **Add Another Round**, **Bundle into a Same-Day Loop** (conditional).

**Animations:** step transitions slide horizontally (200ms), field validation errors shake subtly once (not repeatedly) and show inline red text.

**APIs:** `GET /users?role=candidate` (candidate search — add as companion listing endpoint), `GET /jobs` (companion listing endpoint, org-scoped), `POST /interviews`, `POST /interviews/:id/rounds`, matching-service lookup (`GET /interviewers/suggest?round_id=` — companion endpoint alongside Interviewer Matching Service).

---

### 7.5 Interview Detail — `/interviews/:id`

**Layout:** header (candidate name, role, round type, status badge, scheduled time-if-any) + **tabs**:

**Tab: Overview**
- Round details summary, panel list with avatars + accept/decline status per interviewer, meeting link (once booked, with **Copy Link** button + copied-feedback micro-interaction)
- If this round is bundled into a loop: a **"Part of a 4-round loop" badge** linking to `/loops/:loopId` instead of standalone scheduling actions for this round
- Action buttons contextual to status: **Generate Slots** (if availability collected but slots not yet generated), **Reschedule**, **Cancel Interview**

**Tab: Availability**
- Candidate's submitted windows (calendar/grid visualization) + panel's aggregated busy/free — this is the multi-participant overlap view called out in the brief (§26 Calendar UX)
- If candidate hasn't submitted yet: **Resend Availability Request** button + "waiting since [date]" indicator

**Tab: Recommendations** *(the Explainable Scheduling surface)*
- Ranked slot cards, top slot visually emphasized ("Recommended"), each card expandable to show the constraint checklist (✓ candidate available / ✓ panel available / ✓ within working hours / ✓ buffer maintained / ✓ candidate's preferred window / ✓ lowest workload impact)
- **Book This Slot** button per card (primary on the top recommendation, secondary on alternates)
- If the org has **Zero-Click Auto-Confirm** enabled for this round type and the top slot cleared the score-gap threshold, this tab shows the booking already **Confirmed** (skipping the manual list entirely) with a small **"Auto-confirmed"** badge next to the status — clicking the badge expands the same constraint checklist plus the score-gap number that triggered it, so a recruiter can always see *why* no click was needed, never a silent action
- If zero valid slots: **Conflict Recovery** panel instead — plain-language bottleneck explanation + 2–3 suggested relaxations, each with its own action button ("Use Interviewer C instead," "Extend date range")

**Tab: Communication**
- Log of notifications sent (invite/confirm/reminder) with delivery status badges (sent/failed) — supports debugging without being a full inbox

**Tab: Audit History**
- Immutable timeline: request created → availability submitted → slots generated → slot booked → [any reschedule/decline events] — timestamped, actor-attributed

**Buttons summary for this page:** Generate Slots, Book This Slot (per recommendation), Resend Availability Request, Reschedule, Cancel Interview, Copy Meeting Link, per-conflict-suggestion action buttons.

**Animations:** recommended slot card has a subtle highlight/glow-on-mount (once, not looping) to draw the eye; booking a slot triggers a confirmation micro-animation (checkmark draw-in) before the page transitions to "Confirmed" state; tab switches fade content (150ms), no full reload.

**APIs:** `GET /interviews/:id`, `GET /rounds/:roundId/availability`, `POST /rounds/:roundId/slots/generate`, `GET /rounds/:roundId/slots`, `POST /rounds/:roundId/slots/:slotId/confirm`, `GET /rounds/:roundId/conflict-report`, `GET /notifications?round_id=`, `GET /audit?entity_id=`.

---

### 7.6 Reschedule Flow — `/interviews/:id/reschedule`

**Layout:** drawer/modal (routable so it can be deep-linked from a notification, but doesn't feel like a full page navigation).

- Reason field (optional free-text — sanitized before any downstream AI message drafting, per prompt-injection defense)
- **Regenerate Slots** button → re-runs engine with fresh availability/calendars → same Recommendations UI as Interview Detail Tab 3, embedded in the drawer
- **Confirm New Time** button per slot

**APIs:** `POST /rounds/:roundId/reschedule`, `GET /rounds/:roundId/slots`, `POST /rounds/:roundId/slots/:slotId/confirm`.

---

### 7.7 Loop Builder & Loop Detail — `/interviews/:id/loop/new`, `/loops/:loopId`

**Purpose:** schedule an entire onsite/day-of interview loop (e.g., Technical → Managerial → HR, back-to-back) as one atomic operation, per the Interview Loop Builder feature (architecture doc §4.3/§8.1) — this is the page-level home for that engine capability.

**Loop Builder (`/interviews/:id/loop/new`) — creation flow:**
- **Round picker:** checkboxes over the request's existing rounds ("Include in this loop") — at least 2 required to proceed
- **Order & spacing:** a simple drag-orderable list (or up/down arrows on mobile) showing the sequence rounds will run in, with the org's inter-round buffer shown between each (editable per-gap if policy allows)
- **Date range** for the whole loop (single day or a small window, e.g., "any day this week")
- **Create Loop** button (primary) → creates the `InterviewLoop`, redirects to `/loops/:loopId`

**Loop Detail (`/loops/:loopId`) — same tab pattern as Interview Detail, scoped to the whole day:**

**Tab: Itinerary**
- A vertical day-timeline component (new — see §13): each bundled round as a stacked block showing round type, duration, panel, and buffer gaps visually between blocks
- Before scheduling: empty/pending state per block; after confirmation: each block shows its confirmed time + meeting link

**Tab: Recommendations** *(the loop-level Explainable Scheduling surface)*
- Ranked **full-day itinerary options** (`LoopSlotSet[]`), not individual slots — each option renders as a mini-timeline preview (same visual language as the Itinerary tab) so the recruiter can compare, e.g., "9am–1pm option" vs. "1pm–5pm option" at a glance
- Expandable constraint checklist **per round within the option**, plus one loop-level line explicitly calling out cross-round checks (✓ no interviewer double-booked across rounds, ✓ total on-site time minimized)
- **Book This Itinerary** button per option (primary on top-ranked) — books all rounds atomically; a single loading state covers the whole multi-round transaction rather than one spinner per round
- Zero valid itineraries → same Conflict Recovery pattern as a single round, but the bottleneck explanation names *which round* in the loop is the blocker (e.g., "Round 2's required interviewer has no overlap with the other rounds' feasible windows")

**Tab: Audit History** — same pattern as Interview Detail, but events are loop-scoped (`loop_confirmed`, per-round reschedule cascades)

**Buttons:** Create Loop, Book This Itinerary (per option), Reschedule Loop (re-runs the whole loop, not one round), Cancel Loop.

**Animations:** the itinerary timeline blocks animate into place (staggered, ~200ms) when a `LoopSlotSet` is selected, visually "snapping" into their confirmed positions — reinforces that the whole day was solved together, not stitched from separate bookings.

**APIs:** `POST /interviews/:id/loops`, `GET /loops/:loopId`, `POST /loops/:loopId/slots/generate`, `GET /loops/:loopId/slots`, `POST /loops/:loopId/slots/:slotSetId/confirm`, `POST /loops/:loopId/reschedule`.

---

## 8. Candidate Portal Pages

*(Simplified shell — Section 3.3. Mobile-first: candidates frequently open these from an email link on a phone.)*

### 8.1 My Interviews — `/portal`
Simple card list: each upcoming/past interview as a card (role, round, status, date if confirmed). Tap → detail. Empty state: "No interviews yet — you'll see requests here as soon as a recruiter reaches out."

**APIs:** `GET /interviews?candidate_id=me`.

### 8.2 Interview Detail (candidate view) — `/portal/interviews/:id`
- Round type, duration, recruiter contact
- Status banner (Awaiting your availability / Awaiting scheduling / Confirmed / Rescheduled / Cancelled)
- If confirmed: date/time **in the candidate's own local time zone, explicitly labeled** (e.g., "Tuesday, Mar 12 · 3:00–4:00 PM IST"), meeting link, **Add to Calendar** button (generates .ics or Google Calendar link), **Reschedule** and **Cancel** buttons (subject to org policy on candidate self-service permissions)

**APIs:** `GET /interviews/:id` (candidate-scoped fields only — RBAC field-filtering).

### 8.3 Submit Availability — `/portal/interviews/:id/availability`
- Clear instructions: round name, duration, date range
- Calendar/time-grid picker, defaulting to the candidate's detected time zone (editable time-zone selector at top, all displayed slots re-render live on change)
- Multi-select time blocks (click-drag on desktop, tap-to-toggle on mobile)
- **Submit Availability** button (primary, disabled until at least one window selected)
- Confirmation state: "Thanks! We'll follow up once a time is confirmed."

**Animations:** selected time blocks highlight with a quick fill animation on click/tap; time-zone switch smoothly relabels the grid without a jarring reflow.

**APIs:** `POST /rounds/:roundId/availability`.

### 8.4 Slot Selection / Booking — `/portal/interviews/:id/book`
*(Shown when the recruiter has enabled candidate self-service booking from ranked recommendations, per the P1 self-service feature.)*
- Ranked slot cards (simplified version of the recruiter's Explainable view — candidate sees "Great match" framing rather than the full constraint checklist, to keep it simple per persona needs)
- **Confirm This Time** button per card, single-click guarded, idempotent
- Success state: confirmation animation + summary + **Add to Calendar** button

**APIs:** `GET /rounds/:roundId/slots`, `POST /rounds/:roundId/slots/:slotId/confirm`.

### 8.5 Loop Itinerary View — `/portal/loops/:loopId`
*(Shown instead of the single-interview detail page when the candidate's interview is part of a bundled same-day loop.)*
- Simple vertical day itinerary: each round as a card in order (round type, time in the candidate's local zone, interviewer name, meeting link), with visible gaps between cards representing break/buffer time — communicates "here's your whole day" at a glance, which is exactly the clarity a candidate needs before an onsite loop
- Single **Add Full Day to Calendar** button (adds every round as separate calendar events in one action) rather than one per round
- **Request to Reschedule** (whole loop) — subject to org self-service policy, same as single-interview reschedule

**Animations:** itinerary cards fade/slide in top-to-bottom on load (staggered ~100ms each) to reinforce the sequence.

**APIs:** `GET /loops/:loopId` (candidate-scoped).

---

## 9. Interviewer Portal Pages

### 9.1 Interviewer Home — `/interviewer`
Two sections: **Pending Invitations** (needs accept/decline) and **Upcoming Interviews** (already accepted). Each row: candidate (name only, minimal PII per data-minimization principle), round type, proposed/confirmed time in interviewer's local zone. A row that's part of a bundled loop shows a small "1 of 4 today" chip and links to the loop's itinerary rather than just the single round. A booking made via **Zero-Click Auto-Confirm** shows a subtle "auto-scheduled" tag on the row so the interviewer knows no recruiter manually reviewed it.

**Buttons:** per pending invitation — **Accept**, **Decline** (opens a short reason field, optional), **View Details**.

**APIs:** `GET /interviewers/me/upcoming`, `POST /bookings/:id/accept`, `POST /bookings/:id/decline`.

### 9.2 Availability & Working Hours — `/interviewer/availability`
- Recurring weekly working-hours editor (per-day start/end)
- Exceptions/unavailable-period entries (date-range blocks, e.g., vacation)
- Preferred interview windows (soft preference input, feeds the ranking engine)
- Max interviews per day setting (if org policy allows interviewer-level override)

**Buttons:** **Save Changes** (with unsaved-changes guard on navigation away).

**APIs:** `PUT /users/:id/availability`.

### 9.3 Invitation Detail — `/interviewer/interviews/:id`
Full interview context (candidate background relevant to the round, role, duration, meeting link once confirmed), same Accept/Decline actions as the home list, plus **Request Reschedule** button.

**APIs:** `GET /interviews/:id` (interviewer-scoped), `POST /bookings/:id/accept`, `POST /bookings/:id/decline`, `POST /rounds/:roundId/reschedule`.

### 9.4 Workload View — `/interviewer/workload`
Simple stat cards: interviews this week/month, compared against org's fairness target (visual, e.g., a small bar showing "you're at 60% of the team average" or similar honest framing) — reinforces the fairness USP for the interviewer themselves, not just recruiters.

**APIs:** `GET /interviewers/me/workload`.

---

## 10. Hiring Manager Pages

### 10.1 Pipeline Overview — `/manager/pipeline`
Read-oriented version of the Recruiter's `/interviews` list — same status filters, no create/edit actions, plus a **Panel Health** summary strip (interviewer workload distribution across the team at a glance).

**APIs:** `GET /interviews` (HM-scoped, likely filtered to their team/department), `GET /analytics/workload`.

### 10.2 Interviewer Workload — `/manager/workload`
Table: interviewer name, current load, skills, avg response time — sortable, used to spot overload before it happens.

**APIs:** `GET /analytics/workload`.

---

## 11. Admin Pages

### 11.1 Users & Roles — `/admin/users`
Table with search, role badges, **+ Invite User** button (email + role select), row-level role-edit and deactivate actions.

**APIs:** `GET/POST /admin/users`.

### 11.2 Interviewer Skills — `/admin/skills`
Skill taxonomy manager: list/add/remove skill tags org-wide, and a per-interviewer assignment view (could link into Users page rows).

**APIs:** `PUT /users/:id/skills` (per-interviewer), plus a skills-taxonomy CRUD companion endpoint.

### 11.3 Working Hours & Buffer Policy — `/admin/policy`
Form: default working hours, default buffer time (5/10/15/30 min chips), max interviews/day org default, time-zone handling defaults.

**Zero-Click Auto-Confirm section** (own card within this page, visually separated — this is a higher-stakes setting than the rest):
- **Enable Auto-Confirm** master toggle, **off by default**
- Per-round-type checkboxes (Screening / Technical / Managerial / HR) — an org can allow it for low-stakes Screening calls while keeping Managerial/HR fully manual
- **Minimum score-gap threshold** — a labeled slider/stepper (e.g., "require the top slot to beat the runner-up by at least 15 points") with inline help text explaining what the number means in plain language
- A short static example card showing what an auto-confirmed booking looks like to the recruiter/interviewer (the "Auto-confirmed" badge from §7.5), so the admin understands the visible consequence of turning this on before they do

**Save Policy** button (single button saves the whole page, including Auto-Confirm settings).

**APIs:** `GET/PUT /admin/policy`.

### 11.4 Integrations — `/admin/integrations`
Cards per provider (Google Calendar, Google Meet, Email/SendGrid, SMS/Twilio) showing connection status (Connected/Not Connected/Sandbox Mode), **Connect** / **Disconnect** buttons, and a clearly labeled **Sandbox Mode** toggle for demo reliability.

**APIs:** `GET/POST /admin/integrations`, `POST /calendar/connect`, `DELETE /calendar/disconnect`.

### 11.5 Audit Log Explorer — `/admin/audit`
Filterable table (entity type, actor, date range, action type), each row expandable to show before/after state diff. Read-only, append-only data — no edit/delete actions exposed anywhere in the UI, reinforcing immutability.

**APIs:** `GET /audit`.

---

## 12. Shared Pages

### 12.1 Analytics — `/analytics`
Role-scoped (Recruiter sees their own pipeline metrics; HM/Admin see team/org-wide).
**Tabs:** Overview (time-to-book, success rate, conflict rate, reschedule rate, **% of bookings auto-confirmed**, **loops scheduled** as stat tiles + trend sparkline) · Conflicts (top bottleneck causes, bar chart) · Workload (interviewer utilization).
Honest empty state per tab if no data yet — never fabricated numbers, per the master prompt's explicit instruction.

**APIs:** `GET /analytics/scheduling`, `GET /analytics/conflicts`, `GET /analytics/workload`.

### 12.2 Notifications Center — `/notifications`
Full list (not just the dropdown preview), filter by type (invite/confirm/reminder/reschedule/cancel), mark-as-read interaction, delivery-status indicator for admin-visible debugging context if the viewer is Recruiter/Admin.

**APIs:** `GET /notifications`.

### 12.3 Settings — `/settings`
**Tabs:** Profile (name, time zone, avatar) · Security (change password, connected OAuth) · Calendar (connect/disconnect Google Calendar, view sync status) · Notification Preferences (email/SMS toggle per notification type) · (Interviewer-only) Availability shortcut linking to `/interviewer/availability`.

**APIs:** `GET/PATCH /users/:id`, `POST /calendar/connect`, `DELETE /calendar/disconnect`, `PUT /users/:id` (notification prefs — extend user model with a `notification_preferences` JSON field).

---

## 13. Global Component Library

Buttons (primary/secondary/ghost/destructive, each with default/hover/active/disabled/loading states) · Input, Select, Date picker, Time-zone-aware time picker · Calendar/availability grid (day + week view) · Slot recommendation card (with expandable explanation) · **Loop itinerary timeline (stacked-block day view with buffer gaps — used in Loop Builder §7.7, Loop Detail, and the candidate Loop Itinerary View §8.5)** · **Auto-confirm badge (compact "Auto-confirmed" tag, expandable to the same constraint-checklist component used on manual recommendations)** · Status badge (color-coded per scheduling state) · Toast (success/error/info, auto-dismiss with pause-on-hover) · Modal, Drawer, Dropdown, Tooltip · Table (sortable, paginated) · Tabs · Sidebar, Top navigation · Empty state (icon + message + primary action) · Loading skeleton (never a blank white screen) · Error state (message + Retry button) · Confirmation state (checkmark micro-animation) · Timeline (audit history) · Stat/analytics card · Stepper (multi-step forms) · Avatar + avatar stack (panel display) · Copy-to-clipboard button (with copied-feedback).

Every one of these is used across ≥2 pages — none is page-specific, per the "do not duplicate components across pages" rule. The Loop itinerary timeline reuses the same visual language across all three of its usages (recruiter builder, recruiter detail, candidate view) so the "whole day solved together" concept reads identically regardless of role.

---

## 14. Page → API Map (quick reference)

| Page | Primary APIs |
|---|---|
| Landing | — (static) |
| Sign Up | `POST /auth/signup`, OAuth endpoints |
| Sign In | `POST /auth/login`, OAuth endpoints |
| Forgot/Reset Password | `POST /auth/forgot-password`, `POST /auth/reset-password` |
| Onboarding | `PATCH /users/:id`, `PUT /users/:id/skills`, `PUT /users/:id/availability`, `POST /calendar/connect` |
| Recruiter Dashboard | `GET /interviews`, `GET /analytics/scheduling`, `GET /analytics/conflicts` |
| Interviews List | `GET /interviews` |
| Create Interview | `POST /interviews`, `POST /interviews/:id/rounds`, `GET /jobs`, `GET /users?role=candidate`, `GET /interviewers/suggest` |
| Interview Detail | `GET /interviews/:id`, `GET/POST /rounds/:roundId/availability`, `POST /rounds/:roundId/slots/generate`, `GET /rounds/:roundId/slots`, `POST /rounds/:roundId/slots/:slotId/confirm`, `GET /rounds/:roundId/conflict-report`, `GET /audit` |
| Reschedule | `POST /rounds/:roundId/reschedule`, slot endpoints above |
| **Loop Builder / Loop Detail** | `POST /interviews/:id/loops`, `GET /loops/:loopId`, `POST /loops/:loopId/slots/generate`, `GET /loops/:loopId/slots`, `POST /loops/:loopId/slots/:slotSetId/confirm`, `POST /loops/:loopId/reschedule` |
| Candidate Portal (list/detail) | `GET /interviews` |
| Candidate Availability | `POST /rounds/:roundId/availability` |
| Candidate Booking | `GET /rounds/:roundId/slots`, `POST /rounds/:roundId/slots/:slotId/confirm` |
| **Candidate Loop Itinerary** | `GET /loops/:loopId` |
| Interviewer Home | `GET /interviewers/me/upcoming`, `POST /bookings/:id/accept`, `POST /bookings/:id/decline` |
| Interviewer Availability | `PUT /users/:id/availability` |
| Interviewer Workload | `GET /interviewers/me/workload` |
| HM Pipeline/Workload | `GET /interviews`, `GET /analytics/workload` |
| Admin Users | `GET/POST /admin/users` |
| Admin Policy | `GET/PUT /admin/policy` |
| Admin Integrations | `GET/POST /admin/integrations`, calendar connect/disconnect |
| Admin Audit | `GET /audit` |
| Analytics | `GET /analytics/scheduling`, `/conflicts`, `/workload` |
| Notifications | `GET /notifications` |
| Settings | `GET/PATCH /users/:id`, calendar connect/disconnect |

**Note:** the endpoints this page inventory originally surfaced as missing (`/auth/forgot-password`, `/auth/reset-password`, `/users` search, `/jobs`, `/interviewers/suggest`, skills taxonomy CRUD) plus the newer Loop Builder and Auto-Confirm endpoints (`/interviews/:id/loops`, `/loops/:loopId/*`, the Auto-Confirm fields on `/admin/policy`) have all been folded into `smart-interview-scheduler-architecture.md` Section 7 — that file is now the single source of truth for the full API contract.

---

*End of document. Pair with `smart-interview-scheduler-architecture.md` for backend/API/data-model detail behind every page listed here.*
