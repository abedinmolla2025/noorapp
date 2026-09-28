// test-p0-7-p0-8-quiz.mjs
// P0-7 / P0-8 REGRESSION TESTS — quiz answer-key integrity + duplicate canonicalization.
//
// P0-7 (answer-key integrity):
//   1. Safeguards file schema: every entry is a valid UUID, action in
//      {correct, suppress}, "correct" entries carry an integer
//      effective_correct_answer + non-empty expected_text, every entry has a
//      reason and evidence pointer.
//   2. Pure-logic: stored-key sanity (key must match one of the options);
//      acceptedAnswer consistency (asserted text must equal the effective
//      option text); "correct" applies only on expected-text match
//      (fail-closed => suppress on mismatch/drift).
//   3. Cross-file: every safeguard id appears in the NEEDS-REVIEW manifest.
// P0-8 (duplicate canonicalization):
//   4. Canonical mapping unit tests: every duplicate slug resolves to its
//      primary; primaries self-canonical; no self-mappings; UUIDs valid.
//   5. Invariant guards: trio third members (79b5109a, dbaf94d7) and every
//      excluded_needs_review pair member are NOT keys in the map — the
//      textual correct-answer safety invariant forbids their consolidation.
//   6. HUMAN-DECISION manifest exists with the required columns and covers
//      both trio pairs.
//
// Pure Node (type-stripping import of src TS). Exits non-zero on any failure.

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const sg = await import("../src/lib/quizAnswerSafeguard.ts");
const {
  getEffectiveAnswerIndex,
  shouldSuppressAcceptedAnswer,
  getAcceptedAnswerText,
  isStoredKeyValid,
  SUPPRESS_INDEX,
} = sg;

const safeguardsDoc = JSON.parse(
  readFileSync(join(ROOT, "src", "data", "quiz-answer-safeguards.json"), "utf8"),
);
const canonicalsDoc = JSON.parse(
  readFileSync(join(ROOT, "src", "data", "quiz-duplicate-canonicals.json"), "utf8"),
);

let pass = 0;
let fail = 0;
function check(name, cond) {
  if (cond) { pass++; }
  else { fail++; console.error(`FAIL: ${name}`); }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ── P0-7.1: safeguards file schema ───────────────────────────────────────────
const records = safeguardsDoc.records;
check("safeguards has records object", records && typeof records === "object" && !Array.isArray(records));
const ids = Object.keys(records || {});
check("safeguards covers 11 flagged records", ids.length === 11);
for (const id of ids) {
  const e = records[id];
  check(`safeguard ${id.slice(0, 8)}: valid UUID`, UUID.test(id));
  check(`safeguard ${id.slice(0, 8)}: action in {correct,suppress}`, e.action === "correct" || e.action === "suppress");
  check(`safeguard ${id.slice(0, 8)}: has reason`, typeof e.reason === "string" && e.reason.length > 20);
  check(`safeguard ${id.slice(0, 8)}: has evidence`, typeof e.evidence === "string" && e.evidence.length > 5);
  check(`safeguard ${id.slice(0, 8)}: has db_fix_needed`, typeof e.db_fix_needed === "string" && e.db_fix_needed.length > 10);
  if (e.action === "correct") {
    check(`safeguard ${id.slice(0, 8)}: effective_correct_answer is integer`, Number.isInteger(e.effective_correct_answer) && e.effective_correct_answer >= 0);
    check(`safeguard ${id.slice(0, 8)}: expected_text non-empty`, Array.isArray(e.expected_text) && e.expected_text.length > 0 && e.expected_text.every((t) => typeof t === "string" && t.trim()));
  }
}
const corrected = ids.filter((id) => records[id].action === "correct");
check("exactly one 'correct' record (9322e182)", corrected.length === 1 && corrected[0].startsWith("9322e182"));

// ── P0-7.2: pure logic — stored-key sanity + acceptedAnswer consistency ──────
const fixtureProphets = {
  id: "9322e182-0aaa-4fee-8907-753bcc5a1970",
  correct_answer: 0,
  options_bn: ["২০", "২৫", "৩০", "৩৫"],
  options_en: ["20", "25", "30", "35"],
};
check("stored key valid when in range", isStoredKeyValid(fixtureProphets) === true);
check("stored key invalid when out of range", isStoredKeyValid({ ...fixtureProphets, correct_answer: 9 }) === false);
check("stored key invalid when null", isStoredKeyValid({ ...fixtureProphets, correct_answer: null }) === false);
check("stored key invalid when option empty", isStoredKeyValid({ ...fixtureProphets, options_bn: ["২০", "", "৩০", "৩৫"], correct_answer: 1 }) === false);

// "correct" applies: effective index 1, acceptedAnswer equals the option text.
check("9322e182 resolves to effective index 1", getEffectiveAnswerIndex(fixtureProphets, safeguardsDoc) === 1);
const accepted = getAcceptedAnswerText(fixtureProphets, safeguardsDoc);
check("9322e182 acceptedAnswer equals effective option text", accepted === "২৫ / 25");
check("9322e182 acceptedAnswer is not the stored wrong key", !accepted.includes("২০"));

// Fail-closed: option text drifted (evidence stale) => suppress, never assert.
const drifted = { ...fixtureProphets, options_bn: ["২০", "পঁচিশ", "৩০", "৩৫"] };
check("drifted option text fails closed to suppress", getEffectiveAnswerIndex(drifted, safeguardsDoc) === SUPPRESS_INDEX);
check("drifted record asserts no answer", getAcceptedAnswerText(drifted, safeguardsDoc) === "");

// "suppress" action: no acceptedAnswer, whatever the stored key.
const fixtureMinarets = {
  id: "1e8646d1-2c68-404c-b7ae-04daf388ea19",
  correct_answer: 1,
  options_bn: ["৭", "৯", "১১", "১৩"],
  options_en: ["7", "9", "11", "13"],
};
check("1e8646d1 suppressed", shouldSuppressAcceptedAnswer(fixtureMinarets, safeguardsDoc) === true);
check("1e8646d1 asserts no answer", getAcceptedAnswerText(fixtureMinarets, safeguardsDoc) === "");

// No safeguard: stored key used; invalid stored key still suppresses.
const plain = { id: "00000000-0000-0000-0000-000000000000", correct_answer: 2, options_bn: ["a", "b", "c"] };
check("unsafeguarded record uses stored key", getEffectiveAnswerIndex(plain, safeguardsDoc) === 2);
check("unsafeguarded acceptedAnswer equals key text", getAcceptedAnswerText(plain, safeguardsDoc) === "c");
const plainBad = { ...plain, correct_answer: 7 };
check("unsafeguarded bad key suppresses (key must match an option)", getEffectiveAnswerIndex(plainBad, safeguardsDoc) === SUPPRESS_INDEX);

// Missing file => no safeguards => render as stored (fail-safe, mirrors the
// canonical map's "missing file => self-canonical" precedent). Per-record
// problems (bad action, text mismatch) fail closed to suppress instead.
check("null doc fails safe to stored key", getEffectiveAnswerIndex(fixtureProphets, null) === 0);
check("empty doc: no entry => stored key (sanity only)", getEffectiveAnswerIndex(plain, { records: {} }) === 2);

// ── P0-7.3: manifest cross-check ─────────────────────────────────────────────
const manifestPath = join(ROOT, "research", "forensic", "P0-7-answer-key-NEEDS-REVIEW.csv");
check("P0-7 NEEDS-REVIEW manifest exists", existsSync(manifestPath));
if (existsSync(manifestPath)) {
  const manifest = readFileSync(manifestPath, "utf8");
  for (const id of ids) {
    check(`manifest covers safeguard ${id.slice(0, 8)}`, manifest.includes(id));
  }
  check("manifest logs the render-corrected record", manifest.includes("CORRECT at render"));
  check("manifest logs suppressions", manifest.includes("SUPPRESS acceptedAnswer at render"));
}

// ── P0-8.4: canonical mapping unit tests ─────────────────────────────────────
const map = canonicalsDoc.map || {};
const mapKeys = Object.keys(map);
const getQuizCanonicalId = (id) => (typeof map[id] === "string" && map[id] ? map[id] : id);
check("canonical map has 31 mappings", mapKeys.length === 31);
const primaries = new Set(Object.values(map));
for (const dup of mapKeys) {
  const primary = map[dup];
  check(`dup ${dup.slice(0, 8)} resolves to its primary`, getQuizCanonicalId(dup) === primary);
  check(`dup ${dup.slice(0, 8)} is a valid UUID`, UUID.test(dup));
  check(`primary ${String(primary).slice(0, 8)} is a valid UUID`, UUID.test(primary));
  check(`no self-mapping for ${dup.slice(0, 8)}`, dup !== primary);
}
for (const primary of primaries) {
  check(`primary ${primary.slice(0, 8)} self-canonical`, getQuizCanonicalId(primary) === primary);
}
check("no primary is itself a duplicate key (no chains)", [...primaries].every((p) => !mapKeys.includes(p)));

// ── P0-8.5: invariant guards — trio + excluded pairs NOT in the map ──────────
const TRIO_THIRD = [
  "79b5109a-17c7-4de2-a538-dee67e631215", // Al-Malik: answer "Sovereign King" vs primary "The Sovereign/King"
  "dbaf94d7-c956-476d-b04c-740b12bf98db", // Ar-Rahman: answer "Most Merciful" vs primary "The Most Merciful"
];
for (const id of TRIO_THIRD) {
  check(`trio third member ${id.slice(0, 8)} NOT in canonical map (invariant)`, !(id in map));
}
const excluded = canonicalsDoc.excluded_needs_review || [];
check("excluded_needs_review has 3 pairs", excluded.length === 3);
for (const { pair } of excluded) {
  for (const id of pair) {
    check(`excluded pair member ${id.slice(0, 8)} NOT in canonical map`, !(id in map));
  }
}

// ── P0-8.6: HUMAN-DECISION manifest ───────────────────────────────────────────
const trioPath = join(ROOT, "research", "forensic", "P0-8-trio-pairs-HUMAN-DECISION.csv");
check("P0-8 trio HUMAN-DECISION manifest exists", existsSync(trioPath));
if (existsSync(trioPath)) {
  const trio = readFileSync(trioPath, "utf8");
  const header = trio.split("\n")[0];
  for (const col of ["pair_group", "record_id", "question_en", "options_en", "correct_answer_text", "current_canonical_url", "proposed_canonical_url", "blocker_reason", "decision_required"]) {
    check(`trio manifest has column ${col}`, header.includes(col));
  }
  for (const id of [...TRIO_THIRD, "cb669489-b332-4da8-9558-a000f215471d", "7f596085-398f-4565-a6d8-42c37635fe1d"]) {
    check(`trio manifest covers ${id.slice(0, 8)}`, trio.includes(id));
  }
  check("trio manifest records the invariant blocker", trio.includes("Textual correct-answer safety invariant"));
}

console.log(`\nP0-7/P0-8 quiz regression tests: ${pass} passed, ${fail} failed.`);
process.exit(fail ? 1 : 0);
