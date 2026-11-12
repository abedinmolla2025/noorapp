/**
 * Premium Daily Content visual engine — creative directions, visual
 * history + similarity, stable asset paths, social sharing, image push.
 *
 * REUSED (not rebuilt):
 * - Scene catalog + subject matching: backgrounds.ts (CARD_BACKGROUNDS,
 *   matchBackground, assignBackgrounds, badgeLabelForCard).
 * - Card payloads + captions: cards.ts (buildCard, buildHadithCard — the
 *   caption is composed only from the record's own fields + brand suffix).
 * - QC gate: ogQc.ts (checkOgVerbatim, checkOgCardBatch).
 * - Push payload: push.ts (buildDailyPush).
 * - Share URL patterns: the same wa.me / facebook sharer shapes the app
 *   already uses (BadgeCertificate, NameSharePreviewModal).
 * - Poster rendering: OgShareCard (master Dua OG design) + useDomToPng.
 *
 * NEW here:
 * - Creative directions: 8 named directions (6 with a dedicated scene,
 *   2 pending a dedicated photograph — see PENDING_DIRECTIONS). A
 *   direction is a scene + a composition, never a color theme: the
 *   owner's 2026-11-03 direction forbids fixed theme counts and color
 *   variations of one template, and the Dua OG posters are the only
 *   design reference.
 * - Visual history + similarity check: what was shown on which day, and
 *   a warning when a new pick is too close to recent days. Pure
 *   functions; the demo persists the history in localStorage only.
 * - Stable asset paths: deterministic poster file paths (no binaries in
 *   database rows, ever).
 * - Image-capable push payload: buildDailyPush + the poster's image URL.
 *
 * FOOTER NOTE (owner direction, 2026-11-03): the master design has NO
 * footer banner — no store badges, no download text, no bottom strip.
 * A later brief asked for a download-promotion footer; that conflicts
 * with the standing owner direction, so this engine does NOT add one.
 * Re-adding it is a single owner message away.
 */
import { CARD_BACKGROUNDS, type BackgroundScene } from "./backgrounds.js";
import { buildDailyPush } from "./push.js";
import type { CardPayload, DailyHadithPick, PushPayload } from "./types.js";

export type Composition = "centered" | "lower-third";

export type CreativeDirection = {
  id: string;
  labelBn: string;
  labelEn: string;
  /** Scene id in CARD_BACKGROUNDS, or null when no dedicated photo exists yet. */
  sceneId: string | null;
  composition: Composition;
  /** What this direction is for (subjects, from the record, not invented). */
  subjectsBn: string;
  /** Generation prompt for the missing photo, when sceneId is null. */
  pendingPrompt: string | null;
};

export const CREATIVE_DIRECTIONS: CreativeDirection[] = [
  {
    id: "parents", labelBn: "পিতা-মাতা", labelEn: "Parents",
    sceneId: "parents-hands", composition: "lower-third",
    subjectsBn: "পিতা-মাতার জন্য দোয়া — সন্তানের হাতে বৃদ্ধ পিতা-মাতার হাত",
    pendingPrompt: null,
  },
  {
    id: "children", labelBn: "নেক সন্তান", labelEn: "Righteous children",
    sceneId: "family-child", composition: "centered",
    subjectsBn: "নেক সন্তানের দোয়া — বাগানের পথে পিতা-মাতা ও সন্তান",
    pendingPrompt: null,
  },
  {
    id: "forgiveness", labelBn: "ক্ষমা", labelEn: "Forgiveness",
    sceneId: "dawn-forgiveness", composition: "lower-third",
    subjectsBn: "ক্ষমা প্রার্থনা — অন্ধকার ভেদ করে ভোরের আলো",
    pendingPrompt: null,
  },
  {
    id: "patience", labelBn: "ধৈর্য", labelEn: "Patience",
    sceneId: "patience-tree", composition: "centered",
    subjectsBn: "ধৈর্য ও দৃঢ়তা — ঝড়ে দাঁড়িয়ে থাকা শক্ত গাছ",
    pendingPrompt: null,
  },
  {
    id: "ramadan", labelBn: "রমজান", labelEn: "Ramadan",
    sceneId: "suhur-meal", composition: "lower-third",
    subjectsBn: "রমজান / সেহরি — ভোরের খাবার, খেজুর ও পানির বরকত",
    pendingPrompt: null,
  },
  {
    id: "knowledge", labelBn: "জ্ঞান", labelEn: "Knowledge",
    sceneId: "library", composition: "centered",
    subjectsBn: "জ্ঞান অর্জন — লাইব্রেরিতে বই, রেহাল ও পড়ার আলো",
    pendingPrompt: null,
  },
  {
    id: "gratitude", labelBn: "কৃতজ্ঞতা", labelEn: "Gratitude",
    sceneId: "gratitude-garden", composition: "centered",
    subjectsBn: "কৃতজ্ঞতা — প্রকৃতি, সূর্যের আলো, শান্ত দৃশ্য",
    pendingPrompt: null,
  },
  {
    id: "kindness", labelBn: "দয়া", labelEn: "Kindness",
    sceneId: "helping-hands", composition: "centered",
    subjectsBn: "দয়া ও সদাচরণ — মানবিক, সম্মানজনক গল্প",
    pendingPrompt: null,
  },
];

export function directionForId(id: string): CreativeDirection | null {
  return CREATIVE_DIRECTIONS.find((d) => d.id === id) ?? null;
}

export function sceneForDirection(direction: CreativeDirection): BackgroundScene | null {
  if (!direction.sceneId) return null;
  return CARD_BACKGROUNDS.find((s) => s.id === direction.sceneId) ?? null;
}

/** Directions with a dedicated photograph (usable today). */
export function readyDirections(): CreativeDirection[] {
  return CREATIVE_DIRECTIONS.filter((d) => d.sceneId !== null);
}

/** Directions waiting on a dedicated photograph (catalog growth). */
export function pendingDirections(): CreativeDirection[] {
  return CREATIVE_DIRECTIONS.filter((d) => d.sceneId === null);
}

/* ------------------------------------------------------------------ */
/* Visual history + similarity                                         */
/* ------------------------------------------------------------------ */

export type VisualHistoryEntry = {
  /** Asia/Kolkata date, YYYY-MM-DD. */
  date: string;
  contentRef: string;
  sceneId: string;
  directionId: string;
  format: string;
};

export type SimilarityCheck = { ok: boolean; warnings: string[] };

/**
 * Warn when a candidate pick is too close to recent history:
 * - same scene within the last 7 days,
 * - same direction as yesterday,
 * - same scene + format as the most recent entry.
 * Pure + deterministic; the caller supplies the history.
 */
export function checkVisualSimilarity(
  candidate: { sceneId: string; directionId: string; format: string },
  history: readonly VisualHistoryEntry[],
  today: string,
): SimilarityCheck {
  const warnings: string[] = [];
  if (history.length === 0) return { ok: true, warnings };
  const sorted = [...history].sort((a, b) => (a.date < b.date ? 1 : -1));
  const dayMs = 86_400_000;
  const todayMs = Date.parse(`${today}T00:00:00Z`);
  for (const e of sorted) {
    const gapDays = Math.round((todayMs - Date.parse(`${e.date}T00:00:00Z`)) / dayMs);
    if (e.sceneId === candidate.sceneId && gapDays >= 0 && gapDays <= 7) {
      warnings.push(`এই দৃশ্যটি ${gapDays === 0 ? "আজই" : `${gapDays} দিন আগে`} ব্যবহার হয়েছে (${e.date} · ${e.contentRef}) — পুনরাবৃত্তির ঝুঁকি।`);
      break;
    }
  }
  const yesterday = sorted[0];
  if (yesterday && yesterday.directionId === candidate.directionId) {
    warnings.push(`গতকালের (${yesterday.date}) দিকনির্দেশনার সাথে মিলে যাচ্ছে — ভিন্ন কম্পোজিশন বেছে নিন।`);
  }
  if (yesterday && yesterday.sceneId === candidate.sceneId && yesterday.format === candidate.format) {
    warnings.push(`সবশেষ পোস্টারের ( ${yesterday.date} · ${yesterday.format}) সাথে দৃশ্য ও ফরম্যাট দুটোই মিলে যাচ্ছে।`);
  }
  return { ok: warnings.length === 0, warnings };
}

/* ------------------------------------------------------------------ */
/* Stable asset paths (never store image binaries in database rows)    */
/* ------------------------------------------------------------------ */

export function safeRefSegment(ref: string): string {
  return ref.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase();
}

/** Deterministic production storage path for a rendered poster. */
export function posterAssetPath(
  contentRef: string,
  format: string,
  directionId: string,
): string {
  return `daily-content/posters/${safeRefSegment(contentRef)}/${format}-${directionId}.png`;
}

/** Demo-served URL for a pre-rendered poster (dist/demo-posters/). */
export function demoPosterUrl(contentRef: string, format: string, directionId: string): string {
  return `/demo-posters/${safeRefSegment(contentRef)}-${format}-${directionId}.png`;
}

/* ------------------------------------------------------------------ */
/* Social sharing (same URL shapes the app already uses)               */
/* ------------------------------------------------------------------ */

export const SITE_ORIGIN = "https://www.noorapp.in";

export function canonicalContentUrl(card: CardPayload): string {
  return `${SITE_ORIGIN}${card.canonicalLink}`;
}

/** WhatsApp share link (same shape as BadgeCertificate / NameSharePreviewModal). */
export function whatsappShareUrl(card: CardPayload): string {
  return `https://wa.me/?text=${encodeURIComponent(`${card.caption}`)}`;
}

/** Facebook share link (same shape as the app's existing sharer). */
export function facebookShareUrl(card: CardPayload): string {
  return `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(canonicalContentUrl(card))}&quote=${encodeURIComponent(card.caption)}`;
}

/* ------------------------------------------------------------------ */
/* Image-capable push (buildDailyPush + poster image)                  */
/* ------------------------------------------------------------------ */

export type ImagePushPayload = PushPayload & { image: string | null };

/** The daily push with the poster's image attached; image null = text-only fallback. */
export function buildImagePush(
  pick: DailyHadithPick,
  kolkataDate: string,
  cardCount: number,
  imageUrl: string | null,
): ImagePushPayload {
  const base = buildDailyPush(pick, kolkataDate, cardCount);
  return { ...base, image: imageUrl };
}
