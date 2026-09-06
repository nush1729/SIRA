# Role C — Staff UI

You own everything a company employee sees: login, the pipeline dashboard, creating a request, the request detail screen, and the interviewer console. You build entirely against fixtures, so you never wait on B's API.

Covers the staff half of spec features **1, 2, 3, 8, 11, 12, 13, 14, 18, 20**.

---

## Files you create (nobody else touches these)

```
app/(staff)/layout.tsx            staff shell: top bar + container + auth redirect
app/(staff)/login/page.tsx
app/(staff)/dashboard/page.tsx
app/(staff)/requests/new/page.tsx
app/(staff)/requests/[id]/page.tsx
app/(staff)/interviewer/page.tsx
components/staff/**               RequestRow, PanelCard, SlotCard, EligibilityPanel, EmailsTable…
lib/api-client.ts                 typed fetch wrapper + MOCK_API switch
mocks/staff-fixtures.ts           your fake data
```

You use D's `components/ui/*` for primitives (Button, Input, Chip, StatusPill, Card, Dialog, Toast, Skeleton, EmptyState). **Do not create your own primitives** — that's how a project ends up with two visual languages. Until D0 lands (D's first 2–3 hours), use plain Tailwind and swap after.

---

## The mock switch — how you work alone

```ts
// lib/api-client.ts
const MOCK = process.env.NEXT_PUBLIC_MOCK_API === "true";

export async function getRequests(): Promise<RequestListItemDTO[]> {
  if (MOCK) return staffFixtures.requests;          // ← your whole dev loop
  const r = await fetch("/api/requests");
  const j: ApiResponse<RequestListItemDTO[]> = await r.json();
  if (!j.ok) throw new ApiError(j.error);
  return j.data;
}
```
Every call goes through this file, every function returns the DTO types from `lib/contracts.ts`. At integration you flip one env var and nothing else changes. **If a component reaches for `fetch` directly, the integration will hurt** — keep it all in `api-client.ts`.

Your fixtures must cover all 8 seeded scenarios from [04_SEED_DATA.md](04_SEED_DATA.md), including the awkward ones: a `RESCHEDULE_REQUIRED` row with a `blockedReason`, a request with **zero** slots and a populated `rejections[]`, and a panel member with `status: "DECLINED"`.

---

## What to build

### 1. `app/(staff)/layout.tsx`
Sticky top bar: wordmark · nav (Dashboard / Interviewer) · role-aware avatar menu (name, role, sign out) · a **Reset demo data** button (calls `POST /api/dev/seed`, admin-visible). Redirect to `/login` when `getMe()` fails.

### 2. `/login`
Centred card, email + password, inline error ("Incorrect email or password" — never say which field). Disable the button while pending. On success route by role: RECRUITER/HIRING_MANAGER/ADMIN → `/dashboard`, INTERVIEWER → `/interviewer`.

### 3. `/dashboard` — the pipeline (the screen judges see first)
Three counter tiles (*Awaiting availability · Ready to schedule · Needs attention*), a search box, a status filter, then the request rows: candidate name + email, job + round, **status pill**, and right-aligned actions.
A `RESCHEDULE_REQUIRED` row renders its `blockedReason` inline in amber — that's the marker from logic doc §6B and it must be impossible to miss.
Empty state: "No interviews yet — create your first request."

### 4. `/requests/new`
One-column form in three blocks: **Candidate** (pick existing or add inline) · **Round** (round-type chips, duration chips, skills multi-select, panel size) · **Window** (date range, defaults to next 2 weeks).

Alongside it, the **Eligibility panel** — the visible proof of features #18/#20. It calls `previewPanel()` (debounced) whenever round/skills/window change and renders `SelectionResult` directly:
> ✅ Priya Sharma — *selected · load 0/3*
> ✖︎ Alex Rivera — *at daily cap 2/2*
> ✖︎ Ananya Patel — *no TECHNICAL label*

Don't reformat those strings — the engine wrote them to be read. Submit → `createRequest()` → route to the new detail page.

### 5. `/requests/[id]` — request detail
Header: candidate, job, round, duration, status pill, and if booked, the time **in both the candidate's timezone and the viewer's** (feature 16, made visible). Actions: Reschedule, Cancel.

Four stacked sections (no tabs — everything visible for the demo):
- **Panel** — each member: name, labels/skills, `load 2/3`, status pill, and the `reason` they were picked.
- **Candidate availability** — submitted windows, candidate-local with a "= your time" secondary line.
- **Recommended slots** — ranked `SlotCard`s showing both timezones, rank, and the `reasons[]` checklist, each with **Book this slot**. When `slots` is empty, render the `rejections[]` in an amber panel instead ("Alex Rivera — conflicts with existing event (incl. 15min buffer) · 12 slots") — honest and useful, and it costs you nothing since the engine supplies it.
- **Emails sent** — the `notifications[]` table (time, recipient, subject, status). This is how the demo shows real communication without opening an inbox.

Booking flow: click → confirm dialog → optimistic pending state → on `409 SLOT_NO_LONGER_VALID` show a toast and refetch slots (don't just fail).

### 6. `/interviewer` — interviewer console
My assignments: candidate, round, time **in my timezone**, status. Per row: **Accept** · **Decline** · **Request reschedule** (the latter two open a dialog with an optional reason).
After a decline, render the `RescheduleOutcome` banner — one component, three messages:
`REPLACED_SAME_TIME` → green "Rahul Verma took this over. The time hasn't changed." · `REBOOKED_NEW_TIME` → blue "Moved to Fri 2:00 PM IST. The candidate has been notified." · `RESCHEDULE_REQUIRED` → amber "No replacement found — the recruiter has been notified."

---

## Prove it — your standalone test story

Run `NEXT_PUBLIC_MOCK_API=true npm run dev` and walk this list in front of a teammate:

- [ ] Login page: submit empty → validation; wrong password → inline error; success → correct route per role
- [ ] Dashboard: all 8 fixture rows render with correct status pills; the `RESCHEDULE_REQUIRED` row shows its reason; counters match; search + filter narrow the list; empty state appears when filtered to nothing
- [ ] New request: chips select; eligibility panel updates on change and shows both selected and rejected people with reasons; submit disabled until valid
- [ ] Detail (happy fixture): panel, availability, ranked slots with reasons in two timezones, emails table
- [ ] Detail (zero-slot fixture): rejection panel renders instead of slots — **not** a blank area
- [ ] Detail (scheduled fixture): meet link, copy-to-clipboard feedback, Cancel/Reschedule present
- [ ] Interviewer console: accept, decline, and all three outcome banners (drive them from fixtures)
- [ ] Every page has: loading skeleton, empty state, error state with retry, disabled-looking disabled buttons
- [ ] 375px width: nothing overflows horizontally

**Definition of done:** every screen clickable end-to-end on fixtures, all three reschedule banners demonstrable, no direct `fetch` outside `api-client.ts`.

---

## What you must NOT do

- Don't build your own Button/Input/Card — use D's.
- Don't compute scheduling logic client-side (no "is this slot valid" in React). Render what the API gives you.
- Don't hide actions as your only access control — B enforces RBAC server-side; you just avoid showing what a role can't do.
- Don't rename DTO fields locally to "nicer" names; render `contracts.ts` shapes as-is so integration is a no-op.
