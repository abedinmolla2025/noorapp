/**
 * Adaptive-poster render fixtures (test-only, demo-gated route).
 *
 * The 6530 Bengali below is the EXACT text from the production hadith
 * record (Bukhari 81-6530, `hadiths.bengali`), copied verbatim from
 * ~/workspace/noorapp-ai-daily-content/bukhari-81-6530-bengali.txt
 * (1,365 chars / 222 words) — the text that failed both production
 * poster days (2026-11-21, 2026-11-22) with bengali_overflow_at_min.
 * It is the canonical long-hadith render case.
 *
 * The Arabic here is NOT the hadith's Arabic: the record's Arabic was
 * never exported to this repo, so the fixture uses a clearly labelled
 * geometry placeholder (the intentions phrase, repeated to a comparable
 * length) so the Arabic footnote cap is exercised. It must never be
 * presented as the hadith's Arabic — it exists only to measure layout.
 * The Bengali is the binding constraint in every case (the Arabic cap
 * is a fixed share of the body), so the placeholder does not affect
 * the Bengali page-count verdicts.
 */
import { adaptivePageLabel, splitIntoSentences } from "@/lib/dailyContent/adaptivePoster";
import { extractHadithMatn, transliterateArabic } from "@/lib/dailyContent/transliteration";
import type { CardPayload } from "@/lib/dailyContent/types";

/** Exact Bengali of Bukhari 81-6530 (see module header). */
export const BENGALI_6530 =
  "আবূ সা‘ঈদ খুদরী (রাঃ) হতে বর্ণিত। তিনি বলেন, রাসূলুল্লাহ্ সাল্লাল্লাহু আলাইহি ওয়াসাল্লাম বলেছেনঃ আল্লাহ্ ডেকে বলবেন, হে আদম! তিনি বলবেন, আমি তোমার খিদমতে হাযির। যাবতীয় কল্যাণ তোমারই হাতে। রাসূলুল্লাহ্ সাল্লাল্লাহু আলাইহি ওয়াসাল্লাম বলেন, আল্লাহ্ বলবেন, জাহান্নামীদের (নিক্ষেপ করার জন্য) বের কর। আদম (আঃ) বলবেন, কী পরিমাণ জাহান্নামী বের করব? আল্লাহ্ বলবেন, প্রতি হাজারে নয়শ’ নিরানব্বই জন। আর এটা ঘটবে ঐ সময়, যখন (কিয়ামতের ভয়াবহতায়) শিশু বুড়িয়ে যাবে। (আয়াত) : আর প্রত্যেক গর্ভবতী গর্ভপাত করে ফেলবে, আর মানুষকে দেখবে মাতাল, যদিও তারা প্রকৃতপক্ষে মাতাল নয়, কিন্তু আল্লাহর শাস্তি বড়ই কঠিন (যার কারণে তাদের ঐ অবস্থা ঘটবে)- (সূরাহ হাজ্জ ২২/২)। এ ব্যাপারটি সহাবাগণের নিকট বড় কঠিন মনে হল। তখন তাঁরা বললেনঃ হে আল্লাহর রাসূল! আমাদের মধ্য থেকে (মুক্তি প্রাপ্ত) সেই লোকটি কে হবেন? তিনি বললেনঃ তোমরা সুসংবাদ গ্রহণ কর যে ইয়ায়ুয ও মাযূয থেকে এক হাজার আর তোমাদের হবে একজন। এরপর তিনি বললেনঃ শপথ ঐ সত্তার, যাঁর করতলে আমার প্রাণ! আমি আশা রাখি যে তোমরা জান্নাতীদের এক-তৃতীয়াংশ হবে। বর্ণনাকারী বলেন, এরপর আমরা ‘আল হামদুলিল্লাহ্’ ও ‘আল্লাহু আকবার’ বলে উঠলাম। তিনি আবার বললেনঃ শপথ ঐ সত্তার, যাঁর হাতের মুঠোয় আমার প্রাণ! আমি অবশ্যই আশা রাখি যে তোমরা জান্নাতীদের অর্ধেক হবে। অন্য সব উম্মাতের তুলনায় তোমাদের দৃষ্টান্ত হচ্ছে কাল ষাঁড়ের চামড়ায় একটি সাদা চুলের মত। অথবা সাদা দাগ, যা গাধার সামনের পায়ে হয়ে থাকে। [৩৩৪৮; মুসলিম ১/৯২, হাঃ ২২২, আহমাদ ১১২৮৪] (আধুনিক প্রকাশনী- ৬০৮০, ইসলামিক ফাউন্ডেশন)";

/**
 * Geometry placeholder Arabic (see module header): the intentions
 * phrase repeated to ~660 chars so the Arabic cap is exercised, each
 * repetition ending with the Arabic full stop (۔) so the splitter sees
 * sentence units. NOT the hadith's Arabic — never publish, never
 * present as the record.
 */
export const ARABIC_GEOMETRY_PLACEHOLDER = "إنما الأعمال بالنيات۔ ".repeat(30).trim();

/** Sentence-aligned prefix of a text up to (not past) a target length. */
export function sentenceAlignedPrefix(text: string, targetChars: number): string {
  const units = splitIntoSentences(text);
  let taken = "";
  for (const unit of units) {
    if (taken.length > 0 && taken.length + unit.length > targetChars) break;
    taken += unit;
    if (taken.length >= targetChars) break;
  }
  return taken;
}

/** Full 6530 fixture card (complete Bengali, placeholder Arabic). */
export function fixture6530Card(): CardPayload {
  return buildAdaptiveFixtureCard(BENGALI_6530, ARABIC_GEOMETRY_PLACEHOLDER, "hadith:bukhari-81-6530", "Sahih al-Bukhari, Hadith 6530");
}

/**
 * Sentence-aligned excerpt fixture cards (test-only): a medium excerpt
 * (~500 chars, EXTENDED_SINGLE) and a 2-page excerpt (~700 chars).
 * Labelled excerpts for layout testing — never published as complete.
 */
export function fixture6530ExcerptCard(targetChars: number, label: string): CardPayload {
  const bengali = sentenceAlignedPrefix(BENGALI_6530, targetChars);
  const arabic = sentenceAlignedPrefix(ARABIC_GEOMETRY_PLACEHOLDER, Math.round(targetChars / 2));
  return buildAdaptiveFixtureCard(bengali, arabic, `hadith:bukhari-81-6530-excerpt-${label}`, "Sahih al-Bukhari, Hadith 6530");
}

/**
 * Link-mode fixture (test-only): synthetic Bengali test sentences
 * (~2,500 chars, 5 estimated pages) so the intro-poster layout can
 * be rendered. The text is INVENTED test copy (patience-themed so the
 * visual engine classifies it) — it is NOT a hadith, and the source
 * line says so on the poster itself. Proves the intro layout +
 * excerpt notice; the sentence-aligned prefix rule is proven by unit
 * tests, not by this text.
 */
export function fixtureAdaptiveLinkCard(): CardPayload {
  // NOTE: the sentence must not contain the word সাহায্য (help) — it
  // matches the food-sharing / giving-hands visual concepts, which
  // have no scene file yet, so the visual gate holds the render
  // (visual_needs_new_scene). Patience (ধৈর্য) is the intended concept.
  const sentence = "ধৈর্য ধারণ করা একটি মহৎ গুণ, যা মানুষকে কঠিন সময়ে স্থির থাকতে শেখায়। ";
  const bengali = sentence.repeat(34);
  return buildAdaptiveFixtureCard(bengali, ARABIC_GEOMETRY_PLACEHOLDER, "hadith:test-link-fixture", "পরীক্ষামূলক — Test Only");
}

function buildAdaptiveFixtureCard(
  bengali: string,
  arabic: string,
  recordRef: string,
  sourceLine: string,
): CardPayload {
  const matn = extractHadithMatn(arabic);
  const pronunciation = matn !== null ? transliterateArabic(matn).candidate : null;
  return {
    kind: "hadith",
    recordRef,
    title: "আজকের হাদিস",
    arabic,
    bengali,
    sourceLine,
    canonicalLink: "/hadith/sahih-bukhari/bangla",
    altText: `হাদিস: ${bengali} — ${sourceLine}`,
    caption: `🤲 আজকের হাদিস\n${bengali}\n📖 ${sourceLine}\n🔗 https://noorapp.in/hadith/sahih-bukhari/bangla\n— NoorApp`,
    pronunciation,
    pronunciationStatus: pronunciation !== null ? "candidate" : "missing",
    pronunciationSource: pronunciation !== null ? "generated" : null,
    pronunciationScope: pronunciation !== null ? "matn-only" : null,
  };
}

/**
 * Build one page's card from the full card + its page slice. The page
 * card keeps the same title/source/link; its caption/altText describe
 * the page (with the page label for multi-page sets) so push/share
 * text never implies a page is the complete hadith. Pronunciation is
 * dropped (metadata only, never rendered on Bengali-first posters,
 * and the matn extraction must not run on a sliced Arabic).
 */
export function buildAdaptivePageCard(
  full: CardPayload,
  pageArabic: string,
  pageBengali: string,
  pageIndex: number,
  pageCount: number,
  isExcerpt: boolean,
): CardPayload {
  const label = pageCount > 1 ? ` (${adaptivePageLabel(pageIndex, pageCount)})` : "";
  const excerptNote = isExcerpt ? " (প্রথম অংশ — সম্পূর্ণ হাদিস পড়ুন)" : "";
  return {
    ...full,
    arabic: pageArabic,
    bengali: pageBengali,
    altText: `হাদিস${label}${excerptNote}: ${pageBengali} — ${full.sourceLine}`,
    caption: `🤲 আজকের হাদিস${label}${excerptNote}\n${pageBengali}\n📖 ${full.sourceLine}\n🔗 https://noorapp.in${full.canonicalLink}\n— NoorApp`,
    pronunciation: null,
    pronunciationStatus: "missing",
    pronunciationSource: null,
    pronunciationScope: null,
  };
}
