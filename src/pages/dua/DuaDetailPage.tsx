import { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { ArrowLeft, BookOpen, Sparkles, Heart, Star, Clock, ScrollText, ChevronRight, ChevronLeft, Share2, Loader2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import DuaAudioPlayer from "@/components/DuaAudioPlayer";
import { AdSlot } from "@/components/ads/AdSlot";
import { useToast } from "@/hooks/use-toast";


interface DuaRow {
  id: string;
  slug: string | null;
  title: string | null;
  title_en: string | null;
  title_hi: string | null;
  title_ur: string | null;
  category: string | null;
  content_arabic: string | null;
  content_pronunciation: string | null;
  content_pronunciation_en: string | null;
  content_pronunciation_hi: string | null;
  content_pronunciation_ur: string | null;
  content: string | null;
  content_en: string | null;
  content_hi: string | null;
  content_ur: string | null;
  explanation_bn: string | null;
  benefits_bn: string[] | null;
  when_to_recite_bn: string | null;
  hadith_reference: string | null;
  // Multilingual translations (fallback to *_bn when missing)
  explanation_en: string | null;
  explanation_hi: string | null;
  explanation_ur: string | null;
  benefits_en: string[] | null;
  benefits_hi: string[] | null;
  benefits_ur: string[] | null;
  when_to_recite_en: string | null;
  when_to_recite_hi: string | null;
  when_to_recite_ur: string | null;
  source_type: string | null;
  reference: string | null;
  authenticity: string | null;
  virtue: string | null;
  virtue_reference: string | null;
  subtitle: string | null;
  quran_meta: unknown;
  faq: unknown;
  related_duas: string[] | null;
  recommendation_tags: string[] | null;
  recommended_moments: string[] | null;
  image_url: string | null;
  audio_url: string | null;
  og_image_data: any | null;
  seo: any | null;
}

const SITE_ORIGIN = "https://noorapp.in";
const FALLBACK_OG = `${SITE_ORIGIN}/og-dua.png`;
const LOCAL_CANONICAL_OG_SLUGS = new Set([
  "al-baqarah-2-285", "al-baqarah-2-286", "ayatul-kursi", "dua-after-wudu",
  "dua-before-entering-toilet", "dua-before-sleeping", "dua-for-parents",
  "dua-for-sehri-intention-for-fasting", "dua-for-the-sick", "dua-for-travel",
  "dua-in-times-of-distress", "dua-when-looking-in-the-mirror",
  "dua-when-provoked-while-fasting", "dua-when-wearing-new-clothes",
  "surah-al-falaq", "surah-al-fatihah", "surah-al-ikhlas", "surah-al-ikhlas-2",
  "surah-an-nas", "ইসমে-আযমের-দোয়া-অত্যন্ত-ফজিলতপূর্ণ",
]);

const isLegacyMissingSlugImage = (url: string) =>
  /^https:\/\/noorapp\.in\/assets\/og-images\/[^/?]+\.png(?:\?|$)/i.test(url);

type DuaLang = "bengali" | "english" | "hindi" | "urdu";

const LANGUAGE_LABELS: Record<DuaLang, string> = {
  bengali: "বাংলা",
  english: "English",
  hindi: "हिंदी",
  urdu: "اردو",
};

const CATEGORY_MAP: Record<string, string> = {
  "Balanced Life": "ভারসাম্যপূর্ণ জীবন",
  "Character": "চরিত্র",
  "Daily": "দৈনিক",
  "Death": "মৃত্যু",
  "Evening": "সন্ধ্যা",
  "Faith": "ঈমান",
  "Family": "পরিবার",
  "Fasting": "রোজা",
  "Food": "খাবার",
  "Forgiveness": "ক্ষমা",
  "Gratitude": "কৃতজ্ঞতা",
  "Guidance": "হেদায়েত",
  "Hajj": "হজ",
  "Healing": "আরোগ্য",
  "Health": "স্বাস্থ্য",
  "Hereafter": "পরকাল",
  "Hope": "আশা",
  "Journey": "সফর",
  "Justice": "ইনসাফ",
  "Knowledge": "জ্ঞান",
  "Legacy": "উত্তরাধিকার",
  "Masjid": "মসজিদ",
  "Morning": "সকাল",
  "Names of Allah": "আল্লাহর নাম",
  "Parents": "পিতা-মাতা",
  "Praise": "প্রশংসা",
  "Promise": "প্রতিশ্রুতি",
  "Protection": "সুরক্ষা",
  "Quran": "কুরআন",
  "Ramadan": "রমজান",
  "Remembrance": "জিকির",
  "Repentance": "তওবা",
  "Responsibility": "দায়িত্ব",
  "Ruqyah": "রুকইয়াহ",
  "Salah": "নামাজ",
  "Sleep": "ঘুম",
  "Steadfastness": "অবিচলতা",
  "Submission": "আত্মসমর্পণ",
  "Tawhid": "তাওহীদ",
  "Travel": "ভ্রমণ",
  "Weather": "আবহাওয়া",
  "Wisdom": "প্রজ্ঞা",
  "Worship": "ইবাদত",
  "Wudu": "ওযু",
};

const getCategoryLabel = (cat: string | null) => {
  if (!cat) return "সাধারণ";
  return CATEGORY_MAP[cat] || cat;
};

const ISLAMIC_PATTERN_1 = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='136' viewBox='0 0 160 136'%3E%3Cg fill='none' stroke='%23ffffff' stroke-opacity='0.05' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath stroke-width='3.4' d='M-10 29C10 7 39 4 59 17c16 11 18 32 5 44-13 11-34 7-38-8-3-13 9-24 22-19 16 6 21 27 12 43-11 22-35 31-60 22'/%3E%3Cpath stroke-width='2.7' d='M68-10C56 13 61 38 81 49c18 10 39 0 40-19 1-16-15-25-28-15-14 11-8 35 9 44 18 9 39 7 52-5'/%3E%3Cpath stroke-width='3.2' d='M82 61c18-20 49-22 68-5 16 14 13 40-7 50-17 9-36-1-37-18-1-15 16-25 29-16 16 11 17 36 3 54-15 20-44 27-69 14'/%3E%3Cpath stroke-width='2' d='M2 87c16-15 39-17 55-6M132 103c-8 8-10 19-4 29M45 112c9-10 24-12 36-5'/%3E%3C/g%3E%3Cg fill='%23ffffff' fill-opacity='0.04'%3E%3Ccircle cx='13' cy='52' r='2.4'/%3E%3Ccircle cx='20' cy='48' r='1.5'/%3E%3Ccircle cx='72' cy='103' r='2.2'/%3E%3Cpath d='M34 8c6 7 6 15 0 22-6-7-6-15 0-22ZM102 122c8-10 17-10 25 0-8-4-17-4-25 0Z'/%3E%3C/g%3E%3Cg fill='%23ffffff' font-family='serif' text-anchor='middle' opacity='0.05'%3E%3Ctext x='44' y='55' font-size='17' transform='rotate(-18 44 55)'%3Eالله%3C/text%3E%3Ctext x='118' y='34' font-size='14' transform='rotate(13 118 34)'%3Eرب%3C/text%3E%3Ctext x='42' y='105' font-size='13'%3Eنور%3C/text%3E%3C/g%3E%3C/svg%3E")`;
const ISLAMIC_PATTERN_2 = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='72' height='61' viewBox='0 0 72 61'%3E%3Cg fill='none' stroke='%23ffffff' stroke-width='1.45' stroke-opacity='0.03' stroke-linecap='round'%3E%3Cpath d='M-4 25c9-13 22-15 31-7 8 7 5 18-3 22-8 3-16-2-14-9 1-6 8-9 14-5 7 5 6 15-1 22-8 8-20 8-29 2M38-4c-6 11-3 21 5 26 9 4 18-2 18-10-1-7-8-10-13-6-5 5-2 14 5 18M39 42c9-10 22-10 30-2'/%3E%3C/g%3E%3C/svg%3E")`;
const ISLAMIC_PATTERN = `${ISLAMIC_PATTERN_1}, ${ISLAMIC_PATTERN_2}`;

const LANG_SUFFIX: Record<DuaLang, "" | "_en" | "_hi" | "_ur"> = {
  bengali: "",
  english: "_en",
  hindi: "_hi",
  urdu: "_ur",
};

// Imported Dua records may contain escaped newline markers and accidental
// repeated lines. Normalize only the displayed text.
const normalizeDuaDisplayText = (value: string | null | undefined) => {
  if (!value) return "";
  const normalized = String(value)
    .replace(/\\+r\\+n/g, "\n")
    .replace(/\\+n/g, "\n")
    .replace(/\\+r/g, "\n")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
  const lines = normalized.split("\n").map((line) => line.trim()).filter(Boolean);
  const deduped: string[] = [];
  for (const line of lines) {
    if (line !== deduped[deduped.length - 1]) deduped.push(line);
  }
  return deduped.join("\n");
};

// Language-aware text resolver — falls back to Bengali when missing
const getDuaText = (dua: DuaRow, language: DuaLang) => {
  const suf = LANG_SUFFIX[language];
  const titleKey = (suf ? `title${suf}` : "title") as keyof DuaRow;
  const contentKey = (suf ? `content${suf}` : "content") as keyof DuaRow;
  const pronKey = (suf
    ? `content_pronunciation${suf}`
    : "content_pronunciation") as keyof DuaRow;
  return {
    title: (dua[titleKey] as string | null) || dua.title || "",
    meaning: normalizeDuaDisplayText(
      (dua[contentKey] as string | null) || dua.content || "",
    ),
    pronunciation: normalizeDuaDisplayText(
      (dua[pronKey] as string | null) || dua.content_pronunciation || "",
    ),
  };
};

const SECTION_LABELS = {
  pronunciation: {
    bengali: "বাংলা উচ্চারণ",
    english: "Transliteration",
    hindi: "उच्चारण",
    urdu: "تلفظ",
  },
  meaning: {
    bengali: "অর্থ",
    english: "Meaning",
    hindi: "अर्थ",
    urdu: "معنی",
  },
} as const;

const RICH_LABELS = {
  explanation: {
    bengali: "বিস্তারিত ব্যাখ্যা",
    english: "Detailed Explanation",
    hindi: "विस्तृत व्याख्या",
    urdu: "تفصیلی وضاحت",
  },
  benefits: {
    bengali: "ফজিলত",
    english: "Virtues & Benefits",
    hindi: "फ़ज़ीलत",
    urdu: "فضائل",
  },
  whenToRecite: {
    bengali: "কখন পড়তে হয়",
    english: "When to Recite",
    hindi: "कब पढ़ें",
    urdu: "کب پڑھیں",
  },
	  hadithRef: {
	    bengali: "হাদিস রেফারেন্স",
	    english: "Hadith Reference",
	    hindi: "हदीस संदर्भ",
	    urdu: "حدیث حوالہ",
	  },
	  source: {
	    bengali: "উৎস",
	    english: "Source",
	    hindi: "स्रोत",
	    urdu: "ماخذ",
	  },
	  reference: {
	    bengali: "রেফারেন্স",
	    english: "Reference",
	    hindi: "संदर्भ",
	    urdu: "حوالہ",
	  },
  related: {
    bengali: "সম্পর্কিত দোয়া",
    english: "Related Duas",
    hindi: "संबंधित दुआएं",
    urdu: "متعلقہ دعائیں",
  },
} as const;

// Resolve language-aware rich content with fallback to Bengali
const getDuaRich = (dua: DuaRow, language: DuaLang) => {
  const pick = <T,>(en: T | null, hi: T | null, ur: T | null, bn: T | null): T | null => {
    if (language === "english") return en ?? bn;
    if (language === "hindi") return hi ?? bn;
    if (language === "urdu") return ur ?? bn;
    return bn;
  };
  const benefits =
    pick(dua.benefits_en, dua.benefits_hi, dua.benefits_ur, dua.benefits_bn) ?? null;
  return {
    explanation: pick(
      dua.explanation_en,
      dua.explanation_hi,
      dua.explanation_ur,
      dua.explanation_bn,
    ),
    benefits: benefits && benefits.length > 0 ? benefits : null,
    whenToRecite: pick(
      dua.when_to_recite_en,
      dua.when_to_recite_hi,
      dua.when_to_recite_ur,
      dua.when_to_recite_bn,
    ),
  };
};

const truncate = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);

const asTextList = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  if (typeof value === "string" && value.trim()) return [value.trim()];
  return [];
};

const asFaqList = (value: unknown): Array<{ question: string; answer: string }> => {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    const question = String(record.question ?? record.q ?? "").trim();
    const answer = String(record.answer ?? record.a ?? "").trim();
    return question && answer ? [{ question, answer }] : [];
  });
};

const slugifyCategory = (s: string) =>
  s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\u0980-\u09FF]+/g, "-")
    .replace(/(^-+|-+$)/g, "");

type NavSibling = { slug: string; title: string };

const DuaDetailPage = () => {
  const { slug } = useParams<{ slug: string }>();
  const { toast } = useToast();
  const [dua, setDua] = useState<DuaRow | null>(null);
  const [related, setRelated] = useState<DuaRow[]>([]);
  const [prevDua, setPrevDua] = useState<NavSibling | null>(null);
  const [nextDua, setNextDua] = useState<NavSibling | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [language, setLanguage] = useState<DuaLang>(() => {
    if (typeof window === "undefined") return "bengali";
    const saved = window.localStorage.getItem("dua_language");
    return (saved as DuaLang) || "bengali";
  });

  useEffect(() => {
    try {
      window.localStorage.setItem("dua_language", language);
    } catch {}
  }, [language]);

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setNotFound(false);
      const { data, error } = await supabase
        .from("admin_content")
        .select(
          "id, slug, title, title_en, title_hi, title_ur, category, subtitle, content_arabic, content_pronunciation, content_pronunciation_en, content_pronunciation_hi, content_pronunciation_ur, content, content_en, content_hi, content_ur, explanation_bn, explanation_en, explanation_hi, explanation_ur, benefits_bn, benefits_en, benefits_hi, benefits_ur, when_to_recite_bn, when_to_recite_en, when_to_recite_hi, when_to_recite_ur, hadith_reference, source_type, reference, authenticity, virtue, virtue_reference, quran_meta, faq, related_duas, recommendation_tags, recommended_moments, image_url, audio_url, og_image_data, seo"
        )
        .eq("slug", slug)
        .eq("status", "published")
        .in("content_type", ["dua", "Dua"])
        .maybeSingle();

      if (cancelled) return;
      if (error || !data) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      setDua(data as unknown as DuaRow);

      // Related: same category, exclude self
      const cat = (data as any).category;
      if (cat) {
        const { data: rel } = await supabase
          .from("admin_content")
          .select("id, slug, title, title_en, title_hi, title_ur, category, subtitle, content_arabic, content_pronunciation, content_pronunciation_en, content_pronunciation_hi, content_pronunciation_ur, content, content_en, content_hi, content_ur, explanation_bn, explanation_en, explanation_hi, explanation_ur, benefits_bn, benefits_en, benefits_hi, benefits_ur, when_to_recite_bn, when_to_recite_en, when_to_recite_hi, when_to_recite_ur, hadith_reference, source_type, reference, authenticity, virtue, virtue_reference, quran_meta, faq, related_duas, recommendation_tags, recommended_moments, og_image_data, seo")
          .eq("category", cat)
          .eq("status", "published")
          .in("content_type", ["dua", "Dua"])
          .neq("id", (data as any).id)
          .not("slug", "is", null)
          .limit(5);
        if (!cancelled && rel) setRelated(rel as unknown as DuaRow[]);
      }

      // Prev/Next siblings ordered by created_at across all duas with slug
      const { data: siblings } = await supabase
        .from("admin_content")
        .select("id, slug, title")
        .eq("status", "published")
        .in("content_type", ["dua", "Dua"])
        .not("slug", "is", null)
        .order("created_at", { ascending: true });
      if (!cancelled && siblings) {
        const list = siblings as Array<{ id: string; slug: string | null; title: string | null }>;
        const idx = list.findIndex((s) => s.id === (data as any).id);
        if (idx >= 0) {
          const p = list[idx - 1];
          const n = list[idx + 1];
          setPrevDua(p?.slug ? { slug: p.slug, title: p.title || "পূর্ববর্তী দোয়া" } : null);
          setNextDua(n?.slug ? { slug: n.slug, title: n.title || "পরবর্তী দোয়া" } : null);
        }
      }

      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  // Get OG image URL from database or JSON
  const ogImageUrl = useMemo(() => {
    if (!dua) return FALLBACK_OG;

    // Canonical local assets take precedence over legacy database paths for the upgraded set.
    if (dua.slug && LOCAL_CANONICAL_OG_SLUGS.has(dua.slug)) {
      return `${SITE_ORIGIN}/assets/dua-og/${encodeURIComponent(dua.slug)}` + ".webp";
    }

    // 1. Check direct image_url field (used by Admin Panel uploads)
    if (
      dua.image_url &&
      !dua.image_url.includes("yourwebsite.com") &&
      !isLegacyMissingSlugImage(dua.image_url)
    ) {
      return dua.image_url;
    }

    // 2. Check og_image_data (used by JSON/Bulk data)
    const ogData = (dua as any).og_image_data;
    if (ogData && typeof ogData === "object") {
      const storageBase = import.meta.env.VITE_SUPABASE_URL + "/storage/v1/object/public/media/";
      // Check og_image_url in og_image_data (full URL stored in JSON)
      if (ogData.og_image_url) return ogData.og_image_url;
      const path = ogData.og_image || ogData.storage_path || ogData.og_url || ogData.url;
      
      if (path) {
        if (path.startsWith("http")) return path;
        const cleanPath = path.replace(/^\/+/, "");
        if (cleanPath.startsWith("assets/")) return `${SITE_ORIGIN}/${cleanPath}`;
        return `${storageBase}${cleanPath}`;
      }
    }

    // 3. Check seo.og_image
    const seoData = (dua as any).seo;
    if (seoData && seoData.og_image && !seoData.og_image.includes("yourwebsite.com")) {
      return seoData.og_image;
    }

    // 4. Fallback to generic image
    return FALLBACK_OG;
  }, [dua]);

  const seo = useMemo(() => {
    if (!dua) return null;
    const baseTitle = dua.title || "দোয়া";
    // Format: "{Dua Name} Bangla Meaning, Benefits, Arabic Text"
    const title = truncate(
      `${baseTitle} — বাংলা অর্থ, ফজিলত ও আরবি টেক্সট | Noor`,
      60,
    );
    const description = truncate(
      dua.explanation_bn?.replace(/\s+/g, " ").trim() ||
        dua.content?.replace(/\s+/g, " ").trim() ||
        `${dua.title} এর আরবি, বাংলা উচ্চারণ, অর্থ ও ফজিলত পড়ুন।`,
      150
    );
    const url = `${SITE_ORIGIN}/dua/${dua.slug}`;
    return { title, description, url };
  }, [dua]);

  const handleShare = async () => {
    if (!dua || !seo) return;
    const shareData = {
      title: dua.title || "দোয়া",
      text: seo.description,
      url: seo.url,
    };
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share(shareData);
      } else if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(seo.url);
        toast({ title: "লিংক কপি হয়েছে", description: seo.url });
      }
    } catch {
      // user cancelled — ignore
    }
  };

  const jsonLd = useMemo(() => {
    if (!dua) return null;
    return {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: dua.title || "দোয়া",
      inLanguage: "bn",
      mainEntityOfPage: { "@type": "WebPage", "@id": `${SITE_ORIGIN}/dua/${dua.slug}` },
      description: seo?.description,
      image: ogImageUrl,
      author: { "@type": "Organization", name: "Noor" },
      publisher: {
        "@type": "Organization",
        name: "Noor",
        logo: { "@type": "ImageObject", url: `${SITE_ORIGIN}/logo.png` },
      },
    };
  }, [dua, seo]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[hsl(158,64%,12%)]" style={{ backgroundImage: ISLAMIC_PATTERN }}>
        <div className="max-w-3xl mx-auto px-4 py-10 space-y-8 animate-pulse">
          <div className="flex flex-col items-center justify-center py-10 gap-3">
            <div className="relative">
              <Loader2 className="w-12 h-12 text-[hsl(45,93%,58%)] animate-spin" />
              <Sparkles className="absolute -top-1 -right-1 w-5 h-5 text-[hsl(45,93%,58%)] animate-pulse" />
            </div>
            <p className="text-white/60 animate-pulse font-medium tracking-widest text-xs uppercase">Preparing Dua Details...</p>
          </div>
          
          {/* Skeleton Cards */}
          <div className="relative bg-gradient-to-br from-[hsl(158,55%,25%)] to-[hsl(158,64%,20%)] rounded-3xl p-8 border border-white/10 shadow-xl overflow-hidden opacity-60">
            <div className="space-y-4">
              <Skeleton className="h-4 w-24 bg-white/10 mx-auto rounded" />
              <Skeleton className="h-10 w-full bg-white/10 rounded-lg" />
              <Skeleton className="h-10 w-4/5 mx-auto bg-white/10 rounded-lg" />
            </div>
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full animate-[shimmer_3s_infinite]" />
          </div>

          <div className="space-y-4">
            {[1, 2].map((i) => (
              <div key={i} className="relative bg-white/5 rounded-2xl p-6 border border-white/10 overflow-hidden opacity-50">
                <div className="flex items-center gap-3 mb-4">
                  <Skeleton className="h-4 w-4 bg-white/10 rounded-full" />
                  <Skeleton className="h-3 w-32 bg-white/10 rounded" />
                </div>
                <Skeleton className="h-4 w-full bg-white/5 rounded mb-2" />
                <Skeleton className="h-4 w-5/6 bg-white/5 rounded" />
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full animate-[shimmer_2s_infinite]" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (notFound || !dua) {
    return (
      <div className="min-h-screen bg-[hsl(158,64%,18%)] flex flex-col items-center justify-center p-6 text-center">
        <Helmet><meta name="robots" content="noindex" /></Helmet>
        <p className="text-white text-lg mb-4">এই দোয়াটি খুঁজে পাওয়া যায়নি।</p>
        <div className="flex items-center justify-center gap-3">
          <Link to="/dua" className="px-4 py-2 rounded-full bg-[hsl(45,93%,58%)] text-[hsl(158,64%,15%)] font-medium">
            সব দোয়া দেখুন
          </Link>
          <Link to="/" className="px-4 py-2 rounded-full border border-white/30 text-white font-medium hover:bg-white/10">
            হোমে যান
          </Link>
        </div>
      </div>
    );
  }

  const text = getDuaText(dua, language);
  const rich = getDuaRich(dua, language);
  const faqItems = asFaqList(dua.faq);
  const quranItems = asTextList(dua.quran_meta);
  const momentItems = asTextList(dua.recommended_moments);
  const recommendationItems = asTextList(dua.recommendation_tags);

  return (
    <div className="min-h-screen bg-[hsl(158,64%,18%)]">
      {seo && (
        <Helmet>
          <title>{seo.title}</title>
          <meta name="description" content={seo.description} />
          <link rel="canonical" href={seo.url} />
          <meta property="og:type" content="article" />
          <meta property="og:title" content={seo.title} />
          <meta property="og:description" content={seo.description} />
          <meta property="og:url" content={seo.url} />
          <meta property="og:image" content={ogImageUrl} />
          <meta property="og:image:secure_url" content={ogImageUrl} />
          <meta property="og:image:type" content={/\.png(?:\?|$)/i.test(ogImageUrl) ? "image/png" : /\.jpe?g(?:\?|$)/i.test(ogImageUrl) ? "image/jpeg" : "image/webp"} />
          <meta property="og:image:width" content="1200" />
          <meta property="og:image:height" content="630" />
          <meta property="og:image:alt" content={seo.title} />
          <meta name="twitter:card" content="summary_large_image" />
          <meta name="twitter:title" content={seo.title} />
          <meta name="twitter:description" content={seo.description} />
          <meta name="twitter:image" content={ogImageUrl} />
          {jsonLd && <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>}
        </Helmet>
      )}

      {/* Header */}
      <motion.header
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="sticky top-0 z-50 bg-gradient-to-b from-[hsl(158,55%,22%)] to-[hsl(158,55%,22%)]/95 backdrop-blur-lg border-b border-white/10 relative overflow-hidden"
        style={{ backgroundImage: ISLAMIC_PATTERN }}
      >
        <div className="flex items-center gap-3 px-4 py-4">
          {/* Social deep links have no in-app history. Always return visitors to
              the Dua collection rather than sending them back to the share app. */}
          <Link
            to="/dua"
            className="p-2 -ml-2 hover:bg-white/10 rounded-full transition-colors"
            aria-label="দোয়া সংকলনে ফিরুন"
            title="সব দোয়া"
          >
            <ArrowLeft className="w-5 h-5 text-white" />
          </Link>
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[hsl(45,93%,58%)] to-[hsl(45,93%,48%)] flex items-center justify-center">
            <BookOpen className="w-4 h-4 text-[hsl(158,64%,15%)]" />
          </div>
          <h1 className="min-w-0 flex-1 text-xl font-bold text-white truncate">{text.title}</h1>
          <nav className="flex shrink-0 items-center gap-1" aria-label="দ্রুত নেভিগেশন">
            <Link
              to="/dua"
              className="rounded-full bg-white/10 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-white/20"
            >
              দোয়া
            </Link>
            <Link
              to="/"
              className="rounded-full border border-white/20 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-white/10"
            >
              হোম
            </Link>
          </nav>
        </div>

        {/* Language Selector */}
        <div className="px-4 pb-3">
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
            {(Object.keys(LANGUAGE_LABELS) as DuaLang[]).map((lang) => (
              <button
                key={lang}
                onClick={() => setLanguage(lang)}
                className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all ${
                  language === lang
                    ? "bg-gradient-to-r from-[hsl(45,93%,58%)] to-[hsl(45,93%,48%)] text-[hsl(158,64%,15%)] shadow-md"
                    : "bg-white/10 text-white/70 hover:bg-white/20"
                }`}
              >
                {LANGUAGE_LABELS[lang]}
              </button>
            ))}
          </div>
        </div>
      </motion.header>

      <article className="p-4 space-y-6 max-w-3xl mx-auto pb-12">
        {/* Breadcrumb */}
        <nav className="text-xs text-white/60 flex items-center gap-1 flex-wrap">
          <Link to="/" className="hover:text-[hsl(45,93%,58%)]">হোম</Link>
          <ChevronRight className="w-3 h-3" />
          <Link to="/dua" className="hover:text-[hsl(45,93%,58%)]">দোয়া</Link>
          {dua.category && (
            <>
              <ChevronRight className="w-3 h-3" />
              <Link
                to={`/dua/category/${slugifyCategory(dua.category)}`}
                className="hover:text-[hsl(45,93%,58%)]"
              >
                {getCategoryLabel(dua.category)}
              </Link>
            </>
          )}
        </nav>

        {/* H1 */}
        <header>
          <div className="flex items-start justify-between gap-3">
            <h1 className="text-3xl md:text-4xl font-bold text-white leading-tight flex-1">
              {text.title}
            </h1>
            <button
              onClick={handleShare}
              aria-label="Share"
              className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-full bg-[hsl(45,93%,58%)]/20 text-[hsl(45,93%,58%)] text-xs font-semibold hover:bg-[hsl(45,93%,58%)]/30 transition"
            >
              <Share2 className="w-3.5 h-3.5" /> শেয়ার
            </button>
          </div>
          {dua.category && (
            <Link
              to={`/dua/category/${slugifyCategory(dua.category)}`}
              className="mt-2 inline-block text-sm text-[hsl(45,93%,58%)] hover:underline"
            >
              বিভাগ: {getCategoryLabel(dua.category)} →
            </Link>
          )}
        </header>



        {/* Arabic */}
        {dua.content_arabic && (
          <section 
            className="relative bg-gradient-to-br from-[hsl(158,55%,25%)] to-[hsl(158,64%,20%)] rounded-3xl p-6 border border-white/10 shadow-xl overflow-hidden group"
            style={{ backgroundImage: `${ISLAMIC_PATTERN}, linear-gradient(to bottom right, hsl(158,55%,25%), hsl(158,64%,20%))` }}
          >
            <div className="absolute inset-0 border border-white/5 rounded-3xl pointer-events-none" />
            <div className="absolute top-0 right-0 w-32 h-32 bg-[hsl(45,93%,58%)]/10 rounded-full blur-2xl" />
            <div className="relative">
              <div className="flex items-center justify-center gap-2 mb-4">
                <Sparkles className="w-4 h-4 text-[hsl(45,93%,58%)]" />
                <h2 className="text-xs font-medium text-[hsl(45,93%,58%)] uppercase tracking-wide">আরবি</h2>
                <Sparkles className="w-4 h-4 text-[hsl(45,93%,58%)]" />
              </div>
              <p dir="rtl" className="text-3xl md:text-4xl font-arabic leading-[2] text-white text-center">
                {dua.content_arabic}
              </p>
            </div>
          </section>
        )}

        {/* Pronunciation */}
        {text.pronunciation && (
          <section 
            className="bg-white/5 rounded-2xl p-5 border border-white/10 relative overflow-hidden shadow-sm"
            style={{ backgroundImage: ISLAMIC_PATTERN }}
          >
            <div className="absolute inset-0 border border-white/5 rounded-2xl pointer-events-none" />
            <h2 className="flex items-center gap-2 text-xs font-medium text-[hsl(45,93%,58%)] uppercase tracking-wide mb-3">
              <Sparkles className="w-4 h-4" /> {SECTION_LABELS.pronunciation[language]}
            </h2>
            <p className="text-[#FFFFFF] font-bangla font-medium text-xl md:text-2xl leading-[1.8] tracking-wide drop-shadow-md antialiased">
              {text.pronunciation}
            </p>
          </section>
        )}

        {/* Meaning */}
        {text.meaning && (
          <section 
            className="bg-gradient-to-br from-[hsl(45,93%,58%)]/10 to-transparent rounded-2xl p-5 border border-[hsl(45,93%,58%)]/20 relative overflow-hidden shadow-sm"
            style={{ backgroundImage: `${ISLAMIC_PATTERN}, linear-gradient(to bottom right, hsla(45,93%,58%,0.1), transparent)` }}
          >
            <div className="absolute inset-0 border border-white/5 rounded-2xl pointer-events-none" />
            <h2 className="flex items-center gap-2 text-xs font-medium text-[hsl(45,93%,58%)] uppercase tracking-wide mb-3">
              <Heart className="w-4 h-4" /> {SECTION_LABELS.meaning[language]}
            </h2>
            <p 
              className="text-[#FFFFFF] font-medium text-xl md:text-2xl leading-[1.8] tracking-wide drop-shadow-md antialiased"
              style={{ fontFamily: "'Noto Serif Bengali', serif" }}
            >
              {text.meaning}
            </p>
          </section>
        )}

        {/* Audio */}
        {dua.content_arabic && (
          <DuaAudioPlayer arabicText={dua.content_arabic} duaId={dua.id} audioUrl={dua.audio_url ?? undefined} />
        )}

        <AdSlot placement="web_dua_middle" />

        {/* Explanation */}
        {rich.explanation && (
          <section className="bg-white/5 rounded-2xl p-5 border border-white/10">
            <h2 className="flex items-center gap-2 text-base font-semibold text-white mb-3">
              <ScrollText className="w-5 h-5 text-[hsl(45,93%,58%)]" /> {RICH_LABELS.explanation[language]}
            </h2>
            <div className="text-white/85 leading-relaxed whitespace-pre-line">{rich.explanation}</div>
          </section>
        )}

        {/* Benefits */}
        {rich.benefits && rich.benefits.length > 0 && (
          <section className="bg-white/5 rounded-2xl p-5 border border-white/10">
            <h2 className="flex items-center gap-2 text-base font-semibold text-white mb-3">
              <Star className="w-5 h-5 text-[hsl(45,93%,58%)]" /> {RICH_LABELS.benefits[language]}
            </h2>
            <ul className="space-y-2 text-white/85">
              {rich.benefits.map((b, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-[hsl(45,93%,58%)] mt-1">•</span>
                  <span className="leading-relaxed">{b}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* When to recite */}
        {rich.whenToRecite && (
          <section className="bg-white/5 rounded-2xl p-5 border border-white/10">
            <h2 className="flex items-center gap-2 text-base font-semibold text-white mb-3">
              <Clock className="w-5 h-5 text-[hsl(45,93%,58%)]" /> {RICH_LABELS.whenToRecite[language]}
            </h2>
            <p className="text-white/85 leading-relaxed whitespace-pre-line">{rich.whenToRecite}</p>
          </section>
        )}

	        {/* Hadith reference */}
	        {dua.hadith_reference && (
	          <section className="bg-[hsl(45,93%,58%)]/10 rounded-2xl p-5 border border-[hsl(45,93%,58%)]/30">
	            <h2 className="text-xs font-medium text-[hsl(45,93%,58%)] uppercase tracking-wide mb-2">{RICH_LABELS.hadithRef[language]}</h2>
	            <p className="text-white/90 italic leading-relaxed">{dua.hadith_reference}</p>
	          </section>
	        )}

	        {/* Source & Reference */}
	        {(dua.source_type || dua.reference) && (
	          <section className="bg-white/5 rounded-2xl p-5 border border-white/10">
	            <h2 className="text-xs font-medium text-white/50 uppercase tracking-wide mb-3">উৎস ও রেফারেন্স</h2>
	            <ul className="space-y-2">
	              {dua.source_type && (
	                <li className="flex items-start gap-3">
	                  <span className="text-xs font-semibold text-[hsl(45,93%,58%)] uppercase w-20 shrink-0 mt-0.5">{RICH_LABELS.source[language]}</span>
	                  <span className="text-white/80 text-sm">{dua.source_type}</span>
	                </li>
	              )}
	              {dua.reference && (
	                <li className="flex items-start gap-3">
	                  <span className="text-xs font-semibold text-[hsl(45,93%,58%)] uppercase w-20 shrink-0 mt-0.5">{RICH_LABELS.reference[language]}</span>
	                  <span className="text-white/80 text-sm">{dua.reference}</span>
	                </li>
	              )}
	            </ul>
	          </section>
	        )}

        {/* Editorial trust and context: render only fields supplied with the record. */}
        {(dua.authenticity || dua.virtue || dua.virtue_reference || dua.subtitle) && (
          <section className="bg-[hsl(158,55%,25%)]/70 rounded-2xl p-5 border border-[hsl(45,93%,58%)]/20 space-y-4">
            {dua.subtitle && <p className="text-white/90 text-base leading-relaxed">{dua.subtitle}</p>}
            {dua.authenticity && (
              <div>
                <h2 className="text-xs font-semibold text-[hsl(45,93%,58%)] uppercase tracking-wide mb-2">বিশুদ্ধতা ও সম্পাদনা নোট</h2>
                <p className="text-white/85 leading-relaxed">{dua.authenticity}</p>
              </div>
            )}
            {dua.virtue && (
              <div>
                <h2 className="text-xs font-semibold text-[hsl(45,93%,58%)] uppercase tracking-wide mb-2">ফজিলত ও প্রাসঙ্গিকতা</h2>
                <p className="text-white/85 leading-relaxed">{dua.virtue}</p>
                {dua.virtue_reference && <p className="text-white/60 text-sm mt-2">রেফারেন্স: {dua.virtue_reference}</p>}
              </div>
            )}
          </section>
        )}

        {quranItems.length > 0 && (
          <section className="bg-white/5 rounded-2xl p-5 border border-white/10">
            <h2 className="text-base font-semibold text-white mb-3">সম্পর্কিত কুরআন প্রসঙ্গ</h2>
            <ul className="space-y-2 text-white/85">{quranItems.map((item, i) => <li key={`${item}-${i}`} className="leading-relaxed">{item}</li>)}</ul>
          </section>
        )}

        {momentItems.length > 0 && (
          <section className="bg-white/5 rounded-2xl p-5 border border-white/10">
            <h2 className="text-base font-semibold text-white mb-3">কখন বা কোন প্রয়োজনে পড়া যায়</h2>
            <ul className="space-y-2 text-white/85">{momentItems.map((item, i) => <li key={`${item}-${i}`} className="leading-relaxed">{item}</li>)}</ul>
          </section>
        )}

        {recommendationItems.length > 0 && (
          <div className="flex flex-wrap gap-2" aria-label="বিষয়ভিত্তিক ট্যাগ">
            {recommendationItems.map((item) => <span key={item} className="px-3 py-1 rounded-full bg-white/10 text-white/70 text-xs">{item}</span>)}
          </div>
        )}

        {faqItems.length > 0 && (
          <section className="bg-white/5 rounded-2xl p-5 border border-white/10">
            <h2 className="text-base font-semibold text-white mb-3">প্রশ্ন ও উত্তর</h2>
            <div className="space-y-4">{faqItems.map((item) => <div key={item.question}><h3 className="text-white font-medium">{item.question}</h3><p className="text-white/80 leading-relaxed mt-1">{item.answer}</p></div>)}</div>
          </section>
        )}

        {/* Related Duas */}
        {related.length > 0 && (
          <section>
            <h2 className="text-base font-semibold text-white mb-3">{RICH_LABELS.related[language]}</h2>
            <div className="space-y-2">
              {related.map((r) => {
                const rt = getDuaText(r, language);
                return (
                <Link
                  key={r.id}
                  to={`/dua/${r.slug}`}
                  className="flex items-center justify-between p-4 rounded-2xl bg-gradient-to-br from-[hsl(158,55%,25%)] to-[hsl(158,64%,20%)] border border-white/10 hover:border-[hsl(45,93%,58%)]/30 transition"
                >
                  <span className="text-white font-medium">{rt.title}</span>
                  <ChevronRight className="w-4 h-4 text-white/50" />
                </Link>
                );
              })}
            </div>
          </section>
        )}

        <section className="bg-white/5 rounded-2xl p-5 border border-white/10">
          <h2 className="text-base font-semibold text-white mb-3">আরও পড়ুন</h2>
          <div className="grid sm:grid-cols-3 gap-2 text-sm">
            {dua.category ? <Link to={`/dua/category/${slugifyCategory(dua.category)}`} className="rounded-xl bg-white/5 border border-white/10 p-3 text-white/85 hover:border-[hsl(45,93%,58%)]/40">এই বিভাগের আরও দোয়া</Link> : <Link to="/dua" className="rounded-xl bg-white/5 border border-white/10 p-3 text-white/85 hover:border-[hsl(45,93%,58%)]/40">সব দোয়া</Link>}
            <Link to="/hadith" className="rounded-xl bg-white/5 border border-white/10 p-3 text-white/85 hover:border-[hsl(45,93%,58%)]/40">সম্পর্কিত হাদিস খুঁজুন</Link>
            <Link to="/stories" className="rounded-xl bg-white/5 border border-white/10 p-3 text-white/85 hover:border-[hsl(45,93%,58%)]/40">সম্পর্কিত গল্প পড়ুন</Link>
          </div>
        </section>

        {/* Prev / Next nav */}
        {(prevDua || nextDua) && (
          <nav className="grid grid-cols-2 gap-3 pt-2" aria-label="দোয়া navigation">
            {prevDua ? (
              <Link
                to={`/dua/${prevDua.slug}`}
                className="flex items-center gap-2 p-3 rounded-2xl bg-white/5 border border-white/10 hover:border-[hsl(45,93%,58%)]/30 transition"
              >
                <ChevronLeft className="w-4 h-4 text-[hsl(45,93%,58%)] shrink-0" />
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-wide text-white/50">পূর্ববর্তী</p>
                  <p className="text-sm text-white truncate">{prevDua.title}</p>
                </div>
              </Link>
            ) : <div />}
            {nextDua ? (
              <Link
                to={`/dua/${nextDua.slug}`}
                className="flex items-center gap-2 p-3 rounded-2xl bg-white/5 border border-white/10 hover:border-[hsl(45,93%,58%)]/30 transition text-right"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] uppercase tracking-wide text-white/50">পরবর্তী</p>
                  <p className="text-sm text-white truncate">{nextDua.title}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-[hsl(45,93%,58%)] shrink-0" />
              </Link>
            ) : <div />}
          </nav>
        )}

        <div className="pt-4 text-center">
          <Link to="/dua" className="inline-flex items-center gap-2 text-sm text-[hsl(45,93%,58%)] hover:underline">
            ← সব দোয়া দেখুন
          </Link>
        </div>
      </article>
    </div>
  );
};

export default DuaDetailPage;
