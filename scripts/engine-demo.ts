/**
 * Prints a believable end-to-end scheduling scenario with no UI, no DB, no server —
 * proof the engine works standalone. Run with: npm run demo
 *
 * Scenario mirrors seed candidate S2 (Maya Iyer) from docs/04_SEED_DATA.md:
 * Technical/Java round, Alex Rivera qualified but at his daily cap, Priya Sharma
 * and Rahul Verma also qualified — load balancing should prefer whichever of
 * those two carries less load.
 */
import { pickPanel } from "../lib/selection";
import { generateSlots } from "../lib/scheduler";
import { EngineConfig, EngineParticipant, SelectionCandidate, SelectionInput } from "../lib/contracts";
import { formatLocal } from "../lib/tz";

function line() {
  console.log("─".repeat(72));
}

console.log("SIRA Scheduling Engine — standalone demo\n");

// ── 1. Interviewer selection (#18 + #20) ──
line();
console.log("STEP 1 — Interviewer selection for a Technical/Java round\n");

const requestWindow = { start: "2026-03-09T00:00:00.000Z", end: "2026-03-13T00:00:00.000Z" }; // Mon-Fri

const pool: SelectionCandidate[] = [
  { id: "alex", name: "Alex Rivera", timezone: "America/New_York", labels: ["TECHNICAL", "MANAGERIAL"], skills: ["Java", "Backend", "Go"], dailyLimit: 2, currentLoad: 2, availability: [], busy: [] },
  { id: "priya", name: "Priya Sharma", timezone: "Asia/Kolkata", labels: ["TECHNICAL"], skills: ["Java", "Backend", "React"], dailyLimit: 3, currentLoad: 0, availability: [], busy: [] },
  { id: "rahul", name: "Rahul Verma", timezone: "Asia/Kolkata", labels: ["TECHNICAL"], skills: ["Java", "Backend"], dailyLimit: 3, currentLoad: 1, availability: [], busy: [] },
  { id: "ananya", name: "Ananya Patel", timezone: "Asia/Kolkata", labels: ["HR"], skills: ["Behavioral", "Policy"], dailyLimit: 3, currentLoad: 0, availability: [], busy: [] },
];

const selectionInput: SelectionInput = {
  roundType: "TECHNICAL",
  requiredSkills: ["Java", "Backend"],
  panelSize: 1,
  window: requestWindow,
  durationMin: 60,
};

const selection = pickPanel(selectionInput, pool);

console.log("Selected:");
for (const s of selection.selected) console.log(`  ✅ ${s.name} — ${s.reason}`);
console.log("\nExcluded:");
for (const r of selection.rejected) console.log(`  ✖︎ ${r.name} — ${r.reason}`);
if (selection.insufficient) console.log("\n⚠️  Not enough eligible interviewers for the requested panel size.");

// ── 2. Slot generation + ranking (#5, #6, #7, #8, #16) ──
line();
console.log("\nSTEP 2 — Slot generation for Maya Iyer (Asia/Kolkata) x the selected interviewer\n");

const chosenInterviewerId = selection.selected[0]?.id ?? "priya";
const chosenInterviewer = pool.find((p) => p.id === chosenInterviewerId)!;

const candidateWindow = { start: "2026-03-09T04:00:00.000Z", end: "2026-03-10T08:00:00.000Z" }; // Mon-Tue, IST business hours

const config: EngineConfig = {
  durationMin: 60,
  bufferMin: 15,
  workingHoursStart: "09:00",
  workingHoursEnd: "18:00",
  window: candidateWindow,
  stepMin: 15,
};

const participants: EngineParticipant[] = [
  { id: "maya", name: "Maya Iyer", role: "candidate", timezone: "Asia/Kolkata", availability: [candidateWindow], busy: [] },
  {
    id: chosenInterviewer.id,
    name: chosenInterviewer.name,
    role: "interviewer",
    timezone: chosenInterviewer.timezone,
    availability: [],
    busy: [
      // A seeded lunch block, same shape as docs/04_SEED_DATA.md §2
      { start: "2026-03-09T06:30:00.000Z", end: "2026-03-09T07:30:00.000Z" }, // IST 12:00-13:00
    ],
    dailyLimit: chosenInterviewer.dailyLimit,
    existingBookings: [],
  },
];

const result = generateSlots(config, participants);

if (result.slots.length === 0) {
  console.log("No valid slots. Top reasons:");
  for (const r of result.rejections.slice(0, 5)) console.log(`  ✖︎ ${r.participantName}: ${r.reason} (${r.count} slot(s))`);
} else {
  console.log(`Found ${result.slots.length} valid slot(s), ranked:\n`);
  for (const slot of result.slots) {
    console.log(`  #${slot.rank}  ${formatLocal(slot.start, "Asia/Kolkata")}  (score ${slot.score})`);
    for (const reason of slot.reasons) console.log(`        ✓ ${reason}`);
  }
}

line();
console.log("\nDone. No database, no server, no UI — this is the whole deterministic core.\n");
