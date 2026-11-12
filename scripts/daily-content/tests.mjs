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
const prefs = await import(path.join(dir, ".out/preferences.js"));
const cstate = await import(path.join(dir, ".out/containerState.js"));
const recs = await import(path.join(dir, ".out/recommendations.js"));
const recPlan = await import(path.join(dir, ".out/recommendationPlan.js"));
const cal = await import(path.join(dir, ".out-cal/context.js"));
const reqFor = (d) => recs.buildRecommendRequest(d, cal.getIslamicContextForKey(d));

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

// Phase 4: Vercel Cron sends its own auto-generated CRON_SECRET, not the
// custom secret. The endpoint must accept it (and only it or the custom
// secret) as the incoming bearer, while still forwarding with the custom
// secret to the edge.
t("endpoint accepts Vercel's CRON_SECRET as the incoming bearer", async () => {
  process.env.DAILY_CONTENT_CRON_SECRET = "test-secret";
  process.env.CRON_SECRET = "vercel-cron-secret";
  capturedFetch = null;
  const res = await endpoint.default(
    endpointReq("http://localhost/api/daily-content-run", "Bearer vercel-cron-secret"),
  );
  assert.equal(res.status, 200);
  assert.notEqual(capturedFetch, null);
  assert.equal(capturedFetch.body.retry_only, false);
  delete process.env.CRON_SECRET;
});

t("endpoint rejects a bearer matching neither secret", async () => {
  process.env.DAILY_CONTENT_CRON_SECRET = "test-secret";
  process.env.CRON_SECRET = "vercel-cron-secret";
  capturedFetch = null;
  const res = await endpoint.default(
    endpointReq("http://localhost/api/daily-content-run", "Bearer neither-secret"),
  );
  assert.equal(res.status, 401);
  assert.equal(capturedFetch, null);
  delete process.env.CRON_SECRET;
});

t("endpoint still accepts the custom secret when CRON_SECRET is absent", async () => {
  process.env.DAILY_CONTENT_CRON_SECRET = "test-secret";
  delete process.env.CRON_SECRET;
  capturedFetch = null;
  const res = await endpoint.default(endpointReq("http://localhost/api/daily-content-run"));
  assert.equal(res.status, 200);
  assert.notEqual(capturedFetch, null);
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
t("background: forgiveness title matches the dawn scene", () =>
  assert.equal(bg.matchBackground(P({ title: "ক্ষমা প্রার্থনার দোয়া", sourceLine: "Surah Al-A'raaf 7:23" })).id, "dawn-forgiveness")); // was forgiveness-leaf (52) — dawn-forgiveness is the verified semantic match (96) since the 2026-11-07 engines mission
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
  assert.equal(assigned[0].background.id, "dawn-forgiveness"); // was forgiveness-leaf — dawn-forgiveness is the verified semantic match (96) since the 2026-11-07 engines mission
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

// ---- Phase 3: preference client (pure, stubbed transport) ----
t("preferences: opt_out posts the endpoint with action opt_out and returns the server state", async () => {
  const calls = [];
  const post = async (url, body) => {
    calls.push({ url, body });
    return { status: 200, json: { ok: true, action: "opt_out", devices: 1, daily_enabled: false } };
  };
  const out = await prefs.setDailyPreference(
    { post, getSubscriptionEndpoint: async () => "https://push.example/t1" },
    { edgeUrl: "https://example.supabase.co/functions/v1/daily-content", enabled: false },
  );
  assert.deepEqual(out, { daily_enabled: false, devices: 1 });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].body.action, "opt_out");
  assert.equal(calls[0].body.endpoint, "https://push.example/t1");
});

t("preferences: opt_in posts action opt_in", async () => {
  const calls = [];
  const post = async (url, body) => {
    calls.push(body);
    return { status: 200, json: { ok: true, action: "opt_in", devices: 2, daily_enabled: true } };
  };
  const out = await prefs.setDailyPreference(
    { post, getSubscriptionEndpoint: async () => "https://push.example/t1" },
    { edgeUrl: "https://example.supabase.co/functions/v1/daily-content", enabled: true },
  );
  assert.deepEqual(out, { daily_enabled: true, devices: 2 });
  assert.equal(calls[0].action, "opt_in");
});

t("preferences: no subscription throws NO_SUBSCRIPTION and never posts", async () => {
  let posted = false;
  const post = async () => {
    posted = true;
    return { status: 200, json: { ok: true, daily_enabled: false, devices: 0 } };
  };
  await assert.rejects(
    prefs.setDailyPreference(
      { post, getSubscriptionEndpoint: async () => null },
      { edgeUrl: "https://example.supabase.co/functions/v1/daily-content", enabled: false },
    ),
    (e) => e instanceof prefs.PreferenceError && e.code === "NO_SUBSCRIPTION",
  );
  assert.equal(posted, false);
});

t("preferences: 404 maps to SUBSCRIPTION_NOT_FOUND; 500 and ok:false map to PREFERENCE_FAILED", async () => {
  const ep = async () => "https://push.example/t1";
  await assert.rejects(
    prefs.setDailyPreference(
      { post: async () => ({ status: 404, json: { ok: false, error: "no subscription found" } }), getSubscriptionEndpoint: ep },
      { edgeUrl: "https://example.supabase.co/functions/v1/daily-content", enabled: false },
    ),
    (e) => e instanceof prefs.PreferenceError && e.code === "SUBSCRIPTION_NOT_FOUND",
  );
  await assert.rejects(
    prefs.setDailyPreference(
      { post: async () => ({ status: 500, json: { ok: false } }), getSubscriptionEndpoint: ep },
      { edgeUrl: "https://example.supabase.co/functions/v1/daily-content", enabled: false },
    ),
    (e) => e instanceof prefs.PreferenceError && e.code === "PREFERENCE_FAILED",
  );
  await assert.rejects(
    prefs.setDailyPreference(
      { post: async () => ({ status: 200, json: { ok: false } }), getSubscriptionEndpoint: ep },
      { edgeUrl: "https://example.supabase.co/functions/v1/daily-content", enabled: false },
    ),
    (e) => e instanceof prefs.PreferenceError && e.code === "PREFERENCE_FAILED",
  );
});

// ---- Phase 6: container state (pure) ----
const pubRow = (over = {}) => ({ hadith_ref: "hadith:h1", ...over });
const hRow = (over = {}) => ({
  arabic: "ARABIC-TEST", bengali: "BENGALI-TEST",
  book_key: "bukhari", chapter_id: 3, hadith_number: 42, ...over,
});
t("containerState: valid publication builds the published record", () => {
  const rec = cstate.resolvePublishedRecord(pubRow(), hRow());
  assert.deepEqual(rec, {
    bengali: "BENGALI-TEST",
    arabic: "ARABIC-TEST",
    source: "Sahih al-Bukhari, Hadith 42",
    chapter: "Chapter 3",
    canonicalLink: "/hadith/sahih-bukhari/bangla",
  });
});
t("containerState: non-bukhari book keeps its key and falls back to /hadith", () => {
  const rec = cstate.resolvePublishedRecord(pubRow(), hRow({ book_key: "muslim" }));
  assert.equal(rec.source, "muslim, Hadith 42");
  assert.equal(rec.canonicalLink, "/hadith");
});
t("containerState: missing/bad ref or missing content rejects the record", () => {
  assert.equal(cstate.resolvePublishedRecord(null, hRow()), null);
  assert.equal(cstate.resolvePublishedRecord(pubRow({ hadith_ref: null }), hRow()), null);
  assert.equal(cstate.resolvePublishedRecord(pubRow({ hadith_ref: "dua:x" }), hRow()), null);
  assert.equal(cstate.resolvePublishedRecord(pubRow({ hadith_ref: "hadith:" }), hRow()), null);
  assert.equal(cstate.resolvePublishedRecord(pubRow(), null), null);
  assert.equal(cstate.resolvePublishedRecord(pubRow(), hRow({ arabic: "" })), null);
  assert.equal(cstate.resolvePublishedRecord(pubRow(), hRow({ bengali: null })), null);
});
t("containerState: rotation index follows the Kolkata day-of-year", () => {
  assert.equal(cstate.rotationIndexForDate("2026-11-06", 7), 2); // day 310 % 7
  assert.equal(cstate.rotationIndexForDate("2026-01-01", 7), 1); // day 1 % 7
  assert.equal(cstate.rotationIndexForDate("2026-12-31", 7), 1); // day 365 % 7
  assert.equal(cstate.rotationIndexForDate("2024-02-29", 7), 4); // leap day 60 % 7
  assert.equal(cstate.rotationIndexForDate("2024-12-31", 7), 2); // leap day 366 % 7
  assert.equal(cstate.rotationIndexForDate("not-a-date", 7), 0);
  assert.equal(cstate.rotationIndexForDate("2026-02-30", 7), 0); // impossible date
  assert.equal(cstate.rotationIndexForDate("2026-11-06", 0), 0);
});
const approvedRunRow = (over = {}) => ({
  status: "approved",
  recommendations: [
    { kind: "hadith", ref: "hadith:bukhari-9-534" },
    { kind: "content", ref: "content:dua-a" },
  ],
  ...over,
});
const CONTEXT = { hijriLabel: "১ রমজান ১৪৪৭", eventNamesBn: ["রমজান", "শেষ দশ রাত"] };
const HADITH_ROW = { arabic: "ARABIC-TEST", bengali: "BENGALI-TEST", book_key: "bukhari", chapter_id: 9, hadith_number: 534 };
t("containerState: hadithRefFromRun extracts the first hadith id", () => {
  assert.equal(cstate.hadithRefFromRun(approvedRunRow()), "bukhari-9-534");
  assert.equal(cstate.hadithRefFromRun(approvedRunRow({ recommendations: [{ kind: "content", ref: "content:dua-a" }] })), null);
  assert.equal(cstate.hadithRefFromRun(approvedRunRow({ recommendations: [{ kind: "hadith", ref: "bukhari-9-534" }] })), null);
  assert.equal(cstate.hadithRefFromRun(approvedRunRow({ recommendations: [{ kind: "hadith", ref: "hadith:" }] })), null);
  assert.equal(cstate.hadithRefFromRun(approvedRunRow({ recommendations: [] })), null);
  assert.equal(cstate.hadithRefFromRun(null), null);
});
t("containerState: valid approved run resolves to the contextual record", () => {
  const resolved = cstate.resolveContextualRecord(approvedRunRow(), HADITH_ROW, CONTEXT);
  assert.ok(resolved);
  assert.equal(resolved.record.source, "Sahih al-Bukhari, Hadith 534");
  assert.equal(resolved.record.chapter, "Chapter 9");
  assert.equal(resolved.record.canonicalLink, "/hadith/sahih-bukhari/bangla");
  assert.equal(resolved.record.arabic, "ARABIC-TEST");
  assert.equal(resolved.record.bengali, "BENGALI-TEST");
  assert.deepEqual(resolved.context, CONTEXT);
});
t("containerState: non-approved run or missing hadith never resolves contextually", () => {
  assert.equal(cstate.resolveContextualRecord(approvedRunRow({ status: "pending_review" }), HADITH_ROW, CONTEXT), null);
  assert.equal(cstate.resolveContextualRecord(approvedRunRow({ status: "rejected" }), HADITH_ROW, CONTEXT), null);
  assert.equal(cstate.resolveContextualRecord(approvedRunRow({ recommendations: [{ kind: "content", ref: "content:dua-a" }] }), HADITH_ROW, CONTEXT), null);
  assert.equal(cstate.resolveContextualRecord(approvedRunRow(), { ...HADITH_ROW, arabic: "" }, CONTEXT), null);
  assert.equal(cstate.resolveContextualRecord(approvedRunRow(), { ...HADITH_ROW, bengali: null }, CONTEXT), null);
  assert.equal(cstate.resolveContextualRecord(approvedRunRow(), null, CONTEXT), null);
  assert.equal(cstate.resolveContextualRecord(null, HADITH_ROW, CONTEXT), null);
});

t("preferences: status posts action status and returns the server value", async () => {
  const ep = async () => "https://push.example/t1";
  const post = async (url, body) => {
    assert.equal(body.action, "status");
    assert.equal(body.endpoint, "https://push.example/t1");
    return { status: 200, json: { ok: true, action: "status", devices: 1, daily_enabled: false } };
  };
  const res = await prefs.getDailyPreferenceStatus(
    { post, getSubscriptionEndpoint: ep },
    { edgeUrl: "https://example.supabase.co/functions/v1/daily-content" },
  );
  assert.deepEqual(res, { daily_enabled: false, devices: 1 });
});
t("preferences: status maps 404 / 500 and missing subscription like setDailyPreference", async () => {
  const ep = async () => "https://push.example/t1";
  await assert.rejects(
    prefs.getDailyPreferenceStatus(
      { post: async () => ({ status: 404, json: { ok: false } }), getSubscriptionEndpoint: ep },
      { edgeUrl: "https://example.supabase.co/functions/v1/daily-content" },
    ),
    (e) => e instanceof prefs.PreferenceError && e.code === "SUBSCRIPTION_NOT_FOUND",
  );
  await assert.rejects(
    prefs.getDailyPreferenceStatus(
      { post: async () => ({ status: 500, json: { ok: false } }), getSubscriptionEndpoint: ep },
      { edgeUrl: "https://example.supabase.co/functions/v1/daily-content" },
    ),
    (e) => e instanceof prefs.PreferenceError && e.code === "PREFERENCE_FAILED",
  );
  await assert.rejects(
    prefs.getDailyPreferenceStatus(
      { post: async () => { throw new Error("must not post"); }, getSubscriptionEndpoint: async () => null },
      { edgeUrl: "https://example.supabase.co/functions/v1/daily-content" },
    ),
    (e) => e instanceof prefs.PreferenceError && e.code === "NO_SUBSCRIPTION",
  );
});

t("recommendations: ordinary day builds an empty-context request", () => {
  const req = reqFor("2026-11-07");
  assert.equal(req.kolkataDate, "2026-11-07");
  assert.deepEqual(req.context.hijri, { year: 1448, month: 5, day: 26 });
  assert.equal(req.context.confirmation, "calculated");
  assert.deepEqual(req.context.activeEventSlugs, []);
  assert.equal(req.context.ramadanStage, null);
  assert.deepEqual(req.chapterIds, []);
});
t("recommendations: Ramadan start builds a fasting-chapter request", () => {
  const req = reqFor("2026-02-18");
  assert.deepEqual(req.context.hijri, { year: 1447, month: 9, day: 1 });
  assert.deepEqual(req.context.activeEventSlugs, ["ramadan-start", "ramadan-month"]);
  assert.equal(req.context.ramadanStage, "first-ten");
  assert.deepEqual(req.chapterIds, [30, 31, 33]);
});
t("recommendations: last-ten night builds a Qadr-window request", () => {
  const req = reqFor("2026-03-10");
  assert.deepEqual(req.context.hijri, { year: 1447, month: 9, day: 21 });
  assert.deepEqual(req.context.activeEventSlugs, ["laylatul-qadr", "ramadan-month", "last-ten-nights"]);
  assert.equal(req.context.ramadanStage, "last-ten");
  assert.deepEqual(req.chapterIds, [30, 31, 32, 33]);
});
t("recommendations: Eid al-Fitr builds a festivals-chapter request", () => {
  const req = reqFor("2026-03-20");
  assert.deepEqual(req.context.hijri, { year: 1447, month: 10, day: 1 });
  assert.deepEqual(req.context.activeEventSlugs, ["eid-fitr"]);
  assert.deepEqual(req.chapterIds, [13]);
});
t("recommendations: Eid al-Adha builds a Hajj-chapter request", () => {
  const req = reqFor("2026-05-27");
  assert.deepEqual(req.context.hijri, { year: 1447, month: 12, day: 10 });
  assert.deepEqual(req.context.activeEventSlugs, ["eid-adha", "first-ten-dhul-hijjah", "hajj", "dhul-hijjah-month"]);
  assert.deepEqual(req.chapterIds, [13, 25, 27, 28, 73]);
});
const approvedRun = (over = {}) => ({
  id: "run-1",
  kolkata_date: "2026-03-10",
  hijri_key: "1447-09-21",
  context: reqFor("2026-03-10").context,
  recommendations: [
    { kind: "hadith", ref: "hadith:bukhari-9-534", relevance: 0.95, reasonBn: "রমজানের হাদিস।", sourceLine: "Sahih al-Bukhari, Hadith 534" },
    { kind: "content", ref: "content:dua-a", relevance: 0.9, reasonBn: "দোয়া।", sourceLine: "Dua A" },
    { kind: "content", ref: "content:dua-b", relevance: 0.8, reasonBn: "দোয়া।", sourceLine: "Dua B" },
    { kind: "content", ref: "content:dua-c", relevance: 0.7, reasonBn: "দোয়া।", sourceLine: "Dua C" },
    { kind: "content", ref: "content:dua-d", relevance: 0.6, reasonBn: "দোয়া।", sourceLine: "Dua D" },
  ],
  dropped: [],
  status: "approved",
  created_by: "admin-uuid",
  created_at: "2026-03-10T00:00:00Z",
  reviewed_by: "admin-uuid",
  reviewed_at: "2026-03-10T01:00:00Z",
  review_note: null,
  ...over,
});
t("recommendationPlan: complete approved run converts to a full plan", () => {
  const plan = recPlan.approvedRunToPlan(approvedRun());
  assert.equal(plan.complete, true);
  assert.equal(plan.hadithRef, "hadith:bukhari-9-534");
  assert.deepEqual(plan.contentRefs, ["content:dua-a", "content:dua-b", "content:dua-c", "content:dua-d"]);
  assert.deepEqual(plan.missing, []);
});
t("recommendationPlan: missing hadith or too few content cards is incomplete", () => {
  const noHadith = recPlan.approvedRunToPlan(approvedRun({ recommendations: approvedRun().recommendations.slice(1) }));
  assert.equal(noHadith.complete, false);
  assert.equal(noHadith.hadithRef, null);
  assert.deepEqual(noHadith.missing, ["hadith"]);
  const twoContent = recPlan.approvedRunToPlan(approvedRun({
    recommendations: approvedRun().recommendations.slice(0, 3),
  }));
  assert.equal(twoContent.complete, false);
  assert.deepEqual(twoContent.missing, ["content cards: need 3, have 2"]);
});
t("recommendationPlan: non-approved run yields an empty plan", () => {
  const plan = recPlan.approvedRunToPlan(approvedRun({ status: "pending_review" }));
  assert.equal(plan.complete, false);
  assert.equal(plan.hadithRef, null);
  assert.deepEqual(plan.contentRefs, []);
  assert.deepEqual(plan.missing, ["run is not approved"]);
});
t("recommendationPlan: more than 5 content recommendations are capped at 5", () => {
  const recs6 = approvedRun().recommendations;
  const extraE = { kind: "content", ref: "content:dua-e", relevance: 0.5, reasonBn: "দোয়া।", sourceLine: "Dua E" };
  const extraF = { kind: "content", ref: "content:dua-f", relevance: 0.4, reasonBn: "দোয়া।", sourceLine: "Dua F" };
  const plan = recPlan.approvedRunToPlan(approvedRun({ recommendations: [...recs6, extraE, extraF] }));
  assert.equal(plan.contentRefs.length, 5);
  assert.equal(plan.contentRefs[4], "content:dua-e");
  assert.equal(plan.contentRefs.includes("content:dua-f"), false);
});

await Promise.all(pending);
console.log(`\nALL ${n} TESTS PASSED`);
