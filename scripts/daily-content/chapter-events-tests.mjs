// Chapter -> event mapping tests (Phase 6).
// Imports the compiled mapping (.out/chapterEvents.js) and the compiled
// Phase 4 catalog (.out-cal/events.js). Run via scripts/daily-content/run.sh.
// Conventions match tests.mjs: sequential `t` chain, plain assertions.

import { CHAPTER_EVENT_MAP, EVENTS_WITHOUT_CHAPTERS, chaptersForEvents, eventsForChapter } from "./.out/chapterEvents.js";
import { ISLAMIC_EVENTS } from "./.out-cal/events.js";

let passed = 0;
let failed = 0;
const failures = [];
let chain = Promise.resolve();
function t(name, fn) {
  chain = chain.then(async () => {
    try {
      await fn();
      passed++;
      console.log(`  ok ${name}`);
    } catch (e) {
      failed++;
      failures.push(name);
      console.log(`  FAIL ${name}: ${e.message}`);
    }
  });
}
function eq(actual, expected, label) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${label}: expected ${e}, got ${a}`);
}
function ok(cond, label) {
  if (!cond) throw new Error(label);
}

const catalogSlugs = new Set(ISLAMIC_EVENTS.map((e) => e.slug));

t("9 mapped chapters, ids unique, all 1-97", () => {
  eq(CHAPTER_EVENT_MAP.length, 9, "map size");
  const ids = CHAPTER_EVENT_MAP.map((m) => m.chapterId);
  eq(new Set(ids).size, ids.length, "unique ids");
  for (const id of ids) ok(Number.isInteger(id) && id >= 1 && id <= 97, `chapter ${id} in 1-97`);
});

t("every mapped event slug exists in the Phase 4 catalog", () => {
  for (const m of CHAPTER_EVENT_MAP) {
    for (const slug of m.events) ok(catalogSlugs.has(slug), `chapter ${m.chapterId}: unknown slug ${slug}`);
  }
});

t("pinned titles (canonical English, reconstruction CSV)", () => {
  const byId = new Map(CHAPTER_EVENT_MAP.map((m) => [m.chapterId, m.chapterTitleEn]));
  eq(byId.get(13), "The Two Festivals (Eids)", "13 title");
  eq(byId.get(25), "Hajj (Pilgrimage)", "25 title");
  eq(byId.get(27), "Pilgrims Prevented from Completing the Pilgrimage", "27 title");
  eq(byId.get(28), "Penalty of Hunting while on Pilgrimage", "28 title");
  eq(byId.get(30), "Fasting", "30 title");
  eq(byId.get(31), "Praying at Night in Ramadaan (Taraweeh)", "31 title");
  eq(byId.get(32), "Virtues of the Night of Qadr", "32 title");
  eq(byId.get(33), "Retiring to a Mosque for Remembrance of Allah (I'tikaf)", "33 title");
  eq(byId.get(73), "Al-Adha Festival Sacrifice (Adaahi)", "73 title");
});

t("pinned mappings", () => {
  const byId = new Map(CHAPTER_EVENT_MAP.map((m) => [m.chapterId, [...m.events].sort()]));
  eq(byId.get(13), ["eid-adha", "eid-fitr"], "13 events");
  eq(byId.get(25), ["arafah", "dhul-hijjah-month", "eid-adha", "first-ten-dhul-hijjah", "hajj"], "25 events");
  eq(byId.get(30), ["ashura", "last-ten-nights", "ramadan-month", "ramadan-start"], "30 events");
  eq(byId.get(32), ["last-ten-nights", "laylatul-qadr"], "32 events");
  eq(byId.get(73), ["eid-adha"], "73 events");
});

t("every mapping entry carries non-empty evidence", () => {
  for (const m of CHAPTER_EVENT_MAP) {
    ok(typeof m.evidence === "string" && m.evidence.trim().length > 0, `chapter ${m.chapterId} evidence`);
  }
});

t("chaptersForEvents: union, deduped, sorted", () => {
  eq(chaptersForEvents(["ramadan-month"]), [30, 31, 33], "ramadan-month");
  eq(chaptersForEvents(["eid-adha"]), [13, 25, 73], "eid-adha");
  eq(chaptersForEvents(["ramadan-month", "last-ten-nights"]), [30, 31, 32, 33], "ramadan + last-ten");
  eq(chaptersForEvents(["ashura"]), [30], "ashura");
  eq(chaptersForEvents(["hajj"]), [25, 27, 28], "hajj");
  eq(chaptersForEvents([]), [], "empty");
  eq(chaptersForEvents(["miraj"]), [], "unmapped event");
});

t("eventsForChapter: mapped vs unmapped", () => {
  eq(eventsForChapter(30).sort(), ["ashura", "last-ten-nights", "ramadan-month", "ramadan-start"], "30");
  eq(eventsForChapter(1), [], "1 unmapped");
  eq(eventsForChapter(60), [], "60 unmapped (Prophets is not Mawlid-specific)");
  eq(eventsForChapter(99), [], "99 out of range");
});

t("catalog coverage: every event is mapped or explicitly unmapped (16 total)", () => {
  const mapped = new Set(CHAPTER_EVENT_MAP.flatMap((m) => m.events));
  const unmapped = new Set(EVENTS_WITHOUT_CHAPTERS);
  eq(EVENTS_WITHOUT_CHAPTERS.length, 5, "unmapped count");
  eq([...EVENTS_WITHOUT_CHAPTERS].sort(), ["islamic-new-year", "mawlid", "miraj", "rabi-ul-awwal-month", "shabe-barat"], "unmapped list");
  for (const slug of mapped) ok(!unmapped.has(slug), `${slug} is both mapped and unmapped`);
  eq(mapped.size + unmapped.size, 16, "mapped + unmapped = 16 catalog events");
  eq(new Set([...mapped, ...unmapped]).size, 16, "no overlap, full coverage");
  for (const slug of catalogSlugs) {
    ok(mapped.has(slug) || unmapped.has(slug), `${slug} is neither mapped nor listed unmapped`);
  }
});

await chain;
console.log(`\nchapter-events tests: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log(`failed: ${failures.join(", ")}`);
  process.exit(1);
}
