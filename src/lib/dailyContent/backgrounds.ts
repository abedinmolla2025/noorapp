/**
 * Background scene catalog for OG-style share cards.
 *
 * Each entry is ONE generated, text-free photographic background. The catalog
 * has NO fixed size: a new subject gets a new entry, and nothing here is a
 * "theme" — scenes are never color variations of one template. Backgrounds
 * are generated separately from the card text: no image model ever renders
 * Arabic or Bengali religious text. All text is overlaid programmatically by
 * OgShareCard from the record's own fields.
 *
 * A scene is picked by subject match (title / reference keywords), never at
 * random, and never repeated inside one daily batch while unused scenes
 * remain. When the catalog is smaller than a batch, selection cycles only
 * after every scene has been used once — growing the catalog (one new
 * text-free background per new subject) is the documented launch step for
 * batches larger than the catalog, not a reason to repeat early.
 */
import type { CardPayload } from "./types.js";

export type BackgroundScene = {
  /** Stable id, also used for the no-repeat check. */
  id: string;
  /** File under public/assets/card-backgrounds/. */
  file: string;
  /** Short scene description for the admin UI and audits. */
  scene: string;
  /** Lowercase subject keywords this scene fits (Bengali + English). */
  subjects: string[];
  /** Generation prompt used, kept so the provenance of every file is clear. */
  prompt: string;
};

export const CARD_BACKGROUNDS: BackgroundScene[] = [
  {
    id: "guidance-path",
    file: "bg-guidance-path.jpg",
    scene: "Winding path through misty green hills at dawn, distant mosque silhouette",
    subjects: ["guidance", "হেদায়াত", "path", "straight path", "hidayah", "সরল পথ"],
    prompt:
      "Photorealistic premium landscape photograph, tall vertical portrait orientation: a narrow luminous footpath winding through soft green rolling hills at dawn, gentle mist, warm golden sunlight breaking on the horizon, a small distant mosque silhouette with a single minaret far on the horizon, peaceful and serene atmosphere, soft cinematic light, rich detail. Absolutely no text, no words, no letters, no calligraphy, no signs, no readable writing anywhere in the image.",
  },
  {
    id: "intention-sunrise",
    file: "bg-intention-sunrise.jpg",
    scene: "Golden sunrise over layered mountains and a valley river",
    subjects: ["intention", "niyyah", "নিয়ত", "new day", "morning", "beginning", "actions"],
    prompt:
      "Photorealistic premium landscape photograph, tall vertical portrait orientation: a golden sunrise breaking over gentle layered mountains, soft rays of light through thin clouds, calm warm sky in gold and soft amber, a tranquil valley below in soft shadow, serene and hopeful atmosphere, soft cinematic light. Absolutely no text, no words, no letters, no calligraphy, no signs, no readable writing anywhere in the image.",
  },
  {
    id: "forgiveness-leaf",
    file: "bg-forgiveness-leaf.jpg",
    scene: "Rain-washed green leaf with droplets in golden light",
    subjects: ["forgiveness", "mercy", "repentance", "ক্ষমা", "istighfar", "rain", "purity", "pardon"],
    prompt:
      "Photorealistic premium macro photograph, tall vertical portrait orientation: a fresh green leaf covered in clear rain droplets, soft golden sunlight glowing through the droplets, dreamy green bokeh background, pure and refreshing atmosphere, crisp detail, soft cinematic light. Absolutely no text, no words, no letters, no calligraphy, no signs, no readable writing anywhere in the image.",
  },
];

/** Future scene ideas (NOT inventory — each needs its own generated file first). */
export const FUTURE_SCENE_IDEAS: string[] = [
  "morning bedroom window with sunrise (waking dua)",
  "warm home entrance with open door (entering-home dua)",
  "ornate lantern glowing in a night forest (protection)",
  "white flower in soft sunlight (righteous offspring)",
  "mosque courtyard at golden sunset, person praying (istighfar)",
  "mountain river valley with pines (dhikr)",
  "riverside mosque city with bridge and gardens (deen and dunya)",
  "feather drifting over clouds at sunrise (mercy, ease of burden)",
  "old-city market street in warm light (humility)",
  "family home garden with flowers (wellbeing in both worlds)",
  "storm sky with a single glowing lantern (relief from punishment)",
  "open Quran on a rehal with warm lamp light, blank pages (Quran)",
];

export function backgroundUrl(scene: BackgroundScene): string {
  return `/assets/card-backgrounds/${scene.file}`;
}

function haystack(card: CardPayload): string {
  return `${card.title} ${card.sourceLine} ${card.bengali}`.toLowerCase();
}

/** First scene whose subjects match the card, else the first scene. */
export function matchBackground(card: CardPayload): BackgroundScene {
  const hay = haystack(card);
  const hit = CARD_BACKGROUNDS.find((s) => s.subjects.some((k) => hay.includes(k)));
  return hit ?? CARD_BACKGROUNDS[0];
}

export type AssignedBackground = { card: CardPayload; background: BackgroundScene };

/**
 * Assign one background per card: subject match first, never repeating a
 * scene inside the batch while unused scenes remain. Deterministic — the
 * same batch always gets the same assignment.
 */
export function assignBackgrounds(cards: CardPayload[]): AssignedBackground[] {
  const used = new Set<string>();
  return cards.map((card) => {
    const preferred = matchBackground(card);
    let background = preferred;
    if (used.has(preferred.id)) {
      background = CARD_BACKGROUNDS.find((s) => !used.has(s.id)) ?? preferred;
    }
    used.add(background.id);
    return { card, background };
  });
}

/**
 * Reference-badge label, derived from the record — the same rule the
 * existing Dua OG posters use: Quran-sourced → QURANIC DUA, hadith-sourced
 * → HADITH (a dua record from a hadith collection → PROPHETIC DUA),
 * anything else → DUA. Never invented: it only restates the record's source.
 */
export function badgeLabelForCard(card: CardPayload): string {
  if (card.kind === "quran") return "QURANIC DUA";
  if (card.kind === "hadith") return "HADITH";
  const ref = card.sourceLine;
  if (/^surah\b/i.test(ref)) return "QURANIC DUA";
  if (/bukhari|muslim|tirmidhi|dawood|majah|nasai|ahmad/i.test(ref)) return "PROPHETIC DUA";
  return "DUA";
}
