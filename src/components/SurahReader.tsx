import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Play, Loader2 } from "lucide-react";
import { useSurahDetail, Language, LANGUAGE_LABELS, TRANSLATION_ATTRIBUTION } from "@/hooks/useQuranData";
import QuranAudioPlayer from "./QuranAudioPlayer";

interface SurahReaderProps {
  surahNumber: number;
  surahName: string;
  arabicName: string;
  initialAyah?: number;
}

const SurahReader = ({ surahNumber, surahName, arabicName, initialAyah }: SurahReaderProps) => {
  const [language, setLanguage] = useState<Language>("bengali");
  // currentAyah is 0-indexed internal index
  const [currentAyah, setCurrentAyah] = useState<number | null>(
    initialAyah ? initialAyah - 1 : null
  );
  const { arabicData, translationData, loading, error } = useSurahDetail(surahNumber, language);
  const ayahRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Sync with initialAyah if it changes
  useEffect(() => {
    if (initialAyah) {
      setCurrentAyah(initialAyah - 1);
    }
  }, [initialAyah]);

  // Auto scroll to current ayah
  useEffect(() => {
    if (currentAyah !== null && ayahRefs.current[currentAyah]) {
      const isInitial = initialAyah === currentAyah + 1;
      ayahRefs.current[currentAyah]?.scrollIntoView({
        behavior: isInitial ? "auto" : "smooth",
        block: "center",
      });
    }
  }, [currentAyah, initialAyah]);

  const handlePlayAyah = (ayahIndex: number) => {
    setCurrentAyah(ayahIndex);
  };

  const handleNextAyah = () => {
    if (arabicData && currentAyah !== null && currentAyah < arabicData.ayahs.length - 1) {
      setCurrentAyah(currentAyah + 1);
    }
  };

  const handlePreviousAyah = () => {
    if (currentAyah !== null && currentAyah > 0) {
      setCurrentAyah(currentAyah - 1);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-[hsl(45,93%,58%)]" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-10">
        <p className="text-red-400">{error}</p>
      </div>
    );
  }

  return (
    <div className="pb-40 bg-[hsl(158,64%,18%)]">
      {/* Decorative Bismillah Header */}
      {surahNumber !== 1 && surahNumber !== 9 && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative py-8 bg-gradient-to-b from-[hsl(45,93%,58%)]/10 to-transparent"
        >
          <div className="absolute inset-0 overflow-hidden">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-64 bg-[hsl(45,93%,58%)]/5 rounded-full blur-3xl" />
          </div>
          <div className="relative text-center">
            <motion.p
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              className="text-3xl font-arabic text-[hsl(45,93%,58%)] leading-loose"
            >
              بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ
            </motion.p>
            {language === "bengali" && (
              <p className="text-sm text-white/70 mt-2">
                পরম করুণাময় অসীম দয়ালু আল্লাহর নামে
              </p>
            )}
          </div>
        </motion.div>
      )}

      {/* Language Selector with Gold Active */}
      <div className="sticky top-[52px] z-40 bg-[hsl(158,55%,22%)]/95 backdrop-blur-lg py-3 px-4 border-b border-white/10 shadow-sm">
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {(Object.keys(LANGUAGE_LABELS) as Language[]).map((lang) => (
            <button
              key={lang}
              onClick={() => setLanguage(lang)}
              className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all ${
                language === lang
                  ? "bg-[hsl(45,93%,58%)] text-[hsl(158,64%,15%)] shadow-md"
                  : "bg-white/10 text-white/70 hover:bg-white/20"
              }`}
            >
              {LANGUAGE_LABELS[lang]}
            </button>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-white/50">
          {TRANSLATION_ATTRIBUTION[language].note}: {TRANSLATION_ATTRIBUTION[language].translator} · via AlQuran Cloud API
        </p>
      </div>

      {/* Ayahs */}
      <div className="divide-y divide-white/10">
        {arabicData?.ayahs.map((ayah, index) => (
          <motion.div
            key={ayah.number}
            ref={(el) => (ayahRefs.current[index] = el)}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: Math.min(index * 0.02, 0.5) }}
            className={`p-4 transition-all duration-300 ${
              currentAyah === index 
                ? "bg-gradient-to-r from-[hsl(45,93%,58%)]/10 via-[hsl(45,93%,58%)]/5 to-transparent border-l-4 border-[hsl(45,93%,58%)]" 
                : "hover:bg-white/5"
            }`}
          >
            {/* Ayah Header */}
            <div className="flex items-center justify-between mb-4">
              {/* Ayah Number with Gold decorative frame */}
              <div className="flex items-center gap-3">
                <div className="relative w-10 h-10">
                  <div className="absolute inset-0 rotate-45 rounded-lg bg-gradient-to-br from-[hsl(45,93%,58%)]/40 to-[hsl(45,93%,58%)]/20 border border-[hsl(45,93%,58%)]/30" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-sm font-bold text-[hsl(45,93%,58%)]">{ayah.numberInSurah}</span>
                  </div>
                </div>
              </div>
              
              {/* Play Button with Gold */}
              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => handlePlayAyah(index)}
                className={`p-2.5 rounded-full transition-all shadow-sm ${
                  currentAyah === index
                    ? "bg-[hsl(45,93%,58%)] text-[hsl(158,64%,15%)] shadow-[0_0_20px_hsl(45,93%,58%,0.3)]"
                    : "bg-white/10 hover:bg-[hsl(45,93%,58%)]/30 text-white hover:text-[hsl(45,93%,58%)]"
                }`}
              >
                <Play className="w-4 h-4" />
              </motion.button>
            </div>

            {/* Arabic Text */}
            <p className="text-2xl md:text-3xl font-arabic text-white leading-[2.5] text-right mb-4 selection:bg-[hsl(45,93%,58%)]/20">
              {ayah.text}
              <span className="inline-block mx-2 text-[hsl(45,93%,58%)]">۝</span>
            </p>

            {/* Translation */}
            {translationData?.ayahs[index] && language !== "arabic" && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-white/90 leading-relaxed text-lg md:text-xl border-l-2 border-[hsl(45,93%,58%)]/40 pl-4"
              >
                {translationData.ayahs[index].text}
              </motion.p>
            )}
          </motion.div>
        ))}
      </div>

      {/* Audio Player */}
      {currentAyah !== null && arabicData?.ayahs[currentAyah]?.audio && (
        <QuranAudioPlayer
          audioUrl={arabicData.ayahs[currentAyah].audio!}
          ayahNumber={arabicData.ayahs[currentAyah].numberInSurah}
          onNext={handleNextAyah}
          onPrevious={handlePreviousAyah}
          hasNext={currentAyah < arabicData.ayahs.length - 1}
          hasPrevious={currentAyah > 0}
        />
      )}
    </div>
  );
};

export default SurahReader;
