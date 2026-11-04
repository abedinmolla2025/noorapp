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
const bg = await import(path.join(dir, ".out/backgrounds.js"));
const ogQc = await import(path.join(dir, ".out/ogQc.js"));

let n = 0;
const pending = [];
// Tests run strictly in order (async tests included): endpoint tests share
// one fetch stub and one env secret, so parallel execution would race.
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
t("hadith card copies matn, translation and source verbatim", () => {
  const card = cards.buildHadithCard(cards.hadithPick(H()));
  assert.equal(card.kind, "hadith");
  assert.equal(card.arabic, "ARABIC-TEST");
  assert.equal(card.bengali, "BENGALI-TEST");
  assert.equal(card.sourceLine, "Sahih al-Bukhari, Hadith 1");
  assert.equal(bg.badgeLabelForCard(card), "HADITH");
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

// --- H3 (lib mirror): card cycle wraps only when the pool is exhausted ---
t("planDay card cycle wraps when every content is used", () => {
  const contents = [1, 2, 3].map((i) => C({ slug: `s${i}` }));
  const hadiths = [H({ id: "h1", hadith_number: 1 })];
  const history = {
    hadithUsedRefs: [],
    hadithCycle: 1,
    cardUsedRefs: ["content:s1", "content:s2", "content:s3"],
    cardCycle: 1,
  };
  const r = planMod.planDay({ kolkataDate: "2026-11-03", hadiths, contents, history });
  assert.equal(r.plan.cardCycle, 2);
  assert.equal(r.nextHistory.cardCycle, 2);
  const contentRefs = r.plan.cards
    .filter((c) => c.recordRef.startsWith("content:"))
    .map((c) => c.recordRef)
    .sort();
  assert.ok(contentRefs.length > 0, "wrapped pool yields cards again");
  assert.deepEqual(r.nextHistory.cardUsedRefs.sort(), contentRefs);
});

t("planDay card cycle does not wrap on a partial pool", () => {
  const contents = [1, 2, 3].map((i) => C({ slug: `s${i}` }));
  const hadiths = [H({ id: "h1", hadith_number: 1 })];
  const history = {
    hadithUsedRefs: [],
    hadithCycle: 1,
    cardUsedRefs: ["content:s1"],
    cardCycle: 1,
  };
  const r = planMod.planDay({ kolkataDate: "2026-11-03", hadiths, contents, history });
  assert.equal(r.plan.cardCycle, 1);
  assert.ok(!r.plan.cards.map((c) => c.recordRef).includes("content:s1"));
});

// --- H1: endpoint forwards retry_only to the edge (real endpoint file) ---
const endpoint = await import(path.join(dir, ".out/daily-content-run.js"));
let capturedFetch = null;
globalThis.fetch = async (url, init) => {
  capturedFetch = { url, body: JSON.parse(init.body) };
  return { ok: true, status: 200 };
};
const endpointReq = (url, auth = "Bearer test-secret") => ({
  url,
  headers: { get: (name) => (name.toLowerCase() === "authorization" ? auth : null) },
});

t("endpoint forwards retry_only=1 to the edge", async () => {
  process.env.DAILY_CONTENT_CRON_SECRET = "test-secret";
  capturedFetch = null;
  const res = await endpoint.default(
    endpointReq("http://localhost/api/daily-content-run?retry_only=1"),
  );
  assert.equal(capturedFetch.body.retry_only, true);
  assert.equal(capturedFetch.body.dry_run, false);
  const json = await res.json();
  assert.equal(json.retry_only, true);
  assert.equal(json.dry_run, false);
});

t("endpoint forwards a normal run without retry_only", async () => {
  process.env.DAILY_CONTENT_CRON_SECRET = "test-secret";
  capturedFetch = null;
  const res = await endpoint.default(endpointReq("http://localhost/api/daily-content-run"));
  assert.equal(capturedFetch.body.retry_only, false);
  assert.equal(capturedFetch.body.dry_run, false);
  assert.equal((await res.json()).retry_only, false);
});

t("endpoint forwards dry_run=1 without retry_only", async () => {
  process.env.DAILY_CONTENT_CRON_SECRET = "test-secret";
  capturedFetch = null;
  await endpoint.default(endpointReq("http://localhost/api/daily-content-run?dry_run=1"));
  assert.equal(capturedFetch.body.dry_run, true);
  assert.equal(capturedFetch.body.retry_only, false);
});

t("endpoint rejects retry_only=1 combined with dry_run=1 without calling the edge", async () => {
  process.env.DAILY_CONTENT_CRON_SECRET = "test-secret";
  capturedFetch = null;
  const res = await endpoint.default(
    endpointReq("http://localhost/api/daily-content-run?retry_only=1&dry_run=1"),
  );
  assert.equal(res.status, 400);
  assert.equal(capturedFetch, null);
});

t("endpoint rejects a wrong bearer without calling the edge", async () => {
  process.env.DAILY_CONTENT_CRON_SECRET = "test-secret";
  capturedFetch = null;
  const res = await endpoint.default(
    endpointReq("http://localhost/api/daily-content-run?retry_only=1", "Bearer wrong"),
  );
  assert.equal(res.status, 401);
  assert.equal(capturedFetch, null);
});

t("endpoint fails closed when its secret is missing", async () => {
  delete process.env.DAILY_CONTENT_CRON_SECRET;
  capturedFetch = null;
  const res = await endpoint.default(endpointReq("http://localhost/api/daily-content-run"));
  assert.equal(res.status, 500);
  assert.equal(capturedFetch, null);
  process.env.DAILY_CONTENT_CRON_SECRET = "test-secret";
});

// --- OG backgrounds (no fixed theme count; scenes matched by subject) ---
const P = (over = {}) => ({
  kind: "dua", recordRef: "content:s1", title: "TITLE", arabic: "ARABIC", bengali: "BENGALI",
  sourceLine: "REF", canonicalLink: "/dua/s1", altText: "ALT", caption: "CAP", ...over,
});
t("background: guidance title matches the path scene", () =>
  assert.equal(bg.matchBackground(P({ title: "হেদায়াতের দোয়া", sourceLine: "Surah Al-Faatiha 1:6" })).id, "guidance-path"));
t("background: forgiveness title matches the leaf scene", () =>
  assert.equal(bg.matchBackground(P({ title: "ক্ষমা প্রার্থনার দোয়া", sourceLine: "Surah Al-A'raaf 7:23" })).id, "forgiveness-leaf"));
t("background: intentions hadith matches the sunrise scene", () =>
  assert.equal(bg.matchBackground(P({ kind: "hadith", title: "আজকের হাদিস", bengali: "কর্মের ফলাফল নিয়তের উপর নির্ভরশীল।", sourceLine: "Sahih Bukhari" })).id, "intention-sunrise"));
t("background: unknown subject falls back to the first scene", () =>
  assert.equal(bg.matchBackground(P({ title: "zzz-no-match" })).id, "guidance-path"));
t("background: waking title matches the morning window scene", () =>
  assert.equal(bg.matchBackground(P({ title: "ঘুম থেকে জাগার দোয়া" })).id, "morning-window"));
t("background: entering-home title matches the home entrance scene", () =>
  assert.equal(bg.matchBackground(P({ title: "ঘরে প্রবেশের দোয়া" })).id, "home-entrance"));
t("background: night protection title matches the lantern scene", () =>
  assert.equal(bg.matchBackground(P({ title: "রাতে হেফাজতের দোয়া" })).id, "night-lantern"));
t("background: mosque title matches the courtyard scene", () =>
  assert.equal(bg.matchBackground(P({ title: "মসজিদে প্রবেশের দোয়া" })).id, "courtyard-prayer"));
t("background: full 5-card batch gets 5 distinct scenes", () => {
  const cards = [
    P({ title: "হেদায়াতের দোয়া", recordRef: "content:b1" }),
    P({ title: "ক্ষমা প্রার্থনার দোয়া", recordRef: "content:b2" }),
    P({ title: "ঘুম থেকে জাগার দোয়া", recordRef: "content:b3" }),
    P({ title: "ঘরে প্রবেশের দোয়া", recordRef: "content:b4" }),
    P({ title: "রাতে হেফাজতের দোয়া", recordRef: "content:b5" }),
  ];
  const assigned = bg.assignBackgrounds(cards);
  assert.equal(new Set(assigned.map((a) => a.background.id)).size, 5);
});
t("background: batch assignment never repeats while scenes remain", () => {
  const cards = [
    P({ title: "ক্ষমা প্রার্থনার দোয়া" }),
    P({ title: "ক্ষমা চাওয়া", recordRef: "content:s2" }),
    P({ title: "হেদায়াতের দোয়া", recordRef: "content:s3" }),
  ];
  const assigned = bg.assignBackgrounds(cards);
  assert.equal(new Set(assigned.map((a) => a.background.id)).size, 3);
  assert.equal(assigned[0].background.id, "forgiveness-leaf");
  assert.deepEqual(bg.assignBackgrounds(cards), assigned);
});
t("badge: quran -> QURANIC DUA, hadith -> HADITH", () => {
  assert.equal(bg.badgeLabelForCard(P({ kind: "quran" })), "QURANIC DUA");
  assert.equal(bg.badgeLabelForCard(P({ kind: "hadith" })), "HADITH");
});
t("badge: dua record follows its reference", () => {
  assert.equal(bg.badgeLabelForCard(P({ sourceLine: "Surah Al-Baqarah 2:201" })), "QURANIC DUA");
  assert.equal(bg.badgeLabelForCard(P({ sourceLine: "Sahih al-Bukhari 6307" })), "PROPHETIC DUA");
  assert.equal(bg.badgeLabelForCard(P({ sourceLine: "Daily Dua Collection" })), "DUA");
});

// --- OG quality gate ---
t("ogQc: verbatim check catches one changed character", () => {
  const src = { title: "T", arabic: "A", bengali: "B", sourceLine: "R" };
  assert.equal(ogQc.checkOgVerbatim(src, src).ok, true);
  assert.equal(ogQc.checkOgVerbatim({ ...src, bengali: "B!" }, src).ok, false);
});
t("ogQc: batch flags empty fields and in-batch background repeats", () => {
  const bad = ogQc.checkOgCardBatch([P({ arabic: "  " })], ["guidance-path"], 3);
  assert.equal(bad.ok, false);
  const dup = ogQc.checkOgCardBatch([P(), P({ recordRef: "content:s2" })], ["guidance-path", "guidance-path"], 3);
  assert.equal(dup.ok, false);
});
t("ogQc: long text is a warning, never a silent cut", () => {
  const r = ogQc.checkOgCardBatch([P({ bengali: "x".repeat(400) })], ["guidance-path"], 3);
  assert.equal(r.ok, true);
  assert.equal(r.warnings.length, 1);
});
t("ogQc: export sizes are exactly 1080x1350 and 1080x1080", () => {
  assert.deepEqual(ogQc.ogExportSize("portrait"), { width: 1080, height: 1350 });
  assert.deepEqual(ogQc.ogExportSize("square"), { width: 1080, height: 1080 });
  assert.deepEqual(ogQc.OG_STAGE_SIZE.portrait, { width: 540, height: 675 });
});

await Promise.all(pending);
console.log(`\nALL ${n} TESTS PASSED`);
