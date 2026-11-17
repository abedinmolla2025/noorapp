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
const share = await import(path.join(dir, ".out/dailyShare.js"));
const mon = await import(path.join(dir, ".out/monitoring.js"));
const gate = await import(path.join(dir, ".out/autonomousGate.js"));
const pal = await import(path.join(dir, ".out/palettes.js"));
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
t("ogQc: square long content gets extra tightening, Bengali floor stays 16", () => {
  const sq = ogQc.effectiveBengaliFirstLayout("c", "square", 306, 538);
  assert.equal(sq.isLongContent, true);
  assert.equal(sq.bengaliMinSize, 16);
  assert.equal(sq.padding, "12px 26px 12px");
  assert.equal(sq.titleSize, 16);
  assert.equal(sq.gap, 6);
  // Phase 2 (2026-11-17): the Arabic cap is RESTORED to the table value
  // 0.25 — the 0.23 cap + the raised 14px Arabic floor cannot both hold
  // (a 4-line minimum-size Arabic needs ~120px; 0.25 of the taller body
  // is ~121px). Headroom now comes from the compact header + omitted
  // divider + 1.55 Bengali leading, never from the Arabic.
  assert.equal(sq.arabicCapShare, 0.25);
  assert.equal(sq.bengaliLineHeight, 1.55);
  assert.equal(sq.panelPaddingV, 12);
  assert.equal(sq.sourcePillPaddingV, 4);
  assert.equal(sq.arabicMinSize, 14);
  assert.equal(sq.headerCompact, true);
  assert.equal(sq.hideDivider, true);
});
t("ogQc: square short content is byte-identical to the table (no regression)", () => {
  const sq = ogQc.effectiveBengaliFirstLayout("c", "square", 20, 35);
  assert.equal(sq.isLongContent, false);
  assert.deepEqual(
    { padding: sq.padding, titleSize: sq.titleSize, gap: sq.gap, arabicCapShare: sq.arabicCapShare, bengaliLineHeight: sq.bengaliLineHeight, panelPaddingV: sq.panelPaddingV, sourcePillPaddingV: sq.sourcePillPaddingV },
    { padding: "22px 26px 22px", titleSize: 22, gap: 12, arabicCapShare: 0.25, bengaliLineHeight: 1.65, panelPaddingV: 16, sourcePillPaddingV: 6 },
  );
});
t("ogQc: portrait long content pays for the Arabic strip from chrome (header + leading), keeps its divider", () => {
  const po = ogQc.effectiveBengaliFirstLayout("c", "portrait", 306, 538);
  assert.equal(po.isLongContent, true);
  // Phase 2: long portrait compacts the header and uses 1.6 Bengali
  // leading to pay for the Arabic glass strip (~15px) — the divider
  // stays, and every other number is the pre-existing long tightening.
  assert.equal(po.headerCompact, true);
  assert.equal(po.hideDivider, false);
  assert.equal(po.arabicMinSize, 14);
  assert.deepEqual(
    { padding: po.padding, titleSize: po.titleSize, gap: po.gap, arabicCapShare: po.arabicCapShare, bengaliLineHeight: po.bengaliLineHeight, panelPaddingV: po.panelPaddingV, sourcePillPaddingV: po.sourcePillPaddingV },
    { padding: "22px 28px 22px", titleSize: 20, gap: 10, arabicCapShare: 0.28, bengaliLineHeight: 1.6, panelPaddingV: 16, sourcePillPaddingV: 6 },
  );
});
t("ogQc: layout C arabic floor is 14px in both formats, never below", () => {
  assert.equal(ogQc.BENGALI_FIRST_LAYOUT.c.portrait.arabicMinSize, 14);
  assert.equal(ogQc.BENGALI_FIRST_LAYOUT.c.square.arabicMinSize, 14);
  assert.equal(ogQc.ARABIC_MIN_SIZE_LAYOUT_C, 14);
  assert.equal(ogQc.effectiveBengaliFirstLayout("c", "square", 20, 35).arabicMinSize, 14);
  assert.equal(ogQc.effectiveBengaliFirstLayout("c", "portrait", 20, 35).arabicMinSize, 14);
});
t("ogQc: short-content rule shrinks the panel only when both texts are short", () => {
  assert.equal(ogQc.isShortPosterContent(35, 20), true); // intentions fixture
  assert.equal(ogQc.isShortPosterContent(120, 120), true); // boundary
  assert.equal(ogQc.isShortPosterContent(121, 20), false);
  assert.equal(ogQc.isShortPosterContent(35, 121), false);
  assert.equal(ogQc.isShortPosterContent(424, 331), false); // 869 medium
  assert.equal(ogQc.isShortPosterContent(538, 306), false); // 5022 long
});
t("ogQc: fit record passes with headroom, warns at the floor, fails on overflow or below-floor size", () => {
  const base = { format: "square", isLongContent: true, bengaliSize: 20, bengaliMinSize: 16, arabicSize: 16, arabicMinSize: 14, bengaliLines: 8, arabicLines: 3, bengaliSparePx: 30, arabicSparePx: 5, bengaliOverflow: false, arabicOverflow: false, bengaliLineHeight: 24.8, arabicLineHeight: 28 };
  const ok = ogQc.checkOgFitRecord(base);
  assert.equal(ok.ok, true);
  assert.equal(ok.warnings.length, 0);
  const atFloor = ogQc.checkOgFitRecord({ ...base, bengaliSize: 16, bengaliSparePx: 30 });
  assert.equal(atFloor.ok, true);
  assert.equal(atFloor.warnings.some((w) => w.includes("at the floor")), true);
  const thin = ogQc.checkOgFitRecord({ ...base, bengaliSparePx: 5 });
  assert.equal(thin.ok, true);
  assert.equal(thin.warnings.some((w) => w.includes("under one real-font line")), true);
  const over = ogQc.checkOgFitRecord({ ...base, bengaliOverflow: true, bengaliSparePx: -2 });
  assert.equal(over.ok, false);
  assert.equal(over.errors.some((e) => e.startsWith("bengali_overflow_at_min")), true);
  const below = ogQc.checkOgFitRecord({ ...base, arabicSize: 13 });
  assert.equal(below.ok, false);
  assert.equal(below.errors.some((e) => e.includes("below the 14px floor")), true);
  const neg = ogQc.checkOgFitRecord({ ...base, arabicSparePx: -2 });
  assert.equal(neg.ok, false);
  // Sub-pixel rounding (-0.4px) passes: same +1px tolerance as the render gate.
  assert.equal(ogQc.checkOgFitRecord({ ...base, arabicSparePx: -0.4 }).ok, true);
});
t("ogQc: readability guarantees pass for layout C and catch a lowered floor", () => {
  const sqLong = ogQc.effectiveBengaliFirstLayout("c", "square", 306, 538);
  const g = ogQc.checkOgReadabilityGuarantees("c", sqLong);
  assert.equal(g.ok, true);
  // Known hierarchy inversion (title 16 == floor 16) is a warning, not a pass/fail.
  assert.equal(g.warnings.some((w) => w.includes("hierarchy inversion")), true);
  const poLong = ogQc.effectiveBengaliFirstLayout("c", "portrait", 306, 538);
  assert.equal(ogQc.checkOgReadabilityGuarantees("c", poLong).ok, true);
  const lowered = ogQc.checkOgReadabilityGuarantees("c", { ...sqLong, bengaliMinSize: 14 });
  assert.equal(lowered.ok, false);
  assert.equal(lowered.errors.some((e) => e.includes("16px hard floor")), true);
  const squeezed = ogQc.checkOgReadabilityGuarantees("c", { ...sqLong, bengaliLineHeight: 1.4 });
  assert.equal(squeezed.ok, false);
  const starved = ogQc.checkOgReadabilityGuarantees("c", { ...sqLong, arabicCapShare: 0.15 });
  assert.equal(starved.ok, false);
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
    posterUrl: null,
  });
});
t("containerState: poster_url flows through to the published record (Phase 3)", () => {
  const url = "https://cazdbxxffvdnsdatjsrx.supabase.co/storage/v1/object/public/daily-content-posters/2026-11-15/portrait.png";
  const rec = cstate.resolvePublishedRecord(pubRow({ poster_url: url }), hRow());
  assert.equal(rec.posterUrl, url);
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
  // 2026-03-20 is a Friday: Jumu'ah joins Eid al-Fitr, and book 11
  // (Friday Prayer) joins the chapter prefilter.
  assert.deepEqual(req.context.activeEventSlugs, ["eid-fitr", "jumuah"]);
  assert.deepEqual(req.chapterIds, [11, 13]);
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

// ---- Phase 8: daily share (pure, injected navigator/fetch) ----
const SHARE_POSTER_URL =
  "https://llicfiepatzgllmjhzbw.supabase.co/storage/v1/object/public/daily-content-posters/2026-11-17/portrait.png";
const shareRec = (over = {}) => ({
  bengali: "BENGALI-TEST",
  source: "Sahih al-Bukhari, Hadith 1",
  canonicalLink: "/hadith/sahih-bukhari/bangla",
  posterUrl: SHARE_POSTER_URL,
  kolkataDate: "2026-11-17",
  ...over,
});
const imageFetch = async () => ({
  ok: true,
  status: 200,
  headers: { get: (n) => (n === "content-type" ? "image/png" : null) },
  // 2,400 bytes: larger than the 1x1 probe file (68 bytes) so a
  // size-gated canShare can accept the probe and reject the real file.
  blob: async () => new Blob(["PNG-POSTER-".repeat(200)], { type: "image/png" }),
});
const httpFailFetch = async () => ({
  ok: false,
  status: 404,
  headers: { get: () => null },
  blob: async () => new Blob([]),
});
const textFetch = async () => ({
  ok: true,
  status: 200,
  headers: { get: (n) => (n === "content-type" ? "text/html" : null) },
  blob: async () => new Blob(["<html>"], { type: "text/html" }),
});
const throwingFetch = async () => {
  throw new Error("network down");
};

t("dailyShare: caption is Bengali-first with source, homepage link, brand suffix", () => {
  const caption = share.dailyShareCaption(shareRec());
  assert.ok(caption.startsWith("🤲 আজকের হাদিস\nBENGALI-TEST"));
  assert.ok(caption.includes("📖 Sahih al-Bukhari, Hadith 1"));
  assert.ok(caption.includes("🔗 https://www.noorapp.in/"));
  assert.ok(caption.endsWith("— NoorApp"));
  assert.equal(caption.includes("BENGALI-TEST"), true);
});

t("dailyShare: caption throws on missing Bengali or missing source", () => {
  assert.throws(() => share.dailyShareCaption(shareRec({ bengali: "  " })), /Bengali text/);
  assert.throws(() => share.dailyShareCaption(shareRec({ source: "" })), /source line/);
});

t("dailyShare: share URL is the homepage (where the daily card lives)", () => {
  assert.equal(share.dailyShareUrl(), "https://www.noorapp.in/");
});

t("dailyShare: WhatsApp URL is a wa.me text link carrying the caption", () => {
  const caption = share.dailyShareCaption(shareRec());
  const url = share.dailyWhatsappShareUrl(caption);
  assert.ok(url.startsWith("https://wa.me/?text="));
  assert.equal(decodeURIComponent(url.slice("https://wa.me/?text=".length)), caption);
});

t("dailyShare: Facebook URL is sharer.php with the homepage URL + quote", () => {
  const caption = share.dailyShareCaption(shareRec());
  const url = share.dailyFacebookShareUrl(share.dailyShareUrl(), caption);
  assert.ok(url.startsWith("https://www.facebook.com/sharer/sharer.php?"));
  const params = new URL(url).searchParams;
  assert.equal(params.get("u"), "https://www.noorapp.in/");
  assert.equal(params.get("quote"), caption);
});

t("dailyShare: finalized-poster URL validation accepts only the poster bucket PNG", () => {
  assert.equal(share.isFinalizedPosterUrl(SHARE_POSTER_URL), true);
  assert.equal(
    share.isFinalizedPosterUrl(SHARE_POSTER_URL.replace("/portrait.png", "/square.png")),
    true,
  );
  // Rehearsal project host is equally valid (same code, both environments).
  assert.equal(
    share.isFinalizedPosterUrl(
      "https://cazdbxxffvdnsdatjsrx.supabase.co/storage/v1/object/public/daily-content-posters/2026-11-17/portrait.png",
    ),
    true,
  );
  assert.equal(share.isFinalizedPosterUrl("http://example.com/storage/v1/object/public/daily-content-posters/2026-11-17/portrait.png"), false);
  assert.equal(share.isFinalizedPosterUrl("https://example.com/storage/v1/object/public/daily-content-posters/2026-11-17/portrait.png"), false);
  assert.equal(share.isFinalizedPosterUrl("https://www.noorapp.in/og-image.png"), false);
  assert.equal(share.isFinalizedPosterUrl("https://llicfiepatzgllmjhzbw.supabase.co/storage/v1/object/public/daily-content-posters/2026-11-17/portrait.jpg"), false);
  assert.equal(share.isFinalizedPosterUrl(null), false);
  assert.equal(share.isFinalizedPosterUrl(42), false);
});

t("dailyShare: poster format from URL + dated download filename", () => {
  assert.equal(share.posterFormatFromUrl(SHARE_POSTER_URL), "portrait");
  assert.equal(share.posterFormatFromUrl(SHARE_POSTER_URL.replace("portrait", "square")), "square");
  assert.equal(share.dailyPosterFileName("2026-11-17", SHARE_POSTER_URL), "noorapp-hadith-2026-11-17-portrait.png");
  assert.throws(() => share.dailyPosterFileName("17-11-2026", SHARE_POSTER_URL), /YYYY-MM-DD/);
});

t("dailyShare: fetchPosterFile returns a PNG File; HTTP / non-image / network throw typed errors", async () => {
  const file = await share.fetchPosterFile(SHARE_POSTER_URL, "noorapp-hadith-2026-11-17-portrait.png", imageFetch);
  assert.equal(file.name, "noorapp-hadith-2026-11-17-portrait.png");
  assert.equal(file.type, "image/png");
  await assert.rejects(
    share.fetchPosterFile(SHARE_POSTER_URL, "x.png", httpFailFetch),
    (e) => e.reason === "http",
  );
  await assert.rejects(
    share.fetchPosterFile(SHARE_POSTER_URL, "x.png", textFetch),
    (e) => e.reason === "not-image",
  );
  await assert.rejects(
    share.fetchPosterFile(SHARE_POSTER_URL, "x.png", throwingFetch),
    (e) => e.reason === "network",
  );
});

t("dailyShare: native-share support probe — none / text / image", () => {
  assert.equal(share.getNativeShareSupport(null), "none");
  assert.equal(share.getNativeShareSupport({}), "none");
  assert.equal(share.getNativeShareSupport({ share: async () => {} }), "text");
  assert.equal(
    share.getNativeShareSupport({ share: async () => {}, canShare: () => true }),
    "image",
  );
  assert.equal(
    share.getNativeShareSupport({
      share: async () => {},
      canShare: (d) => !d.files,
    }),
    "text",
  );
  assert.equal(
    share.getNativeShareSupport({
      share: async () => {},
      canShare: () => {
        throw new Error("unsupported shape");
      },
    }),
    "text",
  );
});

t("dailyShare: native file share sends the poster file + caption", async () => {
  const shared = [];
  const nav = {
    share: async (data) => {
      shared.push(data);
    },
    canShare: () => true,
  };
  const res = await share.shareDailyPoster(shareRec(), { nav, fetchImpl: imageFetch });
  assert.equal(res.method, "native-file");
  assert.equal(shared.length, 1);
  assert.equal(shared[0].files.length, 1);
  assert.equal(shared[0].files[0].name, "noorapp-hadith-2026-11-17-portrait.png");
  assert.equal(shared[0].files[0].type, "image/png");
  assert.ok(shared[0].text.includes("BENGALI-TEST"));
});

t("dailyShare: fetch failure degrades to a text share, never a silent failure", async () => {
  const shared = [];
  const nav = {
    share: async (data) => {
      shared.push(data);
    },
    canShare: () => true,
  };
  const res = await share.shareDailyPoster(shareRec(), { nav, fetchImpl: throwingFetch });
  assert.equal(res.method, "native-text");
  assert.equal(shared.length, 1);
  assert.equal(shared[0].files, undefined);
  assert.ok(shared[0].text.includes("BENGALI-TEST"));
});

t("dailyShare: text-only support shares text; no API reports unsupported; cancel is not an error", async () => {
  const shared = [];
  const textNav = {
    share: async (data) => {
      shared.push(data);
    },
    canShare: (d) => !d.files,
  };
  const textRes = await share.shareDailyPoster(shareRec(), { nav: textNav, fetchImpl: imageFetch });
  assert.equal(textRes.method, "native-text");
  assert.equal(shared.length, 1);

  const noneRes = await share.shareDailyPoster(shareRec(), { nav: {}, fetchImpl: imageFetch });
  assert.equal(noneRes.method, "unsupported");
  assert.equal(shared.length, 1);

  const abortError = new Error("user cancelled");
  abortError.name = "AbortError";
  const cancelNav = {
    share: async () => {
      throw abortError;
    },
    canShare: () => true,
  };
  const cancelRes = await share.shareDailyPoster(shareRec(), { nav: cancelNav, fetchImpl: imageFetch });
  assert.equal(cancelRes.method, "cancelled");

  const failNav = {
    share: async () => {
      throw new Error("share sheet failed");
    },
    canShare: () => true,
  };
  const failRes = await share.shareDailyPoster(shareRec(), { nav: failNav, fetchImpl: imageFetch });
  assert.equal(failRes.method, "failed");
  assert.equal(failRes.detail, "share sheet failed");
});

t("dailyShare: canShare rejecting the exact file falls back to text share", async () => {
  const shared = [];
  const nav = {
    share: async (data) => {
      shared.push(data);
    },
    // Tiny probe passes (68 bytes), the real 2.4 KB file does not.
    canShare: (d) => !(d.files && d.files[0].size > 1000),
  };
  const res = await share.shareDailyPoster(shareRec(), { nav, fetchImpl: imageFetch });
  assert.equal(res.method, "native-text");
  assert.equal(shared.length, 1);
  assert.equal(shared[0].files, undefined);
});

t("dailyShare: no finalized poster → file share refuses instead of sharing an arbitrary URL", async () => {
  const shared = [];
  const nav = {
    share: async (data) => {
      shared.push(data);
    },
    canShare: () => true,
  };
  const res = await share.shareDailyPoster(shareRec({ posterUrl: "https://example.com/other.png" }), {
    nav,
    fetchImpl: imageFetch,
  });
  assert.equal(res.method, "failed");
  assert.equal(shared.length, 0);
});

t("dailyShare: download serves the file; fetch failure opens the poster URL instead", async () => {
  const clicked = [];
  const revoked = [];
  const res = await share.downloadPoster(SHARE_POSTER_URL, "noorapp-hadith-2026-11-17-portrait.png", {
    fetchImpl: imageFetch,
    createObjectUrl: () => "blob:poster",
    revokeObjectUrl: (u) => revoked.push(u),
    clickAnchor: (href, name) => clicked.push({ href, name }),
  });
  assert.equal(res.method, "downloaded");
  assert.deepEqual(clicked, [{ href: "blob:poster", name: "noorapp-hadith-2026-11-17-portrait.png" }]);
  assert.deepEqual(revoked, ["blob:poster"]);

  const opened = [];
  const res2 = await share.downloadPoster(SHARE_POSTER_URL, "noorapp-hadith-2026-11-17-portrait.png", {
    fetchImpl: throwingFetch,
    openWindow: (u) => opened.push(u),
  });
  assert.equal(res2.method, "opened");
  assert.deepEqual(opened, [SHARE_POSTER_URL]);
});

t("dailyShare: copyText returns true on success, false when denied or unavailable", async () => {
  assert.equal(await share.copyText("https://www.noorapp.in/", { writeText: async () => {} }), true);
  assert.equal(
    await share.copyText("https://www.noorapp.in/", {
      writeText: async () => {
        throw new Error("denied");
      },
    }),
    false,
  );
  assert.equal(await share.copyText("https://www.noorapp.in/", null), false);
});

// --- monitoring (Phase 10): schedule assessment, alert derivation, snapshot ---
const monPub = (over = {}) => ({
  id: "pub-1",
  kolkata_date: "2026-11-17",
  status: "published",
  poster_qc_status: "passed",
  poster_error: null,
  poster_url: "https://example.supabase.co/storage/v1/object/public/daily-content-posters/2026-11-17/portrait.png",
  hadith_ref: "hadith:h1",
  recipients_total: 9,
  recipients_sent: 9,
  recipients_failed: 0,
  error: null,
  created_at: "2026-11-17T00:35:00.000Z",
  published_at: "2026-11-17T00:35:00.000Z",
  ...over,
});
const monDel = (over = {}) => ({
  publication_id: "pub-1",
  status: "sent",
  attempts: 1,
  max_attempts: 4,
  created_at: "2026-11-17T00:35:00.000Z",
  error: null,
  ...over,
});

t("monitoring: published on time (06:05 IST) -> ok", () => {
  const s = mon.assessSchedule(new Date("2026-11-17T10:00:00+05:30"), "2026-11-17", monPub());
  assert.equal(s.status, "ok");
  assert.equal(s.window, "closed");
  assert.equal(s.expected_at, "2026-11-17T00:30:00.000Z");
  assert.equal(s.grace_until, "2026-11-17T01:00:00.000Z");
});
t("monitoring: published late (12:39 IST, the 2026-11-16 shape) -> late", () => {
  const s = mon.assessSchedule(
    new Date("2026-11-16T13:00:00+05:30"),
    "2026-11-16",
    monPub({ kolkata_date: "2026-11-16", published_at: "2026-11-16T07:09:00.000Z" }),
  );
  assert.equal(s.status, "late");
});
t("monitoring: no row after grace (10:00 IST, the 2026-11-17 shape) -> missed", () => {
  const s = mon.assessSchedule(new Date("2026-11-17T10:00:00+05:30"), "2026-11-17", null);
  assert.equal(s.status, "missed");
  assert.equal(s.window, "closed");
});
t("monitoring: planned row after grace -> missed", () => {
  const s = mon.assessSchedule(
    new Date("2026-11-17T10:00:00+05:30"),
    "2026-11-17",
    monPub({ status: "planned", published_at: null }),
  );
  assert.equal(s.status, "missed");
  assert.equal(s.publication_status, "planned");
});
t("monitoring: failed row after grace -> missed", () => {
  const s = mon.assessSchedule(
    new Date("2026-11-17T10:00:00+05:30"),
    "2026-11-17",
    monPub({ status: "failed", published_at: null, error: "no valid plan" }),
  );
  assert.equal(s.status, "missed");
});
t("monitoring: no row before grace (05:30 IST) -> ok, window open", () => {
  const s = mon.assessSchedule(new Date("2026-11-17T05:30:00+05:30"), "2026-11-17", null);
  assert.equal(s.status, "ok");
  assert.equal(s.window, "open");
});
t("monitoring: grace boundary — 06:29 IST ok, 06:30 IST missed", () => {
  assert.equal(mon.assessSchedule(new Date("2026-11-17T06:29:00+05:30"), "2026-11-17", null).status, "ok");
  assert.equal(mon.assessSchedule(new Date("2026-11-17T06:30:00+05:30"), "2026-11-17", null).status, "missed");
});
t("monitoring: timezone — 01:00 UTC is 06:30 IST (missed), 00:35 UTC is 06:05 IST (ok)", () => {
  assert.equal(mon.assessSchedule(new Date("2026-11-17T01:00:00.000Z"), "2026-11-17", null).status, "missed");
  const s = mon.assessSchedule(
    new Date("2026-11-17T01:00:00.000Z"),
    "2026-11-17",
    monPub({ published_at: "2026-11-17T00:35:00.000Z" }),
  );
  assert.equal(s.status, "ok");
});
t("monitoring: published row with no published_at -> ok (never late on missing data)", () => {
  const s = mon.assessSchedule(
    new Date("2026-11-17T10:00:00+05:30"),
    "2026-11-17",
    monPub({ published_at: null }),
  );
  assert.equal(s.status, "ok");
});
t("monitoring: deriveAlerts — failed row critical, quarantined critical, poster failed warn", () => {
  const alerts = mon.deriveAlerts(
    [
      monPub({ id: "p-fail", kolkata_date: "2026-11-16", status: "failed", error: "no valid plan" }),
      monPub({ id: "p-q", kolkata_date: "2026-11-17", status: "planned", poster_qc_status: "failed", poster_error: "quarantined:bengali_overflow_at_min" }),
      monPub({ id: "p-pf", kolkata_date: "2026-11-15", status: "planned", poster_qc_status: "failed", poster_error: "bengali_overflow_at_min" }),
    ],
    [],
  );
  assert.equal(alerts.length, 3);
  assert.equal(alerts.find((a) => a.publication_id === "p-fail").level, "critical");
  assert.equal(alerts.find((a) => a.publication_id === "p-q").level, "critical");
  assert.equal(alerts.find((a) => a.publication_id === "p-q").reason, "quarantined:bengali_overflow_at_min");
  assert.equal(alerts.find((a) => a.publication_id === "p-pf").level, "warn");
});
t("monitoring: deriveAlerts — failed deliveries aggregate per (publication, error)", () => {
  const alerts = mon.deriveAlerts(
    [monPub()],
    [
      monDel({ status: "failed", error: "gone" }),
      monDel({ status: "failed", error: "gone" }),
      monDel({ status: "failed", error: "timeout" }),
      monDel({ status: "retryable", error: "gone" }),
    ],
  );
  assert.equal(alerts.length, 2);
  assert.equal(alerts.find((a) => a.reason.includes("gone")).reason, "push delivery failed for 2 devices: gone");
  assert.ok(alerts.find((a) => a.reason.includes("timeout")));
});
t("monitoring: dedupeAlerts — same day+reason twice -> one alert", () => {
  const a = { level: "warn", reason: "poster failed; poster workflow retry needed", kolkata_date: "2026-11-17", publication_id: "p1", first_seen: "2026-11-17T01:00:00.000Z" };
  const out = mon.dedupeAlerts([a, { ...a }, { ...a, reason: "other" }]);
  assert.equal(out.length, 2);
});
t("monitoring: snapshot — published today, push counts + retryable + last activity", () => {
  const snap = mon.buildMonitoringSnapshot(
    [monPub()],
    [
      monDel({ status: "retryable", attempts: 1, max_attempts: 4, created_at: "2026-11-17T00:40:00.000Z" }),
      monDel({ status: "retryable", attempts: 3, max_attempts: 4, created_at: "2026-11-17T00:40:00.000Z" }),
      monDel({ status: "failed", attempts: 4, max_attempts: 4, error: "gone" }),
    ],
    new Date("2026-11-17T10:00:00+05:30"),
  );
  assert.equal(snap.kolkata_date, "2026-11-17");
  assert.equal(snap.schedule.status, "ok");
  assert.equal(snap.publication.status, "published");
  assert.equal(snap.publication.poster_qc_status, "passed");
  assert.equal(snap.push.total, 9);
  assert.equal(snap.push.sent, 9);
  assert.equal(snap.push.retryable, 2);
  assert.equal(snap.push.attempts_remaining, 4);
  assert.equal(snap.alerts.length, 1);
  assert.equal(snap.last_activity, "2026-11-17T00:40:00.000Z");
});
t("monitoring: snapshot — no row after grace -> missed, no publication, empty push", () => {
  const snap = mon.buildMonitoringSnapshot([], [], new Date("2026-11-17T10:00:00+05:30"));
  assert.equal(snap.schedule.status, "missed");
  assert.equal(snap.publication, null);
  assert.equal(snap.push.total, 0);
  assert.equal(snap.alerts.length, 0);
  assert.equal(snap.last_activity, null);
});
t("monitoring: snapshot — quarantined today -> missed schedule + critical alert + recent failure", () => {
  const snap = mon.buildMonitoringSnapshot(
    [monPub({ status: "planned", poster_qc_status: "failed", poster_error: "quarantined:bengali_overflow_at_min", published_at: null })],
    [],
    new Date("2026-11-17T10:00:00+05:30"),
  );
  assert.equal(snap.schedule.status, "missed");
  assert.equal(snap.alerts.length, 1);
  assert.equal(snap.alerts[0].level, "critical");
  assert.equal(snap.recent_failures.length, 1);
  assert.equal(snap.recent_failures[0].reason, "quarantined:bengali_overflow_at_min");
});

// --- 8-validation autonomous gate ---
// A valid (publishable) input: synthetic texts only ("ARABIC-TEST" /
// "BENGALI-TEST" carry no topic keywords, and the fixture hadith is
// chapter 1, so the engine classifies it "intentions" via the chapter
// prior — the fixture scene is the intentions concept's scene
// "intention-sunrise").
const gatePoster = (over = {}) => ({
  url: "http://stub/storage/v1/object/public/daily-content-posters/2026-11-17/portrait.png",
  urls: { portrait: "http://stub/storage/v1/object/public/daily-content-posters/2026-11-17/portrait.png" },
  assetId: "poster:2026-11-17",
  storagePath: "daily-content-posters/2026-11-17/portrait.png",
  checksum: "a".repeat(64),
  checksums: { portrait: "a".repeat(64) },
  sceneId: "intention-sunrise",
  qcStatus: "passed",
  generatedAt: "2026-11-17T02:00:00.000Z",
  ...over,
});
const gateInput = (over = {}) => ({
  kolkataDate: "2026-11-17",
  hadithRef: "hadith:h1",
  hadithSourceLine: "Sahih al-Bukhari, Hadith 1",
  cards: [{ kind: "hadith", recordRef: "hadith:h1", arabic: "ARABIC-TEST", bengali: "BENGALI-TEST", sourceLine: "Sahih al-Bukhari, Hadith 1" }],
  push: { title: "TITLE", body: "BODY" },
  poster: gatePoster(),
  liveHadith: { id: "h1", book_key: "bukhari", chapter_id: 1, hadith_number: 1, arabic: "ARABIC-TEST", bengali: "BENGALI-TEST", english: null },
  liveDuas: {},
  history: [],
  hadithCycle: 1,
  cardCycle: 1,
  posterBaseUrl: "http://stub",
  ...over,
});
const gateResult = (verdict, id) => verdict.results.find((r) => r.id === id);
const gateHistRow = (over = {}) => ({
  kolkata_date: "2026-11-16", hadith_ref: null, cards: [], poster_scene_id: null, hadith_cycle: 1, card_cycle: 1, ...over,
});

t("gate: valid input -> publish, all 8 pass", () => {
  const v = gate.evaluateAutonomousGate(gateInput());
  assert.equal(v.decision, "publish");
  assert.deepEqual(v.failed, []);
  assert.equal(v.results.length, 8);
  assert.ok(v.results.every((r) => r.pass));
});
t("gate: valid input + one dua card -> publish", () => {
  const v = gate.evaluateAutonomousGate(gateInput({
    cards: [
      { kind: "hadith", recordRef: "hadith:h1", arabic: "ARABIC-TEST", bengali: "BENGALI-TEST", sourceLine: "Sahih al-Bukhari, Hadith 1" },
      { kind: "dua", recordRef: "content:s1", arabic: "ARABIC-s1", bengali: "BENGALI-s1", sourceLine: "REF-s1" },
    ],
    liveDuas: { s1: { slug: "s1", title: "TITLE-s1", content: "BENGALI-s1", content_arabic: "ARABIC-s1", metadata: { reference: "REF-s1", source_type: "Dua" }, status: "published", content_type: "dua" } },
  }));
  assert.equal(v.decision, "publish");
});
t("gate V1: source line number mismatch -> fail (V1 only)", () => {
  const v = gate.evaluateAutonomousGate(gateInput({ hadithSourceLine: "Sahih al-Bukhari, Hadith 2" }));
  assert.equal(v.decision, "hold");
  assert.deepEqual(v.failed, ["source_reference_integrity"]);
  assert.equal(gateResult(v, "source_reference_integrity").pass, false);
});
t("gate V1: malformed hadith_ref -> fail", () => {
  const v = gate.evaluateAutonomousGate(gateInput({ hadithRef: "bukhari-10-869" }));
  assert.equal(gateResult(v, "source_reference_integrity").pass, false);
});
t("gate V1: live hadith missing -> fail (fail-closed)", () => {
  const v = gate.evaluateAutonomousGate(gateInput({ liveHadith: null }));
  assert.equal(gateResult(v, "source_reference_integrity").pass, false);
  assert.equal(v.decision, "hold");
});
t("gate V1: two hadith cards -> fail", () => {
  const v = gate.evaluateAutonomousGate(gateInput({
    cards: [
      { kind: "hadith", recordRef: "hadith:h1", arabic: "ARABIC-TEST", bengali: "BENGALI-TEST", sourceLine: "Sahih al-Bukhari, Hadith 1" },
      { kind: "hadith", recordRef: "hadith:h2", arabic: "ARABIC-H2", bengali: "BENGALI-H2", sourceLine: "Sahih al-Bukhari, Hadith 2" },
    ],
  }));
  assert.equal(gateResult(v, "source_reference_integrity").pass, false);
});
t("gate V1: duplicate card refs -> fail", () => {
  const v = gate.evaluateAutonomousGate(gateInput({
    cards: [
      { kind: "hadith", recordRef: "hadith:h1", arabic: "ARABIC-TEST", bengali: "BENGALI-TEST", sourceLine: "Sahih al-Bukhari, Hadith 1" },
      { kind: "dua", recordRef: "hadith:h1", arabic: "ARABIC-TEST", bengali: "BENGALI-TEST", sourceLine: "REF" },
    ],
  }));
  assert.equal(gateResult(v, "source_reference_integrity").pass, false);
});
t("gate V1: zero cards -> fail", () => {
  const v = gate.evaluateAutonomousGate(gateInput({ cards: [] }));
  assert.equal(gateResult(v, "source_reference_integrity").pass, false);
});
t("gate V1: dua card with no live row -> fail (fail-closed)", () => {
  const v = gate.evaluateAutonomousGate(gateInput({
    cards: [
      { kind: "hadith", recordRef: "hadith:h1", arabic: "ARABIC-TEST", bengali: "BENGALI-TEST", sourceLine: "Sahih al-Bukhari, Hadith 1" },
      { kind: "dua", recordRef: "content:s9", arabic: "ARABIC-s9", bengali: "BENGALI-s9", sourceLine: "REF-s9" },
    ],
  }));
  assert.equal(gateResult(v, "source_reference_integrity").pass, false);
});
t("gate V2: card Arabic differs from live -> fail (V2 only)", () => {
  const v = gate.evaluateAutonomousGate(gateInput({
    cards: [{ kind: "hadith", recordRef: "hadith:h1", arabic: "ARABIC-CHANGED", bengali: "BENGALI-TEST", sourceLine: "Sahih al-Bukhari, Hadith 1" }],
  }));
  assert.equal(v.decision, "hold");
  assert.deepEqual(v.failed, ["arabic_integrity"]);
});
t("gate V2: empty card Arabic -> fail", () => {
  const v = gate.evaluateAutonomousGate(gateInput({
    cards: [{ kind: "hadith", recordRef: "hadith:h1", arabic: "  ", bengali: "BENGALI-TEST", sourceLine: "Sahih al-Bukhari, Hadith 1" }],
  }));
  assert.equal(gateResult(v, "arabic_integrity").pass, false);
});
t("gate V3: card Bengali differs from live -> fail (V3 only)", () => {
  const v = gate.evaluateAutonomousGate(gateInput({
    cards: [{ kind: "hadith", recordRef: "hadith:h1", arabic: "ARABIC-TEST", bengali: "BENGALI-CHANGED", sourceLine: "Sahih al-Bukhari, Hadith 1" }],
  }));
  assert.equal(v.decision, "hold");
  assert.deepEqual(v.failed, ["bengali_editorial_quality"]);
});
t("gate V3: meaning failure (পিতৃসত্তা) -> fail (V3 only)", () => {
  // The corpus case: a translation containing পিতৃসত্তা is a meaning
  // distortion (Qur'an 112:3) — the gate must hold it even when the
  // card matches the live row verbatim. The word is the pattern under
  // test, not transcribed content.
  const bn = "BENGALI-TEST পিতৃসত্তা";
  const v = gate.evaluateAutonomousGate(gateInput({
    cards: [{ kind: "hadith", recordRef: "hadith:h1", arabic: "ARABIC-TEST", bengali: bn, sourceLine: "Sahih al-Bukhari, Hadith 1" }],
    liveHadith: { id: "h1", book_key: "bukhari", chapter_id: 1, hadith_number: 1, arabic: "ARABIC-TEST", bengali: bn, english: null },
  }));
  assert.equal(v.decision, "hold");
  assert.deepEqual(v.failed, ["bengali_editorial_quality"]);
  assert.match(gateResult(v, "bengali_editorial_quality").detail, /পিতৃসত্তা/);
});
t("gate V3: soft issues (repetition) are warnings, never blocking", () => {
  const bn = "BENGALI-TEST। BENGALI-TEST।";
  const v = gate.evaluateAutonomousGate(gateInput({
    cards: [{ kind: "hadith", recordRef: "hadith:h1", arabic: "ARABIC-TEST", bengali: bn, sourceLine: "Sahih al-Bukhari, Hadith 1" }],
    liveHadith: { id: "h1", book_key: "bukhari", chapter_id: 1, hadith_number: 1, arabic: "ARABIC-TEST", bengali: bn, english: null },
  }));
  assert.equal(v.decision, "publish");
  assert.ok(gateResult(v, "bengali_editorial_quality").warnings.some((w) => w.includes("Repetition")));
});
t("gate V4: claim word introduced in the push -> fail (V4 only)", () => {
  const v = gate.evaluateAutonomousGate(gateInput({ push: { title: "TITLE", body: "BODY সওয়াব" } }));
  assert.equal(v.decision, "hold");
  assert.deepEqual(v.failed, ["fabricated_claims_detection"]);
});
t("gate V4: claim word that is the live source's own wording -> pass, noted", () => {
  // The corpus case: 5/218 bundled duas faithfully contain সওয়াব /
  // নিশ্চিত / পুরস্কার from their Qur'an source — those are NOT
  // fabricated claims. The word is the pattern under test.
  const bn = "BENGALI-TEST সওয়াব";
  const v = gate.evaluateAutonomousGate(gateInput({
    cards: [{ kind: "hadith", recordRef: "hadith:h1", arabic: "ARABIC-TEST", bengali: bn, sourceLine: "Sahih al-Bukhari, Hadith 1" }],
    liveHadith: { id: "h1", book_key: "bukhari", chapter_id: 1, hadith_number: 1, arabic: "ARABIC-TEST", bengali: bn, english: null },
  }));
  assert.equal(v.decision, "publish");
  assert.match(gateResult(v, "fabricated_claims_detection").detail, /source.s own wording/);
});
t("gate V5: scene from another topic -> fail (V5 only)", () => {
  const v = gate.evaluateAutonomousGate(gateInput({ poster: gatePoster({ sceneId: "courtyard-prayer" }) }));
  assert.equal(v.decision, "hold");
  assert.deepEqual(v.failed, ["content_visual_consistency"]);
});
t("gate V5: same scene used yesterday -> fail (14-day window)", () => {
  const v = gate.evaluateAutonomousGate(gateInput({
    history: [gateHistRow({ kolkata_date: "2026-11-16", poster_scene_id: "intention-sunrise" })],
  }));
  assert.equal(v.decision, "hold");
  assert.deepEqual(v.failed, ["content_visual_consistency"]);
});
t("gate V5: same scene 15 days ago -> pass (window expired)", () => {
  const v = gate.evaluateAutonomousGate(gateInput({
    history: [gateHistRow({ kolkata_date: "2026-11-02", poster_scene_id: "intention-sunrise" })],
  }));
  assert.equal(v.decision, "publish");
});
t("gate V5: poster QC not passed -> fail (V5 + V6)", () => {
  const v = gate.evaluateAutonomousGate(gateInput({ poster: gatePoster({ qcStatus: "failed" }) }));
  assert.equal(v.decision, "hold");
  assert.equal(gateResult(v, "content_visual_consistency").pass, false);
  assert.equal(gateResult(v, "bengali_readability_image_quality").pass, false);
});
t("gate V6: empty push body -> fail (V6 only)", () => {
  const v = gate.evaluateAutonomousGate(gateInput({ push: { title: "TITLE", body: "  " } }));
  assert.equal(v.decision, "hold");
  assert.deepEqual(v.failed, ["bengali_readability_image_quality"]);
});
t("gate V7: published row already exists for today -> fail (V7 only)", () => {
  const v = gate.evaluateAutonomousGate(gateInput({
    history: [gateHistRow({ kolkata_date: "2026-11-17", hadith_ref: "hadith:h9" })],
  }));
  assert.equal(v.decision, "hold");
  assert.deepEqual(v.failed, ["duplicate_prevention"]);
});
t("gate V7: same hadith already published in this cycle -> fail", () => {
  const v = gate.evaluateAutonomousGate(gateInput({
    history: [gateHistRow({ kolkata_date: "2026-11-16", hadith_ref: "hadith:h1", hadith_cycle: 1 })],
  }));
  assert.equal(gateResult(v, "duplicate_prevention").pass, false);
});
t("gate V7: same hadith in an older cycle -> pass", () => {
  const v = gate.evaluateAutonomousGate(gateInput({
    history: [gateHistRow({ kolkata_date: "2026-11-16", hadith_ref: "hadith:h1", hadith_cycle: 0 })],
    hadithCycle: 1,
  }));
  assert.equal(v.decision, "publish");
});
t("gate V7: same dua card already published in this card cycle -> fail", () => {
  const v = gate.evaluateAutonomousGate(gateInput({
    cards: [
      { kind: "hadith", recordRef: "hadith:h1", arabic: "ARABIC-TEST", bengali: "BENGALI-TEST", sourceLine: "Sahih al-Bukhari, Hadith 1" },
      { kind: "dua", recordRef: "content:s1", arabic: "ARABIC-s1", bengali: "BENGALI-s1", sourceLine: "REF-s1" },
    ],
    liveDuas: { s1: { slug: "s1", title: "TITLE-s1", content: "BENGALI-s1", content_arabic: "ARABIC-s1", metadata: { reference: "REF-s1", source_type: "Dua" }, status: "published", content_type: "dua" } },
    history: [gateHistRow({ kolkata_date: "2026-11-16", cards: [{ recordRef: "content:s1" }], card_cycle: 1 })],
  }));
  assert.equal(gateResult(v, "duplicate_prevention").pass, false);
});
t("gate V7: missing cycle numbers -> fail (fail-closed)", () => {
  const v = gate.evaluateAutonomousGate(gateInput({ hadithCycle: null, cardCycle: null }));
  assert.equal(gateResult(v, "duplicate_prevention").pass, false);
});
t("gate V8: bad checksum -> fail (V8 only)", () => {
  const v = gate.evaluateAutonomousGate(gateInput({ poster: gatePoster({ checksum: "xyz" }) }));
  assert.equal(v.decision, "hold");
  assert.deepEqual(v.failed, ["finalized_asset_integrity"]);
});
t("gate V8: poster generated on another date -> fail", () => {
  const v = gate.evaluateAutonomousGate(gateInput({ poster: gatePoster({ generatedAt: "2026-11-16T02:00:00.000Z" }) }));
  assert.equal(gateResult(v, "finalized_asset_integrity").pass, false);
});
t("gate V8: wrong asset id -> fail", () => {
  const v = gate.evaluateAutonomousGate(gateInput({ poster: gatePoster({ assetId: "poster:2026-11-16" }) }));
  assert.equal(gateResult(v, "finalized_asset_integrity").pass, false);
});
t("gate V8: no poster base URL -> fail (fail-closed)", () => {
  const v = gate.evaluateAutonomousGate(gateInput({ posterBaseUrl: "" }));
  assert.equal(gateResult(v, "finalized_asset_integrity").pass, false);
});
t("gate: malformed cards (missing recordRef / non-string text) -> hold, never throw", () => {
  const v = gate.evaluateAutonomousGate(gateInput({
    cards: [{ kind: "hadith", bengali: "BENGALI-H" }],
  }));
  assert.equal(v.decision, "hold");
  assert.ok(v.failed.includes("source_reference_integrity"));
});
t("gate: two failures -> hold listing both", () => {
  const v = gate.evaluateAutonomousGate(gateInput({
    poster: gatePoster({ checksum: "xyz" }),
    push: { title: "TITLE", body: "  " },
  }));
  assert.equal(v.decision, "hold");
  assert.deepEqual(v.failed, ["bengali_readability_image_quality", "finalized_asset_integrity"]);
  assert.equal(v.reasons.length, 2);
});


// --- palettes (Master mission Phase 2: dynamic color system) ---
t("palettes: contrast math — white/black is 21, brand gold vs #0b1526 is 10.65", () => {
  assert.equal(pal.contrastRatio("#ffffff", "#000000"), 21);
  assert.equal(pal.contrastRatio("#000000", "#ffffff"), 21);
  assert.equal(pal.contrastRatio("#e9c15c", "#0b1526"), 10.65);
  assert.equal(pal.contrastRatio("#ffffff", "#0b1526"), 18.27);
  assert.equal(pal.contrastRatio("not-a-color", "#0b1526"), null);
  assert.equal(pal.relativeLuminance("#ffffff"), 1);
  assert.equal(pal.relativeLuminance("#000000"), 0);
});
t("palettes: all 11 topic palettes reach the 4.5 contrast floor (readability non-negotiable)", () => {
  assert.equal(Object.keys(pal.PALETTES).length, 11);
  for (const p of Object.values(pal.PALETTES)) {
    const r = pal.checkPaletteContrast(p);
    assert.equal(r.ok, true, `${p.id} (${p.accent}) contrast ${r.ratio} < 4.5`);
    assert.ok(r.ratio >= 4.5);
  }
  assert.equal(pal.PALETTE_MIN_CONTRAST, 4.5);
  assert.equal(pal.BRAND_GOLD, "#e9c15c");
  assert.equal(pal.POSTER_BG, "#0b1526");
});
t("palettes: lookup by id; unknown id is null (never a silent fallback)", () => {
  assert.equal(pal.paletteById("emerald").accent, "#7fd4a8");
  assert.equal(pal.paletteById("gentle-green").name, "Gentle green");
  assert.equal(pal.paletteById("no-such-palette"), null);
  assert.equal(pal.accentRgba("#7fd4a8", 0.85), "rgba(127, 212, 168, 0.85)");
  assert.equal(pal.accentRgba("bad", 0.85), null);
});

// --- sharing: one finalized asset, every channel (Master mission Phase 2 §9) ---
t("dailyShare: one asset — native file share, download and links all use the same finalized poster URL", async () => {
  const rec = shareRec();
  const seen = [];
  const nav = {
    share: async (data) => { seen.push(data); },
    canShare: () => true,
  };
  const res = await share.shareDailyPoster(rec, { nav, fetchImpl: imageFetch });
  assert.equal(res.method, "native-file");
  assert.equal(seen.length, 1);
  assert.equal(seen[0].files[0].name, "noorapp-hadith-2026-11-17-portrait.png");
  assert.ok(seen[0].text.includes("BENGALI-TEST"));
  const dl = await share.downloadPoster(SHARE_POSTER_URL, "noorapp-hadith-2026-11-17-portrait.png", {
    fetchImpl: imageFetch,
    createObjectUrl: () => "blob:fake",
    revokeObjectUrl: () => {},
    clickAnchor: (href, name) => { seen.push({ href, name }); },
  });
  assert.equal(dl.method, "downloaded");
  assert.equal(seen[1].name, "noorapp-hadith-2026-11-17-portrait.png");
  const caption = share.dailyShareCaption(rec);
  assert.ok(share.dailyWhatsappShareUrl(caption).includes(encodeURIComponent("https://www.noorapp.in/")));
  assert.ok(share.dailyFacebookShareUrl(share.dailyShareUrl(), caption).includes(encodeURIComponent("https://www.noorapp.in/")));
});
t("dailyShare: a non-finalized URL never yields a file share (same gate as download)", async () => {
  const nav = { share: async () => {}, canShare: () => true };
  const res = await share.shareDailyPoster(
    shareRec({ posterUrl: "https://example.com/storage/v1/object/public/daily-content-posters/2026-11-17/portrait.png" }),
    { nav, fetchImpl: imageFetch },
  );
  assert.equal(res.method, "failed");
  assert.equal(res.detail, "no finalized poster to share");
});

await Promise.all(pending);
console.log(`\nALL ${n} TESTS PASSED`);
