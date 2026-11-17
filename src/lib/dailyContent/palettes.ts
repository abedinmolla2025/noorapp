/**
 * Topic-driven card-chrome palettes (Master mission Phase 2, 2026-11-17).
 *
 * ONE brand, many topic-specific visual experiences: the palette changes
 * the card CHROME (title, divider, quote marks, accent bar, Arabic
 * footnote border) per topic/concept. It never changes the photograph,
 * never changes the Bengali text (white on dark glass, always), and
 * never touches the brand identity — the logo, the HADITH badge and the
 * source pill stay brand gold (#e9c15c) on every poster.
 *
 * READABILITY IS NON-NEGOTIABLE: every accent is contrast-checked
 * against the dark card background (#0b1526) and must reach WCAG AA
 * 4.5:1. `checkVisualQC` hard-fails a poster whose palette fails the
 * check, and the test suite asserts every palette in this table passes.
 * The palette id lives on the visual concept (visualConceptEngine.ts);
 * this module carries the hex values + the contrast math, so the engine
 * stays standalone.
 */
import type { PaletteId } from "./visualConceptEngine.js";

/** Brand gold — logo, badge, source pill, panel borders. Never varies. */
export const BRAND_GOLD = "#e9c15c";
export const BRAND_GOLD_BORDER = "rgba(233, 193, 92, 0.85)";
/** Dark card background — the contrast reference for every accent. */
export const POSTER_BG = "#0b1526";
/** Minimum accent contrast vs POSTER_BG (WCAG AA for normal text). */
export const PALETTE_MIN_CONTRAST = 4.5;

export type PosterPalette = {
  id: PaletteId;
  /** Display name, e.g. "Prayer emerald". */
  name: string;
  /** Accent colour for title / divider / quotes / accent bar / footnote border. */
  accent: string;
  /** What the palette is for (starting directions, not rigid mappings). */
  description: string;
};

export const PALETTES: Record<PaletteId, PosterPalette> = {
  emerald: { id: "emerald", name: "Prayer emerald", accent: "#7fd4a8", description: "Prayer — emerald with midnight blue and warm light." },
  "dawn-gold": { id: "dawn-gold", name: "Dawn gold", accent: "#f0d9a0", description: "Fajr dawn — warm light gold." },
  "soft-gold": { id: "soft-gold", name: "Quran soft gold", accent: "#e6c87a", description: "Quran — deep blue and brown with soft gold." },
  "deep-blue": { id: "deep-blue", name: "Deep blue", accent: "#a8c8e8", description: "Knowledge — deep blue and brown with soft gold." },
  "warm-amber": { id: "warm-amber", name: "Warm amber", accent: "#e8a85c", description: "Charity, home, fasting — warm amber and earth." },
  "warm-cream": { id: "warm-cream", name: "Warm cream", accent: "#ecd9a8", description: "Parents, modesty — warm cream and brown with muted gold." },
  "muted-gold": { id: "muted-gold", name: "Muted gold", accent: "#d8b36a", description: "Family — muted gold on warm green." },
  "muted-blue": { id: "muted-blue", name: "Muted blue", accent: "#a8c4d8", description: "Patience — muted blue with soft grey and sunrise gold." },
  "sunrise-gold": { id: "sunrise-gold", name: "Sunrise gold", accent: "#e8c07a", description: "Forgiveness, intentions, faith — sunrise gold." },
  "gentle-green": { id: "gentle-green", name: "Gentle green", accent: "#a9d6b0", description: "Kindness, mercy — gentle green with warm neutrals." },
  "forest-green": { id: "forest-green", name: "Forest green", accent: "#8fd0a0", description: "Nature, gratitude — forest green with sky blue and earth." },
};

export function paletteById(id: string): PosterPalette | null {
  return (PALETTES as Record<string, PosterPalette>)[id] ?? null;
}

/** Parse "#rrggbb" into [r, g, b] 0-255. Returns null on bad input. */
export function parseHex(hex: string): [number, number, number] | null {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

/** WCAG relative luminance (0-1) for an sRGB hex colour. */
export function relativeLuminance(hex: string): number | null {
  const rgb = parseHex(hex);
  if (!rgb) return null;
  const lin = rgb.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

/** WCAG contrast ratio between two hex colours (1-21). Null on bad input. */
export function contrastRatio(a: string, b: string): number | null {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  if (la === null || lb === null) return null;
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
}

/** Accent contrast check for one palette. The accent must reach
 *  PALETTE_MIN_CONTRAST against the dark card background. */
export function checkPaletteContrast(palette: PosterPalette): { ok: boolean; ratio: number | null } {
  const ratio = contrastRatio(palette.accent, POSTER_BG);
  return { ok: ratio !== null && ratio >= PALETTE_MIN_CONTRAST, ratio };
}

/** "rgba(r, g, b, alpha)" for an accent hex (borders, hairlines). */
export function accentRgba(hex: string, alpha: number): string | null {
  const rgb = parseHex(hex);
  if (!rgb) return null;
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
}
