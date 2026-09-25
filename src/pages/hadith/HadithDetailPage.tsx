import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  ChevronRight,
  ChevronLeft,
  Sparkles,
  ScrollText,
  Lightbulb,
  Languages,
  Loader2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AdSlot } from "@/components/ads/AdSlot";
import BottomNavigation from "@/components/BottomNavigation";

const ISLAMIC_PATTERN_1 = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='136' viewBox='0 0 160 136'%3E%3Cg fill='none' stroke='%23ffffff' stroke-opacity='0.05' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath stroke-width='3.4' d='M-10 29C10 7 39 4 59 17c16 11 18 32 5 44-13 11-34 7-38-8-3-13 9-24 22-19 16 6 21 27 12 43-11 22-35 31-60 22'/%3E%3Cpath stroke-width='2.7' d='M68-10C56 13 61 38 81 49c18 10 39 0 40-19 1-16-15-25-28-15-14 11-8 35 9 44 18 9 39 7 52-5'/%3E%3Cpath stroke-width='3.2' d='M82 61c18-20 49-22 68-5 16 14 13 40-7 50-17 9-36-1-37-18-1-15 16-25 29-16 16 11 17 36 3 54-15 20-44 27-69 14'/%3E%3Cpath stroke-width='2' d='M2 87c16-15 39-17 55-6M132 103c-8 8-10 19-4 29M45 112c9-10 24-12 36-5'/%3E%3C/g%3E%3Cg fill='%23ffffff' fill-opacity='0.04'%3E%3Ccircle cx='13' cy='52' r='2.4'/%3E%3Ccircle cx='20' cy='48' r='1.5'/%3E%3Ccircle cx='72' cy='103' r='2.2'/%3E%3Cpath d='M34 8c6 7 6 15 0 22-6-7-6-15 0-22ZM102 122c8-10 17-10 25 0-8-4-17-4-25 0Z'/%3E%3C/g%3E%3Cg fill='%23ffffff' font-family='serif' text-anchor='middle' opacity='0.05'%3E%3Ctext x='44' y='55' font-size='17' transform='rotate(-18 44 55)'%3Eالله%3C/text%3E%3Ctext x='118' y='34' font-size='14' transform='rotate(13 118 34)'%3Eرب%3C/text%3E%3Ctext x='42' y='105' font-size='13'%3Eنور%3C/text%3E%3C/g%3E%3C/svg%3E")`;
const ISLAMIC_PATTERN_2 = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='72' height='61' viewBox='0 0 72 61'%3E%3Cg fill='none' stroke='%23ffffff' stroke-width='1.45' stroke-opacity='0.03' stroke-linecap='round'%3E%3Cpath d='M-4 25c9-13 22-15 31-7 8 7 5 18-3 22-8 3-16-2-14-9 1-6 8-9 14-5 7 5 6 15-1 22-8 8-20 8-29 2M38-4c-6 11-3 21 5 26 9 4 18-2 18-10-1-7-8-10-13-6-5 5-2 14 5 18M39 42c9-10 22-10 30-2'/%3E%3C/g%3E%3C/svg%3E")`;
const ISLAMIC_PATTERN = `${ISLAMIC_PATTERN_1}, ${ISLAMIC_PATTERN_2}`;
const EMERALD_CARD_STYLE = {
  backgroundImage: `${ISLAMIC_PATTERN}, linear-gradient(to bottom right, hsl(158,55%,25%), hsl(158,64%,20%))`,
};

interface HadithRow {
  id: string;
  slug: string | null;
  book_key: string;
  chapter_id: number;
  hadith_number: number;
  arabic: string;
  bengali: string | null;
  english: string | null;
  urdu: string | null;
  topic_bn: string | null;
  explanation_bn: string | null;
  lessons_bn: string[] | null;
}

const SITE_ORIGIN = "https://noorapp.in";
const FALLBACK_OG = `${SITE_ORIGIN}/og-bukhari.png`;

const BOOK_LABEL_BN: Record<string, string> = {
  bukhari: "সহীহ বুখারী",
  muslim: "সহীহ মুসলিম",
  abudawud: "সুনান আবু দাউদ",
  tirmidhi: "জামি‘ আত-তিরমিযি",
  nasai: "সুনান নাসায়ী",
  ibnmajah: "সুনান ইবনে মাজাহ",
};

const truncate = (s: string, n: number) =>
  s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s;

const HadithDetailPage = () => {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [hadith, setHadith] = useState<HadithRow | null>(null);
  const [related, setRelated] = useState<HadithRow[]>([]);
  const [prevHadith, setPrevHadith] = useState<HadithRow | null>(null);
  const [nextHadith, setNextHadith] = useState<HadithRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setNotFound(false);
      const { data, error } = await supabase
        .from("hadiths")
        .select(
          "id, slug, book_key, chapter_id, hadith_number, arabic, bengali, english, urdu, topic_bn, explanation_bn, lessons_bn",
        )
        .eq("slug", slug)
        .maybeSingle();

      if (cancelled) return;
      if (error || !data) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      setHadith(data as unknown as HadithRow);

      // Related: same book, neighboring numbers
      const { data: rel } = await supabase
        .from("hadiths")
        .select(
          "id, slug, book_key, chapter_id, hadith_number, arabic, bengali, english, urdu, topic_bn, explanation_bn, lessons_bn",
        )
        .eq("book_key", (data as any).book_key)
        .neq("id", (data as any).id)
        .not("slug", "is", null)
        .order("hadith_number", { ascending: true })
        .gte("hadith_number", Math.max(0, (data as any).hadith_number - 3))
        .lte("hadith_number", (data as any).hadith_number + 3)
        .limit(6);
      if (!cancelled && rel) setRelated(rel as unknown as HadithRow[]);

      // Prev / Next navigation (same book)
      const [{ data: prev }, { data: next }] = await Promise.all([
        supabase
          .from("hadiths")
          .select("id, slug, book_key, chapter_id, hadith_number, arabic, bengali, english, urdu, topic_bn, explanation_bn, lessons_bn")
          .eq("book_key", (data as any).book_key)
          .lt("hadith_number", (data as any).hadith_number)
          .not("slug", "is", null)
          .order("hadith_number", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("hadiths")
          .select("id, slug, book_key, chapter_id, hadith_number, arabic, bengali, english, urdu, topic_bn, explanation_bn, lessons_bn")
          .eq("book_key", (data as any).book_key)
          .gt("hadith_number", (data as any).hadith_number)
          .not("slug", "is", null)
          .order("hadith_number", { ascending: true })
          .limit(1)
          .maybeSingle(),
      ]);
      if (!cancelled) {
        setPrevHadith((prev as unknown as HadithRow) ?? null);
        setNextHadith((next as unknown as HadithRow) ?? null);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const bookLabel = hadith ? BOOK_LABEL_BN[hadith.book_key] ?? hadith.book_key : "";

  const heading = useMemo(() => {
    if (!hadith) return "";
    const topic = hadith.topic_bn?.trim();
    return topic
      ? `${topic} — ${bookLabel} হাদিস ${hadith.hadith_number}`
      : `${bookLabel} হাদিস ${hadith.hadith_number}`;
  }, [hadith, bookLabel]);

  const seo = useMemo(() => {
    if (!hadith) return null;
    const title = truncate(`${heading} | অর্থ ও ব্যাখ্যা | Noor`, 60);
    const baseDesc =
      hadith.explanation_bn?.replace(/\s+/g, " ").trim() ||
      hadith.bengali?.replace(/\s+/g, " ").trim() ||
      `${bookLabel} হাদিস নং ${hadith.hadith_number} এর আরবি, বাংলা অনুবাদ ও বিস্তারিত ব্যাখ্যা।`;
    const description = truncate(baseDesc, 150);
    const url = `${SITE_ORIGIN}/hadith/h/${hadith.slug}`;
    return { title, description, url };
  }, [hadith, heading, bookLabel]);

  // Structured data (Article + BreadcrumbList) is served via the prerender
  // layer; the React JSON-LD copy was removed to avoid duplicates.

  if (loading) {
    return (
      <div className="min-h-screen bg-[hsl(158,64%,12%)] grid place-items-center" style={{ backgroundImage: ISLAMIC_PATTERN }}>
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-10 h-10 text-[hsl(45,93%,58%)] animate-spin" />
          <p className="text-white/60 animate-pulse font-medium tracking-wide">Loading Hadith Details...</p>
        </div>
      </div>
    );
  }

  if (notFound || !hadith) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-center">
        <Helmet>
          <meta name="robots" content="noindex" />
        </Helmet>
        <p className="text-white text-lg mb-4">এই হাদিসটি খুঁজে পাওয়া যায়নি।</p>
        <Link
          to="/hadith"
          className="px-4 py-2 rounded-full bg-primary text-primary-foreground font-medium"
        >
          সব হাদিস দেখুন
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[hsl(158,64%,12%)] text-white" style={{ backgroundImage: ISLAMIC_PATTERN }}>
      {seo && (
        <Helmet>
          <title>{seo.title}</title>
          <meta name="description" content={seo.description} />
          <link rel="canonical" href={seo.url} />
          <meta property="og:type" content="article" />
          <meta property="og:title" content={seo.title} />
          <meta property="og:description" content={seo.description} />
          <meta property="og:url" content={seo.url} />
          <meta property="og:image" content={FALLBACK_OG} />
          <meta property="og:locale" content="bn_BD" />
          <meta name="twitter:card" content="summary_large_image" />
          <meta name="twitter:title" content={seo.title} />
          <meta name="twitter:description" content={seo.description} />
          <meta name="twitter:image" content={FALLBACK_OG} />
          <link rel="alternate" hrefLang="bn" href={seo.url} />
          <link rel="alternate" hrefLang="en" href={seo.url} />
          <link rel="alternate" hrefLang="x-default" href={seo.url} />
        </Helmet>
      )}

      {/* Header */}
      <header
        className="sticky top-0 z-40 bg-gradient-to-b from-[hsl(158,55%,22%)] to-[hsl(158,55%,22%)]/95 backdrop-blur-lg border-b border-white/10 relative overflow-hidden"
        style={{ backgroundImage: ISLAMIC_PATTERN }}
      >
        <div className="max-w-3xl mx-auto flex items-center gap-3 px-4 py-3">
          <button
            onClick={() => navigate(-1)}
            className="p-2 -ml-2 hover:bg-white/10 rounded-full transition-colors text-white"
            aria-label="Back"
          >
            <ArrowLeft className="w-5 h-5 text-white" />
          </button>
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[hsl(45,93%,58%)] to-[hsl(45,93%,48%)] flex items-center justify-center">
            <BookOpen className="w-4 h-4 text-[hsl(158,64%,15%)]" />
          </div>
          <p className="text-sm font-medium text-white truncate">
            {bookLabel} • হাদিস {hadith.hadith_number}
          </p>
        </div>
      </header>

      <article className="max-w-3xl mx-auto px-4 py-6 space-y-8 pb-16">
        {/* Breadcrumb */}
        <nav
          aria-label="Breadcrumb"
          className="text-xs text-white/60 flex items-center gap-1 flex-wrap"
        >
          <Link to="/" className="hover:text-[hsl(45,93%,58%)]">হোম</Link>
          <ChevronRight className="w-3 h-3" />
          <Link to="/hadith" className="hover:text-[hsl(45,93%,58%)]">হাদিস</Link>
          <ChevronRight className="w-3 h-3" />
          <Link
            to={`/hadith/sahih-${hadith.book_key}/bn`}
            className="hover:text-[hsl(45,93%,58%)]"
          >
            {bookLabel}
          </Link>
          <ChevronRight className="w-3 h-3" />
          <span>হাদিস {hadith.hadith_number}</span>
        </nav>

        {/* H1 */}
        <header className="space-y-2">
          <p className="text-xs font-medium text-[hsl(45,93%,58%)] uppercase tracking-wide">
            {bookLabel} • অধ্যায় {hadith.chapter_id}
          </p>
          <h1 className="text-3xl md:text-4xl font-bold text-white leading-tight">
            {heading}
          </h1>
          {seo && (
            <p className="text-sm text-white/70 leading-relaxed">
              {seo.description}
            </p>
          )}
        </header>

        {/* Arabic */}
        <section
          className="relative bg-gradient-to-br from-[hsl(158,55%,25%)] to-[hsl(158,64%,20%)] rounded-2xl p-6 border border-white/10 shadow-xl overflow-hidden"
          style={EMERALD_CARD_STYLE}
          aria-labelledby="arabic-heading"
        >
          <div className="flex items-center justify-center gap-2 mb-4">
            <Sparkles className="w-4 h-4 text-[hsl(45,93%,58%)]" />
            <h2
              id="arabic-heading"
              className="text-xs font-medium text-[hsl(45,93%,58%)] uppercase tracking-wide"
            >
              আরবি
            </h2>
            <Sparkles className="w-4 h-4 text-[hsl(45,93%,58%)]" />
          </div>
          <p
            dir="rtl"
            lang="ar"
            className="text-3xl md:text-4xl font-arabic leading-[2.2] text-white text-center"
          >
            {hadith.arabic}
          </p>
        </section>

        {/* Translation tabs */}
        <section aria-labelledby="translation-heading">
          <div className="flex items-center gap-2 mb-3">
            <Languages className="w-4 h-4 text-[hsl(45,93%,58%)]" />
            <h2
              id="translation-heading"
              className="text-base font-semibold text-white"
            >
              অনুবাদ
            </h2>
          </div>
          <Tabs defaultValue="bn" className="w-full">
            <TabsList className="w-full justify-start bg-white/10">
              <TabsTrigger value="bn">বাংলা</TabsTrigger>
              <TabsTrigger value="en">English</TabsTrigger>
              <TabsTrigger value="ur">اردو</TabsTrigger>
            </TabsList>
            <TabsContent value="bn" className="mt-4">
              <div className="relative bg-white/5 rounded-2xl p-5 border border-white/10 overflow-hidden shadow-sm"
                  style={{ backgroundImage: ISLAMIC_PATTERN }}>
                {hadith.bengali ? (
                  <p
                    lang="bn"
                    className="text-[#FFFFFF] font-bangla-serif font-medium text-xl md:text-2xl leading-[1.8] tracking-wide drop-shadow-md antialiased whitespace-pre-line"
                  >
                    {hadith.bengali}
                  </p>
                ) : (
                  <p className="text-white/60 text-sm">
                    বাংলা অনুবাদ এখনো যোগ করা হয়নি।
                  </p>
                )}
              </div>
            </TabsContent>
            <TabsContent value="en" className="mt-4">
              <div className="relative bg-white/5 rounded-2xl p-5 border border-white/10 overflow-hidden shadow-sm"
                  style={{ backgroundImage: ISLAMIC_PATTERN }}>
                {hadith.english ? (
                  <p
                    lang="en"
                    className="text-white text-lg leading-relaxed whitespace-pre-line"
                  >
                    {hadith.english}
                  </p>
                ) : (
                  <p className="text-white/60 text-sm">
                    English translation not available yet.
                  </p>
                )}
              </div>
            </TabsContent>
            <TabsContent value="ur" className="mt-4">
              <div className="relative bg-white/5 rounded-2xl p-5 border border-white/10 overflow-hidden shadow-sm"
                  style={{ backgroundImage: ISLAMIC_PATTERN }}>
                {hadith.urdu ? (
                  <p
                    dir="rtl"
                    lang="ur"
                    className="text-white text-xl leading-[2] whitespace-pre-line text-right font-arabic"
                  >
                    {hadith.urdu}
                  </p>
                ) : (
                  <p className="text-white/60 text-sm" dir="rtl">
                    اردو ترجمہ ابھی دستیاب نہیں ہے۔
                  </p>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </section>

        <AdSlot placement="web_hadith_middle" />

        {/* Bengali Explanation (primary SEO content) */}
        {hadith.explanation_bn && (
          <section
            aria-labelledby="explanation-heading"
            className="relative bg-gradient-to-br from-amber-400/10 to-transparent rounded-2xl p-5 border border-amber-400/20 overflow-hidden shadow-sm"
            style={{ backgroundImage: `${ISLAMIC_PATTERN}, linear-gradient(to bottom right, rgba(251, 191, 36, 0.1), transparent)` }}
          >
            <h2
              id="explanation-heading"
              className="flex items-center gap-2 text-lg font-semibold text-white mb-3"
            >
              <ScrollText className="w-5 h-5 text-[hsl(45,93%,58%)]" /> বিস্তারিত ব্যাখ্যা
            </h2>
            <div
              lang="bn"
              className="text-white/85 leading-relaxed whitespace-pre-line text-lg font-bangla-serif"
            >
              {hadith.explanation_bn}
            </div>
          </section>
        )}

        {/* Bengali Lessons */}
        {hadith.lessons_bn && hadith.lessons_bn.length > 0 && (
          <section
            aria-labelledby="lessons-heading"
            className="relative bg-white/5 rounded-2xl p-5 border border-white/10 overflow-hidden shadow-sm"
            style={{ backgroundImage: ISLAMIC_PATTERN }}
          >
            <h2
              id="lessons-heading"
              className="flex items-center gap-2 text-lg font-semibold text-white mb-3"
            >
              <Lightbulb className="w-5 h-5 text-[hsl(45,93%,58%)]" /> এই হাদিস থেকে শিক্ষা
            </h2>
            <ul lang="bn" className="space-y-2 text-white/90">
              {hadith.lessons_bn.map((b, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-primary mt-1 font-bold">{i + 1}.</span>
                  <span className="leading-relaxed">{b}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Record-specific reading context: derived only from this hadith's indexed metadata. */}
        <section className="relative bg-white/5 rounded-2xl p-5 border border-white/10 overflow-hidden shadow-sm" style={{ backgroundImage: ISLAMIC_PATTERN }}>
          <h2 className="text-base font-semibold text-white mb-2">এই বর্ণনাটি কীভাবে পড়বেন</h2>
          <p className="text-white/80 leading-relaxed">
            এটি {bookLabel}-এর অধ্যায় {hadith.chapter_id}-এর হাদিস নং {hadith.hadith_number}।
            অনুবাদ ও ব্যাখ্যা বোঝার সময় আরবি মূলপাঠের সঙ্গে নিচের গ্রন্থ-রেফারেন্স মিলিয়ে পড়ুন;
            ব্যাখ্যার অংশটি এই নির্দিষ্ট রেকর্ডের বিষয়{hadith.topic_bn ? ` “${hadith.topic_bn}”` : ""}-কে কেন্দ্র করে সাজানো।
          </p>
        </section>

        {/* Reference */}
        <section className="relative bg-white/5 rounded-2xl p-5 border border-white/10 overflow-hidden shadow-sm" style={{ backgroundImage: ISLAMIC_PATTERN }}>
          <h2 className="text-xs font-medium text-primary uppercase tracking-wide mb-2">
            রেফারেন্স
          </h2>
          <p className="text-white/90">
            {bookLabel}, হাদিস নং {hadith.hadith_number}, অধ্যায় {hadith.chapter_id}
          </p>
        </section>

        {/* Prev / Next navigation */}
        {(prevHadith || nextHadith) && (
          <nav
            aria-label="Hadith navigation"
            className="grid grid-cols-2 gap-3"
          >
            {prevHadith ? (
              <Link
                to={`/hadith/h/${prevHadith.slug}`}
                className="flex items-center gap-2 p-4 rounded-2xl bg-white/5 border border-white/10 shadow-sm relative overflow-hidden hover:border-[hsl(45,93%,58%)]/40 transition-all shadow-lg"
              >
                <ChevronLeft className="w-4 h-4 text-white/60 shrink-0" />
                <div className="min-w-0">
                  <div className="text-[10px] uppercase tracking-wide text-white/60">
                    আগের হাদিস
                  </div>
                  <div className="text-sm font-medium text-white truncate">
                    {bookLabel} {prevHadith.hadith_number}
                  </div>
                </div>
              </Link>
            ) : (
              <div />
            )}
            {nextHadith ? (
              <Link
                to={`/hadith/h/${nextHadith.slug}`}
                className="flex items-center justify-end gap-2 p-4 rounded-2xl bg-white/5 border border-white/10 shadow-sm relative overflow-hidden hover:border-[hsl(45,93%,58%)]/40 transition-all shadow-lg text-right"
              >
                <div className="min-w-0">
                  <div className="text-[10px] uppercase tracking-wide text-white/60">
                    পরবর্তী হাদিস
                  </div>
                  <div className="text-sm font-medium text-white truncate">
                    {bookLabel} {nextHadith.hadith_number}
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-white/60 shrink-0" />
              </Link>
            ) : (
              <div />
            )}
          </nav>
        )}

        {/* Related */}
        {related.length > 0 && (
          <section aria-labelledby="related-heading">
            <h2
              id="related-heading"
              className="text-base font-semibold text-white mb-3"
            >
              সম্পর্কিত হাদিস
            </h2>
            <div className="grid sm:grid-cols-2 gap-2">
              {related.map((r) => (
                <Link
                  key={r.id}
                  to={`/hadith/h/${r.slug}`}
                  className="flex items-center justify-between p-4 rounded-2xl bg-white/5 border border-white/10 shadow-sm relative overflow-hidden hover:border-[hsl(45,93%,58%)]/40 transition-all shadow-lg"
                >
                  <span className="text-white font-medium text-sm">
                    {BOOK_LABEL_BN[r.book_key] ?? r.book_key} • হাদিস {r.hadith_number}
                  </span>
                  <ChevronRight className="w-4 h-4 text-white/60" />
                </Link>
              ))}
            </div>
          </section>
        )}

        <section className="relative bg-white/5 rounded-2xl p-5 border border-white/10 overflow-hidden shadow-sm" style={{ backgroundImage: ISLAMIC_PATTERN }}>
          <h2 className="text-base font-semibold text-white mb-3">আরও শেখার পথ</h2>
          <div className="grid sm:grid-cols-3 gap-2 text-sm">
            <Link to={`/hadith/sahih-${hadith.book_key}/bn`} className="rounded-xl bg-white/5 border border-white/10 shadow-sm relative overflow-hidden p-3 hover:border-primary/40">এই গ্রন্থের আরও হাদিস</Link>
            <Link to="/dua" className="rounded-xl bg-white/5 border border-white/10 shadow-sm relative overflow-hidden p-3 hover:border-primary/40">সম্পর্কিত দোয়া দেখুন</Link>
            <Link to="/stories" className="rounded-xl bg-white/5 border border-white/10 shadow-sm relative overflow-hidden p-3 hover:border-primary/40">ইসলামিক গল্প পড়ুন</Link>
          </div>
        </section>

        <div className="pt-4 text-center">
          <Link
            to={`/hadith/sahih-${hadith.book_key}/bn`}
            className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
          >
            ← {bookLabel} এর সব হাদিস
          </Link>
        </div>
      </article>
      <BottomNavigation />
    </div>
  );
};

export default HadithDetailPage;