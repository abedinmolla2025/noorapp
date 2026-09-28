import { useState, useEffect, Suspense } from "react";
import { RotateCcw, Volume2, VolumeX, ArrowLeft, Vibrate } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Helmet } from "react-helmet-async";
import TasbihBeads3D from "@/components/TasbihBeads3D";
import IslamicEducationalSection from "@/components/seo/IslamicEducationalSection";
import { tasbihContent } from "@/lib/pageContent/utilityPages";

// P0-5 (2026-09-29): the per-dhikr "virtue" merit claims were removed.
// TRK2-001: the 6 claims ("Plants a tree in Paradise", etc.) had zero source
// attribution anywhere in the repo's evidence; per the "cite or remove" action
// and the no-invented-citation rule they are removed, not cited. Arabic text,
// transliteration, meaning and target counts are unchanged. This list is also
// the source of public/data/dhikr-list.json (scripts/extract-tool-data.mjs).
const dhikrList = [
  { arabic: "سُبْحَانَ اللَّهِ", transliteration: "SubhanAllah", meaning: "Glory be to Allah", target: 33 },
  { arabic: "الْحَمْدُ لِلَّهِ", transliteration: "Alhamdulillah", meaning: "Praise be to Allah", target: 33 },
  { arabic: "اللَّهُ أَكْبَرُ", transliteration: "Allahu Akbar", meaning: "Allah is the Greatest", target: 34 },
  { arabic: "لَا إِلَٰهَ إِلَّا اللَّهُ", transliteration: "La ilaha illallah", meaning: "There is no god but Allah", target: 100 },
  { arabic: "أَسْتَغْفِرُ اللَّهَ", transliteration: "Astaghfirullah", meaning: "I seek forgiveness", target: 100 },
  { arabic: "سُبْحَانَ اللَّهِ وَبِحَمْدِهِ", transliteration: "SubhanAllahi wa bihamdihi", meaning: "Glory and praise to Allah", target: 100 },
];

const TasbihPage = () => {
  const navigate = useNavigate();
  const [count, setCount] = useState(0);
  const [selectedDhikr, setSelectedDhikr] = useState(0);
  const [totalCount, setTotalCount] = useState(() => {
    const saved = localStorage.getItem("tasbih_total_today");
    const savedDate = localStorage.getItem("tasbih_date");
    const today = new Date().toDateString();
    if (savedDate === today && saved) {
      return parseInt(saved, 10);
    }
    return 0;
  });
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [vibrationEnabled, setVibrationEnabled] = useState(true);
  const [isPressed, setIsPressed] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);

  const currentDhikr = dhikrList[selectedDhikr];
  const progress = Math.min((count / currentDhikr.target) * 100, 100);
  const isComplete = count >= currentDhikr.target;

  useEffect(() => {
    localStorage.setItem("tasbih_total_today", totalCount.toString());
    localStorage.setItem("tasbih_date", new Date().toDateString());
  }, [totalCount]);

  useEffect(() => {
    if (isComplete && !showCelebration) {
      setShowCelebration(true);
      setTimeout(() => setShowCelebration(false), 2000);
    }
  }, [isComplete]);

  const playClickSound = () => {
    if (soundEnabled && typeof window !== "undefined") {
      try {
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.frequency.value = 600;
        oscillator.type = "sine";
        gainNode.gain.setValueAtTime(0.08, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.08);
        
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.08);
      } catch (e) {
        // Audio not supported
      }
    }
  };

  const vibrate = () => {
    if (vibrationEnabled && typeof navigator !== "undefined" && navigator.vibrate) {
      navigator.vibrate(30);
    }
  };

  const handleCount = () => {
    setCount((prev) => prev + 1);
    setTotalCount((prev) => prev + 1);
    playClickSound();
    vibrate();
    setIsPressed(true);
    setTimeout(() => setIsPressed(false), 100);
  };

  const handleReset = () => {
    setCount(0);
  };

  const handleDhikrChange = (index: number) => {
    setSelectedDhikr(index);
    setCount(0);
  };

  const SITE_ORIGIN = "https://noorapp.in";
  const canonicalUrl = `${SITE_ORIGIN}/tasbih`;
  const pageTitle = "Digital Tasbih Counter — তসবিহ গণনা | NOOR";
  const pageDescription = "Use our digital Tasbih counter for your daily Dhikr — প্রতিদিনের জিকির ও তসবিহ গণনার জন্য ডিজিটাল তসবিহ ব্যবহার করুন। Simple, fast and works offline.";

  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-900 via-emerald-800 to-teal-900">
      <Helmet>
        <title>{pageTitle}</title>
        <meta name="description" content={pageDescription} />
        <link rel="canonical" href={canonicalUrl} />
        <meta property="og:title" content={pageTitle} />
        <meta property="og:description" content={pageDescription} />
        <meta property="og:url" content={canonicalUrl} />
        <meta property="og:image" content={`${SITE_ORIGIN}/og-tasbih.png`} />
      </Helmet>
      {/* Header */}
      <motion.header
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="sticky top-0 z-50 bg-emerald-900/80 backdrop-blur-lg"
      >
        <div className="flex items-center justify-between px-4 py-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate("/")}
              className="p-2 -ml-2 text-white/80 hover:text-white hover:bg-white/10 rounded-full transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-lg font-semibold text-white">Tasbih Counter</h1>
              <p className="text-xs text-emerald-200/70">Digital Prayer Beads</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setVibrationEnabled(!vibrationEnabled)}
              className={`p-2 rounded-full transition-colors ${
                vibrationEnabled ? "text-white bg-white/10" : "text-white/50"
              }`}
            >
              <Vibrate size={18} />
            </button>
            <button
              onClick={() => setSoundEnabled(!soundEnabled)}
              className={`p-2 rounded-full transition-colors ${
                soundEnabled ? "text-white bg-white/10" : "text-white/50"
              }`}
            >
              {soundEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
            </button>
          </div>
        </div>
      </motion.header>

      <div className="p-4 pb-8 flex flex-col items-center">
        {/* Dhikr Selection Cards */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full overflow-x-auto pb-4 -mx-4 px-4 scrollbar-hide"
        >
          <div className="flex gap-3 min-w-max">
            {dhikrList.map((dhikr, index) => (
              <motion.button
                key={index}
                onClick={() => handleDhikrChange(index)}
                whileTap={{ scale: 0.95 }}
                className={`px-4 py-3 rounded-2xl text-left transition-all min-w-[140px] ${
                  selectedDhikr === index
                    ? "bg-gradient-to-br from-amber-400 to-amber-500 text-amber-900 shadow-lg shadow-amber-500/30"
                    : "bg-white/10 text-white/80 hover:bg-white/15"
                }`}
              >
                <p className="text-lg font-arabic leading-relaxed">{dhikr.arabic}</p>
                <p className={`text-xs mt-1 ${selectedDhikr === index ? "text-amber-800" : "text-white/60"}`}>
                  {dhikr.transliteration}
                </p>
              </motion.button>
            ))}
          </div>
        </motion.div>

        {/* Current Dhikr Display Card */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1 }}
          className="w-full max-w-sm bg-white/10 backdrop-blur-sm rounded-3xl p-6 mt-4 text-center"
        >
          <p className="text-4xl font-arabic text-amber-300 leading-relaxed">{currentDhikr.arabic}</p>
          <p className="text-lg text-white mt-3 font-medium">{currentDhikr.transliteration}</p>
          <p className="text-sm text-emerald-200/70 mt-1">{currentDhikr.meaning}</p>
        </motion.div>

        {/* Main Counter Button with 3D Mala */}
        <div className="relative mt-8" style={{ width: '320px', height: '320px' }}>
          {/* 3D Tasbih Mala - Background */}
          <div className="absolute" style={{ 
            width: '480px', 
            height: '480px', 
            top: '-80px', 
            left: '-80px',
            pointerEvents: 'none'
          }}>
            <Suspense fallback={null}>
              <TasbihBeads3D count={count} totalBeads={currentDhikr.target > 50 ? 33 : currentDhikr.target} />
            </Suspense>
          </div>
          
          {/* Center Counter Button */}
          <div className="absolute inset-0 flex items-center justify-center">
            {/* Outer glow ring */}
            <div className={`absolute w-52 h-52 rounded-full transition-all duration-300 ${
              isComplete 
                ? "bg-gradient-to-br from-amber-400/30 to-amber-500/30 animate-pulse" 
                : "bg-gradient-to-br from-emerald-400/20 to-teal-400/20"
            }`} style={{ transform: "scale(1.15)" }} />
            
            {/* Progress ring */}
            <svg className="absolute w-52 h-52 -rotate-90" viewBox="0 0 208 208">
              <circle
                cx="104"
                cy="104"
                r="96"
                fill="none"
                stroke="rgba(255,255,255,0.1)"
                strokeWidth="8"
              />
              <motion.circle
                cx="104"
                cy="104"
                r="96"
                fill="none"
                stroke={isComplete ? "#fbbf24" : "#34d399"}
                strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={603}
                initial={{ strokeDashoffset: 603 }}
                animate={{ strokeDashoffset: 603 - (progress / 100) * 603 }}
                transition={{ type: "spring", stiffness: 50 }}
              />
            </svg>

            {/* Main button */}
            <motion.button
              onClick={handleCount}
              whileTap={{ scale: 0.92 }}
              animate={{ scale: isPressed ? 0.95 : 1 }}
              className={`relative w-52 h-52 rounded-full shadow-2xl transition-all flex flex-col items-center justify-center z-10 ${
                isComplete
                  ? "bg-gradient-to-br from-amber-400 via-amber-500 to-amber-600"
                  : "bg-gradient-to-br from-emerald-500 via-emerald-600 to-teal-600"
              }`}
            >
              <motion.span 
                key={count}
                initial={{ scale: 1.3, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="text-6xl font-bold text-white"
              >
                {count}
              </motion.span>
              <span className="text-white/70 text-sm mt-1">/ {currentDhikr.target}</span>
            </motion.button>

            {/* Celebration effect */}
            <AnimatePresence>
              {showCelebration && (
                <motion.div
                  initial={{ scale: 0.5, opacity: 0 }}
                  animate={{ scale: 1.5, opacity: 1 }}
                  exit={{ scale: 2, opacity: 0 }}
                  className="absolute inset-0 flex items-center justify-center pointer-events-none z-20"
                >
                  <span className="text-6xl">🎉</span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Progress info */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="mt-6 text-center"
        >
          <p className={`text-lg font-medium ${isComplete ? "text-amber-300" : "text-emerald-300"}`}>
            {isComplete ? "✓ Target Completed!" : `${currentDhikr.target - count} more to go`}
          </p>
        </motion.div>

        {/* Reset Button */}
        <motion.button
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          onClick={handleReset}
          className="mt-6 flex items-center gap-2 px-6 py-3 bg-white/10 hover:bg-white/15 text-white rounded-full transition-colors"
        >
          <RotateCcw size={18} />
          Reset Counter
        </motion.button>

        {/* Stats Cards */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="w-full max-w-sm grid grid-cols-2 gap-3 mt-8"
        >
          <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-4 text-center">
            <p className="text-3xl font-bold text-amber-300">{totalCount}</p>
            <p className="text-xs text-white/60 mt-1">Today's Total</p>
          </div>
          <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-4 text-center">
            <p className="text-3xl font-bold text-emerald-300">{Math.floor(totalCount / 33)}</p>
            <p className="text-xs text-white/60 mt-1">Rounds Complete</p>
          </div>
        </motion.div>

        {/* Quick Dhikr Info */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="w-full max-w-sm mt-6 bg-white/5 rounded-2xl p-4"
        >
          <p className="text-sm text-white/70 text-center">
            The Prophet ﷺ said: "Whoever says SubhanAllah 33 times, Alhamdulillah 33 times, and Allahu Akbar 34 times after prayer, his sins will be forgiven even if they are like the foam of the sea."
          </p>
          <p className="text-xs text-amber-300/70 text-center mt-2">— Sahih Muslim</p>
        </motion.div>
      </div>
      <div className="px-4 pb-10">
        <IslamicEducationalSection {...tasbihContent} />
      </div>
    </div>
  );
};

export default TasbihPage;
