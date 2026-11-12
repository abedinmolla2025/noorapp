/**
 * The visual engine's demo examples — real records only.
 *
 * Eight records, eight creative directions, eight distinct scenes (no repeat):
 * - parents:    dua-for-parents (Surah Al-Isra 17:24) → parents-hands
 * - children:   dua-for-family-surah-aal-i-imraan-3-38 → family-child
 * - forgiveness: dua-for-forgiveness-surah-al-araaf-7-23 → dawn-forgiveness
 * - patience:   dua-for-patience-surah-aal-i-imraan-3-147 → patience-tree
 * - ramadan:    hadith bukhari-30-1923 (Fasting — "Take Suhur...") → suhur-meal
 * - knowledge:  hadith bukhari-3-75 (Knowledge — Ibn Abbas) → library
 * - gratitude:  dua-for-faith-surah-ibrahim-14-7 (Surah Ibrahim 14:7) → gratitude-garden
 * - kindness:   hadith bukhari-42-2363 (thirsty dog — kindness rewarded) → helping-hands
 *
 * The kindness hadith is ENGINES-ONLY (no poster): its full Arabic
 * (isnad + long matn) is ~650 characters and does not fit a poster panel
 * whole, and a poster must never truncate religious text. Its semantic
 * profile, score (94) and matn-only pronunciation candidate are reviewed
 * on the engines page; poster support for long hadiths is a separate
 * product decision, not part of this mission.
 *
 * Card payloads are built with the real lib (buildCard / buildHadithCard),
 * so title / Arabic / Bengali / reference / caption / pronunciation are
 * the record's own fields, verbatim (or a clearly-marked rule-based
 * candidate for pronunciation — never presented as verified). The two
 * hadith records have no Bengali translation in the local dataset
 * (production DB only) — their payloads carry an empty Bengali field,
 * which the verification panel reports as a gap, never filled with
 * invented text.
 *
 * Each example also carries its semantic profile + the scene's explainable
 * score, and its pronunciation verification (stored value vs the
 * convention candidate, word by word) — the two engines' evidence, shown
 * in the demo's admin panels.
 */
import { buildCard, buildHadithCard, hadithPick } from "@/lib/dailyContent/cards";
import type { CardPayload } from "@/lib/dailyContent/types";
import { CARD_BACKGROUNDS, type BackgroundScene } from "@/lib/dailyContent/backgrounds";
import { verifyStoredPronunciation } from "@/lib/dailyContent/transliteration";
import { getCuratedProfile } from "@/lib/dailyContent/semanticProfiles";
import { buildGenericProfile, rankScenes, scoreScene, type SceneScore, type SemanticProfile } from "@/lib/dailyContent/semantic";
import { CREATIVE_DIRECTIONS } from "@/lib/dailyContent/visuals";
import type { DemoDatasets } from "./demoData";

export type VisualExample = {
  directionId: string;
  ref: string;
  card: CardPayload;
  /** True when the record's Bengali is missing in the local dataset. */
  bengaliGap: boolean;
  /** The scene used for this example's posters. */
  scene: BackgroundScene | null;
  /** Curated semantic profile (or the generic fallback). */
  profile: SemanticProfile | null;
  /** Explainable score of the assigned scene against the profile. */
  sceneScore: SceneScore | null;
  /** All catalog scenes ranked against the profile (admin panel). */
  rankedScenes: SceneScore[];
  /** Pronunciation verification: stored value vs convention candidate. */
  pronunciation: ReturnType<typeof verifyStoredPronunciation>;
};

const DUA_EXAMPLES: { directionId: string; slug: string }[] = [
  { directionId: "parents", slug: "dua-for-parents" },
  { directionId: "children", slug: "dua-for-family-surah-aal-i-imraan-3-38" },
  { directionId: "forgiveness", slug: "dua-for-forgiveness-surah-al-araaf-7-23" },
  { directionId: "patience", slug: "dua-for-patience-surah-aal-i-imraan-3-147" },
  { directionId: "gratitude", slug: "dua-for-faith-surah-ibrahim-14-7" },
];

const HADITH_EXAMPLES: { directionId: string; id: string }[] = [
  // Short records only: the QC gate flags Arabic >260 chars for a visual
  // fit check, and a poster must never truncate religious text — so the
  // examples use records that fit their panels whole.
  { directionId: "ramadan", id: "bukhari-30-1923" },
  { directionId: "knowledge", id: "bukhari-3-75" },
];

/** Engines-only examples (no poster — see the header note): reviewed on
 * the engines page for pronunciation + semantic matching, not rendered
 * as posters. */
const ENGINE_ONLY_HADITH_EXAMPLES: { directionId: string; id: string }[] = [
  { directionId: "kindness", id: "bukhari-42-2363" },
];

function enrichExample(directionId: string, ref: string, card: CardPayload, storedBn: string | null): VisualExample {
  const direction = CREATIVE_DIRECTIONS.find((d) => d.id === directionId);
  const scene = direction?.sceneId ? CARD_BACKGROUNDS.find((s) => s.id === direction.sceneId) ?? null : null;
  const profile = getCuratedProfile(ref) ?? buildGenericProfile(card);
  const sceneScore = scene ? scoreScene(profile, scene) : null;
  return {
    directionId,
    ref,
    card,
    bengaliGap: !card.bengali.trim(),
    scene,
    profile,
    sceneScore,
    rankedScenes: rankScenes(profile, CARD_BACKGROUNDS),
    pronunciation: verifyStoredPronunciation(card.arabic, storedBn),
  };
}

export function buildVisualExamples(datasets: DemoDatasets): VisualExample[] {
  const out: VisualExample[] = [];
  for (const e of DUA_EXAMPLES) {
    const rec = datasets.duas.find((d) => d.slug === e.slug);
    if (!rec) continue;
    const card = buildCard(rec);
    out.push(enrichExample(e.directionId, `content:${e.slug}`, card, (rec.pronunciation?.bn ?? "").trim() || null));
  }
  for (const e of HADITH_EXAMPLES) {
    const rec = datasets.allHadiths.find((h) => h.id === e.id);
    if (!rec) continue;
    const card = buildHadithCard(hadithPick(rec));
    out.push(enrichExample(e.directionId, `hadith:${e.id}`, card, null));
  }
  return out;
}

/** All eight records: the poster-safe examples plus the engines-only
 * ones (long Arabic — reviewed, never rendered as a poster). */
export function buildEngineExamples(datasets: DemoDatasets): VisualExample[] {
  const out = buildVisualExamples(datasets);
  for (const e of ENGINE_ONLY_HADITH_EXAMPLES) {
    const rec = datasets.allHadiths.find((h) => h.id === e.id);
    if (!rec) continue;
    const card = buildHadithCard(hadithPick(rec));
    out.push(enrichExample(e.directionId, `hadith:${e.id}`, card, null));
  }
  return out;
}

/** Related content for the website preview: same category, real records. */
export function relatedDuas(datasets: DemoDatasets, slug: string, count = 3) {
  const self = datasets.duas.find((d) => d.slug === slug);
  if (!self) return [];
  return datasets.duas
    .filter((d) => d.slug !== slug && d.category === self.category)
    .slice(0, count);
}
