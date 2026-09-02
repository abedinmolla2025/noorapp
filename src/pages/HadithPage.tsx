import { Link, useNavigate } from "react-router-dom";
import { BookOpen, ScrollText, ChevronRight, Sparkles, ArrowRight } from "lucide-react";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Helmet } from "react-helmet-async";
import BottomNavigation from "@/components/BottomNavigation";

const fallbackBooks = [
  { id: "bukhari", slug: "sahih-bukhari", title: "Sahih Bukhari", title_bn: "সহীহ বুখারী", total_chapters: 97, total_hadiths: 7563 },
  { id: "muslim", slug: "muslim", title: "Sahih Muslim", title_bn: "সহীহ মুসলিম", total_chapters: 56 },
  { id: "tirmidhi", slug: "tirmidhi", title: "Jami at-Tirmidhi", title_bn: "জামে তিরমিযী", total_chapters: 49, total_hadiths: 3956 },
  { id: "abu-dawud", slug: "abu-dawud", title: "Sunan Abu Dawud", title_bn: "সুনানে আবু দাউদ", total_chapters: 43, total_hadiths: 5274 },
];

export default function HadithPage() {
  const navigate = useNavigate();

  const { data: books } = useQuery({
    queryKey: ["hadith-books"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hadith_books" as any)
        .select("id, title, title_bn, total_chapters, total_hadiths, display_order")
        .eq("is_active", true)
        .order("display_order");
      if (error) throw error;
      return data as unknown as typeof fallbackBooks;
    },
  });

  const hadithBooks = books ?? fallbackBooks;

  // Counts vary by edition and must not be shown until each book has been verified.
  const getBookSummary = (book: typeof fallbackBooks[number]) => {
    const chapters = book.total_chapters ? `${book.total_chapters} chapters` : "Hadith collection";
    const count = book.id === "muslim" ? undefined : book.total_hadiths;
    return count ? `${chapters} · ${count.toLocaleString()} hadiths` : `${chapters} · Browse by chapter`;
  };

  // Featured hadiths — only fetch a small set with slug for SEO entry points
  const { data: featured } = useQuery({
    queryKey: ["hadith-featured-home"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hadiths")
        .select("id, slug, book_key, hadith_number, arabic, bengali")
        .not("slug", "is", null)
        .eq("book_key", "bukhari")
        .in("hadith_number", [1, 2, 8, 10, 25, 52])
        .limit(6);
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 1000 * 60 * 60,
  });

  const handleBookClick = (book: typeof fallbackBooks[0]) => {
    if (book.id === "bukhari") {
      navigate("/hadith/sahih-bukhari");
    } else {
      navigate(`/hadith/${book.id}`);
    }
  };

  return (
    <div
      className="min-h-screen pb-24"
      style={{ background: "linear-gradient(170deg, #0F766E 0%, #064E3B 40%, #022c22 100%)" }}
    >
      <Helmet>
        <title>Authentic Hadith Collections – Noor App</title>
        <meta name="description" content="Browse authentic Hadith collections including Sahih Bukhari, Sahih Muslim, Jami at-Tirmidhi & Sunan Abu Dawud with Arabic text and translations." />
        <link rel="canonical" href="https://noorapp.in/hadith" />
        <meta name="robots" content="index,follow" />
        <meta property="og:title" content="Authentic Hadith Collections – Noor App" />
        <meta property="og:description" content="Browse authentic Hadith collections including Sahih Bukhari, Sahih Muslim, Jami at-Tirmidhi & Sunan Abu Dawud with Arabic text and translations." />
        <meta property="og:url" content="https://noorapp.in/hadith" />
        <meta property="og:image" content="https://noorapp.in/og-bukhari.png" />
      </Helmet>

      {/* Hero section */}
      <div className="px-4 pt-14 pb-10 text-center relative">
        <div
          className="absolute left-1/2 top-10 -translate-x-1/2 w-40 h-40 rounded-full pointer-events-none"
          style={{ background: "radial-gradient(circle, rgba(16,185,129,0.18) 0%, transparent 70%)" }}
        />

        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
          className="relative mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full"
          style={{
            background: "linear-gradient(180deg, #10B981 0%, #059669 100%)",
            boxShadow: "inset 0 2px 4px rgba(255,255,255,0.2), inset 0 -2px 4px rgba(0,0,0,0.15), 0 4px 12px rgba(5,150,105,0.4)",
          }}
        >
          <BookOpen className="h-7 w-7 text-white" />
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="text-[26px] font-extrabold text-white tracking-tight"
          style={{ textShadow: "0 1px 3px rgba(0,0,0,0.2)" }}
        >
          Hadith Collection
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="mt-1 text-[15px]"
          style={{ fontFamily: "'Noto Sans Bengali', sans-serif", color: "rgba(255,255,255,0.85)" }}
        >
          হাদিস সংকলন
        </motion.p>

        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
          className="mt-3 text-[13px] leading-relaxed max-w-xs mx-auto"
          style={{ color: "rgba(255,255,255,0.55)" }}
        >
          Browse authentic collections from the most trusted scholars of Islam.
        </motion.p>
      </div>

      {/* Editorial context: explains what the collections contain and how to use them. */}
      <section className="mx-auto max-w-lg px-4 -mt-3 mb-8">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-left">
          <h2 className="text-sm font-bold text-emerald-200">হাদিস পড়ার পদ্ধতি ও উৎস</h2>
          <p className="mt-2 text-xs leading-relaxed text-white/75">
            হাদিস হলো নবী মুহাম্মদ ﷺ-এর কথা, কাজ ও অনুমোদনের বর্ণনা। নিচের সংকলনগুলো মূল গ্রন্থের নাম, অধ্যায় এবং হাদিস নম্বর ধরে সাজানো হয়েছে—তাই কোনো বর্ণনা উদ্ধৃত করার সময় গ্রন্থ ও নম্বর মিলিয়ে দেখা জরুরি। বাংলা অর্থ বোঝার সহায়ক; গুরুত্বপূর্ণ আমল বা আকীদার বিষয়ে যোগ্য আলেমের ব্যাখ্যাও গ্রহণ করুন।
          </p>
          <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
            <Link to="/data-sources" className="rounded-full bg-emerald-400/15 px-3 py-1.5 font-semibold text-emerald-200 hover:bg-emerald-400/25">উৎস ও সম্পাদনা পদ্ধতি</Link>
            <Link to="/prayer-guide" className="rounded-full bg-white/10 px-3 py-1.5 font-semibold text-white/80 hover:bg-white/15">নামাজের নির্দেশিকা</Link>
            <Link to="/dua" className="rounded-full bg-white/10 px-3 py-1.5 font-semibold text-white/80 hover:bg-white/15">দোয়া সংকলন</Link>
          </div>
        </div>
      </section>

      {/* Book cards */}
      <div className="mx-auto max-w-lg px-4 flex flex-col gap-[14px]">
        {hadithBooks.map((book, i) => (
          <motion.button
            key={book.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 + i * 0.08, duration: 0.4 }}
            whileHover={{ y: -4, transition: { duration: 0.2 } }}
            whileTap={{ scale: 0.98 }}
            onClick={() => handleBookClick(book)}
            className="flex items-center gap-4 bg-white p-4 text-left transition-shadow duration-200"
            style={{
              borderRadius: 20,
              boxShadow: "0 6px 24px rgba(0,0,0,0.12), 0 2px 6px rgba(0,0,0,0.06)",
            }}
          >
            <div
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
              style={{
                background: "linear-gradient(180deg, #10B981 0%, #059669 100%)",
                boxShadow: "inset 0 1px 2px rgba(255,255,255,0.2), inset 0 -1px 2px rgba(0,0,0,0.1)",
              }}
            >
              <ScrollText className="h-5 w-5 text-white" />
            </div>

            <div className="flex-1 min-w-0">
              <h2 className="text-[15px] font-bold text-gray-900 leading-snug">
                {book.title}
              </h2>
              <p
                className="text-[13px] text-gray-500 mt-0.5"
                style={{ fontFamily: "'Noto Sans Bengali', sans-serif" }}
              >
                {book.title_bn}
              </p>
              <p className="mt-0.5 text-[11px] text-gray-400">
                {getBookSummary(book)}
              </p>
            </div>

            <ChevronRight className="h-4 w-4 shrink-0 text-gray-300" />
          </motion.button>
        ))}
      </div>

      {/* Featured hadiths — SEO entry points */}
      {featured && featured.length > 0 && (
        <section className="mx-auto max-w-lg px-4 mt-10">
          <div className="flex items-center gap-2 mb-4 px-1">
            <Sparkles className="h-4 w-4 text-emerald-300" />
            <h2
              className="text-[15px] font-bold text-white"
              style={{ fontFamily: "'Noto Sans Bengali', sans-serif" }}
            >
              নির্বাচিত হাদিস
            </h2>
          </div>
          <div className="flex flex-col gap-3">
            {featured.map((h: any, i: number) => (
              <motion.div
                key={h.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 * i }}
                className="bg-white rounded-2xl p-4 shadow-md"
              >
                <p
                  dir="rtl"
                  className="text-[15px] text-gray-800 line-clamp-2 mb-1.5 text-right"
                  style={{ fontFamily: "'Amiri', 'Noto Naskh Arabic', serif" }}
                >
                  {h.arabic}
                </p>
                {h.bengali && (
                  <p
                    className="text-[12.5px] text-gray-600 line-clamp-2 mb-3 leading-relaxed"
                    style={{ fontFamily: "'Noto Sans Bengali', sans-serif" }}
                  >
                    {h.bengali}
                  </p>
                )}
                <Link
                  to={`/hadith/h/${h.slug}`}
                  className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-emerald-700 hover:text-emerald-800"
                >
                  Read full hadith <ArrowRight className="h-3 w-3" />
                </Link>
              </motion.div>
            ))}
          </div>
        </section>
      )}

      <section className="mx-auto mt-10 max-w-lg px-4 pb-24">
        <div className="rounded-2xl border border-white/10 bg-white/10 p-5 text-white/85">
          <h2 className="text-base font-bold text-white">হাদিস পড়ার একটি নির্ভরযোগ্য পদ্ধতি</h2>
          <p className="mt-3 text-sm leading-7">
            কোনো হাদিস উদ্ধৃত করার আগে গ্রন্থের নাম, অধ্যায় এবং হাদিস নম্বর মিলিয়ে নিন। একই বর্ণনার অনুবাদ বা numbering সংস্করণভেদে কিছুটা আলাদা হতে পারে, তাই আরবি মূল পাঠ ও দেওয়া reference পাশাপাশি দেখা গুরুত্বপূর্ণ।
          </p>
          <p className="mt-3 text-sm leading-7">
            হাদিসের অর্থ বোঝার সময় সম্পূর্ণ বর্ণনা ও আশপাশের অধ্যায়ের বিষয় পড়ুন। জটিল আকিদা, ফিকহ বা ব্যক্তিগত আমলের সিদ্ধান্তের ক্ষেত্রে যোগ্য আলেমের পরামর্শ নিন। Noor-এর <a href="/sources" className="font-semibold text-emerald-200 underline-offset-2 hover:underline">source notes</a>-এ কোনো ভুল বা অনুবাদ-সংক্রান্ত সংশোধন জানানো যায়।
          </p>
          <div className="mt-4 grid gap-2 text-xs text-white/60 sm:grid-cols-3">
            <span>গ্রন্থ ও অধ্যায় মিলান</span>
            <span>সম্পূর্ণ বর্ণনা পড়ুন</span>
            <span>প্রয়োজনে আলেমকে জিজ্ঞেস করুন</span>
          </div>
        </div>
      </section>

      <BottomNavigation />
    </div>
  );
}
