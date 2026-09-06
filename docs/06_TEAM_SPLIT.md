# Team Split — 4 Parallel Workstreams

Read this first. Then read only your own role doc (07–10). The integration doc (11) is for the final merge.

---

## The idea

Four people, **zero shared files**, **zero blocking dependencies**. Everyone codes against one frozen contract file and a stub of everything they don't own. On integration day the stubs get swapped for the real thing.

| Person | Role | Owns | Can be tested standalone by |
|---|---|---|---|
| **A** | Scheduling Engine | pure TS logic — slots, conflicts, timezone, selection, load balancing | `npm run test` (unit tests) + a CLI demo script |
| **B** | Backend & Data | Prisma schema, auth, all API routes, adapters, seed | seeded DB + curl smoke script + Prisma Studio |
| **C** | Staff UI | login, dashboard, create request, request detail, interviewer console | clicking every page with `MOCK_API=true` |
| **D** | Design System + Candidate UI | tokens/components, landing, the whole `/s/[token]` flow | clicking the candidate flow with `MOCK_API=true` |

Nobody needs anyone else's code to run their own work. That's the whole design.

---

## Hour Zero (all four together, ~45 min) — do this before splitting up

1. One person creates the repo and runs:
   ```bash
   npx create-next-app@latest scheduler --typescript --tailwind --app --eslint
   cd scheduler
   npm i @prisma/client bcryptjs jose luxon zod googleapis
   npm i -D prisma vitest @types/bcryptjs @types/luxon tsx
   npx prisma init --datasource-provider sqlite
   ```
2. Copy `docs/contracts/contracts.ts` → `lib/contracts.ts`. **Read it out loud together.** This is the agreement.
3. Commit + push `main`. Everyone branches:
   `feat/engine` (A) · `feat/backend` (B) · `feat/staff-ui` (C) · `feat/candidate-ui` (D)
4. Agree the two mock switches:
   - `NEXT_PUBLIC_MOCK_API=true` → C and D render from fixtures instead of calling the API
   - `USE_ENGINE_STUB=true` → B uses fake slot data instead of A's engine
5. **Freeze `package.json`.** All dependencies are installed now, by one person, in this step. Nobody adds a dependency later without telling the group — this is the #1 cause of merge conflicts.

After this, everyone works alone until integration.

---

## File ownership map (no two people touch the same file)

```
lib/contracts.ts                     ← FROZEN, nobody edits alone

A ── lib/tz.ts
     lib/scheduler.ts
     lib/selection.ts
     lib/reschedule-core.ts
     lib/__tests__/*.test.ts
     scripts/engine-demo.ts
     vitest.config.ts

B ── prisma/schema.prisma
     prisma/seed.ts
     lib/db.ts
     lib/auth.ts
     lib/notify.ts
     lib/engine.ts               (re-export indirection: stub ⇄ real)
     lib/engine-stub.ts          (deleted at integration)
     lib/adapters/calendar.ts
     lib/adapters/mail.ts
     app/api/**                  (every route)
     scripts/api-smoke.sh
     .env.example

C ── app/(staff)/layout.tsx
     app/(staff)/login/page.tsx
     app/(staff)/dashboard/page.tsx
     app/(staff)/requests/new/page.tsx
     app/(staff)/requests/[id]/page.tsx
     app/(staff)/interviewer/page.tsx
     components/staff/**
     lib/api-client.ts
     mocks/staff-fixtures.ts

D ── app/layout.tsx
     app/globals.css
     app/page.tsx                (landing)
     app/s/[token]/**            (all 5 candidate screens)
     components/ui/**            (the design system)
     components/shells/**
     lib/api-public.ts
     mocks/candidate-fixtures.ts
```

**The one cross-dependency:** C needs D's `components/ui/*`. Handled by **Milestone D0** — D builds and pushes the component library in their first 2–3 hours, before touching the candidate flow. Until D0 lands, C uses plain Tailwind divs and swaps them after. C must not create their own button/input components — that's how you end up with two design systems.

---

## Timeline

| Window | A | B | C | D |
|---|---|---|---|---|
| 0–1h | *Hour Zero, together* | | | |
| 1–4h | tz + generateSlots + tests | schema + migrate + auth | login + dashboard (fixtures) | **D0: design system** |
| 4–8h | selection + load balancing + tests | seed data + adapters | create-request + eligible panel | landing + `/s` intro + days |
| 8–12h | validateSlot + reschedule-core | API routes (against stub) | request detail + slots UI | times + confirmed + reschedule |
| 12–15h | polish, edge-case tests, demo script | smoke script, dev/seed | interviewer console, states | mobile pass, states |
| 15–19h | **INTEGRATION (all four, on B's laptop)** | | | |
| 19–22h | bug-fix + rehearse demo | | | |

---

## Rules that keep this working

1. **Never edit a file you don't own.** Need a change in someone's file? Message them; they do it.
2. **Contracts are law.** If reality demands a contract change, all four agree, and it's announced in the group chat with the exact diff.
3. **Commit and push to your branch at least every 2 hours.** Integration is much easier against recent code.
4. **Your definition-of-done includes your standalone test passing.** "It works on my machine but I can't show you" isn't done — see each role doc's "Prove it" section.
5. **No dependency additions after Hour Zero** without telling the group.
6. **Don't merge to `main` yourself.** All merges happen during the integration window, on the integrator's machine, in the documented order.

---

## Who integrates

**Person B** — they own the schema, the API surface and the seed data, so they can spot wiring errors fastest. Everyone is present (in person or on a call) during the integration window; A, C and D fix their own bugs while B drives the merge.

Fallback: any laptop that can run `npm run dev` + `prisma migrate` works. The machine matters less than having all four people available for the 4-hour window.
