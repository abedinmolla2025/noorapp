import { useEffect, useState, useMemo } from "react";
import { ArrowLeft, Search, ChevronRight, Loader2, BookOpen, Sparkles } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useNavigate, useParams, Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { motion, AnimatePresence } from "framer-motion";
import { Helmet } from "react-helmet-async";
import BottomNavigation from "@/components/BottomNavigation";

// Keep the Hadith visual language identical to the premium Dua cards.
const ISLAMIC_PATTERN_1 = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='136' viewBox='0 0 160 136'%3E%3Cg fill='none' stroke='%23ffffff' stroke-opacity='0.05' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath stroke-width='3.4' d='M-10 29C10 7 39 4 59 17c16 11 18 32 5 44-13 11-34 7-38-8-3-13 9-24 22-19 16 6 21 27 12 43-11 22-35 31-60 22'/%3E%3Cpath stroke-width='2.7' d='M68-10C56 13 61 38 81 49c18 10 39 0 40-19 1-16-15-25-28-15-14 11-8 35 9 44 18 9 39 7 52-5'/%3E%3Cpath stroke-width='3.2' d='M82 61c18-20 49-22 68-5 16 14 13 40-7 50-17 9-36-1-37-18-1-15 16-25 29-16 16 11 17 36 3 54-15 20-44 27-69 14'/%3E%3Cpath stroke-width='2' d='M2 87c16-15 39-17 55-6M132 103c-8 8-10 19-4 29M45 112c9-10 24-12 36-5'/%3E%3C/g%3E%3Cg fill='%23ffffff' fill-opacity='0.04'%3E%3Ccircle cx='13' cy='52' r='2.4'/%3E%3Ccircle cx='20' cy='48' r='1.5'/%3E%3Ccircle cx='72' cy='103' r='2.2'/%3E%3Cpath d='M34 8c6 7 6 15 0 22-6-7-6-15 0-22ZM102 122c8-10 17-10 25 0-8-4-17-4-25 0Z'/%3E%3C/g%3E%3Cg fill='%23ffffff' font-family='serif' text-anchor='middle' opacity='0.05'%3E%3Ctext x='44' y='55' font-size='17' transform='rotate(-18 44 55)'%3Eالله%3C/text%3E%3Ctext x='118' y='34' font-size='14' transform='rotate(13 118 34)'%3Eرب%3C/text%3E%3Ctext x='42' y='105' font-size='13'%3Eنور%3C/text%3E%3C/g%3E%3C/svg%3E")`;
const ISLAMIC_PATTERN_2 = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='72' height='61' viewBox='0 0 72 61'%3E%3Cg fill='none' stroke='%23ffffff' stroke-width='1.45' stroke-opacity='0.03' stroke-linecap='round'%3E%3Cpath d='M-4 25c9-13 22-15 31-7 8 7 5 18-3 22-8 3-16-2-14-9 1-6 8-9 14-5 7 5 6 15-1 22-8 8-20 8-29 2M38-4c-6 11-3 21 5 26 9 4 18-2 18-10-1-7-8-10-13-6-5 5-2 14 5 18M39 42c9-10 22-10 30-2'/%3E%3C/g%3E%3C/svg%3E")`;
const ISLAMIC_PATTERN = `${ISLAMIC_PATTERN_1}, ${ISLAMIC_PATTERN_2}`;
const EMERALD_CARD_STYLE = {
  backgroundImage: `${ISLAMIC_PATTERN}, linear-gradient(to bottom right, hsl(158,55%,25%), hsl(158,64%,20%))`,
};

// ── Types ────────────────────────────────────────────────────
type LangSlug = "bangla" | "english" | "urdu";

interface RawHadith {
  id: string;
  chapter_id: number;
  hadith_number: number;
  arabic: string;
  bengali?: string;
  english?: string;
  urdu?: string;
  slug?: string | null;
}

interface Hadith {
  id: string;
  chapterId: number;
  number: number;
  arabic: string;
  translation: string;
  slug?: string | null;
}

interface Chapter {
  id: number;
  count: number;
}

// ── UI strings ───────────────────────────────────────────────
const uiStrings = {
  bangla: {
    title: "সহিহ বুখারী শরীফ",
    subtitle: "আরবি + বাংলা অনুবাদ",
    searchPlaceholder: "হাদিস খুঁজুন...",
    chapters: "কিতাবসমূহ",
    allHadiths: "সকল হাদিস",
    hadithNo: "হাদিস নং",
    chapter: "কিতাব",
    hadiths: "টি হাদিস",
    loading: "হাদিস লোড হচ্ছে...",
    error: "ডাটা লোড করতে সমস্যা হয়েছে",
    noResults: "কোনো হাদিস পাওয়া যায়নি",
    loadMore: "আরও দেখুন",
    readDetails: "📖 বিস্তারিত পড়ুন",
  },
  english: {
    title: "Sahih Al-Bukhari",
    subtitle: "Arabic + English Translation",
    searchPlaceholder: "Search hadiths...",
    chapters: "Books (Kitab)",
    allHadiths: "All Hadiths",
    hadithNo: "Hadith No",
    chapter: "Book",
    hadiths: "Hadiths",
    loading: "Loading hadiths...",
    error: "Failed to load data",
    noResults: "No hadiths found",
    loadMore: "Load More",
    readDetails: "📖 Read full details",
  },
  urdu: {
    title: "صحیح البخاری",
    subtitle: "عربی + اردو ترجمہ",
    searchPlaceholder: "حدیث تلاش کریں...",
    chapters: "کتب",
    allHadiths: "تمام احادیث",
    hadithNo: "حدیث نمبر",
    chapter: "کتاب",
    hadiths: "احادیث",
    loading: "...احادیث لوڈ ہو رہی ہیں",
    error: "ڈیٹا لوڈ نہیں ہو سکا",
    noResults: "کوئی حدیث نہیں ملی",
    loadMore: "مزید لوڈ کریں",
    readDetails: "📖 تفصیل پڑھیں",
  },
} as const;

// ── Language config ──────────────────────────────────────────
interface LangCfg {
  source: "json" | "db";
  file?: string;
  dbField?: string;
  field: string;
  label: string;
  rtl: boolean;
}

const langMeta: Record<LangSlug, LangCfg> = {
  bangla: {
    source: "db",
    dbField: "bengali",
    field: "bengali",
    label: "বাংলা",
    rtl: false,
  },
  english: {
    source: "json",
    file: "/data/sahih_bukhari_en.json",
    field: "english",
    label: "English",
    rtl: false,
  },
  urdu: {
    source: "json",
    file: "/data/sahih_bukhari_ur.json",
    field: "urdu",
    label: "اردو",
    rtl: true,
  },
};

// ── DB chapter (Kitab) names type ────────────────────────────
interface KitabInfo {
  chapter_number: number;
  title: string;
  title_bn: string | null;
  title_ar: string | null;
  hadith_count: number;
}

function getChapterName(chapterId: number, lang: LangSlug, kitabMap: Map<number, KitabInfo>): string {
  const kitab = kitabMap.get(chapterId);
  if (kitab) {
    if (lang === "bangla") return kitab.title_bn || kitab.title;
    if (lang === "urdu") return kitab.title_ar || kitab.title;
    return kitab.title;
  }
  const fallback = { bangla: "কিতাব", english: "Book", urdu: "کتاب" };
  return `${fallback[lang]} ${chapterId}`;
}

// ── Lang-specific SEO helpers ────────────────────────────────
const langSeoMeta: Record<LangSlug, { rootTitle: string; rootDesc: string; titleLang: string; descLang: string }> = {
  bangla: {
    rootTitle: "Sahih Bukhari Bangla Hadith – সহীহ বুখারী বাংলা হাদিস | Noor App",
    rootDesc: "Read Sahih Bukhari Bangla Hadith with Arabic text and authentic Bangla translation.",
    titleLang: "Bangla",
    descLang: "Bangla",
  },
  english: {
    rootTitle: "Sahih Bukhari English Hadith Collection | Noor App",
    rootDesc: "Read authentic Sahih Bukhari hadith collection with Arabic and English translation.",
    titleLang: "English",
    descLang: "English",
  },
  urdu: {
    rootTitle: "Sahih Bukhari Urdu Hadith – صحیح بخاری اردو | Noor App",
    rootDesc: "صحیح بخاری احادیث اردو ترجمہ کے সাথে پڑھیں۔",
    titleLang: "Urdu",
    descLang: "Urdu",
  },
};

function buildSeoTitle(slug: LangSlug, chapterId?: number, hadithNumber?: number): string {
  const l = langSeoMeta[slug] || langSeoMeta.bangla;
  if (hadithNumber != null) {
    return `Sahih Bukhari Hadith ${hadithNumber} – ${l.titleLang} Translation – Noor App`;
  }
  if (chapterId != null) {
    return `Sahih Bukhari Book ${chapterId} – ${l.titleLang} – Noor App`;
  }
  return l.rootTitle;
}

function buildSeoDesc(slug: LangSlug, chapterId?: number, hadithNumber?: number): string {
  const l = langSeoMeta[slug] || langSeoMeta.bangla;
  if (hadithNumber != null) {
    return `Read Sahih Bukhari Hadith ${hadithNumber} with Arabic text and ${l.descLang} translation on Noor App.`;
  }
  if (chapterId != null) {
    return `Browse all hadiths in Book ${chapterId} of Sahih Bukhari with Arabic text and ${l.descLang} translation.`;
  }
  return l.rootDesc;
}

function buildCanonical(slug: string, chapterId?: number, hadithNumber?: number): string {
  const base = `https://noorapp.in/hadith/sahih-bukhari/${slug}`;
  if (hadithNumber != null && chapterId != null) {
    return `${base}/${chapterId}/${hadithNumber}`;
  }
  if (chapterId != null) {
    return `${base}/chapter-${chapterId}`;
  }
  return base;
}

function buildArticleJsonLd(slug: LangSlug, hadithNumber?: number) {
  const l = langSeoMeta[slug] || langSeoMeta.bangla;
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: hadithNumber
      ? `Sahih Bukhari Hadith ${hadithNumber} – ${l.titleLang}`
      : `Sahih Bukhari ${l.titleLang} Hadith Collection`,
    author: {
      "@type": "Person",
      name: "Imam Bukhari",
    },
    publisher: {
      "@type": "Organization",
      name: "Noor App",
      url: "https://noorapp.in",
    },
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": buildCanonical(slug, undefined, hadithNumber),
    },
  };
}

// ── Flatten book_1, book_2 … into a single array ─────────────
function flattenBooks(json: Record<string, RawHadith[]>): RawHadith[] {
  const all: RawHadith[] = [];
  const keys = Object.keys(json).sort((a, b) => {
    const numA = parseInt(a.replace(/\D/g, ""), 10) || 0;
    const numB = parseInt(b.replace(/\D/g, ""), 10) || 0;
    return numA - numB;
  });
  for (const key of keys) {
    if (Array.isArray(json[key])) all.push(...json[key]);
  }
  return all;
}

// ── Load from database (Bangla) ──────────────────────────────
async function loadChapterFromDb(dbField: string, chapterId: number): Promise<Hadith[]> {
  const { data, error } = await (supabase as any)
    .from("hadiths")
    .select("id, chapter_id, hadith_number, arabic, slug, " + dbField)
    .eq("book_key", "bukhari")
    .eq("chapter_id", chapterId)
    .not(dbField, "is", null)
    .order("hadith_number", { ascending: true });

  if (error) throw error;
  if (!data) return [];

  return data.map((row: any) => ({
    id: row.id,
    chapterId: row.chapter_id,
    number: row.hadith_number,
    arabic: row.arabic,
    translation: row[dbField],
    slug: row.slug ?? null,
  }));
}

async function loadFromDb(dbField: string, search: string = "", chapterId: number | null = null): Promise<Hadith[]> {
  let allRows: any[] = [];
  let from = 0;
  const step = 1000;
  let hasMore = true;

  while (hasMore) {
    let query = (supabase as any)
      .from("hadiths")
      .select("id, chapter_id, hadith_number, arabic, slug, " + dbField)
      .eq("book_key", "bukhari")
      .not(dbField, "is", null)
      .order("chapter_id", { ascending: true })
      .order("hadith_number", { ascending: true })
      .range(from, from + step - 1);

    if (chapterId) query = query.eq("chapter_id", chapterId);
    if (search) query = query.ilike(dbField, `%${search}%`);

    const { data, error } = await query;
    if (error) throw error;
    
    if (data && data.length > 0) {
      allRows = [...allRows, ...data];
      from += step;
      // If we got fewer than 'step' rows, we've reached the end
      if (data.length < step) hasMore = false;
      // Safety cap for browser performance
      if (allRows.length >= 8000) hasMore = false;
    } else {
      hasMore = false;
    }
  }

  return allRows.map((row: any) => ({
    id: row.id,
    chapterId: row.chapter_id,
    number: row.hadith_number,
    arabic: row.arabic,
    translation: row[dbField],
    slug: row.slug ?? null,
  }));
}

// ── Pagination ───────────────────────────────────────────────
const PAGE_SIZE = 40;

// ── Skeleton Loader ──────────────────────────────────────────
const HadithSkeleton = () => (
  <div className="space-y-4 animate-pulse">
    {[1, 2, 3].map((i) => (
      <div key={i} className="relative bg-gradient-to-br from-[hsl(158,55%,25%)] to-[hsl(158,64%,20%)] rounded-2xl p-6 border border-white/10 shadow-lg overflow-hidden opacity-60">
        <div className="flex justify-between mb-4">
          <Skeleton className="h-6 w-24 bg-white/10 rounded-lg" />
          <Skeleton className="h-4 w-32 bg-white/5 rounded-md" />
        </div>
        <div className="space-y-3 mb-6">
          <Skeleton className="h-8 w-full bg-white/10 rounded-md" />
          <Skeleton className="h-8 w-3/4 ml-auto bg-white/10 rounded-md" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-4 w-full bg-white/5 rounded-md" />
          <Skeleton className="h-4 w-full bg-white/5 rounded-md" />
          <Skeleton className="h-4 w-2/3 bg-white/5 rounded-md" />
        </div>
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full animate-[shimmer_3s_infinite]" />
      </div>
    ))}
  </div>
);

// ── Component ───────────────────────────────────────────────
export default function BukhariLangPage() {
  const { lang, chapterSlug, chapterId: chapterParam, hadithNumber: hadithParam } = useParams<{
    lang: string;
    chapterSlug: string;
    chapterId: string;
    hadithNumber: string;
  }>();

  // 1. Language Normalization and Validation
  const normalizedLang = useMemo(() => {
    const raw = (lang || "").toLowerCase().trim();
    if (raw === "bn" || raw === "bengali" || raw === "bangla") return "bangla";
    if (raw === "en" || raw === "english") return "english";
    if (raw === "ur" || raw === "urdu") return "urdu";
    return null;
  }, [lang]);

  // Redirect if invalid language
  if (!normalizedLang) {
    return <Navigate to="/hadith/sahih-bukhari" replace />;
  }

  const effectiveChapterParam = chapterSlug || chapterParam;
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedHadith, setSelectedHadith] = useState<Hadith | null>(null);
  const [selectedChapter, setSelectedChapter] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<"chapters" | "hadiths">(
    effectiveChapterParam ? "hadiths" : "chapters"
  );
  const [page, setPage] = useState(1);

  const [allHadiths, setAllHadiths] = useState<Hadith[]>([]);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cfg = langMeta[normalizedLang];
  const t = uiStrings[normalizedLang];
  const isRtl = cfg.rtl;

  // ── Fetch Kitab names from DB ──────────────────────────────
  const { data: kitabData } = useQuery({
    queryKey: ["bukhari-kitabs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hadith_chapters")
        .select("chapter_number, title, title_bn, title_ar, hadith_count")
        .eq("book_id", "bukhari")
        .order("chapter_number");
      if (error) throw error;
      return data as KitabInfo[];
    },
    staleTime: Infinity,
  });

  const kitabMap = useMemo(() => {
    const m = new Map<number, KitabInfo>();
    if (kitabData) {
      for (const k of kitabData) {
        if (k.chapter_number === 97 && (!k.title_bn || k.title_bn.includes("হারানো"))) {
          m.set(97, { ...k, title: "Tawheed", title_bn: "তাওহীদ (আল্লাহর একত্ববাদ)", hadith_count: 188 });
        } else {
          m.set(k.chapter_number, k);
        }
      }
    }
    return m;
  }, [kitabData]);

  // ── Load data ──────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    
    setLoading(true);
    setError(null);

    // Development assertion for Urdu
    if (normalizedLang === "urdu" && cfg.file !== "/data/sahih_bukhari_ur.json") {
      console.error("CRITICAL: Urdu route has incorrect source file mapping!");
    }

    const processHadiths = (mapped: Hadith[]) => {
      if (cancelled) return;
      setAllHadiths(mapped);
      
      let chapArr: Chapter[] = [];
      if (kitabData && kitabData.length > 0) {
        chapArr = kitabData.map(k => ({ id: k.chapter_number, count: k.hadith_count }));
      } else {
        const chapMap = new Map<number, number>();
        for (const h of mapped) chapMap.set(h.chapterId, (chapMap.get(h.chapterId) || 0) + 1);
        chapArr = Array.from(chapMap.entries())
          .sort((a, b) => a[0] - b[0])
          .map(([id, count]) => ({ id, count }));
      }
      
      setChapters(prev => prev.length > 0 ? prev : chapArr);
      setLoading(false);
    };

    const timer = setTimeout(() => {
      if (cfg.source === "db") {
        const dbField = cfg.dbField!;
        if (selectedChapter) {
          loadChapterFromDb(dbField, selectedChapter)
            .then(processHadiths)
            .catch((err) => {
              if (cancelled) return;
              console.error("Chapter load failed:", err);
              setError(t.error);
              setLoading(false);
            });
        } else {
          loadFromDb(dbField, searchQuery, selectedChapter)
            .then(processHadiths)
            .catch((err) => {
              if (cancelled) return;
              console.error("DB load failed:", err);
              setError(t.error);
              setLoading(false);
            });
        }
      } else {
        // JSON source (English/Urdu)
        fetch(cfg.file!)
          .then((res) => {
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return res.json();
          })
          .then((json: Record<string, RawHadith[]>) => {
            const raw = flattenBooks(json);
            const field = cfg.field;
            const mapped: Hadith[] = raw
              .filter((h) => h.arabic && (h as any)[field])
              .map((h) => ({
                id: h.id,
                chapterId: h.chapter_id,
                number: h.hadith_number,
                arabic: h.arabic,
                translation: (h as any)[field],
                slug: h.slug ?? null,
              }));
            processHadiths(mapped);
          })
          .catch((err) => {
            if (cancelled) return;
            console.error("Fetch failed:", err);
            setError(t.error);
            setLoading(false);
          });
      }
    }, 400);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [normalizedLang, cfg, selectedChapter, searchQuery, kitabData, t.error]);

  // ── Sync from URL ──────────────────────────────────────────
  useEffect(() => {
    if (effectiveChapterParam) {
      const match = effectiveChapterParam.match(/chapter-(\d+)/);
      if (match) {
        setSelectedChapter(parseInt(match[1], 10));
        setActiveTab("hadiths");
      } else if (!isNaN(parseInt(effectiveChapterParam, 10))) {
        setSelectedChapter(parseInt(effectiveChapterParam, 10));
        setActiveTab("hadiths");
      }
    } else {
      setSelectedChapter(null);
      setActiveTab("chapters");
    }

    if (hadithParam) {
      const num = parseInt(hadithParam, 10);
      const h = allHadiths.find((x) => x.number === num);
      if (h) setSelectedHadith(h);
    } else {
      setSelectedHadith(null);
    }
  }, [effectiveChapterParam, hadithParam, allHadiths]);

  // ── Derived state ──────────────────────────────────────────
  const filteredHadiths = useMemo(() => {
    let list = allHadiths;
    if (selectedChapter) {
      list = list.filter((h) => h.chapterId === selectedChapter);
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (h) =>
          h.number.toString().includes(q) ||
          (h.translation || "").toLowerCase().includes(q) ||
          (h.arabic || "").includes(q)
      );
    }
    return list;
  }, [allHadiths, selectedChapter, searchQuery]);

  const pagedHadiths = useMemo(() => {
    return filteredHadiths.slice(0, page * PAGE_SIZE);
  }, [filteredHadiths, page]);

  const totalCount = filteredHadiths.length;

  // ── Handlers ───────────────────────────────────────────────
  const handleChapterClick = (id: number) => {
    setSelectedChapter(id);
    setActiveTab("hadiths");
    setPage(1);
    navigate(`/hadith/sahih-bukhari/${normalizedLang}/chapter-${id}`);
  };

  const handleBack = () => {
    if (selectedHadith) {
      setSelectedHadith(null);
      navigate(`/hadith/sahih-bukhari/${normalizedLang}/chapter-${selectedChapter}`);
    } else if (selectedChapter) {
      setSelectedChapter(null);
      setActiveTab("chapters");
      navigate(`/hadith/sahih-bukhari/${normalizedLang}`);
    } else {
      navigate("/hadith");
    }
  };

  const handleReadDetails = (h: Hadith) => {
    if (h.slug) {
      navigate(`/hadith/h/${h.slug}`);
    } else {
      navigate(`/hadith/sahih-bukhari/${normalizedLang}/${h.chapterId}/${h.number}`);
    }
  };

  // ── Render Helpers ──────────────────────────────────────────
  if (error) {
    return (
      <div className="min-h-screen bg-[#0a1a1a] text-white flex items-center justify-center p-4">
        <div className="text-center">
          <p className="text-red-400 mb-4">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-2 bg-[#10b981] rounded-full text-sm font-medium"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen bg-[hsl(158,64%,12%)] text-white pb-24"
      style={{ backgroundImage: ISLAMIC_PATTERN }}
    >
      <Helmet>
        <title>{buildSeoTitle(normalizedLang, selectedChapter || undefined, selectedHadith?.number)}</title>
        <meta name="description" content={buildSeoDesc(normalizedLang, selectedChapter || undefined, selectedHadith?.number)} />
        <link rel="canonical" href={buildCanonical(normalizedLang, selectedChapter || undefined, selectedHadith?.number)} />
        <script type="application/ld+json">
          {JSON.stringify(buildArticleJsonLd(normalizedLang, selectedHadith?.number))}
        </script>
      </Helmet>

      {/* Header */}
      <header
        className="sticky top-0 z-50 bg-gradient-to-b from-[hsl(158,55%,22%)] to-[hsl(158,55%,22%)]/95 backdrop-blur-lg border-b border-white/10 px-4 py-4 relative overflow-hidden"
        style={{ backgroundImage: ISLAMIC_PATTERN }}
      >
        <div className="max-w-4xl mx-auto flex items-center gap-4">
          <button
            onClick={handleBack}
            className="p-2 hover:bg-white/5 rounded-full transition-colors"
          >
            <ArrowLeft className="w-6 h-6" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold truncate">
              {selectedChapter ? getChapterName(selectedChapter, normalizedLang, kitabMap) : t.title}
            </h1>
            <p className="text-xs text-[#10b981] font-medium">{t.subtitle}</p>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6">
        {/* Search & Tabs */}
        {!selectedHadith && (
          <div className="space-y-6 mb-8">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" />
              <Input
                type="text"
                placeholder={t.searchPlaceholder}
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setPage(1);
                }}
                className="bg-white/10 border-white/10 pl-10 h-12 rounded-xl focus:ring-[hsl(45,93%,58%)] transition-all placeholder:text-white/50"
              />
            </div>

            <div className="flex p-1 bg-[hsl(158,55%,22%)]/80 rounded-xl border border-white/10">
              <button
                onClick={() => {
                  setActiveTab("chapters");
                  setSelectedChapter(null);
                  navigate(`/hadith/sahih-bukhari/${normalizedLang}`);
                }}
                className={`flex-1 py-2.5 text-sm font-medium rounded-lg transition-all ${
                  activeTab === "chapters" ? "bg-gradient-to-r from-[hsl(45,93%,58%)] to-[hsl(45,93%,48%)] text-[hsl(158,64%,15%)] shadow-lg" : "text-white/70 hover:text-white"
                }`}
              >
                {t.chapters}
              </button>
              <button
                onClick={() => setActiveTab("hadiths")}
                className={`flex-1 py-2.5 text-sm font-medium rounded-lg transition-all ${
                  activeTab === "hadiths" ? "bg-gradient-to-r from-[hsl(45,93%,58%)] to-[hsl(45,93%,48%)] text-[hsl(158,64%,15%)] shadow-lg" : "text-white/70 hover:text-white"
                }`}
              >
                {t.allHadiths} ({totalCount})
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="space-y-6">
            <div className="flex flex-col items-center justify-center py-10 gap-3">
              <div className="relative">
                <Loader2 className="w-10 h-10 text-[hsl(45,93%,58%)] animate-spin" />
                <Sparkles className="absolute -top-1 -right-1 w-4 h-4 text-[hsl(45,93%,58%)] animate-pulse" />
              </div>
              <p className="text-white/60 animate-pulse font-medium tracking-wide">Preparing Hadiths...</p>
            </div>
            <HadithSkeleton />
          </div>
        ) : (
          <AnimatePresence mode="wait">
            {selectedHadith ? (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-8"
              >
                <div className="relative bg-gradient-to-br from-[hsl(158,55%,25%)] to-[hsl(158,64%,20%)] rounded-3xl p-6 md:p-8 border border-white/10 shadow-xl overflow-hidden"
                  style={EMERALD_CARD_STYLE}>
                  <div className="flex items-center justify-between mb-8">
                    <span className="px-4 py-1.5 bg-[hsl(45,93%,58%)]/15 text-[hsl(45,93%,58%)] rounded-full text-sm font-bold border border-[hsl(45,93%,58%)]/30">
                      {t.hadithNo} {selectedHadith.number}
                    </span>
                    <span className="text-white/60 text-sm font-medium">
                      {t.chapter} {selectedHadith.chapterId}
                    </span>
                  </div>

                  <div className="space-y-10">
                    <div className="space-y-4">
                      <p
                        className="text-3xl md:text-4xl leading-[1.8] text-right font-arabic text-white"
                        dir="rtl"
                      >
                        {selectedHadith.arabic}
                      </p>
                    </div>

                    <div className="h-px bg-gradient-to-r from-transparent via-[hsl(45,93%,58%)]/30 to-transparent" />

                    <div className="space-y-4">
                      <p
                        className={`text-xl md:text-2xl leading-[1.8] text-white font-bangla-serif drop-shadow-sm antialiased ${
                          isRtl ? "text-right font-arabic" : ""
                        }`}
                        dir={isRtl ? "rtl" : "ltr"}
                      >
                        {selectedHadith.translation}
                      </p>
                    </div>
                  </div>
                </div>
              </motion.div>
            ) : activeTab === "chapters" ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="grid grid-cols-1 md:grid-cols-2 gap-3"
              >
                {chapters.map((chap) => (
                  <button
                    key={chap.id}
                    onClick={() => handleChapterClick(chap.id)}
                    className="relative flex items-center gap-4 p-4 bg-gradient-to-br from-[hsl(158,55%,25%)] to-[hsl(158,64%,20%)] hover:from-[hsl(158,55%,28%)] hover:to-[hsl(158,64%,23%)] rounded-2xl border border-white/10 shadow-lg transition-all group text-left overflow-hidden"
                    style={EMERALD_CARD_STYLE}
                  >
                    <div className="w-12 h-12 rounded-xl bg-[hsl(45,93%,58%)]/15 flex items-center justify-center text-[hsl(45,93%,58%)] font-bold border border-[hsl(45,93%,58%)]/25 group-hover:bg-[hsl(45,93%,58%)] group-hover:text-[hsl(158,64%,15%)] transition-colors">
                      {chap.id}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold truncate text-white group-hover:text-[hsl(45,93%,58%)] transition-colors">
                        {getChapterName(chap.id, normalizedLang, kitabMap)}
                      </h3>
                      <p className="text-xs text-white/65">
                        {chap.count} {t.hadiths}
                      </p>
                    </div>
                    <ChevronRight className="w-5 h-5 text-[hsl(45,93%,58%)]/60 group-hover:text-[hsl(45,93%,58%)] transition-colors" />
                  </button>
                ))}
              </motion.div>
            ) : (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="space-y-4"
              >
                {pagedHadiths.length > 0 ? (
                  <>
                    {pagedHadiths.map((h) => (
                      <div
                        key={h.id}
                        className="relative bg-gradient-to-br from-[hsl(158,55%,25%)] to-[hsl(158,64%,20%)] rounded-2xl p-5 border border-white/10 hover:border-[hsl(45,93%,58%)]/50 shadow-lg transition-all group overflow-hidden"
                        style={EMERALD_CARD_STYLE}
                      >
                        <div className="flex items-center justify-between mb-4">
                          <span className="text-xs font-bold text-[hsl(45,93%,58%)] px-2 py-1 bg-[hsl(45,93%,58%)]/15 rounded-lg border border-[hsl(45,93%,58%)]/20">
                            {t.hadithNo} {h.number}
                          </span>
                          <span className="text-[10px] text-[hsl(45,93%,58%)]/75 uppercase tracking-wider">
                            {getChapterName(h.chapterId, normalizedLang, kitabMap)}
                          </span>
                        </div>
                        <p
                          className="text-xl leading-[1.8] text-right mb-4 font-arabic line-clamp-2 text-white"
                          dir="rtl"
                        >
                          {h.arabic}
                        </p>
                        <p
                          className={`text-base md:text-lg leading-[1.85] line-clamp-3 text-white font-bangla mb-4 ${
                            isRtl ? "text-right font-arabic" : ""
                          }`}
                          dir={isRtl ? "rtl" : "ltr"}
                        >
                          {h.translation}
                        </p>
                        <button
                          onClick={() => handleReadDetails(h)}
                          className="w-full py-2.5 bg-[hsl(45,93%,58%)]/15 hover:bg-[hsl(45,93%,58%)] text-[hsl(45,93%,58%)] hover:text-[hsl(158,64%,15%)] rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 border border-[hsl(45,93%,58%)]/20"
                        >
                          {t.readDetails}
                        </button>
                      </div>
                    ))}
                    {totalCount > pagedHadiths.length && (
                      <button
                        onClick={() => setPage((p) => p + 1)}
                        className="w-full py-4 bg-[hsl(45,93%,58%)]/15 hover:bg-[hsl(45,93%,58%)] text-[hsl(45,93%,58%)] hover:text-[hsl(158,64%,15%)] rounded-2xl font-bold transition-all border border-[hsl(45,93%,58%)]/30"
                      >
                        {t.loadMore}
                      </button>
                    )}
                  </>
                ) : (
                  <div className="text-center py-20 bg-gradient-to-br from-[hsl(158,55%,25%)] to-[hsl(158,64%,20%)] rounded-3xl border border-dashed border-white/10" style={EMERALD_CARD_STYLE}>
                    <BookOpen className="w-12 h-12 text-white/10 mx-auto mb-4" />
                    <p className="text-white/40">{t.noResults}</p>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        )}
      </main>

      <BottomNavigation />
    </div>
  );
}
