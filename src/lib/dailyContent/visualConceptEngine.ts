/**
 * Visual Concept Engine — Content-Matched Dynamic Backgrounds.
 *
 * STANDALONE module. No imports from the NoorApp repo, no network calls,
 * no secrets, no paid APIs (INR 0). Pure deterministic rules, so the same
 * hadith always yields the same concept. Runs with plain Node 24
 * (type-stripping; erasable TypeScript only — no enums, no namespaces).
 *
 * What it does:
 *  - classifyHadith: topic of a hadith from deterministic rules
 *    (Bengali/Arabic/English keyword rules first, Bukhari chapter prior
 *    second, safe default third). AI is a documented FALLBACK only
 *    (Gemini Free / Groq Free, closed taxonomy list) — this module never
 *    calls it; it only reports `needsAiFallback: true` when no rule fires.
 *  - selectVisualConcept: topic -> ranked visual concepts -> candidate
 *    scenes, filtered by visual-history repetition windows.
 *  - checkVisualSimilarity: scene/concept reuse windows vs history.
 *  - contentVisualMatch: does a scene belong to the classified topic?
 *  - evaluateSafetyGate: the 8 mandatory validations -> publish / hold.
 *
 * Design authority: owner briefs 2026-11-15 (Visual Intelligence +
 * Autonomous Operation amendment). The engine never invents religious
 * text, never grades a hadith, never presents an AI visual as a real
 * photo. Scene files are text-free photographs; all text is overlaid
 * programmatically by OgShareCard from the record verbatim.
 *
 * Integration point (NOT done here): PosterRender / the poster-generate
 * workflow call selectVisualConcept() before rendering, enforce the
 * similarity + match checks in QC, and persist the choice via
 * set_poster. That wiring happens after the Bengali-first layout work
 * lands on the poster branch.
 */

export type HadithInput = {
  /** e.g. "hadith:bukhari-1-1" or "hadith:fixture-intentions". */
  ref: string;
  /** e.g. "bukhari". */
  bookKey: string;
  /** Bukhari book/chapter number (1-97), or null when unknown. */
  chapterId: number | null;
  /** Verified English chapter title, when known. */
  chapterTitleEn?: string | null;
  /** Bengali translation (verbatim from the record). */
  bengali: string;
  /** Arabic matn (diacritics optional; stripped before matching). */
  arabic: string;
  /** English text, when available (bundled data). */
  english?: string | null;
  /** Verbatim source line, e.g. "Sahih al-Bukhari, Hadith 1". */
  sourceLine?: string | null;
};

export type TopicId =
  | "salah" | "quran" | "knowledge" | "charity" | "parents" | "family"
  | "patience" | "kindness" | "forgiveness" | "gratitude" | "creation"
  | "intentions" | "speech" | "modesty" | "protection" | "guidance"
  | "fasting" | "faith";

export type Topic = {
  id: TopicId;
  labelBn: string;
  labelEn: string;
  /** Bengali keywords. RULE: never a bare <=3-char word (e.g. "মা" matches
   *  inside "আমার"); use full or inflected forms ("মা-বাবা", "বাবার"). */
  keywordsBn: string[];
  /** Arabic keywords (matched after diacritic stripping + alef norm).
   *  SAME RULE as Bengali: never a bare <=2-char word — Arabic matching
   *  is substring over the FULL text INCLUDING the isnad, so "أب" fires
   *  on "ابن" (ibn — in nearly every isnad) and "أم" fires on "امروا"
   *  (were commanded) / "امرأة" (woman). Removed from parents
   *  2026-11-17 after bukhari-66-5022 misclassified as parents in
   *  card-only mode (score 2 from "ابن أبي أوفى" + "أمروا", beating
   *  quran's 1 from Bengali "কুরআন"). Parents still fires via
   *  "والدين" / "بر الوالدين" + the Bengali compounds + English. */
  keywordsAr: string[];
  /** English keywords (lowercased substring). */
  keywordsEn: string[];
  /** Bukhari chapter ids whose title hints at this topic (weak prior). */
  chapterHints: number[];
};

export const TOPICS: Topic[] = [
  {
    id: "salah", labelBn: "সালাত ও ইবাদত", labelEn: "Prayer & worship",
    keywordsBn: ["নামাজ", "সালাত", "মসজিদ", "জামাত", "আজান", "ফজর", "ইবাদত", "সিজদা", "রুকু", "তাহাজ্জুদ", "জুম্মা", "জুমা"],
    keywordsAr: ["صلاة", "مسجد", "أذان", "فجر", "سجود", "ركوع", "تهجد", "جمعة"],
    keywordsEn: ["prayer", "mosque", "adhan", "fajr", "prostrat", "worship", "friday", "jumu"],
    // Friday keywords (2026-11-17, Jumu'ah): a Friday hadith is prayer
    // content — "জুমার নামাজ" already matched on "নামাজ", but a text
    // that says only "জুম্মার দিন" did not. "جمعة" is 4 letters (the
    // Phase 2 fix removed bare 2-letter Arabic words); "jumu" matches
    // jumu'ah / jumuah. Chapter 11 is the canonical "Friday Prayer"
    // book (forensic reconstruction, 97/97).
    chapterHints: [10, 11, 31, 33],
  },
  {
    id: "quran", labelBn: "কুরআন", labelEn: "Quran",
    keywordsBn: ["কুরআন", "কোরআন", "তিলাওয়াত", "আয়াত", "সূরা"],
    keywordsAr: ["قرآن", "تلاوة", "آية", "سورة", "كتاب الله"],
    keywordsEn: ["quran", "qur'an", "recit"],
    chapterHints: [66],
  },
  {
    id: "knowledge", labelBn: "জ্ঞান অর্জন", labelEn: "Seeking knowledge",
    keywordsBn: ["জ্ঞান", "শেখা", "পড়া", "বই", "শিক্ষা", "আলেম", "অন্বেষণ"],
    keywordsAr: ["علم", "تعلم", "كتاب", "عالم"],
    keywordsEn: ["knowledge", "learn", "seeking knowledge", "scholar", "book"],
    chapterHints: [],
  },
  {
    id: "charity", labelBn: "দান ও সদকা", labelEn: "Charity & sadaqah",
    keywordsBn: ["দান", "সদকা", "সাদাকা", "যাকাত", "গরিব", "মিসকিন", "সাহায্য", "অভাবী"],
    keywordsAr: ["صدقة", "زكاة", "فقير", "مسكين"],
    keywordsEn: ["charity", "sadaqah", "zakat", "poor", "give", "alms"],
    chapterHints: [73],
  },
  {
    id: "parents", labelBn: "মা-বাবার অধিকার", labelEn: "Parents' rights",
    keywordsBn: ["পিতা-মাতা", "মা-বাবা", "পিতামাতা", "বাবা-মা", "বাবার", "মায়ের", "বৃদ্ধ পিতা", "পিতার", "মাতার"],
    keywordsAr: ["والدين", "بر الوالدين"],
    keywordsEn: ["parent", "mother", "father", "elderly parent"],
    chapterHints: [],
  },
  {
    id: "family", labelBn: "পরিবার ও সন্তান", labelEn: "Family & children",
    keywordsBn: ["পরিবার", "সন্তান", "সন্তানের", "স্ত্রী", "স্বামী", "ঘর", "বাড়ি"],
    keywordsAr: ["أسرة", "ولد", "أهل", "بيت"],
    keywordsEn: ["family", "child", "offspring", "household", "spouse"],
    chapterHints: [13],
  },
  {
    id: "patience", labelBn: "ধৈর্য", labelEn: "Patience",
    keywordsBn: ["ধৈর্য", "সবর", "দৃঢ়তা", "সহনশীল"],
    keywordsAr: ["صبر", "صابر"],
    keywordsEn: ["patience", "patient", "steadfast", "endur"],
    chapterHints: [25, 27, 28, 33],
  },
  {
    id: "kindness", labelBn: "দয়া ও উত্তম আচরণ", labelEn: "Kindness & good conduct",
    keywordsBn: ["দয়া", "সদাচরণ", "চরিত্র", "উত্তম আচরণ", "সদয়", "নম্র", "ভদ্র"],
    keywordsAr: ["خلق", "رفق", "إحسان", "رحمة"],
    keywordsEn: ["kindness", "character", "good conduct", "gentle", "compassion"],
    chapterHints: [78],
  },
  {
    id: "forgiveness", labelBn: "ক্ষমা ও তওবা", labelEn: "Forgiveness & repentance",
    keywordsBn: ["ক্ষমা", "তওবা", "গুনাহ", "মাফ", "তাওবা", "ইস্তিগফার"],
    keywordsAr: ["استغفار", "توبة", "مغفرة", "ذنب"],
    keywordsEn: ["forgive", "repent", "pardon", "mercy", "sin"],
    chapterHints: [32],
  },
  {
    id: "gratitude", labelBn: "কৃতজ্ঞতা", labelEn: "Gratitude",
    keywordsBn: ["কৃতজ্ঞতা", "শুকরিয়া", "শোকর", "কৃতজ্ঞ"],
    keywordsAr: ["شكر", "نعمة", "حمد"],
    keywordsEn: ["grateful", "gratitude", "thank", "blessing"],
    chapterHints: [13],
  },
  {
    id: "creation", labelBn: "আল্লাহর সৃষ্টি", labelEn: "Allah's creation",
    keywordsBn: ["সৃষ্টি", "প্রকৃতি", "আকাশ", "পাহাড়", "সাগর", "নক্ষত্র", "চাঁদ", "সূর্য"],
    keywordsAr: ["خلق", "طبيعة", "سماء", "نجم", "قمر", "شمس"],
    keywordsEn: ["creation", "nature", "sky", "mountain", "star", "moon", "sea"],
    chapterHints: [],
  },
  {
    id: "intentions", labelBn: "নিয়ত ও আন্তরিকতা", labelEn: "Intentions & sincerity",
    keywordsBn: ["নিয়ত", "ইখলাস", "আন্তরিকতা", "উদ্দেশ্য"],
    keywordsAr: ["نية", "نيات", "إخلاص"],
    keywordsEn: ["intention", "sincer", "deed"],
    chapterHints: [1],
  },
  {
    id: "speech", labelBn: "জিহ্বা ও কথা", labelEn: "Speech & the tongue",
    keywordsBn: ["কথা", "জিহ্বা", "চুপ", "নীরব", "ভালো কথা", "জবান"],
    keywordsAr: ["لسان", "كلام", "صمت", "قول"],
    keywordsEn: ["tongue", "speech", "speak", "silent", "silence", "words"],
    chapterHints: [78],
  },
  {
    id: "modesty", labelBn: "লজ্জাশীলতা", labelEn: "Modesty",
    keywordsBn: ["লজ্জা", "শালীনতা", "লজ্জাশীল"],
    keywordsAr: ["حياء"],
    keywordsEn: ["modest", "modesty", "shy", "bashful"],
    chapterHints: [],
  },
  {
    id: "protection", labelBn: "হেফাজত ও নিরাপত্তা", labelEn: "Protection & safety",
    keywordsBn: ["হেফাজত", "নিরাপত্তা", "রক্ষা", "ভয়", "অন্ধকার", "নিরাপদ"],
    keywordsAr: ["أمان", "خوف", "حفظ", "ليل"],
    keywordsEn: ["protect", "safety", "safe", "fear", "night", "harm"],
    chapterHints: [],
  },
  {
    id: "guidance", labelBn: "হেদায়াত ও সরল পথ", labelEn: "Guidance & the straight path",
    keywordsBn: ["হেদায়াত", "সরল পথ", "পথ", "হিদায়াত", "সঠিক পথ"],
    keywordsAr: ["هداية", "صراط", "طريق"],
    keywordsEn: ["guidance", "straight path", "right path"],
    chapterHints: [25, 27, 28],
  },
  {
    id: "fasting", labelBn: "রোজা ও রমজান", labelEn: "Fasting & Ramadan",
    keywordsBn: ["রোজা", "সিয়াম", "সেহরি", "ইফতার", "রমজান"],
    keywordsAr: ["صوم", "صيام", "رمضان", "سحور", "إفطار"],
    keywordsEn: ["fast", "ramadan", "suhur", "iftar"],
    chapterHints: [30, 31, 33],
  },
  {
    id: "faith", labelBn: "ঈমান", labelEn: "Faith",
    keywordsBn: ["ঈমান", "বিশ্বাস", "মুমিন", "আখিরাত", "পরকাল"],
    keywordsAr: ["إيمان", "مؤمن", "آخرة"],
    keywordsEn: ["faith", "believe", "believer", "hereafter"],
    chapterHints: [2],
  },
];

export function topicById(id: TopicId): Topic {
  return TOPICS.find((t) => t.id === id) as Topic;
}

/** The safe default when no rule fires: guidance, never invented. */
export const DEFAULT_TOPIC_ID: TopicId = "guidance";

/* ------------------------------------------------------------------ */
/* Visual concepts — one topic, 2-3 concepts; each concept is either   */
/* an existing catalog scene or a NEW scene proposal (sceneId null).   */
/* A concept is a scene + a composition, never a colour theme.        */
/* ------------------------------------------------------------------ */

export type VisualConcept = {
  id: string;
  topicId: TopicId;
  labelBn: string;
  labelEn: string;
  /** Existing scene id in CARD_BACKGROUNDS, or null = scene must be generated first. */
  sceneId: string | null;
  composition: "centered" | "lower-third";
  /** Scene description (existing scene's description, or the new-scene brief). */
  sceneDescription: string;
  /** Generation prompt for a NEW scene (Dua OG style: photorealistic,
   *  text-free, no faces / no identifiable people, dark areas top+bottom
   *  for text). Null when the scene already exists. */
  newScenePrompt: string | null;
};

const NEW_SCENE_GUARD =
  "Photorealistic premium cinematic photograph, tall vertical portrait orientation. " +
  "Absolutely no text, no words, no letters, no calligraphy, no signs, no readable writing anywhere in the image. " +
  "No faces, no identifiable people. Generous darker areas at the top and bottom for text overlay.";

export const VISUAL_CONCEPTS: VisualConcept[] = [
  { id: "mosque-courtyard", topicId: "salah", labelBn: "মসজিদের আঙিনায় নামাজ", labelEn: "Prayer in a mosque courtyard", sceneId: "courtyard-prayer", composition: "centered", sceneDescription: "Man from behind in quiet prayer in a mosque courtyard at dusk, arches and lamps", newScenePrompt: null },
  { id: "fajr-window", topicId: "salah", labelBn: "ফজরের ভোর", labelEn: "Fajr dawn at home", sceneId: "morning-window", composition: "lower-third", sceneDescription: "Quiet bedroom at first morning light, dawn through sheer curtains, prayer cap on side table", newScenePrompt: null },
  { id: "quran-rehal", topicId: "quran", labelBn: "রেহালে কুরআন", labelEn: "Quran on a rehal", sceneId: "library", composition: "centered", sceneDescription: "Quiet Islamic library reading corner — open Quran on a carved wooden rehal stand, warm brass lamp", newScenePrompt: null },
  { id: "quran-dawn", topicId: "quran", labelBn: "ভোরের আলোয় কুরআন", labelEn: "Quran in dawn light", sceneId: null, composition: "centered", sceneDescription: "NEW: open Quran on a wooden rehal beside a window, soft dawn light falling across blank warm pages, quiet and reverent, no people", newScenePrompt: `${NEW_SCENE_GUARD} An open Quran resting on a carved wooden rehal stand beside a tall window, soft golden dawn light falling across the pages, deep green and warm gold tones, quiet reverent atmosphere.` },
  { id: "library-study", topicId: "knowledge", labelBn: "পাঠাগারে অধ্যয়ন", labelEn: "Study in the library", sceneId: "library", composition: "centered", sceneDescription: "Quiet Islamic library reading corner — wooden shelves of old books, warm brass reading lamp (shared scene with quran-rehal; see report §4)", newScenePrompt: null },
  { id: "study-desk", topicId: "knowledge", labelBn: "পড়ার টেবিল", labelEn: "Study desk with books", sceneId: null, composition: "centered", sceneDescription: "NEW: a wooden study desk with stacked old books, an ink pot and a warm lamp glow, deep green and gold tones, no people", newScenePrompt: `${NEW_SCENE_GUARD} A wooden study desk with a stack of old cloth-bound books, an ink pot and a warm brass lamp glowing softly, deep green and warm gold tones, focused calm atmosphere of learning, no people.` },
  { id: "food-sharing", topicId: "charity", labelBn: "খাবার বিতরণ", labelEn: "Sharing food", sceneId: null, composition: "lower-third", sceneDescription: "NEW: hands offering a bowl of dates and bread across a simple wooden table in warm light, no faces", newScenePrompt: `${NEW_SCENE_GUARD} Two pairs of hands across a simple wooden table, one gently offering a bowl of dates and bread to the other, warm golden light, humble and generous atmosphere, close-up on hands only.` },
  { id: "giving-hands", topicId: "charity", labelBn: "দানের হাত", labelEn: "Hands giving", sceneId: null, composition: "centered", sceneDescription: "NEW: an open palm offering coins and dates in warm sunlight, soft green bokeh background, no faces", newScenePrompt: `${NEW_SCENE_GUARD} An open palm gently offering a few coins and dates in warm sunlight, soft green bokeh background, generous and humble atmosphere, close-up on hands only.` },
  { id: "parents-hands", topicId: "parents", labelBn: "পিতা-মাতার হাত", labelEn: "Parents' hands", sceneId: "parents-hands", composition: "lower-third", sceneDescription: "An adult child's hands gently holding an elderly parent's wrinkled hands in warm golden window light", newScenePrompt: null },
  { id: "family-path", topicId: "parents", labelBn: "পরিবারের পথ", labelEn: "Family on a garden path", sceneId: "family-child", composition: "centered", sceneDescription: "Parents and a young child walking together on a garden path at golden hour, seen from behind", newScenePrompt: null },
  { id: "home-welcome", topicId: "family", labelBn: "ঘরের দুয়ার", labelEn: "Home entrance", sceneId: "home-entrance", composition: "lower-third", sceneDescription: "Warm home entrance at golden hour, open carved wooden door, plants and courtyard", newScenePrompt: null },
  { id: "patience-tree", topicId: "patience", labelBn: "ঝড়ে দাঁড়িয়ে থাকা গাছ", labelEn: "Tree standing firm in the storm", sceneId: "patience-tree", composition: "centered", sceneDescription: "A single strong old tree standing firm on a rocky mountain slope in difficult weather, a break of golden light", newScenePrompt: null },
  { id: "still-water", topicId: "patience", labelBn: "শান্ত জল", labelEn: "Still water at dawn", sceneId: null, composition: "centered", sceneDescription: "NEW: a perfectly still lake at dawn reflecting soft gold light, mist over the water, deep calm", newScenePrompt: `${NEW_SCENE_GUARD} A perfectly still mountain lake at dawn reflecting soft golden light, thin mist over the water, deep teal and gold tones, profound calm and steadiness.` },
  { id: "helping-hands", topicId: "kindness", labelBn: "সাহায্যের হাত", labelEn: "Hands helping", sceneId: "helping-hands", composition: "centered", sceneDescription: "Two hands gently offering a cup of tea to an elderly person in a warm sunlit home, no faces", newScenePrompt: null },
  { id: "neighbour-greeting", topicId: "kindness", labelBn: "প্রতিবেশীর সাক্ষাৎ", labelEn: "Neighbours greeting", sceneId: null, composition: "centered", sceneDescription: "NEW: two neighbours sharing tea at a doorway at golden hour, seen from behind, warm and respectful, no faces", newScenePrompt: `${NEW_SCENE_GUARD} Two neighbours sharing tea at an open doorway at golden hour, seen from behind, warm respectful atmosphere, soft golden light, deep green and gold tones.` },
  { id: "dawn-forgiveness", topicId: "forgiveness", labelBn: "ভোরের ক্ষমা", labelEn: "Dawn breaking through darkness", sceneId: "dawn-forgiveness", composition: "lower-third", sceneDescription: "First dawn light breaking through darkness over a calm valley with mist and a lake", newScenePrompt: null },
  { id: "forgiveness-leaf", topicId: "forgiveness", labelBn: "বৃষ্টিধোয়া পাতা", labelEn: "Rain-washed leaf", sceneId: "forgiveness-leaf", composition: "centered", sceneDescription: "Rain-washed green leaf with droplets in golden light", newScenePrompt: null },
  { id: "gratitude-garden", topicId: "gratitude", labelBn: "কৃতজ্ঞতার বাগান", labelEn: "Garden of gratitude", sceneId: "gratitude-garden", composition: "centered", sceneDescription: "Morning sunlight breaking through soft green leaves in a quiet garden, golden rays and gentle mist", newScenePrompt: null },
  { id: "creation-mountains", topicId: "creation", labelBn: "সৃষ্টির পাহাড়", labelEn: "Mountains of creation", sceneId: "guidance-path", composition: "centered", sceneDescription: "Winding path through misty green hills at dawn, distant mosque silhouette", newScenePrompt: null },
  { id: "night-sky", topicId: "creation", labelBn: "তারাভরা আকাশ", labelEn: "Star-filled night sky", sceneId: null, composition: "centered", sceneDescription: "NEW: a vast night sky full of stars over quiet dark hills, a single warm lantern glow low in the frame", newScenePrompt: `${NEW_SCENE_GUARD} A vast night sky full of bright stars over quiet dark hills, a single small warm lantern glowing low in the frame, deep blue-black and gold tones, awe and humility.` },
  { id: "intention-sunrise", topicId: "intentions", labelBn: "নিয়তের সূর্যোদয়", labelEn: "Sunrise of intention", sceneId: "intention-sunrise", composition: "centered", sceneDescription: "Golden sunrise over layered mountains and a valley river", newScenePrompt: null },
  { id: "quiet-garden", topicId: "speech", labelBn: "নীরব বাগান", labelEn: "Quiet garden", sceneId: null, composition: "centered", sceneDescription: "NEW: a quiet garden path at dawn with still air and soft light, an empty wooden bench, no people", newScenePrompt: `${NEW_SCENE_GUARD} A quiet garden path at dawn, still air, soft golden light through trees, an empty wooden bench, deep green and gold tones, silence and restraint.` },
  { id: "still-water-speech", topicId: "speech", labelBn: "শান্ত জল (কথা)", labelEn: "Still water (speech)", sceneId: null, composition: "centered", sceneDescription: "NEW: same still-water scene as patience (shared concept file) — a perfectly still lake at dawn; one scene file serves both topics, flagged by the similarity check", newScenePrompt: `${NEW_SCENE_GUARD} A perfectly still mountain lake at dawn reflecting soft golden light, thin mist over the water, deep teal and gold tones, profound calm and restraint.` },
  { id: "latticed-light", topicId: "modesty", labelBn: "জালির আলো", labelEn: "Light through a lattice", sceneId: null, composition: "centered", sceneDescription: "NEW: soft light falling through a carved wooden lattice window onto a quiet floor, no people", newScenePrompt: `${NEW_SCENE_GUARD} Soft golden light falling through a carved wooden lattice window onto a quiet stone floor, deep shadows and warm light, dignified private calm, no people.` },
  { id: "night-lantern", topicId: "protection", labelBn: "রাতের লণ্ঠন", labelEn: "Lantern in the night", sceneId: "night-lantern", composition: "centered", sceneDescription: "Ornate lantern glowing on a branch in a dark night forest, stars above", newScenePrompt: null },
  { id: "guidance-path", topicId: "guidance", labelBn: "সরল পথ", labelEn: "The straight path", sceneId: "guidance-path", composition: "centered", sceneDescription: "Winding path through misty green hills at dawn, distant mosque silhouette", newScenePrompt: null },
  { id: "suhur-meal", topicId: "fasting", labelBn: "সেহরির খাবার", labelEn: "Suhur meal", sceneId: "suhur-meal", composition: "lower-third", sceneDescription: "A simple pre-dawn suhur meal on a wooden table — dates, water, bread — with a warm lantern", newScenePrompt: null },
  { id: "iftar-table", topicId: "fasting", labelBn: "ইফতারের টেবিল", labelEn: "Iftar table at dusk", sceneId: null, composition: "lower-third", sceneDescription: "NEW: a simple iftar spread at dusk — dates, water, bread — warm lantern light, deep blue dusk through a window", newScenePrompt: `${NEW_SCENE_GUARD} A simple iftar spread on a wooden table at dusk — dates in a small bowl, a glass of water, bread — warm lantern light and deep blue dusk through a window, calm blessed atmosphere, no people.` },
  { id: "dawn-valley", topicId: "faith", labelBn: "ভোরের উপত্যকা", labelEn: "Valley at dawn", sceneId: "dawn-forgiveness", composition: "lower-third", sceneDescription: "First dawn light breaking through darkness over a calm valley with mist and a lake (shared scene with forgiveness)", newScenePrompt: null },
];

export function conceptsForTopic(topicId: TopicId): VisualConcept[] {
  return VISUAL_CONCEPTS.filter((c) => c.topicId === topicId);
}

/* ------------------------------------------------------------------ */
/* Existing scene registry (mirror of backgrounds.ts CARD_BACKGROUNDS  */
/* — ids + files only, so this module stays standalone).              */
/* ------------------------------------------------------------------ */

export type SceneEntry = { id: string; file: string; subjects: string[] };

export const SCENES: SceneEntry[] = [
  { id: "guidance-path", file: "bg-guidance-path.jpg", subjects: ["guidance", "হেদায়াত", "path", "straight path", "hidayah", "সরল পথ"] },
  { id: "parents-hands", file: "bg-parents-hands.jpg", subjects: ["parents", "parent", "elderly", "hands", "care", "mercy", "gratitude", "home", "পিতা-মাতা", "বৃদ্ধ"] },
  { id: "family-child", file: "bg-family-child.jpg", subjects: ["family", "child", "children", "offspring", "parents", "prayer", "hope", "garden", "path", "পরিবার", "সন্তান"] },
  { id: "dawn-forgiveness", file: "bg-dawn-forgiveness.jpg", subjects: ["forgiveness", "repentance", "dawn", "light", "darkness", "mercy", "hope", "valley", "mist", "ক্ষমা", "তওবা"] },
  { id: "patience-tree", file: "bg-patience-tree.jpg", subjects: ["patience", "steadfastness", "endurance", "tree", "mountain", "weather", "resilience", "firm", "strong", "ধৈর্য", "দৃঢ়তা"] },
  { id: "intention-sunrise", file: "bg-intention-sunrise.jpg", subjects: ["intention", "niyyah", "নিয়ত", "new day", "morning", "beginning", "actions"] },
  { id: "forgiveness-leaf", file: "bg-forgiveness-leaf.jpg", subjects: ["forgiveness", "mercy", "repentance", "ক্ষমা", "istighfar", "rain", "purity", "pardon"] },
  { id: "morning-window", file: "bg-morning-window.jpg", subjects: ["waking", "wake up", "sleep", "bedroom", "fajr", "ঘুম", "জাগা"] },
  { id: "home-entrance", file: "bg-home-entrance.jpg", subjects: ["home", "entering", "entrance", "family", "house", "household", "বাড়ি", "ঘরে প্রবেশ", "পরিবার"] },
  { id: "night-lantern", file: "bg-night-lantern.jpg", subjects: ["night", "protection", "lantern", "darkness", "evening", "safety", "fear", "রাত", "অন্ধকার", "হেফাজত"] },
  { id: "courtyard-prayer", file: "bg-courtyard-prayer.jpg", subjects: ["mosque", "masjid", "মসজিদ", "courtyard", "tawbah", "তওবা", "salah", "নামাজ"] },
  { id: "suhur-meal", file: "bg-suhur-meal.jpg", subjects: ["suhur", "meal", "dates", "pre-dawn", "ramadan", "blessing", "fast", "water", "table", "light", "calm", "blessed", "quiet", "peaceful", "সেহরি", "রমজান"] },
  { id: "library", file: "bg-library.jpg", subjects: ["knowledge", "books", "reading", "study", "book", "learning", "quran", "lamp", "stand", "library", "focused", "warm", "reverent", "calm", "জ্ঞান", "পড়া"] },
  { id: "gratitude-garden", file: "bg-gratitude-garden.jpg", subjects: ["gratitude", "nature", "sunlight", "garden", "green", "leaves", "blessing", "peaceful", "morning", "কৃতজ্ঞতা", "প্রকৃতি"] },
  { id: "helping-hands", file: "bg-helping-hands.jpg", subjects: ["kindness", "helping", "compassion", "hands", "tea", "elderly", "care", "warm", "respectful", "tender", "দয়া", "সদাচরণ"] },
];

export function sceneById(id: string): SceneEntry | null {
  return SCENES.find((s) => s.id === id) ?? null;
}

/* ------------------------------------------------------------------ */
/* Repetition windows (design constants — see report §5).              */
/* ------------------------------------------------------------------ */

export const SELECTION_WINDOWS = {
  /** Same scene id must not repeat within this many days (hard block). */
  sceneReuseDays: 14,
  /** Same visual concept must not repeat within this many days (hard block). */
  conceptReuseDays: 7,
  /** Same topic two days running is allowed but flagged (soft warning). */
  topicSoftDays: 2,
  /** Target scene window once the catalog grows to >= 30 scenes. */
  targetSceneWindowDays: 30,
  /** Minimum catalog size for the 30-day target window. */
  targetCatalogSize: 30,
} as const;

/* ------------------------------------------------------------------ */
/* Text normalisation (same approach as the repo's own matching).       */
/* ------------------------------------------------------------------ */

/** Strip Arabic diacritics + tatweel; normalise alef/yeh/teh forms. */
export function normalizeArabic(s: string): string {
  return s
    .replace(/[ً-ٰٓـ]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه");
}

export function normalizeText(s: string): string {
  return s.toLowerCase();
}

/* ------------------------------------------------------------------ */
/* Topic classification — deterministic rules only.                    */
/* ------------------------------------------------------------------ */

export type ClassificationMethod = "keyword" | "chapter" | "default";

export type Classification = {
  topicId: TopicId;
  method: ClassificationMethod;
  /** Distinct keyword hits per topic (chapter prior adds +1.5). */
  scores: Array<{ topicId: TopicId; score: number }>;
  reasoning: string[];
  /** True when no rule fired at all — the AI fallback MAY refine this
   *  (Gemini Free / Groq Free, closed taxonomy list). The default topic
   *  is still safe to use without AI. */
  needsAiFallback: boolean;
};

export function classifyHadith(input: HadithInput): Classification {
  const bn = normalizeText(input.bengali);
  const ar = normalizeArabic(input.arabic);
  const en = normalizeText(input.english ?? "");
  const chapterTitle = normalizeText(input.chapterTitleEn ?? "");
  const hayBn = bn;
  const hayAr = ar;
  const hayEn = `${en} ${chapterTitle} ${input.sourceLine ?? ""}`.toLowerCase();

  const scores = TOPICS.map((t) => {
    let score = 0;
    const hits: string[] = [];
    for (const k of t.keywordsBn) {
      if (k && hayBn.includes(k.toLowerCase())) { score += 1; hits.push(`bn:${k}`); }
    }
    for (const k of t.keywordsAr) {
      if (k && hayAr.includes(normalizeArabic(k))) { score += 1; hits.push(`ar:${k}`); }
    }
    for (const k of t.keywordsEn) {
      if (k && hayEn.includes(k.toLowerCase())) { score += 1; hits.push(`en:${k}`); }
    }
    if (input.chapterId !== null && t.chapterHints.includes(input.chapterId)) {
      score += 1.5;
      hits.push(`chapter:${input.chapterId}`);
    }
    return { topicId: t.id, score, hits };
  });

  const sorted = [...scores].sort((a, b) => b.score - a.score || TOPICS.findIndex((t) => t.id === a.topicId) - TOPICS.findIndex((t) => t.id === b.topicId));
  const best = sorted[0];
  const keywordHit = best.hits.some((h) => h.startsWith("bn:") || h.startsWith("ar:") || h.startsWith("en:"));
  const chapterHit = best.hits.some((h) => h.startsWith("chapter:"));

  let method: ClassificationMethod;
  let topicId: TopicId;
  if (best.score > 0 && keywordHit) {
    method = "keyword";
    topicId = best.topicId;
  } else if (best.score > 0 && chapterHit) {
    method = "chapter";
    topicId = best.topicId;
  } else {
    method = "default";
    topicId = DEFAULT_TOPIC_ID;
  }

  const reasoning: string[] = [];
  if (method === "keyword") {
    reasoning.push(`keyword match: ${best.hits.filter((h) => !h.startsWith("chapter:")).join(", ")} (score ${best.score})`);
    if (chapterHit) reasoning.push(`chapter prior agrees (chapter ${input.chapterId})`);
  } else if (method === "chapter") {
    reasoning.push(`no keyword hit; chapter ${input.chapterId} hints at ${topicById(topicId).labelEn}`);
  } else {
    reasoning.push("no keyword or chapter rule fired — safe default topic (guidance); AI fallback MAY refine");
  }
  const runnerUp = sorted[1];
  if (runnerUp && runnerUp.score > 0 && runnerUp.score === best.score) {
    reasoning.push(`tie with ${topicById(runnerUp.topicId).labelEn} at ${runnerUp.score} — taxonomy order breaks the tie (deterministic)`);
  }

  return {
    topicId,
    method,
    scores: sorted.map(({ topicId: id, score }) => ({ topicId: id, score })),
    reasoning,
    needsAiFallback: method === "default",
  };
}

/* ------------------------------------------------------------------ */
/* Visual history + similarity (DB-backed in the pipeline; the caller  */
/* supplies history rows read from daily_content_publications).        */
/* ------------------------------------------------------------------ */

export type VisualHistoryEntry = {
  /** Asia/Kolkata date, YYYY-MM-DD. */
  date: string;
  contentRef: string;
  sceneId: string;
  conceptId: string;
  topicId: TopicId;
};

export type SimilarityCheck = { ok: boolean; warnings: string[]; blocked: boolean };

export function checkVisualSimilarity(
  candidate: { sceneId: string; conceptId: string; topicId: TopicId },
  history: readonly VisualHistoryEntry[],
  today: string,
): SimilarityCheck {
  const warnings: string[] = [];
  let blocked = false;
  if (history.length === 0) return { ok: true, warnings, blocked };
  const sorted = [...history].sort((a, b) => (a.date < b.date ? 1 : -1));
  const dayMs = 86_400_000;
  const todayMs = Date.parse(`${today}T00:00:00Z`);
  const gapDays = (d: string): number => Math.round((todayMs - Date.parse(`${d}T00:00:00Z`)) / dayMs);

  for (const e of sorted) {
    const gap = gapDays(e.date);
    if (e.sceneId === candidate.sceneId && gap >= 0 && gap <= SELECTION_WINDOWS.sceneReuseDays) {
      warnings.push(`scene ${candidate.sceneId} was used ${gap === 0 ? "today" : `${gap} day(s) ago`} (${e.date} · ${e.contentRef}) — inside the ${SELECTION_WINDOWS.sceneReuseDays}-day window; BLOCKED`);
      blocked = true;
      break;
    }
  }
  for (const e of sorted) {
    const gap = gapDays(e.date);
    if (e.conceptId === candidate.conceptId && gap >= 0 && gap <= SELECTION_WINDOWS.conceptReuseDays) {
      warnings.push(`concept ${candidate.conceptId} was used ${gap === 0 ? "today" : `${gap} day(s) ago`} (${e.date}) — inside the ${SELECTION_WINDOWS.conceptReuseDays}-day window; BLOCKED`);
      blocked = true;
      break;
    }
  }
  const yesterday = sorted[0];
  if (yesterday && yesterday.topicId === candidate.topicId && gapDays(yesterday.date) <= SELECTION_WINDOWS.topicSoftDays) {
    warnings.push(`same topic as ${yesterday.date} (${topicById(candidate.topicId).labelEn}) — allowed, but the visual MUST differ`);
  }
  return { ok: !blocked, warnings, blocked };
}

/** Does this scene belong to the classified topic? (Content-Visual Match.) */
export function contentVisualMatch(topicId: TopicId, sceneId: string): boolean {
  return VISUAL_CONCEPTS.some((c) => c.topicId === topicId && c.sceneId === sceneId);
}

/** Hamming distance between two 64-bit average-hash hex strings.
 *  Returns null when either hash is malformed. A colour-only change
 *  keeps aHash ~identical (it is computed on grayscale), so a recoloured
 *  copy of an existing scene scores distance ~0 — the duplicate check
 *  catches exactly the "same image, different colour" case. */
export function hammingDistance(hashA: string, hashB: string): number | null {
  const ok = (h: string): boolean => /^[0-9a-f]{16}$/i.test(h);
  if (!ok(hashA) || !ok(hashB)) return null;
  let d = 0;
  for (let i = 0; i < 16; i++) {
    let x = parseInt(hashA[i], 16) ^ parseInt(hashB[i], 16);
    while (x) { d += x & 1; x >>= 1; }
  }
  return d;
}

/** aHash duplicate verdict for a NEW background file vs the catalog.
 *  distance <= 5 = near-duplicate (reject from catalog). */
export function isNearDuplicateBackground(hashA: string, hashB: string, threshold = 5): boolean {
  const d = hammingDistance(hashA, hashB);
  return d !== null && d <= threshold;
}

/* ------------------------------------------------------------------ */
/* Concept selection — the pipeline entry point.                       */
/* ------------------------------------------------------------------ */

export type ConceptSelection = {
  classification: Classification;
  /** Effective topic: the override when one was supplied, else the classified topic. */
  topicId: TopicId;
  /** True when a curated topic override was applied (admin / AI-reviewed). */
  overrideApplied: boolean;
  /** Ranked concepts for the topic (existing scenes first). */
  candidates: VisualConcept[];
  /** Chosen concept, or null when every candidate is blocked or the
   *  top concept has no scene file yet. */
  chosen: VisualConcept | null;
  /** True when the chosen concept needs a NEW scene generated first. */
  needsNewScene: boolean;
  /** True when every candidate was blocked by history (poster must be
   *  skipped for the day — text-only publication continues). */
  allBlocked: boolean;
  similarity: SimilarityCheck | null;
  reasoning: string[];
};

export function selectVisualConcept(
  input: HadithInput,
  history: readonly VisualHistoryEntry[],
  today: string,
  /** Curated topic override (admin / AI-reviewed recommendation context).
   *  Rules classify first and honestly; the override wins only when a
   *  human or reviewed AI set it. Use it for the known close calls
   *  (formulaic vocabulary outvoting the topical noun). */
  topicOverride?: TopicId,
): ConceptSelection {
  const classification = classifyHadith(input);
  const topicId = topicOverride ?? classification.topicId;
  const overrideApplied = topicOverride !== undefined && topicOverride !== classification.topicId;
  const topicConcepts = conceptsForTopic(topicId);
  // Existing scenes first (renderable today); new-scene concepts last.
  const candidates = [...topicConcepts].sort((a, b) => Number(a.sceneId === null) - Number(b.sceneId === null));
  const reasoning = [...classification.reasoning];
  if (overrideApplied) {
    reasoning.push(`topic override applied: rules said ${topicById(classification.topicId).labelEn}, curated topic is ${topicById(topicId).labelEn}`);
  }

  let chosen: VisualConcept | null = null;
  let similarity: SimilarityCheck | null = null;
  let allBlocked = false;
  for (const concept of candidates) {
    if (concept.sceneId === null) {
      reasoning.push(`concept ${concept.id} has no scene file yet — needs generation (catalog growth)`);
      continue;
    }
    const check = checkVisualSimilarity(
      { sceneId: concept.sceneId, conceptId: concept.id, topicId },
      history,
      today,
    );
    if (check.blocked) {
      reasoning.push(`concept ${concept.id} (${concept.sceneId}) blocked by history: ${check.warnings.join(" | ")}`);
      continue;
    }
    chosen = concept;
    similarity = check;
    reasoning.push(`chose concept ${concept.id} -> scene ${concept.sceneId} (${concept.composition})`);
    if (check.warnings.length > 0) reasoning.push(`warnings: ${check.warnings.join(" | ")}`);
    break;
  }

  if (chosen === null) {
    const anyNew = candidates.some((c) => c.sceneId === null);
    allBlocked = !anyNew && candidates.length > 0;
    if (anyNew) {
      const firstNew = candidates.find((c) => c.sceneId === null) as VisualConcept;
      reasoning.push(`no renderable candidate — next step is generating the new scene for concept ${firstNew.id}`);
    } else if (candidates.length === 0) {
      reasoning.push("topic has no concepts at all — taxonomy gap, needs a new concept");
    } else {
      reasoning.push("every candidate blocked by history — poster must be skipped today (text-only publication continues)");
    }
  }

  return {
    classification,
    topicId,
    overrideApplied,
    candidates,
    chosen,
    needsNewScene: chosen === null && candidates.some((c) => c.sceneId === null),
    allBlocked,
    similarity,
    reasoning,
  };
}

/* ------------------------------------------------------------------ */
/* Safety gate — the 8 mandatory validations (autonomous operation).   */
/*  Publishable WITHOUT owner review ONLY when ALL 8 pass. Any fail -> */
/*  Hold/Quarantine, never published. Unknown/missing result -> HOLD   */
/*  (fail-closed).                                                     */
/* ------------------------------------------------------------------ */

export type ValidationId =
  | "source_reference_integrity"
  | "arabic_integrity"
  | "bengali_editorial_quality"
  | "fabricated_claims_detection"
  | "content_visual_consistency"
  | "bengali_readability_image_quality"
  | "duplicate_prevention"
  | "finalized_asset_integrity";

export type ValidationStatus = "exists" | "partial" | "missing";

export type MandatoryValidation = {
  id: ValidationId;
  label: string;
  /** Current state in the pipeline (audited 2026-11-15; see report §7). */
  currentStatus: ValidationStatus;
  evidence: string;
};

export const MANDATORY_VALIDATIONS: MandatoryValidation[] = [
  {
    id: "source_reference_integrity", label: "Islamic source & reference integrity",
    currentStatus: "partial",
    evidence: "Ref integrity EXISTS server-side: recommend drops any ref not in the live eligible pool; planner re-validates approved runs slot-by-slot (Phase 3). GAP: no per-publication re-verification that hadith text matches its cited source — the corpus is trusted, not re-checked at runtime (autonomous audit §2).",
  },
  {
    id: "arabic_integrity", label: "Arabic text integrity",
    currentStatus: "partial",
    evidence: "eligibleHadith requires non-empty Arabic; poster QC is character-exact vs the source record (ogQc checkOgVerbatim, poster branch only). GAP: no Arabic integrity check beyond non-empty in the planner (autonomous audit §2).",
  },
  {
    id: "bengali_editorial_quality", label: "Bengali translation & editorial quality",
    currentStatus: "partial",
    evidence: "Editorial Standard v1.0 in all 5 AI function prompts; 168-test quality suite green (Phase 4). GAP: generate-hadith-seo has NO server-side virtue gate (prompt-only) and writes directly to live hadiths with no pending review; fix-dua-content also writes directly; bengali-quality.ts is NOT imported by any function (test-only) (Phases 3/4, autonomous audit §2).",
  },
  {
    id: "fabricated_claims_detection", label: "Misleading / fabricated religious claims detection",
    currentStatus: "partial",
    evidence: "Recommend FORBIDDEN_REASON_PATTERNS + validation loop; enrich Option A suppresses unsupported virtue claims; generate-dua-seo VIRTUE_BLOCKLIST + validateGeneratedOutput() (Phase 3). GAP: generate-hadith-seo prompt-only, no server-side gate; no claim detection at poster/publication time; patterns are 5 shapes only — no general fabricated-claim detector; soft-benefit language decision still open (autonomous audit §2).",
  },
  {
    id: "content_visual_consistency", label: "Content-visual consistency",
    currentStatus: "missing",
    evidence: "No topic<->scene check exists in the poster path; matchBackground is keyword subject-match only (Phase 12 Gap 8). The semantic scorer (semantic.ts, 85/100 threshold) exists but is demo-only, never called from the poster path. This module + report design the check; it is NOT yet wired into the pipeline.",
  },
  {
    id: "bengali_readability_image_quality", label: "Bengali readability & image quality",
    currentStatus: "partial",
    evidence: "ogQc checks dimensions, file size, public-URL 200, verbatim, no-repeat, long-text warnings (Phase 6). GAP: fit is warning-only (no enforcement, no font adjustment); Arabic is LARGER than Bengali in every format (Phase 12 Gap 8); contrast is visual-only by design. Bengali-first layout enforcement is in progress (separate workstream).",
  },
  {
    id: "duplicate_prevention", label: "Duplicate content & duplicate publication prevention",
    currentStatus: "exists",
    evidence: "kolkata_date UNIQUE, delivery UNIQUE (publication_id, device_id) with NULL hole (worked around in code), 30-day repeat check in recommend (HISTORY_DAYS=30), cycle-based no-repeat in planner (hadithUsed/cardUsed), resolveRow dedup, idempotent set_poster (Phases 9/10/11, autonomous audit §2). Residuals (observability, not prevention): documented at-least-once windows, no provider-side idempotency, no recipients_disabled column, 1 unaccounted token in the first production run.",
  },
  {
    id: "finalized_asset_integrity", label: "Finalized asset integrity",
    currentStatus: "partial",
    evidence: "EXISTS on the poster branch: set_poster validates URL prefix, 64-hex checksum, asset ID poster:<date>, storage path, scene slug; published-only; conditional update; idempotent; failed attempts never persist a URL (Phase 6/11). MISSING on main/production: no set_poster, no poster columns (autonomous audit §2).",
  },
];

export type ValidationResult = { id: ValidationId; pass: boolean; detail?: string };

export type SafetyGateResult =
  | { decision: "publish"; failed: [] }
  | { decision: "hold"; failed: ValidationId[]; reasons: string[] };

/** All 8 must be present AND pass, else HOLD. Unknown id -> HOLD (fail-closed). */
export function evaluateSafetyGate(results: ValidationResult[]): SafetyGateResult {
  const byId = new Map(results.map((r) => [r.id, r]));
  const failed: ValidationId[] = [];
  const reasons: string[] = [];
  for (const v of MANDATORY_VALIDATIONS) {
    const r = byId.get(v.id);
    if (!r) {
      failed.push(v.id);
      reasons.push(`${v.label}: no result recorded — HOLD (fail-closed)`);
    } else if (!r.pass) {
      failed.push(v.id);
      reasons.push(`${v.label}: FAILED${r.detail ? ` — ${r.detail}` : ""}`);
    }
  }
  if (failed.length > 0) return { decision: "hold", failed, reasons };
  return { decision: "publish", failed: [] };
}
