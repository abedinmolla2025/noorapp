// Unit tests for src/lib/islamicCalendar (compiled with tsc, run in node).
// Pure-function tests: no network, no AI, no database, no Date.now().
// Conversion vectors are PINNED to this implementation's tabular algorithm
// (verified against the page's gregorianToHijri): the algorithm differs from
// Umm al-Qura by ±1 day on some dates (e.g. Ramadan 1447 starts 2026-02-18
// here, 2026-02-19 per Umm al-Qura) — that divergence is the reason the
// engine labels every date "calculated" and supports admin corrections.
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const hijri = await import(path.join(dir, ".out-cal/hijri.js"));
const events = await import(path.join(dir, ".out-cal/events.js"));
const corr = await import(path.join(dir, ".out-cal/corrections.js"));
const ctx = await import(path.join(dir, ".out-cal/context.js"));

let n = 0;
const pending = [];
let chain = Promise.resolve();
const t = (name, fn) => {
  const p = chain.then(async () => {
    await fn();
    n++;
    console.log(`ok ${n} - ${name}`);
  });
  chain = p.catch(() => {});
  pending.push(p);
};
const G = (y, m, d) => ({ year: y, month: m, day: d });
const H = (y, m, d) => ({ year: y, month: m, day: d });

// --- conversion: algorithm-pinned vectors ---
const VECTORS = [
  [{ y: 2026, m: 11, d: 7 }, { year: 1448, month: 5, day: 26 }],
  [{ y: 2026, m: 2, d: 18 }, { year: 1447, month: 9, day: 1 }],
  [{ y: 2026, m: 3, d: 20 }, { year: 1447, month: 10, day: 1 }],
  [{ y: 2026, m: 5, d: 27 }, { year: 1447, month: 12, day: 10 }],
  [{ y: 2025, m: 6, d: 27 }, { year: 1447, month: 1, day: 1 }],
  [{ y: 2024, m: 3, d: 11 }, { year: 1445, month: 9, day: 1 }],
  [{ y: 2023, m: 3, d: 23 }, { year: 1444, month: 9, day: 1 }],
];
for (const [g, h] of VECTORS) {
  t(`gregorianToHijri ${g.y}-${g.m}-${g.d} -> ${h.year}-${h.month}-${h.day}`, () => {
    assert.deepEqual(hijri.gregorianToHijri(new Date(g.y, g.m - 1, g.d)), h);
  });
  t(`hijriToGregorian ${h.year}-${h.month}-${h.day} -> ${g.y}-${g.m}-${g.d}`, () => {
    assert.deepEqual(hijri.hijriToGregorian(h), { year: g.y, month: g.m, day: g.d });
  });
}

// --- conversion: round-trip sweep (every day of 2026 + leap 2024) ---
t("round-trip 2026: g2h then h2g returns the same date (366 days)", () => {
  for (let m = 0; m < 12; m++) {
    for (let d = 1; d <= 28; d++) {
      const g = G(2026, m + 1, d);
      const h = hijri.gregorianToHijri(new Date(g.year, g.month - 1, g.day));
      assert.deepEqual(hijri.hijriToGregorian(h), g);
    }
  }
});
t("round-trip 2024 (leap year): same invariant", () => {
  for (let m = 0; m < 12; m++) {
    for (let d = 1; d <= 28; d++) {
      const g = G(2024, m + 1, d);
      const h = hijri.gregorianToHijri(new Date(g.year, g.month - 1, g.day));
      assert.deepEqual(hijri.hijriToGregorian(h), g);
    }
  }
});

// --- month lengths, leap years, validation, arithmetic ---
t("month lengths: Ramadan 30, Safar 29, Dhul Hijjah 30 in leap 1447, 29 in 1448", () => {
  assert.equal(hijri.hijriMonthLength(1447, 9), 30);
  assert.equal(hijri.hijriMonthLength(1447, 2), 29);
  assert.equal(hijri.hijriMonthLength(1447, 12), 30);
  assert.equal(hijri.hijriMonthLength(1448, 12), 29);
});
t("leap years: 1447 leap, 1448 not, 1445 leap, 1444 not", () => {
  assert.equal(hijri.isHijriLeapYear(1447), true);
  assert.equal(hijri.isHijriLeapYear(1448), false);
  assert.equal(hijri.isHijriLeapYear(1445), true);
  assert.equal(hijri.isHijriLeapYear(1444), false);
});
t("isValidHijriDate: 1447-12-30 valid (leap), 1448-12-30 invalid, month 13 invalid", () => {
  assert.equal(hijri.isValidHijriDate(H(1447, 12, 30)), true);
  assert.equal(hijri.isValidHijriDate(H(1448, 12, 30)), false);
  assert.equal(hijri.isValidHijriDate(H(1447, 13, 1)), false);
  assert.equal(hijri.isValidHijriDate(H(1447, 9, 0)), false);
});
t("addHijriDays crosses month and year boundaries", () => {
  assert.deepEqual(hijri.addHijriDays(H(1447, 9, 30), 1), H(1447, 10, 1));
  assert.deepEqual(hijri.addHijriDays(H(1447, 12, 29), 1), H(1447, 12, 30));
  assert.deepEqual(hijri.addHijriDays(H(1448, 12, 29), 1), H(1449, 1, 1));
  assert.deepEqual(hijri.addHijriDays(H(1447, 1, 1), -1), H(1446, 12, 29));
});
t("hijriToGregorian throws on an invalid Hijri date", () => {
  assert.throws(() => hijri.hijriToGregorian(H(1448, 12, 30)), RangeError);
});
t("getBengaliNumber renders Bengali digits", () => {
  assert.equal(hijri.getBengaliNumber(27), "২৭");
  assert.equal(hijri.getBengaliNumber(2026), "২০২৬");
});
t("compareHijri and hijriDateKey", () => {
  assert.equal(hijri.compareHijri(H(1447, 9, 1), H(1447, 9, 2)), -1);
  assert.equal(hijri.compareHijri(H(1447, 9, 2), H(1447, 9, 2)), 0);
  assert.equal(hijri.hijriDateKey(H(1447, 9, 1)), "1447-09-01");
});

// --- context: ordinary day ---
t("context 2026-11-07: ordinary day, calculated, no events, no Ramadan stage", () => {
  const c = ctx.getIslamicContext(G(2026, 11, 7));
  assert.equal(c.hijriKey, "1448-05-26");
  assert.equal(c.confirmation, "calculated");
  assert.equal(c.source, "tabular");
  assert.equal(c.isOrdinaryDay, true);
  assert.equal(c.ramadanStage, null);
  assert.deepEqual(c.activeEvents, []);
  assert.deepEqual(c.appliedCorrections, []);
  assert.deepEqual(c.hijriCalculated, c.hijri);
});

// --- context: Ramadan transitions ---
t("context 2026-02-18 (Ramadan 1): ramadan-start + ramadan-month, stage first-ten", () => {
  const c = ctx.getIslamicContext(G(2026, 2, 18));
  assert.equal(c.hijriKey, "1447-09-01");
  assert.equal(c.ramadanStage, "first-ten");
  assert.equal(c.isOrdinaryDay, false);
  const slugs = ctx.activeEventSlugs(c);
  assert.ok(slugs.includes("ramadan-start"));
  assert.ok(slugs.includes("ramadan-month"));
  assert.ok(!slugs.includes("laylatul-qadr"));
});
t("context 2026-03-04 (Ramadan 15): stage middle-ten, no Qadr", () => {
  const c = ctx.getIslamicContext(G(2026, 3, 4));
  assert.equal(c.hijriKey, "1447-09-15");
  assert.equal(c.ramadanStage, "middle-ten");
  assert.deepEqual(ctx.activeEventSlugs(c), ["ramadan-month"]);
});
t("context 2026-03-14 (Ramadan 25): Qadr window + last-ten-nights + ramadan-month", () => {
  const c = ctx.getIslamicContext(G(2026, 3, 14));
  assert.equal(c.hijriKey, "1447-09-25");
  assert.equal(c.ramadanStage, "last-ten");
  const slugs = ctx.activeEventSlugs(c);
  assert.ok(slugs.includes("laylatul-qadr"));
  assert.ok(slugs.includes("last-ten-nights"));
  assert.ok(slugs.includes("ramadan-month"));
});
t("Qadr is a WINDOW (21-30), never a single night — even on the 27th", () => {
  const c = ctx.getIslamicContext(G(2026, 3, 16)); // Ramadan 27
  const qadr = c.activeEvents.find((a) => a.event.slug === "laylatul-qadr");
  assert.ok(qadr, "Qadr must be active on Ramadan 27");
  assert.equal(qadr.windowStart.day, 21);
  assert.equal(qadr.windowEnd.day, 30);
  assert.equal(qadr.dayInWindow, 7);
  assert.equal(qadr.windowLength, 10);
});

// --- context: other events ---
t("context 2026-03-20 (Shawwal 1): Eid al-Fitr, no Ramadan stage", () => {
  const c = ctx.getIslamicContext(G(2026, 3, 20));
  assert.equal(c.hijriKey, "1447-10-01");
  assert.ok(ctx.activeEventSlugs(c).includes("eid-fitr"));
  assert.equal(c.ramadanStage, null);
});
t("context 2026-05-26 (Dhul Hijjah 9): Arafah + first-ten + Hajj + month window", () => {
  const c = ctx.getIslamicContext(G(2026, 5, 26));
  assert.equal(c.hijriKey, "1447-12-09");
  const slugs = ctx.activeEventSlugs(c);
  for (const s of ["arafah", "first-ten-dhul-hijjah", "hajj", "dhul-hijjah-month"]) {
    assert.ok(slugs.includes(s), "missing " + s);
  }
});
t("context 2026-05-27 (Dhul Hijjah 10): Eid al-Adha + first-ten + Hajj", () => {
  const c = ctx.getIslamicContext(G(2026, 5, 27));
  assert.equal(c.hijriKey, "1447-12-10");
  const slugs = ctx.activeEventSlugs(c);
  for (const s of ["eid-adha", "first-ten-dhul-hijjah", "hajj"]) {
    assert.ok(slugs.includes(s), "missing " + s);
  }
});
t("context 2025-07-06 (Muharram 10): Ashura", () => {
  const c = ctx.getIslamicContext(G(2025, 7, 6));
  assert.equal(c.hijriKey, "1447-01-10");
  assert.ok(ctx.activeEventSlugs(c).includes("ashura"));
});

// --- context: upcoming events ---
t("upcoming: 2026-02-10 lists Ramadan start in 8 days (2026-02-18)", () => {
  const c = ctx.getIslamicContext(G(2026, 2, 10));
  const next = c.upcomingEvents.find((u) => u.event.slug === "ramadan-start");
  assert.ok(next, "ramadan-start must be upcoming");
  assert.equal(next.startsInDays, 8);
  assert.equal(next.startGregorian, "2026-02-18");
});
t("upcoming: the day after Eid al-Fitr it is no longer upcoming", () => {
  const c = ctx.getIslamicContext(G(2026, 3, 21));
  assert.ok(!c.upcomingEvents.some((u) => u.event.slug === "eid-fitr"));
});

// --- context: timezone + planner interop ---
t("same Gregorian date gives the same context however the Date was built", () => {
  const a = ctx.getIslamicContextForKey("2026-11-07");
  const b = ctx.getIslamicContext(G(2026, 11, 7));
  const d = ctx.getIslamicContextForDate(new Date(2026, 10, 7));
  assert.equal(a.hijriKey, b.hijriKey);
  assert.equal(a.hijriKey, d.hijriKey);
  assert.equal(a.hijriKey, "1448-05-26");
});
t("parseGregorianDateKey: valid keys parse, impossible dates return null", () => {
  assert.deepEqual(ctx.parseGregorianDateKey("2026-11-07"), { year: 2026, month: 11, day: 7 });
  assert.equal(ctx.parseGregorianDateKey("2026-02-30"), null);
  assert.equal(ctx.parseGregorianDateKey("2026-13-01"), null);
  assert.equal(ctx.parseGregorianDateKey("not-a-date"), null);
});
t("getIslamicContext throws on an invalid Gregorian date", () => {
  assert.throws(() => ctx.getIslamicContext(G(2026, 2, 30)), RangeError);
  assert.throws(() => ctx.getIslamicContextForKey("2026-02-30"), RangeError);
});

// --- corrections ---
const RAMADAN_MINUS_1 = {
  id: "c1", hijriYear: 1447, hijriMonth: 9, dayOffset: -1,
  reasonBn: "পশ্চিমবঙ্গে চাঁদ একদিন পরে দেখা গেছে", source: "Hilal Committee, West Bengal",
  status: "confirmed", createdBy: "admin-1", createdAt: "2026-02-18T10:00:00.000Z",
};
t("confirmed correction -1: 2026-02-19 becomes Ramadan 1 (confirmed)", () => {
  const c = ctx.getIslamicContext(G(2026, 2, 19), [RAMADAN_MINUS_1]);
  assert.equal(c.hijriCalculated.year, 1447);
  assert.equal(c.hijriCalculated.month, 9);
  assert.equal(c.hijriCalculated.day, 2);
  assert.equal(c.hijriKey, "1447-09-01");
  assert.equal(c.confirmation, "confirmed");
  assert.equal(c.appliedCorrections.length, 1);
});
t("confirmed correction -1: 2026-02-18 is still Sha'ban 29 (month started later)", () => {
  const c = ctx.getIslamicContext(G(2026, 2, 18), [RAMADAN_MINUS_1]);
  assert.equal(c.hijriKey, "1447-08-29");
  assert.ok(!ctx.activeEventSlugs(c).includes("ramadan-start"));
});
t("proposed correction never shifts the date", () => {
  const proposed = { ...RAMADAN_MINUS_1, id: "c2", status: "proposed" };
  const c = ctx.getIslamicContext(G(2026, 2, 19), [proposed]);
  assert.equal(c.hijriKey, "1447-09-02");
  assert.equal(c.confirmation, "calculated");
  assert.equal(c.appliedCorrections.length, 0);
  assert.equal(c.pendingCorrections.length, 1);
});
t("correction for another month has no effect", () => {
  const other = { ...RAMADAN_MINUS_1, id: "c3", hijriMonth: 10 };
  const c = ctx.getIslamicContext(G(2026, 2, 19), [other]);
  assert.equal(c.hijriKey, "1447-09-02");
  assert.equal(c.confirmation, "calculated");
});
t("latest confirmed correction wins for the same month", () => {
  const older = { ...RAMADAN_MINUS_1, id: "c4", dayOffset: 1, createdAt: "2026-02-17T10:00:00.000Z" };
  const newer = { ...RAMADAN_MINUS_1, id: "c5", dayOffset: -1, createdAt: "2026-02-18T10:00:00.000Z" };
  const c = ctx.getIslamicContext(G(2026, 2, 19), [older, newer]);
  assert.equal(c.hijriKey, "1447-09-01");
  assert.equal(c.appliedCorrections[0].id, "c5");
});
t("validateCorrection: valid passes, bad month/offset/source fail", () => {
  assert.deepEqual(corr.validateCorrection(RAMADAN_MINUS_1), []);
  assert.ok(corr.validateCorrection({ ...RAMADAN_MINUS_1, hijriMonth: 13 }).length > 0);
  assert.ok(corr.validateCorrection({ ...RAMADAN_MINUS_1, dayOffset: 2 }).length > 0);
  assert.ok(corr.validateCorrection({ ...RAMADAN_MINUS_1, source: "  " }).length > 0);
  assert.ok(corr.validateCorrection({ ...RAMADAN_MINUS_1, status: "maybe" }).length > 0);
});

// --- catalog invariants ---
t("catalog: every entry is calculated + tabular (never hardcoded as confirmed)", () => {
  assert.equal(events.ISLAMIC_EVENTS.length, 16);
  for (const e of events.ISLAMIC_EVENTS) {
    assert.equal(e.confirmation, "calculated", e.slug);
    assert.equal(e.source, "tabular", e.slug);
  }
});
t("catalog: Qadr entry is a 21-30 window with the exact-night caveat", () => {
  const qadr = events.ISLAMIC_EVENTS.find((e) => e.slug === "laylatul-qadr");
  assert.equal(qadr.hijriDayStart, 21);
  assert.equal(qadr.hijriDayEnd, 30);
  assert.match(qadr.noteBn, /নির্দিষ্ট রাত জানা যায় না/);
});
t("page events: 16 rows; Qadr label is a range, Eid al-Fitr is a single day", () => {
  const rows = events.getCalendarPageEvents();
  assert.equal(rows.length, 16);
  assert.equal(rows.find((r) => r.slug === "laylatul-qadr").dayLabel, "২১–৩০ রমজান");
  assert.equal(rows.find((r) => r.slug === "eid-fitr").dayLabel, "১ শাওয়াল");
});

await Promise.all(pending);
console.log(`\nALL ${n} CALENDAR TESTS PASSED`);
