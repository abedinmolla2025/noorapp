import { useState, useMemo } from "react";
import { BookOpen, ChevronRight, Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";

interface HadithTranslation {
  bengali: string;
  english: string;
  arabic: string;
  urdu: string;
  turkish: string;
}

interface Hadith {
  translations: HadithTranslation;
  arabicOriginal: string;
  source: string;
  chapter: string;
}

// Collection of hadiths that will rotate daily
const hadithCollection: Hadith[] = [
  {
    translations: {
      bengali: "জ্ঞান অনুন্ধান করা প্রতিটি মুসলিমের জন্য বাধ্যতামূলক।",
      english: "Seeking knowledge is an obligation upon every Muslim.",
      arabic: "طلب العلم فريضة على كل مسلم",
      urdu: "علم حاصل کرنا ہر مسلمان پر فرض ہے۔",
      turkish: "İlim öğrenmek her Müslümana farzdır.",
    },
    arabicOriginal: "طلب العلم فريضة على كل مسلم",
    source: "Ibn Majah",
    chapter: "Knowledge",
  },
  {
    translations: {
      bengali: "কর্মের ফলাফল নিয়তের উপর নির্ভরশীল।",
      english: "Actions are judged by intentions.",
      arabic: "إنما الأعمال بالنيات",
      urdu: "اعمال کا دارومدار نیتوں پر ہے۔",
      turkish: "Ameller niyetlere göredir.",
    },
    arabicOriginal: "إنما الأعمال بالنيات",
    source: "Sahih Bukhari",
    chapter: "Revelation",
  },
  {
    translations: {
      bengali: "যে ব্যক্তি আল্লাহ ও শেষ দিবসে বিশ্বাস করে, সে যেন ভালো কথা বলে অথবা চুপ থাকে।",
      english: "Whoever believes in Allah and the Last Day should speak good or remain silent.",
      arabic: "من كان يؤمن بالله واليوم الآخر فليقل خيراً أو ليصمت",
      urdu: "جو اللہ اور آخرت پر ایمان رکھتا ہے وہ اچھی بات کہے یا خاموش رہے۔",
      turkish: "Allah'a ve ahiret gününe iman eden ya hayır söylesin ya da sussun.",
    },
    arabicOriginal: "من كان يؤمن بالله واليوم الآخر فليقل خيراً أو ليصمت",
    source: "Sahih Bukhari",
    chapter: "Belief",
  },
  {
    translations: {
      bengali: "তোমাদের মধ্যে সর্বোত্তম সেই ব্যক্তি যে কুরআন শেখে এবং অন্যদের শেখায়।",
      english: "The best of you is the one who learns the Quran and teaches it.",
      arabic: "خيركم من تعلم القرآن وعلمه",
      urdu: "تم میں سے بہترین وہ ہے جو قرآن سیکھے اور سکھائے۔",
      turkish: "En hayırlınız Kuran'ı öğrenen ve öğretendir.",
    },
    arabicOriginal: "خيركم من تعلم القرآن وعلمه",
    source: "Sahih Bukhari",
    chapter: "Knowledge",
  },
  {
    translations: {
      bengali: "মুমিনদের মধ্যে সবচেয়ে পূর্ণ ঈমানের অধিকারী সে যার চরিত্র সবচেয়ে সুন্দর।",
      english: "The most complete believer in faith is the one with the best character.",
      arabic: "أكمل المؤمنين إيماناً أحسنهم خلقاً",
      urdu: "ایمان میں سب سے کامل وہ ہے جس کا اخلاق سب سے اچھا ہو۔",
      turkish: "İmanda en olgun olan, ahlakı en güzel olandır.",
    },
    arabicOriginal: "أكمل المؤمنين إيماناً أحسنهم خلقاً",
    source: "Abu Dawud",
    chapter: "Character",
  },
  {
    translations: {
      bengali: "মুসলিম সেই ব্যক্তি যার জিহ্বা ও হাত থেকে অন্য মুসলিমরা নিরাপদ থাকে।",
      english: "A Muslim is the one from whose tongue and hands other Muslims are safe.",
      arabic: "المسلم من سلم المسلمون من لسانه ويده",
      urdu: "مسلمان وہ ہے جس کی زبان اور ہاتھ سے دوسرے مسلمان محفوظ رہیں۔",
      turkish: "Müslüman, dilinden ve elinden diğer Müslümanların selamette olduğu kimsedir.",
    },
    arabicOriginal: "المسلم من سلم المسلمون من لسانه ويده",
    source: "Sahih Bukhari",
    chapter: "Belief",
  },
  {
    translations: {
      bengali: "লজ্জাশীলতা ঈমানের অংশ।",
      english: "Modesty is part of faith.",
      arabic: "الحياء من الإيمان",
      urdu: "حیا ایمان کا حصہ ہے۔",
      turkish: "Hayâ imandan bir şubedir.",
    },
    arabicOriginal: "الحياء من الإيمان",
    source: "Sahih Bukhari",
    chapter: "Belief",
  },
];

// Function to get hadith based on current date
const getDailyHadith = (): Hadith => {
  const today = new Date();
  const startOfYear = new Date(today.getFullYear(), 0, 0);
  const diff = today.getTime() - startOfYear.getTime();
  const dayOfYear = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hadithIndex = dayOfYear % hadithCollection.length;
  return hadithCollection[hadithIndex];
};

type Language = "bengali" | "english" | "arabic" | "urdu" | "turkish";

const languages: { key: Language; label: string }[] = [
  { key: "bengali", label: "বাংলা" },
  { key: "english", label: "English" },
  { key: "arabic", label: "العربية" },
  { key: "urdu", label: "اردو" },
  { key: "turkish", label: "Türkçe" },
];

const DailyHadith = () => {
  const navigate = useNavigate();
  const [selectedLang, setSelectedLang] = useState<Language>("bengali");
  
  // Get today's hadith - memoized so it doesn't change during the session
  const dailyHadith = useMemo(() => getDailyHadith(), []);

  return (
    <motion.div 
      className="relative overflow-hidden rounded-[1.5rem] md:rounded-[2rem] shadow-2xl"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
    >
      {/* Premium Gradient Background */}
      <div className="absolute inset-0 bg-gradient-to-br from-emerald-800 via-teal-800 to-cyan-900" />
      
      {/* Animated Orbs for depth */}
      <motion.div 
        animate={{ 
          scale: [1, 1.15, 1],
          opacity: [0.2, 0.35, 0.2]
        }}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
        className="absolute -top-16 -right-16 w-56 h-56 bg-gradient-to-br from-amber-400 to-orange-500 rounded-full blur-[60px]"
      />
      <motion.div 
        animate={{ 
          scale: [1, 1.2, 1],
          opacity: [0.15, 0.25, 0.15]
        }}
        transition={{ duration: 10, repeat: Infinity, ease: "easeInOut", delay: 1 }}
        className="absolute -bottom-16 -left-16 w-48 h-48 bg-gradient-to-tr from-teal-400 to-cyan-500 rounded-full blur-[50px]"
      />
      
      {/* Mesh Pattern Texture */}
      <div className="absolute inset-0 opacity-[0.04]" style={{
        backgroundImage: `radial-gradient(circle at 1px 1px, white 1px, transparent 0)`,
        backgroundSize: '20px 20px'
      }} />
      
      {/* Islamic Geometric Pattern Overlay */}
      <div className="absolute inset-0 opacity-[0.02]" style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
      }} />
      
      {/* Inner Border Accent */}
      <div className="absolute inset-0 rounded-[1.5rem] md:rounded-[2rem] border border-white/10" />
      <div className="absolute inset-[1px] rounded-[1.5rem] md:rounded-[2rem] border border-amber-400/5" />

      {/* Content Container */}
      <div className="relative z-10 p-5 md:p-7 lg:p-8">
        
        {/* Header */}
        <div className="flex items-center justify-between mb-5 md:mb-6">
          <div className="flex items-center gap-3 md:gap-4">
            <motion.div 
              animate={{ 
                boxShadow: ['0 0 15px rgba(251,191,36,0.15)', '0 0 25px rgba(251,191,36,0.3)', '0 0 15px rgba(251,191,36,0.15)']
              }}
              transition={{ duration: 3, repeat: Infinity }}
              className="w-12 h-12 md:w-14 md:h-14 bg-gradient-to-br from-amber-400/20 to-amber-500/10 border border-amber-400/30 rounded-xl md:rounded-2xl flex items-center justify-center backdrop-blur-sm"
            >
              <BookOpen size={24} className="text-amber-400 md:w-7 md:h-7" />
            </motion.div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg md:text-xl font-bold text-white">হাদীস টুডে</h3>
                <motion.div
                  animate={{ rotate: [0, 15, -15, 0] }}
                  transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                >
                  <Sparkles size={16} className="text-amber-400" />
                </motion.div>
              </div>
              <p className="text-sm text-white/50">Daily Wisdom from the Prophet ﷺ</p>
            </div>
          </div>
          
          {/* Decorative Badge */}
          <div className="hidden sm:flex items-center gap-2 bg-amber-400/10 border border-amber-400/20 rounded-full px-3 py-1.5">
            <div className="w-2 h-2 bg-amber-400 rounded-full animate-pulse" />
            <span className="text-xs text-amber-300 font-medium">Today</span>
          </div>
        </div>

        {/* Hadith Text Card */}
        <motion.div 
          className="relative bg-white/[0.07] border border-white/10 rounded-xl md:rounded-2xl p-4 md:p-6 mb-5 md:mb-6 backdrop-blur-md overflow-hidden"
          whileHover={{ backgroundColor: "rgba(255,255,255,0.09)" }}
          transition={{ duration: 0.3 }}
        >
          {/* Quote Decoration */}
          <div className="absolute top-2 left-3 text-amber-400/10 text-6xl md:text-7xl font-serif leading-none select-none">"</div>
          
          <div className="relative z-10">
            <p className={`text-white text-base md:text-lg font-medium leading-relaxed md:leading-loose ${
              selectedLang === "arabic" || selectedLang === "urdu" 
                ? "text-right font-arabic" 
                : ""
            }`}>
              {dailyHadith.translations[selectedLang]}
            </p>

            {/* Arabic Original - Shown when not Arabic selected */}
            {selectedLang !== "arabic" && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="mt-4 pt-4 border-t border-white/10"
              >
                <p className="text-right text-amber-300/80 text-sm md:text-base leading-relaxed font-arabic" dir="rtl">
                  {dailyHadith.arabicOriginal}
                </p>
              </motion.div>
            )}
          </div>
          
          {/* Bottom Quote */}
          <div className="absolute bottom-2 right-3 text-amber-400/10 text-6xl md:text-7xl font-serif leading-none rotate-180 select-none">"</div>
        </motion.div>

        {/* Language Selector - Scrollable on mobile */}
        <div className="mb-5 md:mb-6">
          <div className="flex flex-wrap gap-2 md:gap-2.5">
            {languages.map((lang, index) => (
              <motion.button
                key={lang.key}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setSelectedLang(lang.key)}
                className={`px-3.5 md:px-4 py-2 md:py-2.5 rounded-xl text-sm font-semibold transition-all duration-300 ${
                  selectedLang === lang.key
                    ? "bg-gradient-to-r from-amber-400 to-amber-500 text-emerald-900 shadow-lg shadow-amber-400/25"
                    : "bg-white/10 text-white hover:bg-white/15 border border-white/10 hover:border-white/20"
                }`}
              >
                {lang.label}
              </motion.button>
            ))}
          </div>
        </div>

        {/* Footer - Source & Action */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-4 md:pt-5 border-t border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-amber-400/10 border border-amber-400/20 rounded-lg flex items-center justify-center">
              <BookOpen size={18} className="text-amber-400" />
            </div>
            <div>
              <p className="font-bold text-amber-400 text-base md:text-lg">{dailyHadith.source}</p>
              <p className="text-white/50 text-sm">Chapter: {dailyHadith.chapter}</p>
            </div>
          </div>
          
          <motion.button 
            whileHover={{ scale: 1.02, x: 3 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => navigate("/hadith/sahih-bukhari")}
            className="flex items-center justify-center gap-2 px-5 py-2.5 md:py-3 bg-gradient-to-r from-amber-400/15 to-amber-500/10 border border-amber-400/30 hover:border-amber-400/50 text-white font-semibold rounded-xl transition-all group"
          >
            <span>আরও পড়ুন</span>
            <ChevronRight size={18} className="text-amber-400 group-hover:translate-x-1 transition-transform" />
          </motion.button>
        </div>
      </div>
    </motion.div>
  );
};

export default DailyHadith;