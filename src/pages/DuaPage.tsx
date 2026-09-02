import { useState, useEffect, useMemo } from "react";
import { Search, BookOpen, ChevronRight, ArrowLeft, Sparkles, Heart, Volume2, Loader2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { motion, AnimatePresence } from "framer-motion";
import DuaAudioPlayer from "@/components/DuaAudioPlayer";
import { supabase } from "@/integrations/supabase/client";
import { AdSlot } from "@/components/ads/AdSlot";

type Language = "bengali" | "english" | "hindi" | "urdu";

const LANGUAGE_LABELS: Record<Language, string> = {
  bengali: "বাংলা",
  english: "English",
  hindi: "हिंदी",
  urdu: "اردو",
};

const SECTION_LABELS = {
  arabic: {
    bengali: "আরবি",
    english: "Arabic",
    hindi: "अरबी",
    urdu: "عربی",
  },
  transliteration: {
    bengali: "বাংলা উচ্চারণ",
    english: "Transliteration",
    hindi: "उच्चारण",
    urdu: "تلفظ",
  },
  translation: {
    bengali: "অনুবাদ",
    english: "Translation",
    hindi: "अनुवाद",
    urdu: "ترجمہ",
  },
} as const;

const CATEGORY_TRANSLATIONS: Record<string, Record<Language, string>> = {
  "Balanced Life": { bengali: "ভারসাম্যপূর্ণ জীবন", english: "Balanced Life", hindi: "संतुलित जीवन", urdu: "متوازن زندگی" },
  Character: { bengali: "চরিত্র", english: "Character", hindi: "चरित्र", urdu: "کردار" },
  Daily: { bengali: "দৈনন্দিন", english: "Daily", hindi: "दैनिक", urdu: "روزانہ" },
  Death: { bengali: "মৃত্যু", english: "Death", hindi: "मृत्यु", urdu: "موت" },
  Evening: { bengali: "সন্ধ্যা", english: "Evening", hindi: "शाम", urdu: "شام" },
  Faith: { bengali: "ঈমান", english: "Faith", hindi: "ईमान", urdu: "ایمان" },
  Family: { bengali: "পরিবার", english: "Family", hindi: "परिवार", urdu: "خاندان" },
  Fasting: { bengali: "রোজা", english: "Fasting", hindi: "रोज़ा", urdu: "روزہ" },
  Food: { bengali: "খাবার", english: "Food", hindi: "भोजन", urdu: "کھانا" },
  Forgiveness: { bengali: "ক্ষমা", english: "Forgiveness", hindi: "क्षमा", urdu: "معافی" },
  Gratitude: { bengali: "কৃতজ্ঞতা", english: "Gratitude", hindi: "कृतज्ञता", urdu: "شکر گزاری" },
  Guidance: { bengali: "হেদায়াত", english: "Guidance", hindi: "मार्गदर्शन", urdu: "ہدایت" },
  Hajj: { bengali: "হজ", english: "Hajj", hindi: "हज", urdu: "حج" },
  Healing: { bengali: "আরোগ্য", english: "Healing", hindi: "उपचार", urdu: "شفا" },
  Health: { bengali: "স্বাস্থ্য", english: "Health", hindi: "स्वास्थ्य", urdu: "صحت" },
  Hereafter: { bengali: "পরকাল", english: "Hereafter", hindi: "परलोक", urdu: "آخرت" },
  Hope: { bengali: "আশা", english: "Hope", hindi: "आशा", urdu: "امید" },
  Journey: { bengali: "সফর", english: "Journey", hindi: "यात्रा", urdu: "سفر" },
  Justice: { bengali: "ইনসাফ", english: "Justice", hindi: "न्याय", urdu: "انصاف" },
  Knowledge: { bengali: "জ্ঞান", english: "Knowledge", hindi: "ज्ञान", urdu: "علم" },
  Legacy: { bengali: "উত্তরাধিকার", english: "Legacy", hindi: "विरासत", urdu: "میراث" },
  Masjid: { bengali: "মসজিদ", english: "Masjid", hindi: "मस्जिद", urdu: "مسجد" },
  Morning: { bengali: "সকাল", english: "Morning", hindi: "सुबह", urdu: "صبح" },
  "Names of Allah": { bengali: "আল্লাহর নাম", english: "Names of Allah", hindi: "अल्लाह के नाम", urdu: "اللہ کے نام" },
  Parents: { bengali: "পিতা-মাতা", english: "Parents", hindi: "माता-पिता", urdu: "والدین" },
  Praise: { bengali: "প্রশংসা", english: "Praise", hindi: "प्रशंसा", urdu: "تعریف" },
  Promise: { bengali: "প্রতিশ্রুতি", english: "Promise", hindi: "वादा", urdu: "وعدہ" },
  Protection: { bengali: "সুরক্ষা", english: "Protection", hindi: "सुरक्षा", urdu: "حفاظت" },
  Quran: { bengali: "কুরআন", english: "Quran", hindi: "क़ुरान", urdu: "قرآن" },
  Ramadan: { bengali: "রমজান", english: "Ramadan", hindi: "रमजान", urdu: "রমজান" },
  Remembrance: { bengali: "জিকির", english: "Remembrance", hindi: "स्मरण", urdu: "ذکر" },
  Repentance: { bengali: "তওবা", english: "Repentance", hindi: "पछतावा", urdu: "توبہ" },
  Responsibility: { bengali: "দায়িত্ব", english: "Responsibility", hindi: "जिम्मेदारी", urdu: "ذمہ داری" },
  Ruqyah: { bengali: "রুকইয়াহ", english: "Ruqyah", hindi: "रुक्याह", urdu: "رقیہ" },
  Salah: { bengali: "নামাজ", english: "Salah", hindi: "सलाह", urdu: "صلاة" },
  Sleep: { bengali: "ঘুম", english: "Sleep", hindi: "नींद", urdu: "نیند" },
  Steadfastness: { bengali: "অবিচলতা", english: "Steadfastness", hindi: "दृढ़তা", urdu: "استقامت" },
  Submission: { bengali: "আত্মসমর্পণ", english: "Submission", hindi: "समर्पण", urdu: "اطاعت" },
  Tawhid: { bengali: "তাওহীদ", english: "Tawhid", hindi: "तौहीद", urdu: "توحید" },
  Travel: { bengali: "ভ্রমণ", english: "Travel", hindi: "यात्रा", urdu: "سفر" },
  Weather: { bengali: "আবহাওয়া", english: "Weather", hindi: "मौसम", urdu: "موسم" },
  Wisdom: { bengali: "প্রজ্ঞা", english: "Wisdom", hindi: "बुद्धिमत्ता", urdu: "حکمت" },
  Worship: { bengali: "ইবাদত", english: "Worship", hindi: "इबादत", urdu: "عبادت" },
  Wudu: { bengali: "ওযু", english: "Wudu", hindi: "वुज़ू", urdu: "وضو" },
  Dua: { bengali: "দোয়া", english: "Dua", hindi: "दुआ", urdu: "دعا" },
};

const getCategoryLabel = (category: string, lang: Language): string => {
  return CATEGORY_TRANSLATIONS[category]?.[lang] || category;
};

const CATEGORY_ICONS: Record<string, string> = {
  "Balanced Life": "⚖️",
  "Character": "👤",
  "Daily": "☀️",
  "Death": "⚰️",
  "Evening": "🌙",
  "Faith": "🕋",
  "Family": "👨‍👩‍👧‍👦",
  "Fasting": "🍽️",
  "Food": "🍲",
  "Forgiveness": "🤲",
  "Gratitude": "🤲",
  "Guidance": "🧭",
  "Hajj": "🕋",
  "Healing": "💊",
  "Health": "🏥",
  "Hereafter": "🌌",
  "Hope": "✨",
  "Journey": "🚗",
  "Justice": "⚖️",
  "Knowledge": "📚",
  "Legacy": "📜",
  "Masjid": "🕌",
  "Morning": "🌅",
  "Names of Allah": "✨",
  "Parents": "👴👵",
  "Praise": "🙌",
  "Promise": "🤝",
  "Protection": "🛡️",
  "Quran": "📖",
  "Ramadan": "🌙",
  "Remembrance": "📿",
  "Repentance": "🛐",
  "Responsibility": "📋",
  "Ruqyah": "🛡️",
  "Salah": "🛐",
  "Sleep": "💤",
  "Steadfastness": "⚓",
  "Submission": "🛐",
  "Tawhid": "☝️",
  "Travel": "✈️",
  "Weather": "⛈️",
  "Wisdom": "💡",
  "Worship": "🛐",
  "Wudu": "🚿",
  "Dua": "🤲",
};

const getCategoryIcon = (category: string): string => {
  return CATEGORY_ICONS[category] || "🤲";
};

const ISLAMIC_PATTERN_1 = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='136' viewBox='0 0 160 136'%3E%3Cg fill='none' stroke='%23ffffff' stroke-opacity='0.05' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath stroke-width='3.4' d='M-10 29C10 7 39 4 59 17c16 11 18 32 5 44-13 11-34 7-38-8-3-13 9-24 22-19 16 6 21 27 12 43-11 22-35 31-60 22'/%3E%3Cpath stroke-width='2.7' d='M68-10C56 13 61 38 81 49c18 10 39 0 40-19 1-16-15-25-28-15-14 11-8 35 9 44 18 9 39 7 52-5'/%3E%3Cpath stroke-width='3.2' d='M82 61c18-20 49-22 68-5 16 14 13 40-7 50-17 9-36-1-37-18-1-15 16-25 29-16 16 11 17 36 3 54-15 20-44 27-69 14'/%3E%3Cpath stroke-width='2' d='M2 87c16-15 39-17 55-6M132 103c-8 8-10 19-4 29M45 112c9-10 24-12 36-5'/%3E%3C/g%3E%3Cg fill='%23ffffff' fill-opacity='0.04'%3E%3Ccircle cx='13' cy='52' r='2.4'/%3E%3Ccircle cx='20' cy='48' r='1.5'/%3E%3Ccircle cx='72' cy='103' r='2.2'/%3E%3Cpath d='M34 8c6 7 6 15 0 22-6-7-6-15 0-22ZM102 122c8-10 17-10 25 0-8-4-17-4-25 0Z'/%3E%3C/g%3E%3Cg fill='%23ffffff' font-family='serif' text-anchor='middle' opacity='0.05'%3E%3Ctext x='44' y='55' font-size='17' transform='rotate(-18 44 55)'%3Eالله%3C/text%3E%3Ctext x='118' y='34' font-size='14' transform='rotate(13 118 34)'%3Eرب%3C/text%3E%3Ctext x='42' y='105' font-size='13'%3Eنور%3C/text%3E%3C/g%3E%3C/svg%3E")`;
const ISLAMIC_PATTERN_2 = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='72' height='61' viewBox='0 0 72 61'%3E%3Cg fill='none' stroke='%23ffffff' stroke-width='1.45' stroke-opacity='0.03' stroke-linecap='round'%3E%3Cpath d='M-4 25c9-13 22-15 31-7 8 7 5 18-3 22-8 3-16-2-14-9 1-6 8-9 14-5 7 5 6 15-1 22-8 8-20 8-29 2M38-4c-6 11-3 21 5 26 9 4 18-2 18-10-1-7-8-10-13-6-5 5-2 14 5 18M39 42c9-10 22-10 30-2'/%3E%3C/g%3E%3C/svg%3E")`;
const ISLAMIC_PATTERN = `${ISLAMIC_PATTERN_1}, ${ISLAMIC_PATTERN_2}`;

const slugifyCategory = (s: string) =>
  s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\u0980-\u09FF]+/g, "-")
    .replace(/(^-+|-+$)/g, "");

const UI_LABELS = {
  loading: {
    bengali: "দোয়া লোড হচ্ছে...",
    english: "Loading duas...",
    hindi: "दुआएं लोड हो रही हैं...",
    urdu: "دعائیں لوڈ ہو رہی ہیں...",
  },
  errorMessage: {
    bengali: "দোয়া লোড করতে সমস্যা হয়েছে।",
    english: "Failed to load duas. Please try again.",
    hindi: "दुआएं लोड करने में विफल।",
    urdu: "دعائیں لوڈ کرنے میں ناکامی۔",
  },
  noDuasFound: {
    bengali: "কোনো দোয়া পাওয়া যায়নি।",
    english: "No duas found.",
    hindi: "कोई दुआ नहीं मिली।",
    urdu: "کوئی دعا نہیں ملی۔",
  },
  searchPlaceholder: {
    bengali: "দোয়া খুঁজুন...",
    english: "Search duas...",
    hindi: "दुआ खोजें...",
    urdu: "دعا تلاش کریں...",
  },
  readMore: {
    bengali: "📖 বিস্তারিত পড়ুন",
    english: "📖 Read More",
    hindi: "📖 और पढ़ें",
    urdu: "📖 مزید پڑھیں",
  },
  todayDua: {
    bengali: "আজকের দোয়া",
    english: "Today's Dua",
    hindi: "आज की दुआ",
    urdu: "آج کی دعا",
  },
  featuredDuas: {
    bengali: "নির্বাচিত দোয়া",
    english: "Featured Duas",
    hindi: "चयनित दुआ",
    urdu: "منتخب دعائیں",
  },
  viewAllDuas: {
    bengali: "সব দোয়া দেখুন →",
    english: "View All Duas →",
    hindi: "सभी दुआ देखें →",
    urdu: "تمام دعائیں دیکھیں ←",
  },
} as const;

interface DuaTranslation {
  title: string;
  translation: string;
  category: string;
}

interface Dua {
  id: string;
  slug?: string | null;
  arabic: string;
  bengaliTransliteration?: string;
  pronunciationEn?: string;
  pronunciationHi?: string;
  pronunciationUr?: string;
  translations: Record<Language, DuaTranslation>;
}

interface AdminContentDuaRow {
  id: string;
  slug?: string | null;
  title: string | null;
  title_en: string | null;
  title_hi: string | null;
  title_ur: string | null;
  content: string | null;
  content_arabic: string | null;
  content_en: string | null;
  content_hi: string | null;
  content_ur: string | null;
  content_pronunciation: string | null;
  content_pronunciation_en?: string | null;
  content_pronunciation_hi?: string | null;
  content_pronunciation_ur?: string | null;
  category: string | null;
}


async function loadPublicDuaFallback(): Promise<Dua[]> {
  try {
    const response = await fetch("/data/duas.json", { cache: "force-cache" });
    if (!response.ok) throw new Error(`duas fallback HTTP ${response.status}`);
    const rows = (await response.json()) as Array<Record<string, any>>;
    return rows
      .filter((row) => row && (row.arabic || row.title_bn || row.title_en))
      .map((row, index) => ({
        id: String(row.slug ?? row.id ?? `public-dua-${index + 1}`),
        slug: row.slug ?? null,
        arabic: row.arabic ?? "",
        bengaliTransliteration: row.pronunciation ?? undefined,
        pronunciationEn: row.pronunciation ?? undefined,
        pronunciationHi: row.pronunciation ?? undefined,
        pronunciationUr: row.pronunciation ?? undefined,
        translations: {
          bengali: {
            title: row.title_bn ?? row.title_en ?? "দোয়া",
            category: row.category ?? "দোয়া",
            translation: row.translation_bn ?? row.translation_en ?? "",
          },
          english: {
            title: row.title_en ?? row.title_bn ?? "Dua",
            category: row.category ?? "Dua",
            translation: row.translation_en ?? row.translation_bn ?? "",
          },
          hindi: {
            title: row.title_hi ?? row.title_en ?? row.title_bn ?? "दुआ",
            category: row.category ?? "दुआ",
            translation: row.translation_en ?? row.translation_bn ?? "",
          },
          urdu: {
            title: row.title_ur ?? row.title_en ?? row.title_bn ?? "دعا",
            category: row.category ?? "دعا",
            translation: row.translation_en ?? row.translation_bn ?? "",
          },
        },
      }));
  } catch (fallbackError) {
    console.error("Public dua fallback failed", fallbackError);
    return [];
  }
}

const CategorySkeleton = () => (
  <div className="flex gap-3 overflow-x-auto pb-4 scrollbar-hide -mx-4 px-4 animate-pulse">
    {[1, 2, 3, 4, 5].map((i) => (
      <div key={i} className="shrink-0 w-32 p-4 rounded-2xl bg-white/5 border border-white/10 flex flex-col items-center">
        <div className="w-10 h-10 rounded-xl bg-white/10 mb-2" />
        <div className="h-3 w-16 bg-white/10 rounded mb-1" />
        <div className="h-2 w-10 bg-white/5 rounded" />
      </div>
    ))}
  </div>
);

const DuaSkeleton = () => (
  <div className="space-y-3 animate-pulse">
    {[1, 2, 3, 4, 5, 6].map((i) => (
      <div key={i} className="w-full p-4 rounded-2xl bg-gradient-to-br from-[hsl(158,55%,25%)] to-[hsl(158,64%,20%)] border border-white/10 opacity-60" style={{ backgroundImage: ISLAMIC_PATTERN }}>
        <div className="flex items-center justify-between">
          <div className="space-y-3 flex-1">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-white/10" />
              <div className="h-4 w-1/2 bg-white/10 rounded" />
            </div>
            <div className="h-3 w-3/4 bg-white/5 rounded" />
          </div>
          <div className="w-5 h-5 bg-white/10 rounded" />
        </div>
      </div>
    ))}
  </div>
);

const DuaPage = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [language, setLanguage] = useState<Language>(() => {
    if (typeof window === "undefined") return "bengali";
    const saved = window.localStorage.getItem("dua_language");
    return (saved as Language) || "bengali";
  });

  useEffect(() => {
    try {
      window.localStorage.setItem("dua_language", language);
    } catch {}
  }, [language]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedDua, setSelectedDua] = useState<Dua | null>(null);
  const [duas, setDuas] = useState<Dua[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const categoryParam = searchParams.get("category");
  const duaParam = searchParams.get("dua");

  // Static fallback Duas — ensures the page always has content for Google & SEO
  // even if the Supabase API fails or times out
  const FALLBACK_DUAS: Dua[] = [
    {
      id: "fallback-1",
      slug: null,
      arabic: "بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ",
      bengaliTransliteration: "বিসমিল্লাহির রাহমানির রাহীম",
      pronunciationEn: "Bismillaahir Rahmaanir Raheem",
      pronunciationHi: "बिस्मिल्लाहिर रहमानिर रहीम",
      pronunciationUr: "بسم اللہ الرحمن الرحیم",
      translations: {
        bengali: { title: "বিসমিল্লাহ", category: "Daily", translation: "শুরু করছি আল্লাহর নামে, যিনি পরম করুণাময়, অতি দয়ালু।" },
        english: { title: "Bismillah", category: "Daily", translation: "In the name of Allah, the Most Gracious, the Most Merciful." },
        hindi: { title: "बिस्मिल्लाह", category: "Daily", translation: "अल्लाह के नाम से जो रहमान और रहीम है।" },
        urdu: { title: "بسم اللہ", category: "Daily", translation: "اللہ کے نام سے جو بہت مہربان اور رحم کرنے والا ہے۔" },
      },
    },
    {
      id: "fallback-2",
      slug: null,
      arabic: "الْحَمْدُ لِلَّهِ رَبِّ الْعَالَمِينَ",
      bengaliTransliteration: "আলহামদুলিল্লাহি রাব্বিল আআলামীন",
      pronunciationEn: "Alhamdu lillaahi Rabbil Aa'lameen",
      pronunciationHi: "अलहम्दु लिल्लाहि रब्बिल आलामीन",
      pronunciationUr: "الحمد للہ رب العلمین",
      translations: {
        bengali: { title: "আলহামদুলিল্লাহ", category: "Daily", translation: "সব প্রশংসা আল্লাহর, যিনি সমগ্র বিশ্বের রব।" },
        english: { title: "Alhamdulillah", category: "Daily", translation: "All praise is due to Allah, Lord of the worlds." },
        hindi: { title: "अलहम्दुलिल्लाह", category: "Daily", translation: "सारी तारीफ अल्लाह के लिए है जो सारी दुनियाओं का पालनहार है।" },
        urdu: { title: "الحمد للہ", category: "Daily", translation: "تمام تعریفیں اللہ کے لیے ہیں جو تمام جہانوں کا رب ہے۔" },
      },
    },
    {
      id: "fallback-3",
      slug: null,
      arabic: "سُبْحَانَ اللَّهِ وَبِحَمْدِهِ",
      bengaliTransliteration: "সুবহানাল্লাহি ওয়া বিহামদিহি",
      pronunciationEn: "SubhaanAllaahi wa bihamdihi",
      pronunciationHi: "सुब्हानअल्लाहि व बिहम्दिहि",
      pronunciationUr: "سبحان اللہ وبحمدہ",
      translations: {
        bengali: { title: "তাসবীহ", category: "Daily", translation: "আল্লাহ তাআলা সকল দোষ থেকে পবিত্র এবং তার প্রশংসার সাথে।" },
        english: { title: "SubhanAllahi wa bihamdihi", category: "Daily", translation: "Glory be to Allah and His is the praise." },
        hindi: { title: "सुब्हानअल्लाह", category: "Daily", translation: "अल्लाह पवित्र है और उसकी तारीफ़ है।" },
        urdu: { title: "سبحان اللہ", category: "Daily", translation: "اللہ پاک ہے اور اس کی تمام تعریفیں اس کے لیے ہیں۔" },
      },
    },
    {
      id: "fallback-4",
      slug: null,
      arabic: "اللَّهُمَّ صَلِّ عَلَىٰ مُحَمَّدٍ وَعَلَىٰ آلِ مُحَمَّدٍ",
      bengaliTransliteration: "আল্লাহুম্মা সাল্লি আ'লা মুহাম্মাদিন ওয়া আ'লা আ'লি মুহাম্মাদ",
      pronunciationEn: "Allaahumma salli 'alaa Muhammadin wa 'alaa aali Muhammad",
      pronunciationHi: "अल्लाहुम्मा सल्ली अला मुहम्मदिन व अला आलि मुहम्मद",
      pronunciationUr: "اللہم صل علیٰ محمد و علیٰ آل محمد",
      translations: {
        bengali: { title: "দরূদ শরীফ", category: "Daily", translation: "হে আল্লাহ! মুহাম্মদ (সা.)-এর উপর এবং মুহাম্মদ (সা.)-এর পরিবারের উপর রহমত বর্ষণ করুন।" },
        english: { title: "Durood Shareef", category: "Daily", translation: "O Allah, send Your blessings upon Muhammad and upon the family of Muhammad." },
        hindi: { title: "दरूद शरीफ", category: "Daily", translation: "ऐ अल्लाह! मुहम्मद और मुहम्मद की उम्मत पर रहमतें भेज।" },
        urdu: { title: "درود شریف", category: "Daily", translation: "اے اللہ! محمدﷺ اور محمدﷺ کی آل پر رحمتیں بھیج۔" },
      },
    },
    {
      id: "fallback-5",
      slug: null,
      arabic: "أَعُوذُ بِاللَّهِ مِنَ الشَّيْطَانِ الرَّجِيمِ",
      bengaliTransliteration: "আ'ঊযুবিল্লাহি মিনাশ শাইতানির রাজীম",
      pronunciationEn: "A'uudhu billaahi minash Shaitaanir Rajiim",
      pronunciationHi: "अऊज़ु बिल्लाहि मिनश शैतानिर रजीम",
      pronunciationUr: "اعوذ باللہ من الشیطان الرجیم",
      translations: {
        bengali: { title: "ইসতি'আযা", category: "Daily", translation: "আমি আল্লাহর কাছে আশ্রয় চাই অভিশপ্ত শয়তান থেকে।" },
        english: { title: "Istiaadha", category: "Daily", translation: "I seek refuge in Allah from Satan, the accursed." },
        hindi: { title: "इसतियाज़ा", category: "Daily", translation: "मैं अल्लाह की पनाह माँगता हूँ शैतान से जो मारा गया।" },
        urdu: { title: "استعاذہ", category: "Daily", translation: "میں اللہ کی پناہ مانگتا ہوں شیطان مردود سے۔" },
      },
    },
    {
      id: "fallback-6",
      slug: null,
      arabic: "رَبِّ زِدْنِي عِلْمًا",
      bengaliTransliteration: "রাব্বি যিদনী ইলমা",
      pronunciationEn: "Rabbi zidnee 'ilman",
      pronunciationHi: "रब्बि ज़िदनी इल्मा",
      pronunciationUr: "رب زدني علما",
      translations: {
        bengali: { title: "ইলমের দোয়া", category: "Knowledge", translation: "হে আমার রব! আমার জ্ঞান বৃদ্ধি করুন। (সূরা ত্বোহা: ১১৪)" },
        english: { title: "Dua for Knowledge", category: "Knowledge", translation: "My Lord, increase me in knowledge. (Quran 20:114)" },
        hindi: { title: "इल्म की दुआ", category: "Knowledge", translation: "ऐ मेरे रब! मेरा इल्म बढ़ा दे। (सूरह त्वाहा: 114)" },
        urdu: { title: "علم کی دعا", category: "Knowledge", translation: "اے میرے رب! میرا علم بڑھا دے۔ (سورۃ طہ: 114)" },
      },
    },
    {
      id: "fallback-7",
      slug: null,
      arabic: "اللَّهُمَّ إِنِّي أَسْأَلُكَ خَيْرَ هَٰذَا الْيَوْمِ",
      bengaliTransliteration: "আল্লাহুম্মা ইন্নী আসআলুকা খাইরা হাযাল ইয়াওমি",
      pronunciationEn: "Allaahumma innee as-aluka khaira haadhal yawmi",
      pronunciationHi: "अल्लाहुम्मा इन्नी असअलुका खैर हज़ल याव्मि",
      pronunciationUr: "اللہم إنی أسألک خیر ہذا الیوم",
      translations: {
        bengali: { title: "সকালের দোয়া", category: "Morning", translation: "হে আল্লাহ! আমি এই দিনের কল্যাণ আপনার কাছে চাই।" },
        english: { title: "Morning Dua", category: "Morning", translation: "O Allah, I ask You for the good of this day." },
        hindi: { title: "सुबह की दुआ", category: "Morning", translation: "ऐ अल्लाह! मैं इस दिन की भलाई माँगता हूँ।" },
        urdu: { title: "صبح کی دعا", category: "Morning", translation: "اے اللہ! میں اس دن کی بھلائی مانگتا ہوں۔" },
      },
    },
    {
      id: "fallback-8",
      slug: null,
      arabic: "اللَّهُمَّ إِنِّي أَعُوذُ بِكَ مِنْ عَذَابِ جَهَنَّمَ",
      bengaliTransliteration: "আল্লাহুম্মা ইন্নী আ'ঊযুবিকা মিন আ'যাবি জাহান্নাম",
      pronunciationEn: "Allaahumma innee a'oodhu bika min 'adhaabi Jahannam",
      pronunciationHi: "अल्लाहुम्मा इन्नी अऊज़ु बिका मिन अज़ाबि जहन्नम",
      pronunciationUr: "اللہم إنی أعوذ بک من عذاب جہنم",
      translations: {
        bengali: { title: "জাহান্নাম থেকে রক্ষার দোয়া", category: "Protection", translation: "হে আল্লাহ! আমি জাহান্নামের আযাব থেকে আপনার কাছে আশ্রয় চাই।" },
        english: { title: "Dua for Protection", category: "Protection", translation: "O Allah, I seek refuge in You from the punishment of Hell." },
        hindi: { title: "जहन्नुम से बचाव की दुआ", category: "Protection", translation: "ऐ अल्लाह! मैं जहन्नुम के अज़ाब से तेरी पनाह माँगता हूँ।" },
        urdu: { title: "جہنم سے پناہ کی دعا", category: "Protection", translation: "اے اللہ! میں جہنم کے عذاب سے تیری پناہ مانگتا ہوں۔" },
      },
    },
    {
      id: "fallback-9",
      slug: null,
      arabic: "رَبَّنَا آتِنَا فِي الدُّنْيَا حَسَنَةً وَفِي الْآخِرَةِ حَسَنَةً وَقِنَا عَذَابَ النَّارِ",
      bengaliTransliteration: "রাব্বানা আ'তিনা ফিদ্দুনিয়া হাসানাতান ওয়া ফিল আ'খিরাতি হাসানাতান ওয়া ক্বিনা আ'যাবান্নার",
      pronunciationEn: "Rabbanaa aatinaa fid-dunyaa hasanatan wa fil-Aakhirati hasanatan wa qinaa 'adhaaban-Naar",
      pronunciationHi: "रब्बना आतिना फिद्दुनिया हसनतन व फिल आखिरति हसनतन व क़िना अज़ाबन्-नार",
      pronunciationUr: "ربنا آتنا في الدنيا حسنة وفي الآخرة حسنة وقنا عذاب النار",
      translations: {
        bengali: { title: "কুরআনের দোয়া (সূরা বাকারা: ২০১)", category: "Quran", translation: "হে আমাদের রব! আমাদের দুনিয়ায় কল্যাণ দিন, আখিরাতেও কল্যাণ দিন এবং আমাদের জাহান্নামের আযাব থেকে রক্ষা করুন।" },
        english: { title: "Quran Dua (Al-Baqarah 2:201)", category: "Quran", translation: "Our Lord, give us in this world good and in the Hereafter good, and protect us from the punishment of the Fire." },
        hindi: { title: "क़ुरआन की दुआ (सूरह बक़रह: 201)", category: "Quran", translation: "ऐ हमारे रब! हमें दुनिया में भलाई दे और आख़िरत में भी भलाई दे, और हमें आग के अज़ाब से बचा।" },
        urdu: { title: "قرآن کی دعا (سورۃ البقرہ: 201)", category: "Quran", translation: "اے ہمارے رب! ہمیں دنیا میں بھلائی دے اور آخرت میں بھی بھلائی دے، اور ہمیں آگ کے عذاب سے بچا۔" },
      },
    },
    {
      id: "fallback-10",
      slug: null,
      arabic: "سُبْحَانَ اللَّهِ الْحَظِيمِ",
      bengaliTransliteration: "আসতাগফিরুল্লাহ",
      pronunciationEn: "Astaghfirullaah",
      pronunciationHi: "अस्तग़फ़िरुल्लाह",
      pronunciationUr: "استغفر اللہ",
      translations: {
        bengali: { title: "ক্ষমার দোয়া", category: "Forgiveness", translation: "আমি আল্লাহর কাছে ক্ষমা চাই।" },
        english: { title: "Dua for Forgiveness", category: "Forgiveness", translation: "I seek forgiveness from Allah." },
        hindi: { title: "माफ़ी की दुआ", category: "Forgiveness", translation: "मैं अल्लाह से माफ़ी माँगता हूँ।" },
        urdu: { title: "معافی کی دعا", category: "Forgiveness", translation: "میں اللہ سے معافی مانگتا ہوں۔" },
      },
    },
  ];

  useEffect(() => {
    const fetchDuas = async () => {
      setLoading(true);
      setError(null);
      try {
        const { data, error } = await supabase
          .from("admin_content")
          .select("*")
          .eq("status", "published")
          .in("content_type", ["dua", "Dua"])
          .order("published_at", { ascending: false });

        if (error) {
          console.error("Error loading duas", error);
          // Use the complete public dataset instead of the small emergency sample.
          const fallback = await loadPublicDuaFallback();
          setDuas(fallback.length ? fallback : FALLBACK_DUAS);
          setLoading(false);
          return;
        }

        const mapped: Dua[] = (data as unknown as AdminContentDuaRow[]).map((row) => ({
          id: row.id,
          slug: row.slug ?? null,
          arabic: row.content_arabic || "",
          bengaliTransliteration: row.content_pronunciation || undefined,
          pronunciationEn: row.content_pronunciation_en || undefined,
          pronunciationHi: row.content_pronunciation_hi || undefined,
          pronunciationUr: row.content_pronunciation_ur || undefined,
          translations: {
            bengali: {
              title: row.title || "দোয়া",
              category: row.category || "দোয়া",
              translation: row.content || "",
            },
            english: {
              title: row.title_en || row.title || "Dua",
              category: row.category || "Dua",
              translation: row.content_en || row.content || "",
            },
            hindi: {
              title: row.title_hi || row.title || "दुआ",
              category: row.category || "دुआ",
              translation: row.content_hi || row.content || "",
            },
            urdu: {
              title: row.title_ur || row.title || "دعا",
              category: row.category || "دعا",
              translation: row.content_ur || row.content || "",
            },
          },
        }));

        // If API returns empty data, use the complete public dataset.
        if (!mapped || mapped.length === 0) {
          const fallback = await loadPublicDuaFallback();
          setDuas(fallback.length ? fallback : FALLBACK_DUAS);
        } else {
          setDuas(mapped);
        }
        setLoading(false);
      } catch (err) {
        console.error("Dua fetch failed", err);
        const fallback = await loadPublicDuaFallback();
        setDuas(fallback.length ? fallback : FALLBACK_DUAS);
        setLoading(false);
      }
    };

    fetchDuas();
  }, []);

  // Sync UI state from URL (enables step-by-step browser back)
  useEffect(() => {
    // Category from URL
    setSelectedCategory(categoryParam || null);

    // Dua from URL (wait until data exists)
    if (duaParam) {
      const found = duas.find((d) => d.id === duaParam) ?? null;
      setSelectedDua(found);
    } else {
      setSelectedDua(null);
    }
    // Intentionally depends on `duas` (so it resolves after fetch)
  }, [categoryParam, duaParam, duas]);

  const categories = useMemo(
    () => [...new Set(duas.map((d) => d.translations.english?.category || "Dua"))],
    [duas]
  );

  const filteredDuas = useMemo(() => {
    return duas.filter((dua) => {
    const translation = dua.translations[language] || { title: "", translation: "", category: "" };
    const matchesSearch =
      (translation.title || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (dua.bengaliTransliteration || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (dua.pronunciationEn || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (dua.pronunciationHi || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (dua.pronunciationUr || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (translation.translation || "").toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = !selectedCategory || translation.category === selectedCategory;
    return matchesSearch && matchesCategory;
    });
  }, [duas, language, searchQuery, selectedCategory]);

  const pushCategory = (cat: string) => {
    setSearchParams({ category: cat }, { replace: false });
  };

  const pushDua = (duaId: string) => {
    const cat = selectedCategory || categoryParam || "";
    const next: Record<string, string> = {};
    if (cat) next.category = cat;
    next.dua = duaId;
    setSearchParams(next, { replace: false });
  };

  const handleBack = () => {
    // Let router history unwind (dua -> category -> list -> previous route)
    navigate(-1);
  };

  const getTitle = () => {
    if (selectedDua) return selectedDua.translations[language].title;
    if (selectedCategory) return selectedCategory;
    return language === "bengali" ? "দোয়া সংকলন" : 
           language === "hindi" ? "दुआ संग्रह" : 
           language === "urdu" ? "دعا مجموعہ" : "Dua Collection";
  };

  return (
    <div className="min-h-screen bg-[hsl(158,64%,12%)]" style={{ backgroundImage: ISLAMIC_PATTERN }}>
      {/* Header */}
      <motion.header
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="sticky top-0 z-50 bg-gradient-to-b from-[hsl(158,55%,22%)] to-[hsl(158,55%,22%)]/95 backdrop-blur-lg border-b border-white/10 relative overflow-hidden"
        style={{ backgroundImage: `${ISLAMIC_PATTERN}, linear-gradient(to bottom, hsl(158,55%,22%), hsl(158,55%,22%))` }}
      >
        <div className="flex items-center gap-3 px-4 py-4">
          <button
            onClick={handleBack}
            className="p-2 -ml-2 hover:bg-white/10 rounded-full transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-white" />
          </button>
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[hsl(45,93%,58%)] to-[hsl(45,93%,48%)] flex items-center justify-center">
            <BookOpen className="w-4 h-4 text-[hsl(158,64%,15%)]" />
          </div>
          <h1 className="text-xl font-bold text-white">{getTitle()}</h1>
        </div>

        {/* Language Selector */}
        <div className="px-4 pb-3">
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
            {(Object.keys(LANGUAGE_LABELS) as Language[]).map((lang) => (
              <button
                key={lang}
                onClick={() => {
                  setLanguage(lang);
                  // Reset drilldown when language changes (and keep history clean)
                  setSearchParams({}, { replace: true });
                }}
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

      {/* Web Ad Slot */}
      {!loading && !error && (
        <div className="px-4 pt-4">
          <AdSlot placement="web_dua_middle" />
        </div>
      )}

      {loading && (
        <div className="p-4 space-y-6">
          <div className="relative">
            <div className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 bg-white/10 rounded-full animate-pulse" />
            <div className="h-12 w-full rounded-2xl bg-white/10 border border-white/10" />
          </div>
          <CategorySkeleton />
          <DuaSkeleton />
        </div>
      )}
      {error && (
        <div className="p-4 text-center text-red-300 text-sm">{UI_LABELS.errorMessage[language]}</div>
      )}

      <AnimatePresence mode="wait">
        {selectedDua ? (
          // Dua Detail View
          <motion.div
            key="detail"
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -50 }}
            className="p-4 space-y-6"
          >
            <div className="text-center space-y-6 py-6">
              {/* Arabic Text Card */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="relative bg-gradient-to-br from-[hsl(158,55%,25%)] to-[hsl(158,64%,20%)] rounded-3xl p-6 border border-[hsl(45,93%,58%)]/20 shadow-lg overflow-hidden"
              >
                <div className="absolute top-0 right-0 w-32 h-32 bg-[hsl(45,93%,58%)]/10 rounded-full blur-2xl" />
                <div className="absolute bottom-0 left-0 w-24 h-24 bg-[hsl(158,64%,30%)]/30 rounded-full blur-xl" />
                <div className="relative">
                  <div className="flex items-center justify-center gap-2 mb-4">
                    <Sparkles className="w-4 h-4 text-[hsl(45,93%,58%)]" />
                    <span className="text-xs font-medium text-[hsl(45,93%,58%)]">
                      {SECTION_LABELS.arabic[language]}
                    </span>
                    <Sparkles className="w-4 h-4 text-[hsl(45,93%,58%)]" />
                  </div>
                  <p className="text-3xl md:text-4xl font-arabic leading-[2] text-white">
                    {selectedDua.arabic}
                  </p>
                </div>
              </motion.div>

              {/* Transliteration */}
              {(() => {
                const langText =
                  language === "bengali"
                    ? selectedDua.bengaliTransliteration
                    : language === "english"
                    ? selectedDua.pronunciationEn
                    : language === "hindi"
                    ? selectedDua.pronunciationHi
                    : selectedDua.pronunciationUr;

                // Spec: fallback to Bengali only when selected language is missing.
                const fallbackText = langText || selectedDua.bengaliTransliteration;

                if (!fallbackText) return null;

                return (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.15 }}
                    className="bg-white/5 rounded-2xl p-5 border border-white/10"
                  >
                    <div className="flex items-center gap-2 mb-3">
                      <Sparkles className="w-4 h-4 text-[hsl(45,93%,58%)]" />
                      <p className="text-xs font-medium text-[hsl(45,93%,58%)]">
                        {SECTION_LABELS.transliteration[language]}
                      </p>
                    </div>
                    <p className="text-white/90 text-lg md:text-xl leading-relaxed">
                      {fallbackText}
                    </p>
                  </motion.div>
                );
              })()}

              {/* Translation */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="bg-gradient-to-br from-[hsl(45,93%,58%)]/10 to-transparent rounded-2xl p-5 border border-[hsl(45,93%,58%)]/20"
              >
                <div className="flex items-center gap-2 mb-3">
                  <Heart className="w-4 h-4 text-[hsl(45,93%,58%)]" />
                  <p className="text-xs font-medium text-[hsl(45,93%,58%)]">
                    {SECTION_LABELS.translation[language]}
                  </p>
                </div>
<p className="text-white text-lg md:text-xl leading-relaxed">
	                  {selectedDua.translations[language]?.translation || ""}
	                </p>
              </motion.div>

              {/* Audio Player */}
              <DuaAudioPlayer 
                arabicText={selectedDua.arabic} 
                duaId={selectedDua.id} 
              />
            </div>
          </motion.div>
        ) : (
          // List View
          <motion.div
            key="list"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="p-4 space-y-4"
          >
            <section className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <h2 className="text-sm font-bold text-[hsl(45,93%,58%)]">
                দোয়া পড়ার অর্থ ও প্রেক্ষাপট
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-white/75">
                Noor-এর দোয়া সংকলনে দৈনন্দিন জীবন, ইবাদত ও বিভিন্ন প্রয়োজনের জন্য আরবি পাঠ, উচ্চারণ এবং অনুবাদ একসঙ্গে দেওয়া হয়েছে। দোয়া শুধু মুখস্থ করার বিষয় নয়—অর্থ বোঝা, কখন পড়তে হয় তা জানা এবং বর্ণনার উৎস যাচাই করাও গুরুত্বপূর্ণ। অনুবাদ সহায়ক হিসেবে ব্যবহার করুন এবং বিশেষ ধর্মীয় সিদ্ধান্তে যোগ্য আলেমের পরামর্শ নিন।
              </p>
              <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
                <Link to="/data-sources" className="rounded-full bg-[hsl(45,93%,58%)]/15 px-3 py-1.5 font-semibold text-[hsl(45,93%,65%)] hover:bg-[hsl(45,93%,58%)]/25">উৎস ও সম্পাদনা পদ্ধতি</Link>
                <Link to="/hadith" className="rounded-full bg-white/10 px-3 py-1.5 font-semibold text-white/80 hover:bg-white/15">হাদিস সংকলন</Link>
                <Link to="/prayer-guide" className="rounded-full bg-white/10 px-3 py-1.5 font-semibold text-white/80 hover:bg-white/15">নামাজের নির্দেশিকা</Link>
              </div>
            </section>

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/50" />
              <Input
                placeholder={UI_LABELS.searchPlaceholder[language]}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-12 h-12 rounded-2xl bg-white/10 border-white/10 text-white placeholder:text-white/50 focus:border-[hsl(45,93%,58%)]/50"
              />
            </div>

            {/* Categories */}
            {!selectedCategory && (
              <>
                {/* Daily Dua — deterministic per calendar day */}
                {!searchQuery && (() => {
                  const slugged = duas.filter((d) => d.slug);
                  if (slugged.length === 0) return null;
                  const today = new Date();
                  const dayKey =
                    today.getFullYear() * 10000 +
                    (today.getMonth() + 1) * 100 +
                    today.getDate();
                  const daily = slugged[dayKey % slugged.length];
                  return (
                    <Link
                      to={`/dua/${daily.slug}`}
                      className="block p-4 rounded-2xl bg-gradient-to-br from-[hsl(45,93%,58%)]/20 to-[hsl(45,93%,48%)]/5 border border-[hsl(45,93%,58%)]/40 hover:border-[hsl(45,93%,58%)] transition overflow-hidden relative shadow-lg"
                      style={{ backgroundImage: `${ISLAMIC_PATTERN}, linear-gradient(to bottom right, hsla(45,93%,58%,0.2), hsla(45,93%,48%,0.05))` }}
                    >
                      <div className="absolute inset-0 border border-white/5 rounded-2xl pointer-events-none" />
                      <div className="flex items-center gap-2 mb-2">
                        <Sparkles className="w-4 h-4 text-[hsl(45,93%,58%)]" />
                        <span className="text-[11px] font-semibold uppercase tracking-wide text-[hsl(45,93%,58%)]">
                          {UI_LABELS.todayDua[language]}
                        </span>
                      </div>
<p className="text-base font-bold text-white line-clamp-1">
	                        {daily.translations[language]?.title || ""}
	                      </p>
                      <p
                        dir="rtl"
                        className="mt-2 text-sm text-white/80 font-arabic line-clamp-2 leading-loose"
                      >
                        {daily.arabic}
                      </p>
                      <p className="mt-2 text-xs text-[hsl(45,93%,58%)] font-medium">
                        {UI_LABELS.readMore[language]} →
                      </p>
                    </Link>
                  );
                })()}

                {/* Horizontal scrollable category cards */}
                {!searchQuery && categories.length > 0 && (
                  <div className="flex gap-3 overflow-x-auto pb-4 scrollbar-hide -mx-4 px-4">
                    {categories.map((cat) => (
                      <Link
                        key={`seo-cat-${cat}`}
                        to={`/dua/category/${slugifyCategory(cat)}`}
                        className="shrink-0 w-32 p-4 rounded-2xl bg-white/5 border border-white/10 hover:border-[hsl(45,93%,58%)]/30 transition-all group flex flex-col items-center text-center"
                      >
                        <div className="w-10 h-10 rounded-xl bg-[hsl(45,93%,58%)]/10 flex items-center justify-center text-xl mb-2 group-hover:scale-110 transition-transform">
                          {getCategoryIcon(cat)}
                        </div>
                        <p className="text-xs font-bold text-white group-hover:text-[hsl(45,93%,58%)] transition-colors line-clamp-1">
                          {getCategoryLabel(cat, language)}
                        </p>
                        <p className="text-[9px] text-white/40 mt-1 uppercase tracking-wider whitespace-nowrap">
                          {UI_LABELS.viewAllDuas[language]}
                        </p>
                      </Link>
                    ))}
                  </div>
                )}

                {/* Featured Duas (4–6 items with slug) */}
                {!searchQuery && (
                  (() => {
                    const featured = duas.filter((d) => d.slug).slice(0, 6);
                    if (featured.length === 0) return null;
                    return (
                      <section className="space-y-2">
                        <h2 className="text-sm font-semibold text-white/90 flex items-center gap-2">
                          <Sparkles className="w-4 h-4 text-[hsl(45,93%,58%)]" />
                          {UI_LABELS.featuredDuas[language]}
                        </h2>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {featured.map((d) => (
                            <Link
                              key={`feat-${d.id}`}
                              to={`/dua/${d.slug}`}
                              className="p-3 rounded-2xl bg-gradient-to-br from-[hsl(158,55%,25%)] to-[hsl(158,64%,20%)] border border-white/10 hover:border-[hsl(45,93%,58%)]/40 transition"
                            >
<p className="text-sm font-semibold text-white line-clamp-1">
	                                {d.translations[language]?.title || ""}
	                              </p>
                              <p className="text-xs text-white/60 line-clamp-1 mt-1 font-arabic">
                                {d.arabic}
                              </p>
                            </Link>
                          ))}
                        </div>
                      </section>
                    );
                  })()
                )}


              </>
            )}

            {/* Dua List */}
            {!loading && !error && filteredDuas.length === 0 ? (
              <div className="py-8 text-center text-white/70 text-sm">
                {UI_LABELS.noDuasFound[language]}
              </div>
            ) : (
              <div className="space-y-3">
                {filteredDuas.map((dua, index) => (
                  <motion.button
                    key={dua.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                    onClick={() => {
                      if (dua.slug) {
                        navigate(`/dua/${dua.slug}`);
                      } else {
                        pushDua(dua.id);
                      }
                    }}
                    className="w-full text-left p-4 rounded-2xl bg-gradient-to-br from-[hsl(158,55%,25%)] to-[hsl(158,64%,20%)] border border-white/10 hover:border-[hsl(45,93%,58%)]/30 transition-all active:scale-[0.98] group"
                  >
                    <div className="flex items-center justify-between">
                      <div className="space-y-2 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="w-6 h-6 rounded-full bg-[hsl(45,93%,58%)]/20 flex items-center justify-center text-xs font-bold text-[hsl(45,93%,58%)]">
                            {index + 1}
                          </span>
                          <p className="font-semibold text-white">{dua.translations[language].title}</p>
                        </div>
                        <p className="text-sm text-white/60 line-clamp-1 font-arabic">
                          {dua.arabic}
                        </p>
                      </div>
                      <ChevronRight className="w-5 h-5 text-white/40 group-hover:text-[hsl(45,93%,58%)] transition-colors" />
                    </div>
                    {dua.slug && (
                      <span
                        role="link"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/dua/${dua.slug}`);
                        }}
                        className="mt-3 inline-flex items-center justify-center gap-1.5 w-full py-2 rounded-xl bg-[hsl(45,93%,58%)]/20 text-[hsl(45,93%,58%)] text-xs font-semibold hover:bg-[hsl(45,93%,58%)]/30 transition"
                      >
                        <BookOpen className="w-3.5 h-3.5" />
                        {UI_LABELS.readMore[language]}
                      </span>
                    )}
                  </motion.button>
                ))}
              </div>
            )}

            {!selectedCategory && (
              <section className="mt-8 rounded-2xl border border-white/10 bg-[hsl(158,55%,18%)] p-5 text-white/80">
                <h2 className="text-base font-bold text-white">দোয়া কীভাবে পড়বেন ও বুঝবেন</h2>
                <p className="mt-3 text-sm leading-7">
                  দোয়া পড়ার সময় আগে আরবি পাঠটি ধীরে পড়ুন, তারপর উচ্চারণ দেখে অনুশীলন করুন এবং অর্থটি বুঝে আল্লাহর কাছে মনোযোগসহকারে প্রার্থনা করুন। শুধু দ্রুত পড়ার বদলে দোয়াটি কোন পরিস্থিতিতে পড়া হয় তা জানা আমলকে আরও অর্থবহ করে।
                </p>
                <p className="mt-3 text-sm leading-7">
                  প্রতিটি দোয়ার উৎস ও প্রেক্ষাপট যাচাই করে পড়ুন। কুরআনের দোয়া ও হাদিসে বর্ণিত দোয়ার ক্ষেত্রে সূরা/হাদিসের রেফারেন্স দেখুন; কোনো অনুবাদ বা উচ্চারণে ভুল মনে হলে আমাদের <a href="/sources" className="font-semibold text-[hsl(45,93%,58%)] underline-offset-2 hover:underline">উৎস ও সংশোধন পেজে</a> জানান।
                </p>
                <div className="mt-4 grid gap-2 text-xs text-white/60 sm:grid-cols-3">
                  <span>১. আরবি পাঠ দেখুন</span>
                  <span>২. উচ্চারণ অনুশীলন করুন</span>
                  <span>৩. অর্থ বুঝে আমল করুন</span>
                </div>
              </section>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default DuaPage;
