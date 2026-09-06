# UI Pages & Design

**11 pages total.** Minimal on purpose — every page earns its place by driving a step in [01_LOGIC_FLOW.md](01_LOGIC_FLOW.md). Structure is modelled on the GoodTime reference screenshots; the visual language is our own (fresher, lighter, less enterprise-purple).

---

## 1. Design system

Keep it to one accent colour, two surfaces, and four status colours. That alone makes it look intentional.

| Token | Value | Use |
|---|---|---|
| `bg` | `zinc-50` | page background (staff) |
| `surface` | `white` | cards, tables, panels |
| `border` | `zinc-200` | hairlines, dividers |
| `text` | `zinc-900` / `zinc-500` (secondary) | body |
| `accent` | `indigo-600` (hover `indigo-700`) | primary buttons, active nav, selected slot |
| `success` | `emerald-600` | confirmed, accepted |
| `warn` | `amber-500` | awaiting response, reschedule required |
| `danger` | `rose-600` | declined, cancelled, conflicts |
| radius | `rounded-lg` (cards), `rounded-md` (inputs/buttons) | — |
| shadow | one level: `shadow-sm` on cards | no heavy glows |
| font | **Inter** — `font-semibold` headings, `text-sm` UI body | — |
| spacing | 4 / 8 / 12 / 16 / 24 / 32 | — |

**Status pills** (used everywhere, one component):
`AWAITING AVAILABILITY` amber · `READY TO SCHEDULE` indigo · `SCHEDULED` emerald · `RESCHEDULE REQUIRED` amber-dark w/ dot · `CANCELLED` zinc · `DECLINED` rose

**Two visual worlds** (this is the main design idea):
- **Staff pages** — dense, light, functional. White cards on zinc-50, clean tables, sticky top bar. Fast to scan.
- **Candidate pages** — full-bleed background (soft indigo→violet gradient with subtle grain), one centred white card, large friendly headings, one action per screen. Directly inspired by the GoodTime candidate flow, but gradient instead of a stock photo so it feels current, not 2019.

Motion: only three — 150ms fade/slide for page transitions, 120ms scale on button press, a checkmark draw-in on confirmation. Nothing loops.

**Every screen needs:** loading skeleton, empty state with a next action, error state with a retry, and disabled states that look disabled.

---

## 2. Page inventory

| # | Route | Who | Purpose |
|---|---|---|---|
| 1 | `/login` | staff | email + password |
| 2 | `/dashboard` | recruiter, HM, admin | interview pipeline — the home screen |
| 3 | `/requests/new` | recruiter | create interview request |
| 4 | `/requests/[id]` | recruiter, HM | request detail: panel, availability, slots, emails, actions |
| 5 | `/interviewer` | interviewer | my assignments, accept/decline/request-reschedule |
| 6 | `/s/[token]` | candidate | intro / welcome |
| 7 | `/s/[token]/days` | candidate | pick days |
| 8 | `/s/[token]/times` | candidate | pick times |
| 9 | `/s/[token]/confirmed` | candidate | confirmation + meet link + reschedule entry |
| 10 | `/s/[token]/reschedule` | candidate | refined slots from earlier windows |
| 11 | `/` | public | one-screen landing → "Sign in" |

---

## 3. Staff pages

### 1. `/login`
Centred card on zinc-50. Fields: email, password. Button **Sign in**. Below it, small text: demo accounts are listed on the seed page / README.
Errors inline ("Incorrect email or password" — never reveal which). Loading spinner on submit, button disabled while pending.
→ `POST /api/auth/login`

### 2. `/dashboard` — the pipeline *(baseline: GoodTime "Interviews" list)*
```
┌──────────────────────────────────────────────────────────────┐
│  SmartSchedule      Dashboard  Interviewer        [avatar ▾]  │  sticky top bar
├──────────────────────────────────────────────────────────────┤
│  Interviews                              [+ New Interview]   │
│  [ search candidate…] [ status: All ▾ ]                      │
├──────────────────────────────────────────────────────────────┤
│  Maya Iyer      Sr Backend · Technical   ⬤ READY TO SCHEDULE │
│  maya@…                                  [View] [Schedule]   │
│  ────────────────────────────────────────────────────────────│
│  Ryan Cole      Data Eng · Technical     ⬤ RESCHEDULE REQ'D  │
│  ryan@…         ⚠ candidate's earlier windows no longer work │
│                                          [View] [Send new…]  │
└──────────────────────────────────────────────────────────────┘
```
- Rows: candidate name + email, job + round, status pill, action buttons on the right (mirrors GoodTime's `Request Availability` / `Schedule Now` row actions).
- A `RESCHEDULE_REQUIRED` row shows the `blockedReason` inline — this is the marker from logic doc §6B.
- Top strip of 3 counters: *Awaiting availability · Ready to schedule · Needs attention*.
- Empty state: "No interviews yet — create your first request."
→ `GET /api/requests`

### 3. `/requests/new` *(baseline: GoodTime right-side creation panel)*
Single form, one column, grouped into three blocks. Not a multi-step wizard — faster to build and faster to demo.

**Candidate** — select existing candidate (from seed) or add inline (name, email, timezone)
**Round** — round type (Screening / Technical / Managerial / HR chips) · duration (30/45/60 chips) · required skills (multi-select chips: Java, Backend, React, System Design, Culture, Policy) · panel size (1–2)
**Window** — date range picker (start / end), defaults to next 2 weeks

Right side (or below on mobile): a live **"Eligible interviewers"** preview card that calls the selection endpoint as you change round/skills, showing who qualifies and **why others were excluded**:
> ✅ Priya Sharma — Technical, Java · load 2/3
> ✅ Alex Rivera — Technical, Java · load 2/2 ⚠ at daily cap
> ✖︎ Ananya Patel — no TECHNICAL label

This little panel is the visible proof of features #18 + #20 and costs one endpoint.

Buttons: **Create & send availability request** (primary), *Create as draft* (secondary).
→ `POST /api/requests` then `POST /api/requests/:id/availability-request`

### 4. `/requests/[id]` — request detail
Header: candidate name, job, round, duration, status pill, and the booked time (in **both** the candidate's and the viewer's timezone — feature #16 made visible).

Four stacked sections (no tabs — less code, everything visible for the demo):

**Panel** — each interviewer: name, labels/skills, load `2/3`, status pill (PENDING/ACCEPTED/DECLINED), and the `reason` string explaining why they were selected.

**Candidate availability** — the windows they submitted, shown in candidate-local time with a small "= your time" secondary line.

**Recommended slots** — ranked cards. Each shows the time in candidate tz + viewer tz, a score, and the reasons list:
> **Tue 14 Nov · 3:00–4:00 PM IST** (1:30–2:30 PM your time) · rank #1
> ✓ Candidate available · ✓ Priya Sharma free · ✓ within working hours both zones · ✓ 15-min buffer respected
> `[ Book this slot ]`

If zero slots: a plain amber panel listing the top rejection reasons collected during generation ("Alex Rivera: conflicts with existing event", "outside working hours in Asia/Kolkata") — that's honest and useful without building the full recovery engine (#21/#22, out of scope).

**Emails sent** — table of `Notification` rows: time, recipient, subject, status. This is how we show real communication in the demo without opening an inbox.

Actions in the header: **Reschedule**, **Cancel interview**.
→ `GET /api/requests/:id`, `GET .../slots`, `POST .../book`, `POST .../cancel`, `POST .../reschedule`

### 5. `/interviewer` — interviewer console
List of my assignments: candidate, round, proposed/confirmed time **in my timezone**, status.
Buttons per row: **Accept** · **Decline** · **Request reschedule** (decline and reschedule both open a small dialog for an optional reason).
After declining, an inline result banner shows what the system did — "Replaced by Alex Rivera, time unchanged" or "New time found: Wed 3 PM" or "Recruiter notified — no replacement available." That makes flow §6A visible on screen.
→ `POST /api/assignments/:id/respond`

---

## 4. Candidate pages (no login, token link)

Shared shell: full-bleed gradient background, centred `max-w-md` white card, `rounded-2xl`, generous padding, one primary action. Timezone selector at the top of every screen (defaults to their stored tz, changing it re-renders all times live — feature #16).

### 6. `/s/[token]` — intro *(baseline: "Hey Meredith, excited to meet you")*
Avatar/initials of the recruiter, headline **"Hi Maya, let's find a time"**, subline with job title + round + duration, button **Get started**.
Invalid/expired token → friendly card: "This link has expired — please contact your recruiter."

### 7. `/s/[token]/days` — pick days *(baseline: "Pick a few days you are free")*
Month calendar. Selectable days highlighted; days with no possible interviewer availability are disabled and greyed. Multi-select, minimum 1. Timezone selector above. Button **Continue**.

### 8. `/s/[token]/times` — pick times *(baseline: "Pick a few times that work for you")*
For each chosen day, a card listing the **ranked valid slots** in candidate-local time, with a small "Recommended" tag on rank #1. Candidate selects one → **Confirm**.
This is the moment the engine's output is visible to the candidate. Slots here are already conflict-free, buffer-respecting, and working-hours-valid.
→ `POST /api/public/[token]/availability` (their windows), `GET /api/public/[token]/slots`, `POST /api/public/[token]/book`

### 9. `/s/[token]/confirmed` — confirmation *(baseline: "Meeting confirmed")*
Green header band, the confirmed date/time in their timezone, interviewer name(s), **Join meeting** link (Google Meet), *Add to calendar*, and a quiet text link **"I need to reschedule."**
Checkmark draw-in animation on first load.

### 10. `/s/[token]/reschedule`
Headline: "Let's find another time." Body copy states plainly that these options come from the availability they already gave.
Shows the **refined slot list** (logic doc §6B) — same card style as page 8.
If the list is empty: amber card — "None of your earlier times are still available. We've let the recruiting team know and they'll send you fresh options." (and the backend has already flipped the request to `RESCHEDULE_REQUIRED` + emailed them).

### 11. `/` — landing
One screen. Product name, one-line value prop ("Interview scheduling that actually accounts for everyone's calendar"), a small visual of the slot-card, and **Sign in**. No marketing sprawl.

---

## 5. Component list (build once, reuse)

`Button` · `Input` · `Select` · `Chip` (round type, skills, duration) · `StatusPill` · `Card` · `Table` · `Dialog` · `Toast` · `Skeleton` · `EmptyState` · `SlotCard` (with reasons list) · `TimezoneSelect` · `CandidateShell` (gradient + centred card) · `StaffShell` (top bar + container)

~15 components. Nothing else.

---

## 6. Responsive

Only two breakpoints matter:
- **≥1024px** — staff tables full width, slot cards in a 2-col grid.
- **<640px** — staff tables collapse to stacked rows; candidate pages are already single-column so they need almost nothing. Candidate flow **must** be perfect on mobile (they open it from an email on a phone) — that's the one responsive path to actually test.
