/**
 * Visual selection bridge — wires the Visual Concept Engine into the
 * poster generation path (Phase 2, 2026-11-17).
 *
 * Flow (PosterRender calls these, in order):
 *   1. buildHadithInput(card, record) — engine input from the card +
 *      the re-fetched hadith record (chapter, English when available).
 *   2. buildHistoryEntries(rows, today) — rebuild the engine's visual
 *      history from published publication rows (existing columns only:
 *      kolkata_date, hadith_ref, cards, poster_scene_id). Topic/concept
 *      are re-derived by classifying each stored card and reverse-looking
 *      up the concept for (topic, scene) — no new columns, no migration.
 *   3. selectPosterVisual(...) — selectVisualConcept() decides the
 *      scene; no chosen concept (needs a new scene, or every candidate
 *      blocked by history) => HOLD, never a fallback scene.
 *   4. checkVisualQC(...) — the mandatory Content-Visual Match QC:
 *      engine match boolean + semantic score (>= 85) + similarity
 *      windows + Islamic visual safety + text-safe-area warning.
 *      Any failure => HOLD (the render aborts; the poster workflow
 *      fails closed and the planned row stays planned).
 *
 * What this module does NOT do:
 * - It does not run the full 8-validation autonomous gate
 *   (evaluateSafetyGate): validations 1-4, 6-8 live elsewhere (planner,
 *   ogQc/autofit, set_poster). This module evidences #5
 *   (content_visual_consistency) and the visual part of #6. The gate
 *   itself (autonomousGate.ts, 2026-11-17) consumes this module's V5
 *   evidence at publish time via publishPlanned.
 * - It does not persist concept/topic: there is no column for them yet
 *   (migration sketch in the Phase 2 report §7 — DO NOT APPLY without
 *   its own owner approval). Scene id persists via set_poster as before;
 *   topic/concept travel in the render JSON + workflow log.
 * - It does not generate new scenes: concepts with sceneId null
 *   (quiet-garden, latticed-light, ...) HOLD until the scene file is
 *   generated + human-reviewed (catalog growth, owner-approved).
 * - It does not touch fit/layout: the square long-Bengali overflow
 *   (E2E 2026-11-17, bukhari-66-5022) is a separate defect; the
 *   autofit gate still enforces fit and this module never overrides it.
 *
 * Thresholds (design constants, unchanged): semantic >= 85
 * (SEMANTIC_THRESHOLD); scene reuse 14 days, concept reuse 7 days
 * (SELECTION_WINDOWS, in the engine).
 */
import {
  checkVisualSimilarity,
  classifyHadith,
  conceptsForTopic,
  contentVisualMatch,
  selectVisualConcept,
  topicById,
  type ConceptSelection,
  type HadithInput,
  type TopicId,
  type VisualConcept,
  type VisualHistoryEntry,
} from "./visualConceptEngine.js";
import { CARD_BACKGROUNDS, type BackgroundScene } from "./backgrounds.js";
import { scoreScene, SEMANTIC_THRESHOLD, type SceneScore, type SemanticProfile } from "./semantic.js";
import { checkPaletteContrast, paletteById } from "./palettes.js";
import type { CardPayload, HadithRecord } from "./types.js";

/** One published publication row as read for the history rebuild. */
export type VisualHistoryRow = {
  kolkata_date: string;
  hadith_ref: string | null;
  cards: unknown;
  poster_scene_id: string | null;
};

/** Stopwords for the profile keyword builder (English label words only). */
const LABEL_STOPWORDS = new Set(
  "a an the of in on at to for and or with by from as is are was were be been it its this that these those no not only into over under after before between through during without within upon about out up down off".split(" "),
);

/** Lowercase content words (> 2 chars, no stopwords) from English text. */
function labelWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/[\s-]+/)
    .filter((w) => w.length > 2 && !LABEL_STOPWORDS.has(w));
}

function uniq(words: string[]): string[] {
  return [...new Set(words)];
}

/**
 * Engine input from the poster card + the re-fetched hadith record.
 * chapterTitleEn is not available in the poster path (the record select
 * carries no chapter title) — classification runs on Bengali + Arabic +
 * English keywords + the chapter-id prior, which is sufficient (the
 * engine test's case 8 proves chapter-title-free classification works
 * when English carries the topic; Bengali carries it in the poster path).
 */
export function buildHadithInput(card: CardPayload, record?: HadithRecord | null): HadithInput {
  const bookKey = record?.book_key ?? card.recordRef.replace(/^hadith:/, "").split("-")[0] ?? "bukhari";
  return {
    ref: card.recordRef,
    bookKey,
    chapterId: record?.chapter_id ?? null,
    chapterTitleEn: null,
    bengali: card.bengali,
    arabic: card.arabic,
    english: record?.english ?? null,
    sourceLine: card.sourceLine,
  };
}

/**
 * Rebuild engine history entries from published rows.
 * - Rows without poster_scene_id are skipped (pre-migration rows carry
 *   no scene; nothing to check against).
 * - The topic is re-derived by classifying the stored hadith card.
 *   With `records` (the history rows' hadith records, batch-fetched by
 *   the caller: chapter_id + English), classification matches the live
 *   path. WITHOUT records it falls back to card-only classification
 *   (Bengali + Arabic keywords): usually right, but a card can classify
 *   differently — e.g. bukhari-66-5027's Arabic "تعلم" double-counts
 *   for knowledge ("علم" is a substring of "تعلم"), so card-only says
 *   knowledge/library-study where the full record says quran/quran-rehal.
 *   That only weakens the (redundant — see below) concept window and
 *   the topic soft-warning; the 14-day SCENE window reads the DB scene
 *   id directly and is exact either way. A concept has exactly one
 *   scene today and the scene window (14d) is longer than the concept
 *   window (7d), so the concept check can never bind independently of
 *   the scene check; it exists for catalog growth (a concept gaining a
 *   second scene) and for exact reasoning in the logs.
 * - The concept is the reverse lookup: the concept in that topic whose
 *   sceneId is the row's scene. If no concept in the topic uses that
 *   scene, the row is skipped (data inconsistency — never guessed).
 * - Today's own row is excluded (the render in progress is not history;
 *   including it would block its own scene on day 0).
 */
export function buildHistoryEntries(
  rows: readonly VisualHistoryRow[],
  today: string,
  records?: ReadonlyMap<string, { chapter_id: number | null; english: string | null }>,
): VisualHistoryEntry[] {
  const entries: VisualHistoryEntry[] = [];
  for (const row of rows) {
    if (!row.poster_scene_id) continue;
    if (row.kolkata_date === today) continue;
    const cards = Array.isArray(row.cards) ? (row.cards as Record<string, unknown>[]) : [];
    const stored = cards.find((c) => c.kind === "hadith") as
      | { recordRef?: string; arabic?: string; bengali?: string; sourceLine?: string }
      | undefined;
    if (!stored || typeof stored.recordRef !== "string") continue;
    const recordId = stored.recordRef.replace(/^hadith:/, "");
    const record = records?.get(recordId);
    const classification = classifyHadith({
      ref: stored.recordRef,
      bookKey: "bukhari",
      chapterId: record?.chapter_id ?? null,
      bengali: typeof stored.bengali === "string" ? stored.bengali : "",
      arabic: typeof stored.arabic === "string" ? stored.arabic : "",
      english: record?.english ?? null,
      sourceLine: typeof stored.sourceLine === "string" ? stored.sourceLine : null,
    });
    const concept = conceptsForTopic(classification.topicId).find((c) => c.sceneId === row.poster_scene_id);
    if (!concept) continue;
    entries.push({
      date: row.kolkata_date,
      contentRef: stored.recordRef,
      sceneId: row.poster_scene_id,
      conceptId: concept.id,
      topicId: classification.topicId,
      paletteId: concept.paletteId,
      composition: concept.composition,
    });
  }
  return entries;
}

export type PosterVisualHold = {
  /** Machine reason, surfaced in the render error + workflow log. */
  reason: "visual_needs_new_scene" | "visual_all_blocked" | "visual_scene_not_in_catalog";
  detail: string;
};

export type PosterVisualSelection = {
  selection: ConceptSelection;
  /** Chosen catalog scene, or null when held. */
  scene: BackgroundScene | null;
  hold: PosterVisualHold | null;
};

/**
 * The pipeline entry point: engine selection -> catalog scene.
 * HOLD (never a fallback): no renderable concept, every candidate
 * blocked by history, or the chosen scene is not in the catalog.
 */
export function selectPosterVisual(
  card: CardPayload,
  record: HadithRecord | null | undefined,
  history: readonly VisualHistoryEntry[],
  today: string,
  topicOverride?: TopicId,
): PosterVisualSelection {
  const input = buildHadithInput(card, record);
  const selection = selectVisualConcept(input, history, today, topicOverride);
  if (!selection.chosen) {
    return {
      selection,
      scene: null,
      hold: {
        reason: selection.needsNewScene ? "visual_needs_new_scene" : "visual_all_blocked",
        detail: selection.reasoning.join(" | "),
      },
    };
  }
  const scene = CARD_BACKGROUNDS.find((s) => s.id === selection.chosen!.sceneId) ?? null;
  if (!scene) {
    return {
      selection,
      scene: null,
      hold: {
        reason: "visual_scene_not_in_catalog",
        detail: `concept ${selection.chosen.id} points at scene ${selection.chosen.sceneId}, which is not in CARD_BACKGROUNDS`,
      },
    };
  }
  return { selection, scene, hold: null };
}

/**
 * Semantic profile for the scorer, built from the ENGINE's understanding
 * (topic + concept) — not from the raw card title (Bengali; the scorer
 * is English-only) and not from the classifier's rule vocabulary (the
 * full topic keyword list is 6-10 broad terms no single scene can
 * contain — v1 capped every chosen scene at ~10/30 on subject).
 * - subject: the CONCEPT label words (2-3 words the matching scene
 *   must contain). The topic still gates via contentVisualMatch and
 *   the meaning keywords.
 * - meaning: topic label words + concept scene-description words (<=12).
 * - action/object: concept scene-description words (<=8).
 * - tone: MEASURED since Master mission Phase 2 (2026-11-17) — the
 *   concept's tone keywords (every word occurs in the chosen scene's
 *   prompt/subjects text, verified by test). The old design set
 *   tone: [] and the scorer awarded max for the empty list, so the
 *   effective bar was 70/85 on the measured components; the bar is
 *   now the full 85, and the calibration (master calibration script)
 *   re-proves chosen scenes at 92-100 with exactly one scene >= 85.
 * Calibration (phase2-working/calibrate-semantic.mjs): chosen scenes
 * score 92-100, next-best scene 36-56, exactly one scene >= 85 each
 * time. Threshold 85 is unchanged; the scorer is unchanged.
 */
export function buildVisualProfile(card: CardPayload, topicId: TopicId, concept: VisualConcept): SemanticProfile {
  const topic = topicById(topicId);
  const descWords = labelWords(concept.sceneDescription);
  return {
    id: card.recordRef,
    subject: concept.labelEn,
    topic: topic.labelEn,
    meaning: card.bengali,
    people: [],
    objects: [],
    actions: [],
    tone: [...concept.tone],
    environment: "",
    metaphor: concept.sceneDescription,
    unsuitable: ["mosque", "lantern", "crescent", "generic Islamic background"],
    emphasis: concept.labelEn,
    subjectKeywords: uniq(labelWords(concept.labelEn)),
    meaningKeywords: uniq([...labelWords(topic.labelEn), ...descWords]).slice(0, 12),
    objectKeywords: uniq(descWords).slice(0, 8),
    toneKeywords: [...concept.tone],
  };
}

/** Person words that must never appear in a scene prompt unguarded. */
const PERSON_WORDS = ["man", "woman", "child", "children", "person", "people", "hands", "neighbour", "neighbours", "baby", "boy", "girl", "face", "faces"];

/**
 * Islamic visual safety, enforced in code on the catalog prompt:
 * - text-free: the prompt must carry a "no text" marker (no image model
 *   ever renders religious text; all text is overlaid programmatically).
 * - no faces / no identifiable people: either an explicit marker
 *   ("no faces" / "no identifiable people" / "seen from behind" /
 *   "no people") or no person word at all in the prompt (landscapes).
 * A scene failing either check can never render, however good the match.
 */
export function isSafeScene(scene: BackgroundScene): { safe: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const prompt = scene.prompt;
  if (!/no text/i.test(prompt)) reasons.push("prompt has no 'no text' marker");
  const explicitNoFace = /no faces|no identifiable people|seen from behind|no people/i.test(prompt);
  if (!explicitNoFace) {
    const lowered = prompt.toLowerCase();
    const found = PERSON_WORDS.filter((w) => new RegExp(`\\b${w}\\b`).test(lowered));
    if (found.length > 0) reasons.push(`prompt mentions people (${found.join(", ")}) without a no-face marker`);
  }
  return { safe: reasons.length === 0, reasons };
}

/** Text-safe area: the prompt reserves darker areas for the text overlay. */
export function hasTextSafeArea(scene: BackgroundScene): boolean {
  return /darker areas/i.test(scene.prompt);
}

export type VisualQcResult = {
  ok: boolean;
  /** Semantic score for the chosen scene (null when not scored). */
  score: SceneScore | null;
  matchOk: boolean;
  safetyOk: boolean;
  similarityOk: boolean;
  /** Hard failures — any one HOLDS the poster. */
  failures: string[];
  /** Soft warnings — recorded, never blocking. */
  warnings: string[];
};

/**
 * The mandatory Content-Visual Match QC for the chosen scene.
 * Hard fails (HOLD): engine match false, semantic score < 85,
 * similarity blocked (14-day scene / 7-day concept), safety fail,
 * unknown palette, palette contrast below the 4.5 floor.
 * Warning (recorded): no "darker areas" text-safe marker — Layout C's
 * Bengali panel provides the contrast, and the autofit gate still
 * enforces fit; blocking three catalog scenes (guidance-path,
 * intention-sunrise, forgiveness-leaf) over a prompt wording gap would
 * strand whole topics, so this stays a warning until catalog growth.
 * Warning (recorded): same palette as yesterday for the same topic —
 * the scene / composition / lighting still differ, but the variation
 * is named so a repeat is visible in the render JSON.
 */
export function checkVisualQC(args: {
  card: CardPayload;
  topicId: TopicId;
  concept: VisualConcept;
  scene: BackgroundScene;
  history: readonly VisualHistoryEntry[];
  today: string;
}): VisualQcResult {
  const failures: string[] = [];
  const warnings: string[] = [];

  const matchOk = contentVisualMatch(args.topicId, args.scene.id);
  if (!matchOk) failures.push(`content_visual_mismatch: scene ${args.scene.id} does not belong to topic ${args.topicId}`);

  const profile = buildVisualProfile(args.card, args.topicId, args.concept);
  const score = scoreScene(profile, args.scene);
  if (!score.passed) {
    failures.push(`semantic_below_threshold:${score.total} < ${SEMANTIC_THRESHOLD} for scene ${args.scene.id} (topic ${args.topicId})`);
  }

  const similarity = checkVisualSimilarity(
    { sceneId: args.scene.id, conceptId: args.concept.id, topicId: args.topicId },
    args.history,
    args.today,
  );
  const similarityOk = !similarity.blocked;
  if (!similarityOk) failures.push(`visual_repetition: ${similarity.warnings.join(" | ")}`);

  const safety = isSafeScene(args.scene);
  const safetyOk = safety.safe;
  if (!safetyOk) failures.push(`visual_safety: ${safety.reasons.join("; ")}`);

  // Palette contrast (Master mission Phase 2): the accent must reach
  // 4.5:1 against the dark card background. An unknown palette id is a
  // data error, not a fallback to gold — fail closed.
  const palette = paletteById(args.concept.paletteId);
  if (!palette) {
    failures.push(`visual_palette_unknown: concept ${args.concept.id} names palette ${args.concept.paletteId}, which has no definition`);
  } else {
    const contrast = checkPaletteContrast(palette);
    if (!contrast.ok) {
      failures.push(`visual_palette_contrast:${contrast.ratio} < 4.5 for palette ${palette.id} (accent ${palette.accent})`);
    }
  }

  if (!hasTextSafeArea(args.scene)) {
    warnings.push(`text_safe_area: scene ${args.scene.id} prompt has no 'darker areas' marker — Layout C panel provides contrast; verify readability by eye`);
  }
  if (similarity.warnings.length > 0 && similarityOk) {
    warnings.push(...similarity.warnings);
  }
  // Palette / composition variation vs yesterday (same topic): the
  // 14-day scene block already forces a different scene; this names a
  // repeated palette so the render JSON shows whether the day's poster
  // actually looks different from yesterday's.
  const yesterday = args.history.find((h) => h.date === addDays(args.today, -1));
  if (yesterday && yesterday.topicId === args.topicId) {
    if (yesterday.paletteId === args.concept.paletteId) {
      warnings.push(
        `visual_variation: same palette (${args.concept.paletteId}) as yesterday for topic ${args.topicId} — scene differs (${yesterday.sceneId} -> ${args.scene.id}), composition ${yesterday.composition} -> ${args.concept.composition}, lighting differs; verify by eye that the poster does not look like a repeat`,
      );
    } else if (yesterday.composition === args.concept.composition) {
      warnings.push(`visual_variation: same composition (${args.concept.composition}) as yesterday for topic ${args.topicId}, palette differs (${yesterday.paletteId} -> ${args.concept.paletteId})`);
    }
  }

  return { ok: failures.length === 0, score, matchOk, safetyOk, similarityOk, failures, warnings };
}

/** YYYY-MM-DD minus/plus days (local helper — the render route has its own). */
function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Render-JSON shape for the visual selection (surfaced in PosterStatus). */
export type VisualStatusJson = {
  topicId: TopicId;
  /** Runner-up topic (null when none scored > 0). */
  secondaryTopicId: TopicId | null;
  secondaryScore: number;
  /** Message / meaning of the chosen concept (topic → concept labels). */
  messageBn: string;
  messageEn: string;
  /** Emotional tone (measured keywords) + the topic's Bengali label. */
  tone: string[];
  toneLabelBn: string;
  /** Card-chrome palette / lighting / direction / composition. */
  paletteId: string;
  lighting: string;
  visualDirection: string;
  composition: "centered" | "lower-third";
  /** "reviewed" = scene JPG exists + human-reviewed; "pending-human-review" = HOLD. */
  reviewStatus: "reviewed" | "pending-human-review";
  conceptId: string;
  sceneId: string;
  semanticScore: number;
  semanticPassed: boolean;
  matchOk: boolean;
  safetyOk: boolean;
  warnings: string[];
  reasoning: string[];
};

export function visualStatusJson(
  selection: ConceptSelection,
  scene: BackgroundScene,
  qc: VisualQcResult,
): VisualStatusJson {
  const chosen = selection.chosen;
  return {
    topicId: selection.topicId,
    secondaryTopicId: selection.secondaryTopicId,
    secondaryScore: selection.secondaryScore,
    messageBn: selection.message.bn,
    messageEn: selection.message.en,
    tone: selection.tone,
    toneLabelBn: selection.toneLabelBn,
    paletteId: selection.paletteId ?? "",
    lighting: selection.lighting ?? "",
    visualDirection: selection.visualDirection ?? "",
    composition: selection.composition ?? "centered",
    reviewStatus: chosen?.reviewStatus ?? "pending-human-review",
    conceptId: selection.chosen?.id ?? "",
    sceneId: scene.id,
    semanticScore: qc.score?.total ?? 0,
    semanticPassed: qc.score?.passed ?? false,
    matchOk: qc.matchOk,
    safetyOk: qc.safetyOk,
    warnings: qc.warnings,
    reasoning: selection.reasoning,
  };
}
