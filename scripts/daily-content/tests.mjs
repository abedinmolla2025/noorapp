// Unit tests for src/lib/dailyContent (compiled with tsc, run in node).
// SYNTHETIC LOGIC FIXTURES ONLY for hadith-shaped inputs: strings like
// "ARABIC-TEST" verify filtering/selection/clamping logic. They are never
// real hadith text, never rendered as content, never published.
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const elig = await import(path.join(dir, ".out/eligibility.js"));
const sel = await import(path.join(dir, ".out/selection.js"));
const cards = await import(path.join(dir, ".out/cards.js"));
const push = await import(path.join(dir, ".out/push.js"));
const deliv = await import(path.join(dir, ".out/delivery.js"));
const planMod = await import(path.join(dir, ".out/plan.js"));

let n = 0;
const t = (name, fn) => { fn(); n++; console.log(`ok ${n} - ${name}`); };
const H = (over = {}) => ({
  id: "h1", book_key: "bukhari", chapter_id: 1, hadith_number: 1,
  arabic: "ARABIC-TEST", bengali: "BENGALI-TEST", ...over,
});
const C = (over = {}) => ({
  slug: "s1", source_type: "Dua", title_bn: "TITLE-BN-TEST", title_en: "TITLE-EN-TEST",
  arabic: "ARABIC-TEST", translation_bn: "BENGALI-TEST", reference: "REF-TEST", ...over,
});

// --- eligibility ---
t("eligible hadith passes", () => assert.equal(elig.isEligibleHadith(H()), true));
t("hadith missing bengali is ineligible", () => assert.equal(elig.isEligibleHadith(H({ bengali: null })), false));
t("hadith missing number is ineligible", () => assert.equal(elig.isEligibleHadith(H({ hadith_number: null })), false));
t("hadith missing arabic is ineligible", () => assert.equal(elig.isEligibleHadith(H({ arabic: "  " })), false));
t("hadith missing book key is ineligible", () => assert.equal(elig.isEligibleHadith(H({ book_key: "" })), false));
t("content missing reference is ineligible", () => assert.equal(elig.isEligibleContent(C({ reference: null })), false));
t("content missing bengali translation is ineligible", () => assert.equal(elig.isEligibleContent(C({ translation_bn: "" })), false));
t("excluded refs are removed", () => {
  const kept = elig.applyExclusions([H({ id: "a" }), H({ id: "b" })], new Set(["a"]));
  assert.deepEqual(kept.map((h) => h.id), ["b"]);
});

// --- kolkata dates ---
t("kolkata date: 00:00Z is 05:30 IST same day", () =>
  assert.equal(sel.kolkataDateString(new Date("2026-11-03T00:00:00Z")), "2026-11-03"));
t("kolkata date: 18:30Z is 00:00 IST next day", () =>
  assert.equal(sel.kolkataDateString(new Date("2026-11-02T18:30:00Z")), "2026-11-03"));
t("kolkata date: 18:29:59Z is still previous day", () =>
  assert.equal(sel.kolkataDateString(new Date("2026-11-02T18:29:59Z")), "2026-11-02"));
t("next run before 00:30Z is same-day 00:30Z", () =>
  assert.equal(sel.nextDailyRunAt(new Date("2026-11-03T00:00:00Z")), "2026-11-03T00:30:00.000Z"));
t("next run after 00:30Z is next-day 00:30Z", () =>
  assert.equal(sel.nextDailyRunAt(new Date("2026-11-03T01:00:00Z")), "2026-11-04T00:30:00.000Z"));

// --- deterministic selection + no-repeat ---
t("seeded shuffle is deterministic", () => {
  const a = sel.seededShuffle([1, 2, 3, 4, 5], 42);
  const b = sel.seededShuffle([1, 2, 3, 4, 5], 42);
  assert.deepEqual(a, b);
});
t("no-repeat covers the whole pool before wrapping", () => {
  const pool = [1, 2, 3].map((i) => H({ id: `h${i}`, hadith_number: i }));
  const used = new Set();
  const picks = [];
  for (let day = 0; day < 3; day++) {
    const { item, wrapped } = sel.pickNext(pool, (h) => `hadith:${h.id}`, used);
    assert.equal(wrapped, false);
    picks.push(item.id);
    used.add(`hadith:${item.id}`);
  }
  assert.equal(new Set(picks).size, 3);
  const wrap = sel.pickNext(pool, (h) => `hadith:${h.id}`, used);
  assert.equal(wrap.wrapped, true);
});
t("same pool+history yields same pick", () => {
  const pool = [1, 2, 3, 4, 5].map((i) => H({ id: `h${i}`, hadith_number: i }));
  const a = sel.pickNext(pool, (h) => `hadith:${h.id}`, new Set(["hadith:h1"]));
  const b = sel.pickNext(pool, (h) => `hadith:${h.id}`, new Set(["hadith:h1"]));
  assert.equal(a.item.id, b.item.id);
});
t("card picks never duplicate within a day", () => {
  const pool = [1, 2, 3, 4, 5, 6].map((i) => C({ slug: `s${i}` }));
  const picked = sel.pickCards(pool, (c) => `content:${c.slug}`, () => "dua", new Set(), 4);
  assert.equal(picked.length, 4);
  assert.equal(new Set(picked.map((c) => c.slug)).size, 4);
});
t("card picks respect used refs and short pools without padding", () => {
  const pool = [1, 2].map((i) => C({ slug: `s${i}` }));
  const picked = sel.pickCards(pool, (c) => `content:${c.slug}`, () => "dua", new Set(), 4);
  assert.equal(picked.length, 2); // never padded with duplicates
});

// --- cards (verbatim, no invented wording) ---
t("card copies fields verbatim and links canonically", () => {
  const card = cards.buildCard(C({ slug: "dua-x", reference: "REF-TEST" }));
  assert.equal(card.arabic, "ARABIC-TEST");
  assert.equal(card.bengali, "BENGALI-TEST");
  assert.equal(card.sourceLine, "REF-TEST");
  assert.equal(card.canonicalLink, "/dua/dua-x");
  assert.match(card.caption, /https:\/\/noorapp\.in\/dua\/dua-x/);
  assert.doesNotMatch(card.caption, /virtue|benefit|grade/i);
});
t("hadith source line: bukhari mapped, unknown key verbatim", () => {
  assert.equal(cards.hadithSourceLine(H()), "Sahih al-Bukhari, Hadith 1");
  assert.equal(cards.hadithSourceLine(H({ book_key: "tirmidhi" })), "tirmidhi, Hadith 1");
});
t("hadith canonical link is the book page, never a guessed deep URL", () => {
  assert.equal(cards.hadithCanonicalLink(H()), "/hadith/sahih-bukhari/bangla");
});

// --- push ---
t("push clamp keeps title/body within limits", () => {
  const long = "অ".repeat(200);
  const title = push.clampPushText(`📿 ${long}`, 60);
  const width = [...title].reduce((n, ch) => n + (ch.codePointAt(0) > 0xffff ? 2 : 1), 0);
  assert.ok(width <= 60, `title width ${width}`);
  assert.ok((title.match(/[\u{1F300}-\u{1FAFF}]/gu) || []).length <= 1);
});
t("push payload prefers hadith and counts cards", () => {
  const pick = cards.hadithPick(H());
  const p = push.buildDailyPush(pick, "2026-11-03", 4);
  assert.match(p.title, /আজকের হাদিস/);
  assert.match(p.body, /4টি ইসলামিক কার্ড/);
  assert.equal(p.deepLink, "/hadith/sahih-bukhari/bangla");
  assert.equal(p.capKeyPrefix, "daily:2026-11-03");
});
t("daily cap key is per device per kolkata date", () => {
  assert.equal(push.dailyCapKey("2026-11-03", "dev-1"), "daily:2026-11-03:dev-1");
  assert.notEqual(push.dailyCapKey("2026-11-03", "dev-1"), push.dailyCapKey("2026-11-04", "dev-1"));
});
t("failure classification: dead vs retryable vs failed", () => {
  assert.equal(push.classifyPushFailure(410), "disabled");
  assert.equal(push.classifyPushFailure(404), "disabled");
  assert.equal(push.classifyPushFailure(429), "retryable");
  assert.equal(push.classifyPushFailure(500), "retryable");
  assert.equal(push.classifyPushFailure(null), "retryable");
  assert.equal(push.classifyPushFailure(400), "failed");
});
t("retry backoff: 5/15/45 after failures 1/2/3, terminal after 4", () => {
  assert.equal(push.delayAfterFailures(1), 5);
  assert.equal(push.delayAfterFailures(2), 15);
  assert.equal(push.delayAfterFailures(3), 45);
  assert.equal(push.delayAfterFailures(4), null);
});

// --- retry state machine ---
t("retry advances attempts with backoff; max attempts terminal", () => {
  const base = { deviceId: "d1", platform: "web", status: "retryable", attempts: 1, error: "HTTP 500", capKey: "k" };
  const r1 = deliv.applyRetry(base);
  assert.equal(r1.next.attempts, 2);
  assert.equal(r1.delayMinutes, 5);
  assert.equal(r1.terminal, false);
  const r3 = deliv.applyRetry({ ...base, attempts: 3 });
  assert.equal(r3.next.attempts, 4);
  assert.equal(r3.delayMinutes, 45);
  const r4 = deliv.applyRetry({ ...base, attempts: 4 });
  assert.equal(r4.next.status, "failed");
  assert.equal(r4.terminal, true);
});
t("retry is a no-op for sent/disabled rows (no double-send)", () => {
  const sent = { deviceId: "d1", platform: "web", status: "sent", attempts: 1, error: null, capKey: "k" };
  assert.equal(deliv.applyRetry(sent).next, sent);
  const dis = { ...sent, status: "disabled" };
  assert.equal(deliv.applyRetry(dis).next, dis);
});

// --- planDay end-to-end ---
t("planDay with eligible hadith picks one, builds push, no dup cards", () => {
  const hadiths = [1, 2, 3].map((i) => H({ id: `h${i}`, hadith_number: i }));
  const contents = [1, 2, 3, 4, 5, 6].map((i) => C({ slug: `s${i}` }));
  const history = { hadithUsedRefs: [], hadithCycle: 1, cardUsedRefs: [], cardCycle: 1 };
  const { plan, nextHistory } = planMod.planDay({ kolkataDate: "2026-11-03", hadiths, contents, history });
  assert.ok(plan.hadith);
  assert.ok(plan.push);
  assert.ok(plan.cards.length >= 3 && plan.cards.length <= 5);
  assert.equal(new Set(plan.cards.map((c) => c.recordRef)).size, plan.cards.length);
  assert.equal(plan.hadithEmptyReason, null);
  assert.equal(nextHistory.hadithUsedRefs.length, 1);
});
t("planDay with no eligible hadith reports the reason, never invents", () => {
  const { plan } = planMod.planDay({
    kolkataDate: "2026-11-03",
    hadiths: [H({ bengali: null })],
    contents: [1, 2, 3, 4].map((i) => C({ slug: `s${i}` })),
    history: { hadithUsedRefs: [], hadithCycle: 1, cardUsedRefs: [], cardCycle: 1 },
  });
  assert.equal(plan.hadith, null);
  assert.equal(plan.push, null);
  assert.match(plan.hadithEmptyReason, /No eligible hadith/);
  assert.ok(plan.cards.length >= 3);
});
t("planDay consecutive days never repeat the hadith", () => {
  const hadiths = [1, 2, 3].map((i) => H({ id: `h${i}`, hadith_number: i }));
  const contents = [1, 2, 3, 4, 5, 6, 7, 8].map((i) => C({ slug: `s${i}` }));
  let history = { hadithUsedRefs: [], hadithCycle: 1, cardUsedRefs: [], cardCycle: 1 };
  const ids = [];
  for (let day = 0; day < 3; day++) {
    const r = planMod.planDay({ kolkataDate: `2026-11-0${3 + day}`, hadiths, contents, history });
    ids.push(r.plan.hadith.record.id);
    history = r.nextHistory;
  }
  assert.equal(new Set(ids).size, 3);
});

console.log(`\nALL ${n} TESTS PASSED`);
