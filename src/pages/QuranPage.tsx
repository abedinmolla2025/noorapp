import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, BookOpen, Search, Loader2, Star, BookMarked, Clock, Sparkles } from "lucide-react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { motion, AnimatePresence } from "framer-motion";
import { useQuranData, Surah } from "@/hooks/useQuranData";
import SurahReader from "@/components/SurahReader";

const QuranPage = () => {
  const navigate = useNavigate();
  const { surahId, ayahId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const { surahs, loading, error, retry } = useQuranData();
  const [selectedSurah, setSelectedSurah] = useState<Surah | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"surah" | "juz" | "bookmark">("surah");

  // Support both /quran/:surahId and /quran?surah=N
  const surahParam = surahId || searchParams.get("surah");
  const surahNumberParam = surahParam ? Number(surahParam) : null;

  const surahByNumber = useMemo(() => {
    const m = new Map<number, Surah>();
    for (const s of surahs) m.set(s.number, s);
    return m;
  }, [surahs]);

  // Sync reader from URL so browser back is step-by-step
  useEffect(() => {
    if (!surahNumberParam) {
      setSelectedSurah(null);
      return;
    }
    setSelectedSurah(surahByNumber.get(surahNumberParam) ?? null);
  }, [surahNumberParam, surahByNumber]);

  const filteredSurahs = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return surahs.filter(
      (surah) =>
        surah.englishName.toLowerCase().includes(q) ||
        surah.name.includes(searchQuery) ||
        surah.number.toString().includes(searchQuery)
    );
  }, [surahs, searchQuery]);

  // Featured surahs for quick access
  const featuredSurahs = useMemo(
    () => surahs.filter((s) => [1, 36, 67, 55, 56, 18].includes(s.number)),
    [surahs]
  );

  const openSurah = (s: Surah) => {
    navigate(`/quran/${s.number}`);
  };

  const goBack = () => navigate(-1);

  if (loading) {
    return (
      <div className="min-h-screen bg-[hsl(158,64%,18%)] flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center"
        >
          <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-white/10 flex items-center justify-center border-2 border-[hsl(45,93%,58%)]">
            <BookOpen className="w-10 h-10 text-[hsl(45,93%,58%)] animate-pulse" />
          </div>
          <Loader2 className="w-6 h-6 animate-spin text-[hsl(45,93%,58%)] mx-auto" />
          <p className="text-white/70 mt-3 text-sm">কুরআন লোড হচ্ছে...</p>
        </motion.div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[hsl(158,64%,18%)] flex items-center justify-center px-4">
        <div className="text-center">
          <p className="text-red-400 mb-4">{error}</p>
          <button
            onClick={() => retry()}
            className="px-6 py-2 bg-[hsl(45,93%,58%)] text-[hsl(158,64%,15%)] rounded-xl font-bold hover:opacity-90 transition-opacity"
          >
            আবার চেষ্টা করুন (Retry)
          </button>
        </div>
      </div>
    );
  }

  const SITE_ORIGIN = "https://noorapp.in";
  const canonicalUrl = `${SITE_ORIGIN}/quran`;
  const pageTitle = "Quran Reader — পবিত্র কুরআন | NOOR";
  const pageDescription = "Read the Holy Quran with Arabic text, Bengali translation & audio recitation — সূরা তিলাওয়াত, তাফসীর ও অডিও সহ সম্পূর্ণ কুরআন পাঠ করুন।";

  return (
    <div className="min-h-screen bg-[hsl(158,64%,18%)] text-white">
      {!selectedSurah && (
        <Helmet>
          <title>{pageTitle}</title>
          <meta name="description" content={pageDescription} />
          <link rel="canonical" href={canonicalUrl} />
          <meta property="og:title" content={pageTitle} />
          <meta property="og:description" content={pageDescription} />
          <meta property="og:url" content={canonicalUrl} />
          <meta property="og:image" content={`${SITE_ORIGIN}/og-quran.png`} />
        </Helmet>
      )}
      <AnimatePresence mode="wait">
        {selectedSurah ? (
          <motion.div
            key="reader"
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -50 }}
          >
            {/* Reader Header */}
            <motion.header className="sticky top-0 z-50 bg-[hsl(158,55%,22%)] border-b border-white/10 shadow-lg">
              <div className="flex items-center gap-3 px-4 py-3">
                <button
                  onClick={goBack}
                  className="p-2 -ml-2 hover:bg-white/10 rounded-full transition-colors text-white"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <div className="flex-1">
                  <h1 className="text-lg font-bold text-white">{selectedSurah.englishName}</h1>
                  <p className="text-xs text-white/60">{selectedSurah.englishNameTranslation}</p>
                </div>
                <span className="text-2xl font-arabic text-[hsl(45,93%,58%)]">{selectedSurah.name}</span>
              </div>
            </motion.header>
            
            <SurahReader
              surahNumber={selectedSurah.number}
              surahName={selectedSurah.englishName}
              arabicName={selectedSurah.name}
              initialAyah={ayahId ? Number(ayahId) : undefined}
            />
          </motion.div>
        ) : (
          <motion.div
            key="list"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            {/* Premium Header with Gold Accents */}
            <div className="bg-[hsl(158,55%,22%)] border-b border-white/10">
              {/* Top Bar */}
              <div className="flex items-center justify-between px-4 py-3">
                <button
                  onClick={goBack}
                  className="p-2 -ml-2 hover:bg-white/10 rounded-full transition-colors text-white"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="flex items-center gap-2"
                >
                  <div className="w-8 h-8 rounded-full bg-[hsl(45,93%,58%)]/20 border border-[hsl(45,93%,58%)] flex items-center justify-center">
                    <Sparkles className="w-4 h-4 text-[hsl(45,93%,58%)]" />
                  </div>
                </motion.div>
              </div>

              {/* Hero Section with Gold */}
              <div className="px-4 pb-6 text-center">
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                >
                  <h1 className="text-4xl font-arabic text-[hsl(45,93%,58%)] mb-2">الْقُرْآن الْكَرِيم</h1>
                  <p className="text-white/70 text-sm">পবিত্র কুরআন মাজীদ</p>
                </motion.div>

                {/* Stats with Gold Numbers */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className="flex justify-center gap-6 mt-5"
                >
                  <div className="text-center">
                    <p className="text-3xl font-bold text-[hsl(45,93%,58%)]">114</p>
                    <p className="text-xs text-white/60">সূরা</p>
                  </div>
                  <div className="w-px bg-white/20" />
                  <div className="text-center">
                    <p className="text-3xl font-bold text-[hsl(45,93%,58%)]">30</p>
                    <p className="text-xs text-white/60">পারা</p>
                  </div>
                  <div className="w-px bg-white/20" />
                  <div className="text-center">
                    <p className="text-3xl font-bold text-[hsl(45,93%,58%)]">6236</p>
                    <p className="text-xs text-white/60">আয়াত</p>
                  </div>
                </motion.div>
              </div>

              {/* Search Bar with Gold Ring */}
              <div className="px-4 pb-4">
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                  className="relative"
                >
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/50" />
                  <input
                    type="text"
                    placeholder="সূরা খুঁজুন..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-11 pr-4 py-3 rounded-xl bg-white/10 border border-white/20 text-white placeholder:text-white/50 text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(45,93%,58%)] focus:border-[hsl(45,93%,58%)] transition-all"
                  />
                </motion.div>
              </div>

              {/* Tabs with Gold Active State */}
              <div className="flex px-4 gap-1">
                {[
                  { id: "surah", label: "সূরা", icon: BookOpen },
                  { id: "juz", label: "পারা", icon: BookMarked },
                  { id: "bookmark", label: "সংরক্ষিত", icon: Star },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as typeof activeTab)}
                    className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-t-xl text-sm font-medium transition-all ${
                      activeTab === tab.id
                        ? "bg-[hsl(45,93%,58%)] text-[hsl(158,64%,15%)] shadow-md"
                        : "text-white/60 hover:bg-white/10"
                    }`}
                  >
                    <tab.icon className="w-4 h-4" />
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Content */}
            <div className="px-3 py-4">
              {/* Quick Access with Gold Borders */}
              {activeTab === "surah" && !searchQuery && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mb-4"
                >
                  <div className="flex items-center gap-2 mb-3">
                    <Star className="w-4 h-4 text-[hsl(45,93%,58%)] fill-[hsl(45,93%,58%)]" />
                    <h3 className="font-semibold text-sm text-white">জনপ্রিয় সূরা</h3>
                  </div>
                  <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                    {featuredSurahs.map((surah) => (
                      <motion.button
                        key={surah.number}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => openSurah(surah)}
                        className="shrink-0 px-4 py-3 rounded-xl bg-white/5 border-2 border-[hsl(45,93%,58%)]/30 hover:border-[hsl(45,93%,58%)] hover:shadow-[0_0_20px_hsl(45,93%,58%,0.2)] transition-all"
                      >
                        <p className="font-arabic text-[hsl(45,93%,58%)] text-xl">{surah.name}</p>
                        <p className="text-xs text-white/60 mt-1">{surah.englishName}</p>
                      </motion.button>
                    ))}
                  </div>
                </motion.div>
              )}

              {/* Surah List with Gold Accents */}
              {activeTab === "surah" && (
                <div className="space-y-2">
                  {filteredSurahs.map((surah, index) => (
                    <motion.button
                      key={surah.number}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: Math.min(index * 0.01, 0.5) }}
                      whileHover={{ scale: 1.01 }}
                      whileTap={{ scale: 0.99 }}
                      onClick={() => openSurah(surah)}
                      className="w-full text-left p-3 rounded-xl bg-white/5 border border-white/10 hover:border-[hsl(45,93%,58%)]/50 hover:shadow-md transition-all group"
                    >
                      <div className="flex items-center gap-3">
                        {/* Surah Number with Gold decorative frame */}
                        <div className="relative w-12 h-12 shrink-0">
                          <div className="absolute inset-0 rotate-45 rounded-lg bg-gradient-to-br from-[hsl(45,93%,58%)]/30 to-[hsl(45,93%,58%)]/10 group-hover:from-[hsl(45,93%,58%)]/50 group-hover:to-[hsl(45,93%,58%)]/20 transition-colors border border-[hsl(45,93%,58%)]/30" />
                          <div className="absolute inset-0 flex items-center justify-center">
                            <span className="font-bold text-[hsl(45,93%,58%)] text-lg">{surah.number}</span>
                          </div>
                        </div>

                        {/* Surah Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <div>
                              <p className="font-semibold text-white">{surah.englishName}</p>
                              <p className="text-xs text-white/60">{surah.englishNameTranslation}</p>
                            </div>
                            <div className="text-right">
                              <span className="text-xl font-arabic text-[hsl(45,93%,58%)]">{surah.name}</span>
                              <p className="text-xs text-white/60">
                                {surah.numberOfAyahs} আয়াত
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Revelation Type Badge with Gold for Meccan */}
                      <div className="mt-2 flex gap-2">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                          surah.revelationType === "Meccan" 
                            ? "bg-[hsl(45,93%,58%)]/20 text-[hsl(45,93%,58%)] border border-[hsl(45,93%,58%)]/30" 
                            : "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                        }`}>
                          {surah.revelationType === "Meccan" ? "মক্কী" : "মাদানী"}
                        </span>
                      </div>
                    </motion.button>
                  ))}
                </div>
              )}

              {/* Juz Tab with Gold Numbers */}
              {activeTab === "juz" && (
                <div className="grid grid-cols-3 gap-2">
                  {Array.from({ length: 30 }, (_, i) => i + 1).map((juz) => (
                    <motion.button
                      key={juz}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: juz * 0.02 }}
                      className="p-4 rounded-xl bg-white/5 border border-white/10 hover:border-[hsl(45,93%,58%)]/50 hover:shadow-md transition-all text-center group"
                    >
                      <div className="w-10 h-10 mx-auto rounded-full bg-gradient-to-br from-[hsl(45,93%,58%)]/30 to-[hsl(45,93%,58%)]/10 border border-[hsl(45,93%,58%)]/40 flex items-center justify-center mb-2 group-hover:from-[hsl(45,93%,58%)]/50 group-hover:to-[hsl(45,93%,58%)]/20 transition-colors">
                        <span className="font-bold text-[hsl(45,93%,58%)]">{juz}</span>
                      </div>
                      <p className="text-xs text-white/60">পারা {juz}</p>
                    </motion.button>
                  ))}
                </div>
              )}

              {/* Bookmark Tab */}
              {activeTab === "bookmark" && (
                <div className="text-center py-12">
                  <div className="w-16 h-16 mx-auto rounded-full bg-[hsl(45,93%,58%)]/10 border-2 border-[hsl(45,93%,58%)]/30 flex items-center justify-center mb-4">
                    <Star className="w-8 h-8 text-[hsl(45,93%,58%)]" />
                  </div>
                  <p className="text-white font-medium">কোন সংরক্ষিত সূরা নেই</p>
                  <p className="text-xs text-white/60 mt-1">আপনার পছন্দের সূরা সংরক্ষণ করুন</p>
                </div>
              )}

              {filteredSurahs.length === 0 && activeTab === "surah" && (
                <div className="text-center py-10">
                  <p className="text-white/60">কোন সূরা পাওয়া যায়নি</p>
                </div>
              )}

              <section className="mt-8 rounded-2xl border border-white/10 bg-white/5 p-5 text-white/80">
                <h2 className="text-base font-bold text-white">কুরআন পড়া ও বোঝার সহজ পদ্ধতি</h2>
                <p className="mt-3 text-sm leading-7">
                  একটি সূরা বেছে নিয়ে প্রথমে আরবি তিলাওয়াত শুনুন, তারপর আয়াতের বাংলা অনুবাদ ধীরে পড়ুন। অনুবাদ মূল আরবি পাঠের বিকল্প নয়; বরং অর্থ বোঝার সহায়ক। গুরুত্বপূর্ণ শব্দ বা আয়াত bookmark করে পরে আবার পড়লে ধারাবাহিক শেখা সহজ হয়।
                </p>
                <p className="mt-3 text-sm leading-7">
                  সূরার মক্কী বা মাদানী পরিচয় এবং আয়াতের সংখ্যা এখানে navigation-এর সহায়ক তথ্য। কোনো আয়াতের তাফসির বা বিধান বুঝতে নির্ভরযোগ্য তাফসির এবং যোগ্য আলেমের ব্যাখ্যা অনুসরণ করুন।
                </p>
                <div className="mt-4 grid gap-2 text-xs text-white/60 sm:grid-cols-3">
                  <span>আরবি পাঠ শুনুন</span>
                  <span>বাংলা অর্থ পড়ুন</span>
                  <span>প্রেক্ষাপট বুঝে আমল করুন</span>
                </div>
              </section>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default QuranPage;
