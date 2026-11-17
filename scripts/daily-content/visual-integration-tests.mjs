// Visual Intelligence integration tests — Phase 2 (2026-11-17).
// Runs against the COMPILED lib (tsc -> scripts/daily-content/.out),
// same pattern as tests.mjs. Run via run.sh (after the lib compile) or:
//   ./node_modules/.bin/tsc <files> --module esnext --target es2020 --skipLibCheck --outDir scripts/daily-content/.out
//   node scripts/daily-content/visual-integration-tests.mjs
//
// Test inputs are VERIFIED texts, copied from the engine's own self-test
// (visual-intel/visual-concept-engine.test.ts, 47/47) for the 7-hadith
// plan, plus the two live renders:
//  - bukhari-66-5022: Bengali transcribed from the verified E2E portrait
//    (NOORAPP-E2E-REPORT-2026-11-17, checksum 7c7427f4...); Arabic +
//    English from the bundled sahih_bukhari_en.json (exact).
//  - bukhari-10-869: Bengali transcribed from the verified Phase 3
//    render (poster-phase3-test/real869-c-portrait.png); Arabic +
//    English from the bundle (= the engine test's Arabic, exact).
// These fixtures verify SELECTION + QC logic only. They are never
// rendered as published content and never leave this test file.
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const engine = await import(path.join(dir, ".out/visualConceptEngine.js"));
const vs = await import(path.join(dir, ".out/visualSelection.js"));
const bg = await import(path.join(dir, ".out/backgrounds.js"));
const sem = await import(path.join(dir, ".out/semantic.js"));

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

// --- verified inputs (see header) ---
const H = (over) => ({
  ref: "hadith:bukhari-1-1", bookKey: "bukhari", chapterId: 1,
  chapterTitleEn: "Revelation",
  bengali: "কর্মের ফলাফল নিয়তের উপর নির্ভরশীল।",
  arabic: "إنما الأعمال بالنيات",
  english: "Actions are judged by intentions.",
  sourceLine: "Sahih Bukhari, Hadith 1",
  ...over,
});
const INPUTS = {
  intentions: H({}),
  knowledge: H({
    ref: "hadith:rotation-knowledge", bookKey: "ibn-majah", chapterId: null,
    chapterTitleEn: null,
    bengali: "জ্ঞান অনুন্ধান করা প্রতিটি মুসলিমের জন্য বাধ্যতামূলক।",
    arabic: "طلب العلم فريضة على كل مسلم",
    english: "Seeking knowledge is an obligation upon every Muslim.",
    sourceLine: "Ibn Majah",
  }),
  speech: H({
    ref: "hadith:bukhari-78-6018", bookKey: "bukhari", chapterId: 78,
    chapterTitleEn: "Good Manners",
    bengali: "যে ব্যক্তি আল্লাহ ও শেষ দিবসে বিশ্বাস করে, সে যেন ভালো কথা বলে অথবা চুপ থাকে।",
    arabic: "من كان يؤمن بالله واليوم الآخر فليقل خيراً أو ليصمت",
    english: "Whoever believes in Allah and the Last Day should speak good or remain silent.",
    sourceLine: "Sahih Bukhari, Hadith 6018",
  }),
  quran5027: H({
    ref: "hadith:bukhari-66-5027", bookKey: "bukhari", chapterId: 66,
    chapterTitleEn: "Virtues of the Quran",
    bengali: "তোমাদের মধ্যে সর্বোত্তম সেই ব্যক্তি যে কুরআন শেখে এবং অন্যদের শেখায়।",
    arabic: "خيركم من تعلم القرآن وعلمه",
    english: "The best of you is the one who learns the Quran and teaches it.",
    sourceLine: "Sahih Bukhari, Hadith 5027",
  }),
  character: H({
    ref: "hadith:rotation-character", bookKey: "abu-dawud", chapterId: null,
    chapterTitleEn: null,
    bengali: "মুমিনদের মধ্যে সবচেয়ে পূর্ণ ঈমানের অধিকারী সে যার চরিত্র সবচেয়ে সুন্দর।",
    arabic: "أكمل المؤمنين إيماناً أحسنهم خلقاً",
    english: "The most complete believer in faith is the one with the best character.",
    sourceLine: "Abu Dawud",
  }),
  safety: H({
    ref: "hadith:bukhari-2-10", bookKey: "bukhari", chapterId: 2,
    chapterTitleEn: "Belief",
    bengali: "মুসলিম সেই ব্যক্তি যার জিহ্বা ও হাত থেকে অন্য মুসলিমরা নিরাপদ থাকে।",
    arabic: "المسلم من سلم المسلمون من لسانه ويده",
    english: "A Muslim is the one from whose tongue and hands other Muslims are safe.",
    sourceLine: "Sahih Bukhari, Hadith 10",
  }),
  modesty: H({
    ref: "hadith:bukhari-2-24", bookKey: "bukhari", chapterId: 2,
    chapterTitleEn: "Belief",
    bengali: "লজ্জাশীলতা ঈমানের অংশ।",
    arabic: "الحياء من الإيمان",
    english: "Modesty is part of faith.",
    sourceLine: "Sahih Bukhari, Hadith 24",
  }),
  h869: H({
    ref: "hadith:bukhari-10-869", bookKey: "bukhari", chapterId: 10,
    chapterTitleEn: "Call to Prayers (Adhan)",
    bengali: "‘আয়িশাহ (রাযি.) হতে বর্ণিত। তিনি বলেন, যদি আল্লাহর রাসূল সাল্লাল্লাহু আলাইহি ওয়াসাল্লাম জানতেন যে, নারীরা কী অবস্থা সৃষ্টি করেছে, তাহলে বনী ইসরাঈলের নারীদের যেমন বারণ করা হয়েছিল, তেমনি এদেরও মসজিদে আসা নিষেধ করে দিতেন। (রাবী) ইয়াহইয়া ইবনু সা‘ঈদ (রহ.) বলেন,) আমি ‘আমরাহ্ (রাযি.)-কে জিজ্ঞেস করলাম, তাদের কি নিষেধ করা হয়েছিল? তিনি বললেন, হাঁ। (মুসলিম ৪/৩০, হাঃ ৪৪৫, আহমাদ ২৬০৪১) (আধুনিক প্রকাশনীঃ ৮২০, ইসলামিক ফাউন্ডেশনঃ)",
    arabic: "حَدَّثَنَا عَبْدُ اللَّهِ بْنُ يُوسُفَ، قَالَ أَخْبَرَنَا مَالِكٌ، عَنْ يَحْيَى بْنِ سَعِيدٍ، عَنْ عَمْرَةَ، عَنْ عَائِشَةَ ـ رضى الله عنها ـ قَالَتْ لَوْ أَدْرَكَ رَسُولُ اللَّهِ صلى الله عليه وسلم مَا أَحْدَثَ النِّسَاءُ لَمَنَعَهُنَّ كَمَا مُنِعَتْ نِسَاءُ بَنِي إِسْرَائِيلَ‏.‏ قُلْتُ لِعَمْرَةَ أَوَ مُنِعْنَ قَالَتْ نَعَمْ‏.‏",
    english: "Narrated `Aisha: Had Allah's Messenger (ﷺ) known what the women were doing, he would have forbidden them from going to the mosque as the women of Bani Israel had been forbidden.",
    sourceLine: "Sahih al-Bukhari, Hadith 869",
  }),
  h5022: H({
    ref: "hadith:bukhari-66-5022", bookKey: "bukhari", chapterId: 66,
    chapterTitleEn: "Virtues of the Quran",
    bengali: "ত্বলহা (রাঃ) হতে বর্ণিত। তিনি বলেন, আমি ‘আবদুল্লাহ ইবনু আবু ‘আওফা (রাঃ)-কে জিজ্ঞেস করলাম, নবী সাল্লাল্লাহু ‘আলাইহি ওয়াসাল্লাম কি কোন ওয়াসিয়্যাত করে গেছেন? তিনি বললেন, না। তখন আমি বললাম, যখন নবী সাল্লাল্লাহু ‘আলাইহি ওয়াসাল্লাম নিজে কোন ওয়াসিয়্যাত করে যাননি, তখন কী করে মানুষের জন্য ওয়াসিয়্যাত করাকে (কুরআন মাজীদে) বাধ্যতামূলক করা হল এবং তাদেরকে এজন্য নির্দেশ দেয়া হল। জবাবে তিনি বললেন, তিনি [নবী সাল্লাল্লাহু ‘আলাইহি ওয়াসাল্লাম] আল্লাহর কিতাব (অনুসরণ)-এর ওয়াসিয়্যাত করে গেছেন। [২৭৪০] (আধুনিক প্রকাশনীঃ ৪৬৪৮, ইসলামিক ফাউন্ডেশনঃ)",
    arabic: "حَدَّثَنَا مُحَمَّدُ بْنُ يُوسُفَ، حَدَّثَنَا مَالِكُ بْنُ مِغْوَلٍ، حَدَّثَنَا طَلْحَةُ، قَالَ سَأَلْتُ عَبْدَ اللَّهِ بْنَ أَبِي أَوْفَى أَوْصَى النَّبِيُّ صلى الله عليه وسلم فَقَالَ لاَ‏.‏ فَقُلْتُ كَيْفَ كُتِبَ عَلَى النَّاسِ الْوَصِيَّةُ، أُمِرُوا بِهَا وَلَمْ يُوصِ قَالَ أَوْصَى بِكِتَابِ اللَّهِ‏.‏",
    english: "Narrated Talha: I asked `Abdullah bin Abi `Aufa, \"Did the Prophet (ﷺ) make a will (to appoint his successor or bequeath wealth)?\" He replied, \"No.\" I said, \"How is it prescribed then for the people to make wills, and they are ordered to do so while the Prophet (ﷺ) did not make any will?\" He said, \"He made a will wherein he recommended Allah's Book",
    sourceLine: "Sahih al-Bukhari, Hadith 5022",
  }),
};

const cardFor = (input) => ({
  kind: "hadith", recordRef: input.ref, title: "আজকের হাদিস",
  arabic: input.arabic, bengali: input.bengali, sourceLine: input.sourceLine,
  canonicalLink: "/hadith/sahih-bukhari/bangla", altText: "", caption: "",
  pronunciation: null, pronunciationStatus: "missing",
  pronunciationSource: null, pronunciationScope: null,
});
const recordFor = (input, hadithNumber) => ({
  id: input.ref.replace("hadith:", ""), book_key: input.bookKey,
  chapter_id: input.chapterId ?? 0, hadith_number: hadithNumber ?? 0,
  arabic: input.arabic, bengali: input.bengali, english: input.english ?? null,
});
const NO_HISTORY = [];
const TODAY = "2026-11-17";

/** Selection + QC for one input; returns {sel, qc, scene, score}. */
function selectAndQc(input, history = NO_HISTORY, override = undefined, hadithNumber = 0) {
  const card = cardFor(input);
  const record = recordFor(input, hadithNumber);
  const sel = vs.selectPosterVisual(card, record, history, TODAY, override);
  if (sel.hold || !sel.scene || !sel.selection.chosen) return { sel, qc: null, scene: null, score: null };
  const qc = vs.checkVisualQC({
    card, topicId: sel.selection.topicId, concept: sel.selection.chosen,
    scene: sel.scene, history, today: TODAY,
  });
  return { sel, qc, scene: sel.scene, score: qc.score };
}

// --- drift guard: engine SCENES == CARD_BACKGROUNDS ---
t("engine SCENES registry matches CARD_BACKGROUNDS id-for-id and file-for-file", () => {
  const engineScenes = new Map(engine.SCENES.map((s) => [s.id, s.file]));
  const catalog = new Map(bg.CARD_BACKGROUNDS.map((s) => [s.id, s.file]));
  assert.equal(engineScenes.size, catalog.size, "scene count differs — re-copy the engine");
  for (const [id, file] of catalog) {
    assert.equal(engineScenes.get(id), file, `scene ${id}: engine file ${engineScenes.get(id)} != catalog file ${file}`);
  }
});

// --- safety ---
t("all 15 catalog scenes pass Islamic visual safety", () => {
  for (const s of bg.CARD_BACKGROUNDS) {
    const r = vs.isSafeScene(s);
    assert.equal(r.safe, true, `scene ${s.id} unsafe: ${r.reasons.join("; ")}`);
  }
});
t("exactly 3 catalog scenes lack the 'darker areas' text-safe marker (warning, not a hold)", () => {
  const lacking = bg.CARD_BACKGROUNDS.filter((s) => !vs.hasTextSafeArea(s)).map((s) => s.id).sort();
  assert.deepEqual(lacking, ["forgiveness-leaf", "guidance-path", "intention-sunrise"]);
});
t("safety rejects a prompt without a 'no text' marker", () => {
  const bad = { ...bg.CARD_BACKGROUNDS[0], prompt: "A landscape with a sign that says hello, no people." };
  assert.equal(vs.isSafeScene(bad).safe, false);
});
t("safety rejects a prompt that mentions a person without a no-face marker", () => {
  const bad = { ...bg.CARD_BACKGROUNDS[0], prompt: "A man's face in warm light. Absolutely no text anywhere." };
  assert.equal(vs.isSafeScene(bad).safe, false);
});

// --- selection table (7-hadith plan + live renders) ---
const EXPECTED = [
  ["intentions", "intentions", "intention-sunrise", "intention-sunrise", undefined],
  ["knowledge", "knowledge", "library-study", "library", undefined],
  ["speech (no scene yet)", "speech", null, null, undefined],
  ["quran-5027", "quran", "quran-rehal", "library", undefined],
  ["character + kindness override", "kindness", "helping-hands", "helping-hands", "kindness"],
  ["safety + protection override", "protection", "night-lantern", "night-lantern", "protection"],
  ["modesty (no scene yet)", "modesty", null, null, undefined],
  ["bukhari-10-869 (live)", "salah", "mosque-courtyard", "courtyard-prayer", undefined],
  ["bukhari-66-5022 (E2E)", "quran", "quran-rehal", "library", undefined],
];
for (const [name, topic, concept, scene, override] of EXPECTED) {
  const key = { intentions: "intentions", knowledge: "knowledge", "speech (no scene yet)": "speech", "quran-5027": "quran5027", "character + kindness override": "character", "safety + protection override": "safety", "modesty (no scene yet)": "modesty", "bukhari-10-869 (live)": "h869", "bukhari-66-5022 (E2E)": "h5022" }[name];
  t(`select ${name}: topic=${topic} concept=${concept} scene=${scene}`, () => {
    const { sel, qc, score } = selectAndQc(INPUTS[key], NO_HISTORY, override);
    assert.equal(sel.selection.topicId, topic, `topic mismatch: ${sel.selection.topicId}`);
    if (concept === null) {
      assert.equal(sel.scene, null, "expected HOLD (no scene)");
      assert.ok(sel.hold, "expected a hold record");
      assert.equal(sel.hold.reason, "visual_needs_new_scene", `hold reason: ${sel.hold.reason}`);
      assert.equal(sel.selection.needsNewScene, true);
      return;
    }
    assert.equal(sel.hold, null, `unexpected hold: ${JSON.stringify(sel.hold)}`);
    assert.equal(sel.selection.chosen.id, concept);
    assert.equal(sel.scene.id, scene);
    assert.equal(qc.ok, true, `QC failed: ${qc.failures.join("; ")}`);
    assert.ok(score && score.total >= sem.SEMANTIC_THRESHOLD, `semantic ${score?.total} < 85`);
    assert.equal(qc.matchOk, true);
    assert.equal(qc.safetyOk, true);
  });
}

// --- semantic discrimination: the chosen scene is the UNIQUE >= 85 scene ---
t("semantic score: chosen scene is the unique scene >= 85 for every renderable case", () => {
  for (const [name, key, override] of [
    ["intentions", "intentions", undefined], ["knowledge", "knowledge", undefined],
    ["quran-5027", "quran5027", undefined], ["character", "character", "kindness"],
    ["safety", "safety", "protection"], ["869", "h869", undefined], ["5022", "h5022", undefined],
  ]) {
    const input = INPUTS[key];
    const card = cardFor(input);
    const record = recordFor(input, 0);
    const sel = vs.selectPosterVisual(card, record, NO_HISTORY, TODAY, override);
    assert.ok(sel.scene && sel.selection.chosen, `${name}: expected a scene`);
    const profile = vs.buildVisualProfile(card, sel.selection.topicId, sel.selection.chosen);
    const ranked = sem.rankScenes(profile, bg.CARD_BACKGROUNDS);
    const passing = ranked.filter((r) => r.total >= sem.SEMANTIC_THRESHOLD);
    assert.equal(passing.length, 1, `${name}: expected exactly 1 scene >= 85, got ${passing.map((r) => `${r.sceneId}=${r.total}`).join(", ")}`);
    assert.equal(passing[0].sceneId, sel.scene.id, `${name}: the passing scene is not the chosen one`);
  }
});
t("semantic threshold is 85 (design constant, unchanged)", () => {
  assert.equal(sem.SEMANTIC_THRESHOLD, 85);
});

// --- overrides: rules vs curated ---
t("character: rules say faith, override kindness applies", () => {
  const { sel } = selectAndQc(INPUTS.character);
  assert.equal(sel.selection.topicId, "faith", "rules must say faith (known close call)");
  const over = selectAndQc(INPUTS.character, NO_HISTORY, "kindness");
  assert.equal(over.sel.selection.topicId, "kindness");
  assert.equal(over.sel.selection.overrideApplied, true);
  assert.equal(over.scene.id, "helping-hands");
});
t("safety: rules say speech, override protection applies", () => {
  const { sel } = selectAndQc(INPUTS.safety);
  assert.equal(sel.selection.topicId, "speech", "rules must say speech (known close call)");
  const over = selectAndQc(INPUTS.safety, NO_HISTORY, "protection");
  assert.equal(over.sel.selection.topicId, "protection");
  assert.equal(over.scene.id, "night-lantern");
});

// --- history rebuild + windows ---
const rowFor = (date, sceneId, inputKey, refOverride) => ({
  kolkata_date: date,
  hadith_ref: INPUTS[inputKey].ref,
  cards: [{ ...cardFor(INPUTS[inputKey]), recordRef: refOverride ?? INPUTS[inputKey].ref }],
  poster_scene_id: sceneId,
});
/** Full records (chapter + English) for the rebuild, as PosterRender batch-fetches them. */
const recordsFor = (...keys) => new Map(
  keys.map((k) => [
    INPUTS[k].ref.replace("hadith:", ""),
    { chapter_id: INPUTS[k].chapterId ?? null, english: INPUTS[k].english ?? null },
  ]),
);
t("history rebuild: rows without a scene are skipped; topic/concept re-derived", () => {
  const rows = [
    rowFor("2026-11-15", "library", "quran5027"),
    rowFor("2026-11-14", null, "h869"),
    rowFor("2026-11-13", "courtyard-prayer", "h869"),
  ];
  const entries = vs.buildHistoryEntries(rows, TODAY, recordsFor("quran5027", "h869"));
  assert.equal(entries.length, 2);
  const lib = entries.find((e) => e.sceneId === "library");
  assert.equal(lib.conceptId, "quran-rehal");
  assert.equal(lib.topicId, "quran");
  const court = entries.find((e) => e.sceneId === "courtyard-prayer");
  assert.equal(court.conceptId, "mosque-courtyard");
  assert.equal(court.topicId, "salah");
});
t("history rebuild WITHOUT records falls back to card-only classification (documented limitation)", () => {
  // bukhari-66-5027's Arabic "تعلم" double-counts for knowledge ("علم"
  // is a substring of "تعلم"), so card-only says knowledge/library-study
  // where the full record says quran/quran-rehal. Only the redundant
  // concept window and the topic soft-warning are affected; the 14-day
  // scene window reads the DB scene id directly and stays exact.
  const rows = [rowFor("2026-11-15", "library", "quran5027")];
  const entries = vs.buildHistoryEntries(rows, TODAY);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].topicId, "knowledge");
  assert.equal(entries[0].conceptId, "library-study");
});
t("history rebuild: a row whose scene does not belong to its classified topic is skipped", () => {
  const rows = [rowFor("2026-11-15", "courtyard-prayer", "quran5027")];
  assert.equal(vs.buildHistoryEntries(rows, TODAY).length, 0);
});
t("history rebuild: today's own row is excluded (a render must not block its own scene)", () => {
  const rows = [rowFor(TODAY, "library", "quran5027")];
  assert.equal(vs.buildHistoryEntries(rows, TODAY).length, 0);
});
t("history window: library used 1 day ago blocks quran-rehal -> HOLD (needs new scene)", () => {
  const history = vs.buildHistoryEntries([rowFor("2026-11-16", "library", "quran5027")], TODAY, recordsFor("quran5027"));
  const { sel } = selectAndQc(INPUTS.quran5027, history);
  assert.equal(sel.scene, null);
  assert.equal(sel.hold.reason, "visual_needs_new_scene");
});
t("history window: library used 27 days ago allows quran-rehal", () => {
  const history = vs.buildHistoryEntries([rowFor("2026-10-21", "library", "quran5027")], TODAY, recordsFor("quran5027"));
  const { sel } = selectAndQc(INPUTS.quran5027, history);
  assert.equal(sel.scene.id, "library");
});
t("all-blocked: single-concept topic blocked by history -> HOLD (visual_all_blocked)", () => {
  const history = vs.buildHistoryEntries([rowFor("2026-11-16", "intention-sunrise", "intentions")], TODAY, recordsFor("intentions"));
  const { sel } = selectAndQc(INPUTS.intentions, history);
  assert.equal(sel.scene, null);
  assert.equal(sel.hold.reason, "visual_all_blocked");
  assert.equal(sel.selection.allBlocked, true);
});

// --- QC failures ---
t("QC fails on a content-visual mismatch (wrong scene for the topic)", () => {
  const input = INPUTS.quran5027;
  const card = cardFor(input);
  const record = recordFor(input, 5027);
  const sel = vs.selectPosterVisual(card, record, NO_HISTORY, TODAY);
  const wrongScene = bg.CARD_BACKGROUNDS.find((s) => s.id === "night-lantern");
  const qc = vs.checkVisualQC({
    card, topicId: sel.selection.topicId, concept: sel.selection.chosen,
    scene: wrongScene, history: NO_HISTORY, today: TODAY,
  });
  assert.equal(qc.ok, false);
  assert.equal(qc.matchOk, false);
  assert.ok(qc.failures.some((f) => f.startsWith("content_visual_mismatch")));
  assert.ok(qc.failures.some((f) => f.startsWith("semantic_below_threshold")));
});
t("buildHadithInput parses book/chapter from the record, nulls without one", () => {
  const withRecord = vs.buildHadithInput(cardFor(INPUTS.h5022), recordFor(INPUTS.h5022, 5022));
  assert.equal(withRecord.bookKey, "bukhari");
  assert.equal(withRecord.chapterId, 66);
  assert.equal(withRecord.english, INPUTS.h5022.english);
  const withoutRecord = vs.buildHadithInput(cardFor(INPUTS.intentions), null);
  assert.equal(withoutRecord.chapterId, null);
  assert.equal(withoutRecord.english, null);
});

await Promise.all(pending);
console.log(`\nRESULT: ${n} passed`);
