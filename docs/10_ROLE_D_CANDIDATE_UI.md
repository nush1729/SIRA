# Role D — Design System + Candidate UI

You own how the whole product *looks*, plus the screens the candidate actually touches. Your first deliverable unblocks C, so it ships first.

Covers spec features **4, 15, 16** (candidate side) and the visual quality of everything else.

---

## Files you create (nobody else touches these)

```
app/layout.tsx                  root layout, fonts, globals
app/globals.css                 tokens as CSS vars + Tailwind layer
app/page.tsx                    landing (one screen)
app/s/[token]/page.tsx          intro
app/s/[token]/days/page.tsx     pick days
app/s/[token]/times/page.tsx    pick times
app/s/[token]/confirmed/page.tsx
app/s/[token]/reschedule/page.tsx
components/ui/**                the design system  ← MILESTONE D0
components/shells/CandidateShell.tsx
lib/api-public.ts               typed fetch + MOCK switch (candidate endpoints)
mocks/candidate-fixtures.ts
```

---

## MILESTONE D0 — do this first (2–3 hrs), then push immediately

C is using plain divs until this lands. Build exactly these, no more:

`Button` (primary/secondary/ghost/danger × default/hover/disabled/loading) · `Input` · `Select` · `Chip` (selectable) · `StatusPill` · `Card` · `Dialog` · `Toast` · `Skeleton` · `EmptyState` · `TimezoneSelect` · `SlotCard` (time + secondary timezone line + reasons list + action)

Tokens in `globals.css` per [03_UI_PAGES.md](03_UI_PAGES.md) §1: `zinc-50` page, white surfaces, `zinc-200` borders, **one** accent `indigo-600`, status colours emerald/amber/rose, `rounded-lg` cards, a single `shadow-sm` elevation, Inter.

Push it, tell C, then start your own pages.

---

## The two visual worlds

**Staff (C's pages, your components):** light, dense, functional. White cards on zinc-50. Fast to scan.

**Candidate (your pages):** full-bleed soft indigo→violet gradient background, one centred white card (`max-w-md`, `rounded-2xl`, generous padding), one big friendly heading, **one action per screen**. This is the GoodTime candidate flow's structure with a fresher skin — gradient rather than a stock photo, so it reads as current.

Motion, and nothing more: 150ms fade/slide between steps, 120ms press-scale on buttons, a checkmark draw-in on confirmation. Respect `prefers-reduced-motion`.

---

## The mock switch — how you work alone

```ts
// lib/api-public.ts
const MOCK = process.env.NEXT_PUBLIC_MOCK_API === "true";
export async function getPublicRequest(token: string): Promise<PublicRequestDTO> {
  if (MOCK) return candidateFixtures.byToken[token] ?? candidateFixtures.default;
  ...
}
```
Fixture tokens to support: `demo-dev` (fresh, no windows yet), `demo-ryan` (booked, and its reschedule-slots list is **empty**), `demo-expired` (invalid token), `demo-few` (only 2 valid slots).

---

## What to build

### 1. `/` — landing (one screen, don't sprawl)
Product name, one-line value prop — *"Interview scheduling that actually respects everyone's calendar."* — a single visual (a `SlotCard` with its reasons ticked), and **Sign in**. That's it.

### 2. `/s/[token]` — intro
Recruiter initials avatar, **"Hi Maya, let's find a time"**, subline with job title · round · duration, **Get started**.
Invalid/expired token → calm card: "This link has expired — please contact your recruiter." Never a stack trace, never a 500 page.

### 3. `/s/[token]/days` — pick days
Month calendar, multi-select days, `TimezoneSelect` at the top defaulting to their stored zone. Changing the timezone re-renders every displayed time live — that's feature 16 made tangible. Days with no possible availability render disabled/greyed. **Continue** disabled until ≥1 day chosen.

### 4. `/s/[token]/times` — pick times
Submit their chosen windows (`POST .../availability`), then render the returned `GenerateSlotsResult`: a card per day listing ranked slots in **their** local time, rank 1 tagged *Recommended*. Select one → **Confirm** → `POST .../book`.
Handle `409 SLOT_NO_LONGER_VALID` gracefully: toast + refetch, never a dead end.
Empty slots → the amber "no times work" card with a "contact recruiter" line.

### 5. `/s/[token]/confirmed`
Emerald header band, checkmark draw-in, the confirmed date/time in their zone, interviewer name(s), **Join meeting** (Meet link), *Add to calendar*, and a quiet text link **"I need to reschedule."**

### 6. `/s/[token]/reschedule`
Heading "Let's find another time", with copy that plainly says these options come from the availability they already gave.
Render the refined slots (same `SlotCard`s). If the list is empty: amber card — *"None of your earlier times are still available. We've let the recruiting team know and they'll send you fresh options."* (the backend has already flipped the request to `RESCHEDULE_REQUIRED` and emailed them — you just show the truth).

---

## Prove it — your standalone test story

Run `NEXT_PUBLIC_MOCK_API=true npm run dev`, **in a 375px-wide window** (candidates open these from email on a phone — that's the primary target, not an afterthought):

- [ ] `demo-dev`: intro → days → times → confirmed, all the way through, thumb-only
- [ ] Timezone selector changes every displayed time live, and the zone label is always visible (never a bare "10:00 AM")
- [ ] `demo-few`: only 2 slots, ranking tag on the first
- [ ] `demo-ryan` → `/reschedule`: empty state card renders, not a blank screen
- [ ] `demo-expired`: friendly expired card
- [ ] Confirmed page: Meet link, add-to-calendar, reschedule link all present; checkmark animates once
- [ ] Every screen: loading skeleton, error state with retry, disabled buttons that look disabled
- [ ] `prefers-reduced-motion` honoured
- [ ] D0 components: every variant/state rendered on a scratch page and eyeballed
- [ ] No horizontal scroll at 375px, and nothing clipped at 1440px

**Definition of done:** the full candidate journey is clickable on fixtures at phone width, and C is using your components (not their own).

---

## What you must NOT do

- Don't fetch outside `lib/api-public.ts`.
- Don't show internal data on candidate pages — you render `PublicRequestDTO` only. No interviewer emails, no scores, no rejection reasons. Candidates see times, not the machinery.
- Don't add a second accent colour or a second font. One of each is what makes it look designed.
- Don't build staff pages — that's C. If you think a staff screen needs a component, add it to `components/ui/` and tell them.
