/**
 * Semantic visual matching engine (mission Part B).
 *
 * REQUIREMENT: the visual must represent the ACTUAL SUBJECT and MEANING
 * of the Dua or Hadith. A beautiful but unrelated image is a failure.
 * A mosque, lantern, crescent, sunset or mountain must not become the
 * default visual for unrelated content.
 *
 * HOW IT WORKS: every record gets a structured semantic profile (built
 * from its own approved Bengali meaning, category, entities and emotion —
 * never from the slug alone, never inventing religious context). Every
 * catalog scene is then scored against that profile with an explainable,
 * weighted score:
 *   subject relevance      30%
 *   meaning relevance      25%
 *   action / object        20%
 *   emotional relevance    15%
 *   composition / design   10%
 * Minimum automatic acceptance: 85/100. Below 85 the scene is NOT
 * auto-accepted — it is regenerated or sent to admin review. The score
 * alone never approves religious content; the admin's eyes are the real
 * check, and the admin can reject a beautiful but irrelevant image.
 *
 * HONEST LIMIT: the scorer is a deterministic keyword-overlap heuristic
 * over the scene's documented subjects and description. It does not
 * "see" the photograph. Its job is to rank candidates and to make the
 * reason for a match or a mismatch explicit — not to replace human
 * judgement. Every score carries its reasons so an admin can audit it.
 */

import type { BackgroundScene } from "./backgrounds";
import type { CardPayload } from "./types";

export interface SemanticProfile {
  /** Record identity: `content:<slug>` or `hadith:<id>`. */
  id: string;
  /** Main subject, in Bengali (what the Dua/Hadith is about). */
  subject: string;
  /** Primary topic, in Bengali. */
  topic: string;
  /** The approved Bengali meaning (excerpt, verbatim from the record). */
  meaning: string;
  people: string[];
  objects: string[];
  actions: string[];
  tone: string[];
  environment: string;
  /** The visual metaphor the image should carry. */
  metaphor: string;
  /** Imagery that would mislead (never use for this record). */
  unsuitable: string[];
  /** What the image must emphasise. */
  emphasis: string;
  /** English keywords used by the scorer (must match scene vocabulary). */
  subjectKeywords: string[];
  meaningKeywords: string[];
  objectKeywords: string[];
  toneKeywords: string[];
}

export interface ScoreComponent {
  key: "subject" | "meaning" | "action" | "emotional" | "composition";
  label: string;
  max: number;
  points: number;
  reason: string;
}

export interface SceneScore {
  sceneId: string;
  total: number;
  passed: boolean;
  components: ScoreComponent[];
  verdict: string;
}

export const SEMANTIC_THRESHOLD = 85;

const WEIGHTS = { subject: 30, meaning: 25, action: 20, emotional: 15, composition: 10 } as const;

function norm(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s-]/g, " ");
}

function stem(w: string): string {
  return w.length > 3 && w.endsWith("s") ? w.slice(0, -1) : w;
}

function overlap(keywords: string[], haystack: string): { matched: string[]; missing: string[] } {
  const hayWords = new Set(norm(haystack).split(/\s+/).filter(Boolean).map(stem));
  const hay = ` ${norm(haystack)} `;
  const matched: string[] = [];
  const missing: string[] = [];
  for (const kw of keywords) {
    const k = norm(kw).trim();
    if (!k) continue;
    const kWords = k.split(/\s+/).map(stem);
    // A keyword matches when every stemmed word of it appears in the
    // scene text (so "parents" matches "parent", "pre-dawn" matches
    // "pre dawn"), or the whole phrase appears verbatim.
    const ok = kWords.every((w) => hayWords.has(w)) || hay.includes(` ${k} `);
    if (ok) matched.push(kw);
    else missing.push(kw);
  }
  return { matched, missing };
}

function component(
  key: ScoreComponent["key"],
  label: string,
  max: number,
  keywords: string[],
  haystack: string,
): ScoreComponent {
  const { matched, missing } = overlap(keywords, haystack);
  const points = keywords.length === 0 ? max : Math.round((matched.length / keywords.length) * max);
  const reason =
    matched.length > 0
      ? `মিলেছে: ${matched.join(", ")}${missing.length > 0 ? ` — নেই: ${missing.join(", ")}` : ""}`
      : `কিছুই মেলেনি — খুঁজছিল: ${keywords.join(", ")}`;
  return { key, label, max, points, reason };
}

/** Score one catalog scene against a semantic profile. */
export function scoreScene(profile: SemanticProfile, scene: BackgroundScene): SceneScore {
  const sceneText = `${scene.scene} ${scene.subjects.join(" ")} ${scene.prompt}`;
  const components: ScoreComponent[] = [
    component("subject", "বিষয় (Subject)", WEIGHTS.subject, profile.subjectKeywords, sceneText),
    component("meaning", "অর্থ (Meaning)", WEIGHTS.meaning, profile.meaningKeywords, sceneText),
    component("action", "কাজ / বস্তু (Action / Object)", WEIGHTS.action, profile.objectKeywords, sceneText),
    component("emotional", "ভাব (Emotional)", WEIGHTS.emotional, profile.toneKeywords, sceneText),
  ];
  // Composition: 5 for reserved text space, 5 for the brand palette.
  const hasTextSpace = /darker areas/i.test(scene.prompt);
  const hasPalette = /gold|green|navy/i.test(scene.prompt);
  const compPoints = (hasTextSpace ? 5 : 0) + (hasPalette ? 5 : 0);
  components.push({
    key: "composition",
    label: "কম্পোজিশন (Composition)",
    max: WEIGHTS.composition,
    points: compPoints,
    reason: hasTextSpace && hasPalette
      ? "টেক্সটের জন্য অন্ধকার জায়গা আছে; সোনালি/সবুজ/নেভি প্যালেট মিলেছে"
      : !hasTextSpace
        ? "টেক্সটের জন্য সংরক্ষিত জায়গা স্পষ্ট নয়"
        : "ব্র্যান্ড প্যালেট (সোনালি/সবুজ/নেভি) মেলেনি",
  });
  const total = components.reduce((s, c) => s + c.points, 0);
  const passed = total >= SEMANTIC_THRESHOLD;
  return {
    sceneId: scene.id,
    total,
    passed,
    components,
    verdict: passed
      ? `≥ ${SEMANTIC_THRESHOLD} — স্বয়ংক্রিয় গ্রহণযোগ্য (তবুও অ্যাডমিনের চোখে যাচাই আবশ্যক)`
      : `< ${SEMANTIC_THRESHOLD} — স্বয়ংক্রিয় গ্রহণযোগ্য নয়; নতুন ছবি বা অ্যাডমিন পর্যালোচনা প্রয়োজন`,
  };
}

/** Score every catalog scene against a profile, best first. */
export function rankScenes(profile: SemanticProfile, scenes: BackgroundScene[]): SceneScore[] {
  return scenes.map((s) => scoreScene(profile, s)).sort((a, b) => b.total - a.total);
}

/**
 * Generic profile builder for records without a curated profile: derives
 * the profile from the record's own fields (title, meaning, category,
 * entities, emotion). Curated profiles (the six demo records) live in
 * semanticProfiles.ts and take precedence — they follow the mission's
 * B3 table and the record's own meaning.
 */
export function buildGenericProfile(card: CardPayload): SemanticProfile {
  const meaning = card.bengali || "";
  return {
    id: card.recordRef,
    subject: card.title,
    topic: card.title,
    meaning,
    people: [],
    objects: [],
    actions: [],
    tone: [],
    environment: "",
    metaphor: "",
    unsuitable: ["mosque", "lantern", "crescent", "generic Islamic background"],
    emphasis: card.title,
    subjectKeywords: card.title.toLowerCase().split(/\s+/).filter(Boolean),
    meaningKeywords: meaning.toLowerCase().split(/\s+/).filter(Boolean).slice(0, 8),
    objectKeywords: [],
    toneKeywords: [],
  };
}
