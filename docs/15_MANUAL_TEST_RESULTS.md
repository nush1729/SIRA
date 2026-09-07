# Manual Test Results — Full Pass (mock mode, real engine)

Run against `main @ c96c20c`, fresh clone simulation (`npm install` → `prisma migrate deploy` → `npm run seed` → `npm run dev`), `PROVIDER_MODE=mock`. Covers automated checks, a manual UI/API click-through of the seeded demo scenarios, and everything found along the way that needs a decision or a fix.

---

## 1. Bugs found and fixed during this pass

### 1.1 `npm run seed` crashes on a fresh clone — **FIXED**
```
TypeError: Cannot read properties of undefined (reading 'deleteMany')
    at runSeed (lib/seed.ts:84:36)
```
**Cause:** `npm install` does not automatically run `prisma generate`. On a clean clone, the Prisma Client in `node_modules/@prisma/client` was generated before the `BookingAssignment`/`InterviewerTimeLock` migration existed, so `prisma.interviewerTimeLock` was `undefined`.
**Fix applied:** ran `npx prisma generate` manually. Seed then succeeds.
**Recommended permanent fix:** add a `postinstall` script so this can't bite anyone else:
```json
"scripts": {
  "postinstall": "prisma generate"
}
```
This is a real onboarding blocker for every teammate (and for whoever sets up Google mode) until this is added — same class of problem as the `vitest`/`@types/node` fix from earlier in the project.

### 1.2 `.env` had `USE_ENGINE_STUB="true"` — **FIXED**
The whole app was silently running on the deterministic stub engine (`lib/engine-stub.ts`), not the real scheduling engine (`lib/scheduler.ts`). Flipped to `false` in the local `.env`. Confirmed it was actually live before vs. after — Maya Iyer's assigned interviewer changed from Ananya Patel (stub) to Priya Sharma (real engine) the moment the flag flipped, and `scripts/verify.mjs` output changed accordingly.

**This is worth an explicit check-in with whoever owns deploy config** — if this ever shipped to a demo laptop with the stub flag on, the demo would still *look* fine (the stub returns plausible-looking fixed slots) but would silently not be exercising any of the real pool/timezone/buffer logic the whole project is built around.

### 1.3 `.env` was missing several vars present in `.env.example` — **FIXED locally**
Missing entirely (not just blank): `GOOGLE_REDIRECT_URI`, `GOOGLE_PRIMARY_CALENDAR_ID`, and all five `GOOGLE_CAL_*` keys. Added them (blank, ready to fill) to match `.env.example`. Not a bug in the app itself, just drift between one developer's local `.env` and the template — worth everyone diffing their `.env` against `.env.example` before Google setup.

---

## 2. Things that looked like bugs but weren't (verified, not changed)

### 2.1 Priya Sharma appearing in both "assigned" and "ruled out" for Maya's request
On Maya Iyer's request, the top 5 ranked slots all assign Priya Sharma — but the "Who was ruled out, and why" panel also lists Priya as rejected for 5 other slot-times (buffer conflicts). **This is correct, not a contradiction.** Per-slot assignment (post pool-based redesign) means the same person can be free for some candidate-offered times and busy for others within the same request; the rejection list aggregates reasons across every slot-time scanned, not just the top 5 shown. Confirmed via direct DB/API inspection.

### 2.2 Alex Rivera never appears anywhere in Maya's pool or rejection list
Alex has the right skills (Java, Backend) but never shows up at all — not assigned, not rejected. Traced this to `pickPanel`'s working-hours pre-check (`selection.ts`): Maya's candidate windows are IST daytime, which is the middle of the night in Alex's zone (America/New_York), so he fails `hasAnyFreeTimeInWindow` and is filtered out **before** ever entering the per-slot pool that the "ruled out" list is built from. Correct behavior, just a different constraint than the hackathon brief's toy "daily cap" example — this scenario is actually doing double duty (timezone filtering *and* what the seed data labels "load balancing").

---

## 3. Automated verification

| Check | Result |
|---|---|
| `npm install` | ✅ (3 high-severity npm audit findings — see §5.3) |
| `npx prisma migrate deploy` | ✅ both migrations applied cleanly |
| `npm run seed` | ✅ (after 1.1 fix) — 8 named demo candidates + filler "Prior Candidate" rows for load-balancing padding |
| `npm test` | ✅ **85/85 passed**, re-run against the real engine after fixing 1.2 |
| `node scripts/verify.mjs` | ✅ all 8 seeded scenarios return sane status/slots/assignee data |
| `node scripts/concurrency-test.mjs` | ✅ **PASS** — two concurrent cross-request bookings for the same interviewer/slot: exactly one `200 BOOKED`, one `409 ALREADY_BOOKED` |

---

## 4. Manual UI / API walkthrough results

| Scenario | Steps taken | Result |
|---|---|---|
| Staff login | Logged in as `jordan@example.com` (ADMIN) | ✅ dashboard loads, pipeline counts correct |
| Load-balancing / pool selection (Maya Iyer) | Opened request detail, inspected pool reasoning, ranked slots | ✅ correct exclusion logic (§2.2), correct per-slot assignment (§2.1) |
| Staff-side booking | Booked Maya's rank #1 slot from the UI | ✅ status → `SCHEDULED`, Priya Sharma assigned as `PENDING`, 2 mock notification emails recorded (to Priya, to Maya) |
| Interviewer console | Logged in as `priya@example.com` | ✅ correctly scoped to only her 3 assignments |
| Interviewer decline → same-time replacement (Sophia Reddy) | Declined Priya's `ACCEPTED` assignment for Sophia | ✅ **exact spec match**: same time slot kept (`09:30:00.000Z` → `09:30:00.000Z`, unchanged), Rahul Verma auto-assigned with `reason: "Same-time replacement"`, candidate got a soft "A small update to your interview" email (not a full reschedule notice), Rahul got a normal "interview scheduled" email |
| Cancellation (Chloe Fernandes) | Cancelled via `/api/requests/:id/cancel` | ✅ status → `CANCELLED`, `booking` cleared |
| **Cross-request lock release on cancel** | Queried `InterviewerTimeLock` table directly after Chloe's cancellation | ✅ **zero rows remained** for that interviewer at that time — confirms docs/13's "delete locks in the same transaction as the status change" requirement is actually implemented, not just specced |

Demo data was reseeded back to a clean state after testing (booking/decline/cancel actions mutate the DB).

---

## 5. Open items / recommended changes

### 5.1 Add `"postinstall": "prisma generate"` to `package.json`
See §1.1. Low effort, prevents a guaranteed onboarding failure for the next person who clones after any future migration.

### 5.2 Double-check `USE_ENGINE_STUB` before any demo/judging session
See §1.2. Suggest a visible indicator somewhere in the staff UI (even just a small "engine: real" / "engine: stub" badge, dev-mode only) so nobody can accidentally demo on stub data without noticing — the stub's output is plausible enough to not look obviously wrong.

### 5.3 `npm audit` — 3 high-severity findings
All three trace to `deepmerge-ts` via `@prisma/config` → `prisma` (the Prisma **CLI** dev dependency, not the runtime `@prisma/client`). Not exploitable in the shipped app (it's a devDependency, never runs in the deployed/demoed server), but `npm audit fix --force` would bump `prisma` to `6.12.0`, a breaking change worth testing in isolation before applying — same caution as the earlier `vitest` upgrade. Recommend: leave as-is for the hackathon deadline, revisit post-submission.

### 5.4 `.env` drift vs `.env.example`
See §1.3. Worth a one-line team reminder: re-diff your local `.env` against `.env.example` after pulling, since new Google-mode vars have been added twice now across recent commits.

### 5.5 Two ambiguous OAuth client ID/secret pairs supplied for Google setup
During Google credential setup, two separate Client ID / Client Secret pairs were provided, labeled "developer" and "candidate"/"user." **This app's architecture only has one OAuth client slot** (`GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — single "master account" design per docs/02). Used the pairing labeled "(dev)" since it matched the developer Client ID. The second pair is currently unused. If there was an intended reason for two separate Google Cloud OAuth clients, that needs to be reconciled with the single-client design before Google mode is turned on — otherwise it's dead configuration nobody will remember the purpose of.

### 5.6 Credential hygiene flag
Real-looking Google API keys and an OAuth Client Secret were pasted directly into chat during this session. They were used (per explicit instruction) but you should treat anything pasted in a chat transcript as potentially logged/retained — worth rotating these in Google Cloud Console once Google mode is fully verified working, purely as good hygiene, independent of whether anything actually leaked.

### 5.7 Google mode — not yet verified (blocked on user action, not code)
Everything through `scripts/mint-google-token.mjs` (Step 5 in the setup script) requires the account owner's own browser session and consent click — this cannot be done by an agent. Once `GOOGLE_REFRESH_TOKEN` is minted and pasted into `.env`, remaining steps (create 5 calendars, seed them, flip `PROVIDER_MODE=google`, re-verify) are ready to run immediately — `.env` already has `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_REDIRECT_URI` filled in correctly.

---

## 6. Summary

Core product — scheduling engine, pool-based assignment, timezone/buffer handling, staff UI, candidate UI, interviewer decline/replacement flow, cancellation, and the cross-request double-booking guard — all verified working correctly against real data, not just passing unit tests. Two real environment-setup bugs were found and fixed (Prisma Client staleness, stub-engine flag). Nothing found in this pass blocks a demo running in mock mode today. The only remaining work is the Google OAuth consent step, which is a manual action for whoever owns the Google account, not a code change.
