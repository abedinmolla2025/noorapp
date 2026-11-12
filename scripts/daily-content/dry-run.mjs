// Dry-run: plan 4 consecutive days from the local fixture pool.
// PLANS ONLY. There is no send, publish, schedule or write-to-production
// code anywhere in this path — planDay is a pure function.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const out = await import(path.join(dir, ".out/plan.js"));
const sel = await import(path.join(dir, ".out/selection.js"));
const { planDay } = out;

const root = path.resolve(dir, "../..");
const fixture = JSON.parse(fs.readFileSync(path.join(dir, "fixture.json"), "utf8"));

let history = { hadithUsedRefs: [], hadithCycle: 1, cardUsedRefs: [], cardCycle: 1 };
const days = [];
const start = new Date("2026-11-03T00:30:00Z"); // 06:00 IST
for (let i = 0; i < 4; i++) {
  const at = new Date(start.getTime() + i * 24 * 3600_000);
  const kolkataDate = sel.kolkataDateString(at);
  const { plan, nextHistory, diagnostics } = planDay({
    kolkataDate,
    hadiths: [],
    contents: fixture.contents,
    history,
  });
  history = nextHistory;
  days.push({
    kolkataDate,
    hadith: plan.hadith,
    hadithEmptyReason: plan.hadithEmptyReason,
    cards: plan.cards.map((c) => ({
      kind: c.kind, recordRef: c.recordRef, title: c.title,
      sourceLine: c.sourceLine, canonicalLink: c.canonicalLink,
    })),
    push: plan.push,
    hadithCycle: plan.hadithCycle,
    cardCycle: plan.cardCycle,
    diagnostics,
  });
  console.log(`--- ${kolkataDate} ---`);
  console.log(`hadith: ${plan.hadith ? plan.hadith.sourceLine : "NONE — " + plan.hadithEmptyReason}`);
  console.log(`cards (${plan.cards.length}): ${plan.cards.map((c) => `${c.kind}:${c.recordRef}`).join(", ")}`);
  const dupes = new Set(plan.cards.map((c) => c.recordRef)).size !== plan.cards.length;
  console.log(`duplicate cards in day: ${dupes ? "YES (BUG)" : "no"}`);
  console.log(`push: ${plan.push ? plan.push.title : "none (no hadith)"}`);
  console.log(`eligible: ${diagnostics.contentEligible}/${diagnostics.contentPool} contents, ${diagnostics.hadithEligible}/${diagnostics.hadithPool} hadiths`);
}

// Cross-day no-repeat check for cards.
const allRefs = days.flatMap((d) => d.cards.map((c) => c.recordRef));
const crossDupes = allRefs.length !== new Set(allRefs).size;
console.log(`\ncross-day duplicate cards: ${crossDupes ? "YES (BUG)" : "no"} (${allRefs.length} card slots over 4 days)`);
console.log(`next run after last day: ${sel.nextDailyRunAt(new Date(start.getTime() + 4 * 24 * 3600_000))}`);

const report = { generatedAt: new Date().toISOString(), mode: "dry-run (plan only, no sends)", days, crossDayDuplicateCards: crossDupes };
fs.writeFileSync(path.join(dir, "dry-run-report.json"), JSON.stringify(report, null, 2) + "\n");
if (crossDupes) process.exit(1);
console.log("DRY-RUN OK");
