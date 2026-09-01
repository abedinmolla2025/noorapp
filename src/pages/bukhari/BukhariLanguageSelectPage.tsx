import { useNavigate } from "react-router-dom";
import { BookOpen, ChevronRight, Languages, BookText, ScrollText } from "lucide-react";
import { motion } from "framer-motion";
import BottomNavigation from "@/components/BottomNavigation";
import { Helmet } from "react-helmet-async";

const languages = [
  {
    code: "bangla",
    label: "বাংলা",
    labelEn: "Bangla",
    description: "আরবি + বাংলা অনুবাদ",
    descEn: "Arabic + Bengali Translation",
    Icon: BookText,
  },
  {
    code: "english",
    label: "English",
    labelEn: "English",
    description: "Arabic + English Translation",
    descEn: "Arabic + English Translation",
    Icon: Languages,
  },
  {
    code: "urdu",
    label: "اردو",
    labelEn: "Urdu",
    description: "عربی + اردو ترجمہ",
    descEn: "Arabic + Urdu Translation",
    Icon: ScrollText,
  },
];

export default function BukhariLanguageSelectPage() {
  const navigate = useNavigate();

  return (
    <div
      className="min-h-screen pb-24"
      style={{
        background:
          "linear-gradient(170deg, #0F766E 0%, #064E3B 40%, #022c22 100%)",
      }}
    >
      <Helmet>
        <title>Sahih al-Bukhari Hadith Collection – Noor App</title>
        <meta
          name="description"
          content="Read Sahih al-Bukhari in Bangla, English, or Urdu with Arabic text, chapter navigation and collection references."
        />
        <link rel="canonical" href="https://noorapp.in/hadith/sahih-bukhari" />
        <meta name="robots" content="index,follow" />
        <script type="application/ld+json">
          {JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Article",
            headline: "Sahih al-Bukhari Hadith Collection",
            author: { "@type": "Person", name: "Imam Bukhari" },
            publisher: { "@type": "Organization", name: "Noor App", url: "https://noorapp.in" },
          })}
        </script>
      </Helmet>

      {/* Hero */}
      <div className="px-4 pt-14 pb-6 text-center relative">
        <div
          className="absolute left-1/2 top-10 -translate-x-1/2 w-40 h-40 rounded-full pointer-events-none"
          style={{
            background:
              "radial-gradient(circle, rgba(16,185,129,0.18) 0%, transparent 70%)",
          }}
        />

        <motion.button
          onClick={() => navigate("/hadith")}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="absolute top-6 left-4 p-2 text-white/70 hover:text-white rounded-full hover:bg-white/10 transition-colors"
        >
          <ChevronRight className="w-5 h-5 rotate-180" />
        </motion.button>

        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
          className="relative mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full"
          style={{
            background: "linear-gradient(180deg, #10B981 0%, #059669 100%)",
            boxShadow:
              "inset 0 2px 4px rgba(255,255,255,0.2), inset 0 -2px 4px rgba(0,0,0,0.15), 0 4px 12px rgba(5,150,105,0.4)",
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
          Sahih al-Bukhari
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="mt-1 text-[15px]"
          style={{
            fontFamily: "'Noto Sans Bengali', sans-serif",
            color: "rgba(255,255,255,0.85)",
          }}
        >
          সহীহ আল-বুখারী
        </motion.p>

        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
          className="mt-3 text-[13px] leading-relaxed max-w-xs mx-auto"
          style={{ color: "rgba(255,255,255,0.55)" }}
        >
          Choose your preferred language to read with Arabic text
        </motion.p>
      </div>

      {/* Language Cards */}
      <div className="mx-auto max-w-lg px-4 flex flex-col gap-4 mt-4">
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="text-white/60 text-xs uppercase tracking-widest font-semibold text-center mb-1"
        >
          Select Language · ভাষা নির্বাচন করুন
        </motion.p>

        {languages.map((lang, i) => (
          <motion.button
            key={lang.code}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.45 + i * 0.1, duration: 0.4 }}
            whileHover={{ y: -4, transition: { duration: 0.2 } }}
            whileTap={{ scale: 0.97 }}
            onClick={() => navigate(`/hadith/sahih-bukhari/${lang.code}`)}
            className="flex items-center gap-4 p-5 text-left transition-shadow duration-200"
            style={{
              borderRadius: 20,
              background: "rgba(255,255,255,0.08)",
              backdropFilter: "blur(12px)",
              border: "1px solid rgba(255,255,255,0.12)",
              boxShadow: "0 8px 32px rgba(0,0,0,0.15)",
            }}
          >
            <div
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full"
              style={{
                background: "linear-gradient(180deg, #10B981 0%, #059669 100%)",
                boxShadow: "inset 0 1px 2px rgba(255,255,255,0.2), inset 0 -1px 2px rgba(0,0,0,0.1)",
              }}
            >
              <lang.Icon className="h-5 w-5 text-white" />
            </div>

            <div className="flex-1 min-w-0">
              <h2 className="text-[17px] font-bold text-white leading-snug">
                {lang.label}
              </h2>
              <p className="text-[12px] text-white/50 mt-0.5">
                {lang.descEn}
              </p>
            </div>

            <ChevronRight className="h-5 w-5 shrink-0 text-white/30" />
          </motion.button>
        ))}
      </div>

      {/* Stats */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.8 }}
        className="mx-auto max-w-lg px-4 mt-8 grid grid-cols-2 gap-3"
      >
        <div
          className="text-center py-4 rounded-2xl"
          style={{
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <p className="text-2xl font-bold text-emerald-300">97</p>
          <p className="text-[11px] text-white/50 mt-1">Chapters</p>
        </div>
        <div
          className="text-center py-4 rounded-2xl"
          style={{
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <p className="text-2xl font-bold text-emerald-300">Edition-based</p>
          <p className="text-[11px] text-white/50 mt-1">Numbering</p>
        </div>
      </motion.div>

      <BottomNavigation />
    </div>
  );
}
