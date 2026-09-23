import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { ArrowLeft, BookOpen, ChevronRight, Sparkles, Loader2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { AdSlot } from "@/components/ads/AdSlot";

interface DuaRow {
  id: string;
  slug: string | null;
  title: string | null;
  title_en: string | null;
  title_hi: string | null;
  title_ur: string | null;
  category: string | null;
  content_arabic: string | null;
  content: string | null;
  content_en: string | null;
  content_hi: string | null;
  content_ur: string | null;
  content_pronunciation: string | null;
  content_pronunciation_en: string | null;
  content_pronunciation_hi: string | null;
  content_pronunciation_ur: string | null;
}

const SITE_ORIGIN = "https://noorapp.in";

type DuaLang = "bengali" | "english" | "hindi" | "urdu";

const READ_MORE_TEXT: Record<DuaLang, string> = {
  bengali: "📖 বিস্তারিত পড়ুন",
  english: "📖 Read More",
  hindi: "📖 और पढ़ें",
  urdu: "📖 مزید پڑھیں",
};

const UI_LABELS = {
  home: { bengali: "হোম", english: "Home", hindi: "होम", urdu: "ہوم" },
  dua: { bengali: "দোয়া", english: "Dua", hindi: "दुआ", urdu: "دعا" },
  categoryHeading: {
    bengali: (n: string) => `${n} সম্পর্কিত দোয়া`,
    english: (n: string) => `Duas related to ${n}`,
    hindi: (n: string) => `${n} से संबंधित दुआएं`,
    urdu: (n: string) => `${n} سے متعلق دعائیں`,
  },
  categoryHeader: {
    bengali: (n: string) => `${n} দোয়া`,
    english: (n: string) => `${n} Duas`,
    hindi: (n: string) => `${n} दुआएं`,
    urdu: (n: string) => `${n} دعائیں`,
  },
  countLine: {
    bengali: (c: number) => `${c} টি দোয়া — আরবি, বাংলা অর্থ ও ফজিলতসহ`,
    english: (c: number) => `${c} duas — with Arabic, meaning & benefits`,
    hindi: (c: number) => `${c} दुआएं — अरबी, अर्थ और फ़ज़ीलत के साथ`,
    urdu: (c: number) => `${c} دعائیں — عربی، معنی اور فضائل کے ساتھ`,
  },
  loading: {
    bengali: "Preparing Duas...",
    english: "Preparing Duas...",
    hindi: "Preparing Duas...",
    urdu: "Preparing Duas...",
  },
  emptyCategory: {
    bengali: "এই বিভাগে কোনো দোয়া পাওয়া যায়নি।",
    english: "No duas found in this category.",
    hindi: "इस श्रेणी में कोई दुआ नहीं मिली।",
    urdu: "اس زمرے میں کوئی دعا نہیں ملی۔",
  },
} as const;

const LANG_SUFFIX: Record<DuaLang, "" | "_en" | "_hi" | "_ur"> = {
  bengali: "",
  english: "_en",
  hindi: "_hi",
  urdu: "_ur",
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
    meaning: (dua[contentKey] as string | null) || dua.content || "",
    pronunciation:
      (dua[pronKey] as string | null) || dua.content_pronunciation || "",
  };
};

const slugify = (s: string) =>
  s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\u0980-\u09FF]+/g, "-")
    .replace(/(^-+|-+$)/g, "");

const truncate = (s: string, n: number) =>
  s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s;

const DuaSkeleton = () => (
  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-pulse">
    {[1, 2, 3, 4].map((i) => (
      <div key={i} className="relative bg-gradient-to-br from-[hsl(158,55%,25%)] to-[hsl(158,64%,20%)] rounded-2xl p-6 border border-white/10 shadow-lg overflow-hidden opacity-60">
        <div className="flex items-center gap-3 mb-4">
          <Skeleton className="h-10 w-10 bg-white/10 rounded-xl" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-1/2 bg-white/10 rounded" />
            <Skeleton className="h-3 w-1/4 bg-white/5 rounded" />
          </div>
        </div>
        <div className="space-y-2">
          <Skeleton className="h-4 w-full bg-white/5 rounded" />
          <Skeleton className="h-4 w-5/6 bg-white/5 rounded" />
        </div>
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full animate-[shimmer_3s_infinite]" />
      </div>
    ))}
  </div>
);

const DuaCategoryPage = () => {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [duas, setDuas] = useState<DuaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [categoryName, setCategoryName] = useState<string>("");
  const [language, setLanguage] = useState<DuaLang>("bengali");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem("dua_language") as DuaLang | null;
    if (saved) setLanguage(saved);
    const onStorage = (e: StorageEvent) => {
      if (e.key === "dua_language" && e.newValue) {
        setLanguage(e.newValue as DuaLang);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError(false);
      const { data, error } = await supabase
        .from("admin_content")
        .select(
          "id, slug, title, title_en, title_hi, title_ur, category, content_arabic, content, content_en, content_hi, content_ur, content_pronunciation, content_pronunciation_en, content_pronunciation_hi, content_pronunciation_ur"
        )
        .eq("is_published", true)
        .eq("status", "published")
        .in("content_type", ["dua", "Dua"])
        .order("order_index", { ascending: true });

      if (cancelled) return;
      if (error) {
        setDuas([]);
        setCategoryName(slug);
        setLoadError(true);
        setLoading(false);
        return;
      }
      const all = (data ?? []) as unknown as DuaRow[];
      const filtered = all.filter(
        (d) => d.category && slugify(d.category) === slug
      );
      setCategoryName(filtered[0]?.category ?? slug);
      setDuas(filtered);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const seo = useMemo(() => {
    const name = categoryName || slug || "দোয়া";
    const title = truncate(`${name} সম্পর্কিত দোয়া — অর্থ ও ফজিলত | Noor`, 60);
    const description = truncate(
      `${name} সম্পর্কিত সকল দোয়ার আরবি, বাংলা উচ্চারণ, অর্থ ও ফজিলত পড়ুন। সহীহ হাদিস ভিত্তিক ${name} দোয়ার সম্পূর্ণ সংকলন।`,
      155
    );
    return {
      title,
      description,
      url: `${SITE_ORIGIN}/dua/category/${slug}`,
    };
  }, [categoryName, slug]);

  const jsonLd = useMemo(
    () => ({
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: seo.title,
      description: seo.description,
      url: seo.url,
      inLanguage: "bn",
      hasPart: duas
        .filter((d) => d.slug)
        .map((d) => ({
          "@type": "Article",
          headline: d.title,
          url: `${SITE_ORIGIN}/dua/${d.slug}`,
        })),
    }),
    [seo, duas]
  );

  return (
    <div className="min-h-screen bg-[hsl(158,64%,18%)]">
      <Helmet>
        <title>{seo.title}</title>
        <meta name="description" content={seo.description} />
        <link rel="canonical" href={seo.url} />
        <meta property="og:type" content="website" />
        <meta property="og:title" content={seo.title} />
        <meta property="og:description" content={seo.description} />
        <meta property="og:url" content={seo.url} />
        <meta property="og:image" content={`${SITE_ORIGIN}/og-dua.png`} />
        <meta property="og:image:secure_url" content={`${SITE_ORIGIN}/og-dua.png`} />
        <meta property="og:image:type" content="image/png" />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:image:alt" content={seo.title} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={seo.title} />
        <meta name="twitter:description" content={seo.description} />
        <meta name="twitter:image" content={`${SITE_ORIGIN}/og-dua.png`} />
        <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>
      </Helmet>

      <motion.header
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="sticky top-0 z-50 bg-gradient-to-b from-[hsl(158,55%,22%)] to-[hsl(158,55%,22%)]/95 backdrop-blur-lg border-b border-white/10"
      >
        <div className="flex items-center gap-3 px-4 py-4">
          <button
            onClick={() => navigate(-1)}
            className="p-2 -ml-2 hover:bg-white/10 rounded-full transition-colors"
            aria-label="Back"
          >
            <ArrowLeft className="w-5 h-5 text-white" />
          </button>
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[hsl(45,93%,58%)] to-[hsl(45,93%,48%)] flex items-center justify-center">
            <BookOpen className="w-4 h-4 text-[hsl(158,64%,15%)]" />
          </div>
          <h1 className="text-xl font-bold text-white truncate">
            {UI_LABELS.categoryHeader[language](categoryName)}
          </h1>
        </div>
      </motion.header>

      <article className="p-4 max-w-3xl mx-auto pb-12 space-y-5">
        {/* Breadcrumb */}
        <nav className="text-xs text-white/60 flex items-center gap-1 flex-wrap">
          <Link to="/" className="hover:text-[hsl(45,93%,58%)]">
            {UI_LABELS.home[language]}
          </Link>
          <ChevronRight className="w-3 h-3" />
          <Link to="/dua" className="hover:text-[hsl(45,93%,58%)]">
            {UI_LABELS.dua[language]}
          </Link>
          <ChevronRight className="w-3 h-3" />
          <span>{categoryName}</span>
        </nav>

        <header>
          <h1 className="text-3xl md:text-4xl font-bold text-white leading-tight">
            {UI_LABELS.categoryHeading[language](categoryName)}
          </h1>
          <p className="mt-2 text-sm text-white/70">
            {UI_LABELS.countLine[language](duas.length)}
          </p>
        </header>

        <section className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <h2 className="text-sm font-bold text-[hsl(45,93%,58%)]">
            এই দোয়াগুলো কীভাবে ব্যবহার করবেন
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-white/75">
            {categoryName} বিষয়ের দোয়াগুলো আরবি পাঠ, উচ্চারণ ও অর্থসহ পড়ুন। দোয়া মুখস্থ করার আগে অর্থ বোঝা, নির্ভরযোগ্য উৎস মিলিয়ে দেখা এবং যে আমলের জন্য দোয়াটি পড়া হয় তার প্রেক্ষাপট জানা উপকারী। Noor-এর অনুবাদ বোঝার সহায়ক; ফিকহি বা বিশেষ ধর্মীয় সিদ্ধান্তের জন্য যোগ্য আলেমের পরামর্শ নিন।
          </p>
          <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
            <Link to="/data-sources" className="rounded-full bg-[hsl(45,93%,58%)]/15 px-3 py-1.5 font-semibold text-[hsl(45,93%,65%)] hover:bg-[hsl(45,93%,58%)]/25">উৎস ও সম্পাদনা পদ্ধতি</Link>
            <Link to="/dua" className="rounded-full bg-white/10 px-3 py-1.5 font-semibold text-white/80 hover:bg-white/15">সব দোয়া</Link>
            <Link to="/hadith" className="rounded-full bg-white/10 px-3 py-1.5 font-semibold text-white/80 hover:bg-white/15">হাদিস সংকলন</Link>
          </div>
        </section>

        <AdSlot placement="web_dua_middle" />

        {loading ? (
          <div className="space-y-8">
            <div className="flex flex-col items-center justify-center py-10 gap-3">
              <div className="relative">
                <Loader2 className="w-10 h-10 text-[hsl(45,93%,58%)] animate-spin" />
                <Sparkles className="absolute -top-1 -right-1 w-4 h-4 text-[hsl(45,93%,58%)] animate-pulse" />
              </div>
              <p className="text-white/60 animate-pulse font-medium tracking-widest text-[10px] uppercase">Preparing Duas...</p>
            </div>
            <DuaSkeleton />
          </div>
        ) : loadError ? (
          <div className="text-white/70 text-sm py-8 text-center" role="alert">
            দোয়াগুলো লোড করা যায়নি। অনুগ্রহ করে আবার চেষ্টা করুন।
          </div>
        ) : duas.length === 0 ? (
          <p className="text-white/70 text-sm py-8 text-center">
            {UI_LABELS.emptyCategory[language]}
          </p>
        ) : (
          <div className="space-y-3">
            {duas.map((d, i) => {
              const text = getDuaText(d, language);
              return (
              <article
                key={d.id}
                className="p-4 rounded-2xl bg-gradient-to-br from-[hsl(158,55%,25%)] to-[hsl(158,64%,20%)] border border-white/10"
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-6 h-6 rounded-full bg-[hsl(45,93%,58%)]/20 flex items-center justify-center text-xs font-bold text-[hsl(45,93%,58%)]">
                    {i + 1}
                  </span>
                  <h2 className="font-semibold text-white">{text.title}</h2>
                </div>
                {d.content_arabic && (
                  <p
                    dir="rtl"
                    className="text-white/80 font-arabic text-lg leading-loose line-clamp-2 mb-2"
                  >
                    {d.content_arabic}
                  </p>
                )}
                {text.meaning && (
                  <p className="text-sm text-white/70 line-clamp-2 mb-3">
                    {text.meaning}
                  </p>
                )}
                {d.slug ? (
                  <Link
                    to={`/dua/${d.slug}`}
                    className="inline-flex items-center justify-center gap-1.5 w-full py-2 rounded-xl bg-[hsl(45,93%,58%)]/20 text-[hsl(45,93%,58%)] text-xs font-semibold hover:bg-[hsl(45,93%,58%)]/30 transition"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    {READ_MORE_TEXT[language] || READ_MORE_TEXT.bengali}
                  </Link>
                ) : null}
              </article>
              );
            })}
          </div>
        )}
      </article>
    </div>
  );
};

export default DuaCategoryPage;
