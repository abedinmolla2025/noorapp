import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, BookOpen, Heart, Footprints, HandHeart, Sparkles, ChevronRight, ArrowLeft } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Helmet } from "react-helmet-async";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import BottomNavigation from "@/components/BottomNavigation";
import { useAppSettings } from "@/context/AppSettingsContext";

// Localization strings
const UI_STRINGS = {
  bn: {
    pageTitle: "নামাজ শিক্ষা",
    pageSubtitle: "ধাপে ধাপে নামাজ শিখুন",
    searchPlaceholder: "নিয়ত খুঁজুন (ফজর, বিতর, ঈদ...)",
    noResults: "কোনো নিয়ত পাওয়া যায়নি",
    tabNiyah: "নিয়ত",
    tabLearn: "শিক্ষা",
    tabSteps: "ধাপ",
    tabDuas: "দোয়া",
    step: "ধাপ",
    action: "কাজ",
    stepsIntro: "প্রতিটি রাকাতে এই ধাপগুলো অনুসরণ করুন। এই গাইড সম্পূর্ণ নামাজের চক্র কভার করে।",
    duasIntro: "নামাজে পাঠ করা প্রয়োজনীয় দোয়াগুলো। আপনার সালাত পরিপূর্ণ করতে এগুলো মুখস্ত করুন।",
  },
  en: {
    pageTitle: "Prayer Guide",
    pageSubtitle: "Learn how to pray step by step",
    searchPlaceholder: "Search Niyah (Fajr, Witr, Eid...)",
    noResults: "No Niyah found",
    tabNiyah: "Niyah",
    tabLearn: "Learn",
    tabSteps: "Steps",
    tabDuas: "Duas",
    step: "Step",
    action: "Action",
    stepsIntro: "Follow these steps in order for each rakat of your prayer. This guide covers the complete prayer cycle.",
    duasIntro: "Essential duas recited during prayer. Memorize these to perfect your Salah.",
  },
  ar: {
    pageTitle: "دليل الصلاة",
    pageSubtitle: "تعلم كيفية الصلاة خطوة بخطوة",
    searchPlaceholder: "ابحث عن النية (الفجر، الوتر، العيد...)",
    noResults: "لم يتم العثور على نية",
    tabNiyah: "النية",
    tabLearn: "تعلم",
    tabSteps: "الخطوات",
    tabDuas: "الأدعية",
    step: "خطوة",
    action: "الفعل",
    stepsIntro: "اتبع هذه الخطوات بالترتيب لكل ركعة من صلاتك. يغطي هذا الدليل دورة الصلاة الكاملة.",
    duasIntro: "الأدعية الأساسية التي تُقرأ أثناء الصلاة. احفظها لإتقان صلاتك.",
  },
};

// Niyah Data
// Phase C (2026-10-05): optional madhhab/context note shown under the meaning.
interface NiyahEntry {
  id: string; name: string; nameBn: string; rakats: string; rakatsBn: string;
  arabic: string; meaning: string; meaningBn: string;
  transliteration: string; transliterationBn: string;
  note?: string; noteBn?: string;
}
const NIYAH_DATA: NiyahEntry[] = [
  {
    id: "fajr",
    name: "Fajr",
    nameBn: "ফজর",
    rakats: "2 Farz",
    rakatsBn: "২ রাকাত ফরজ",
    arabic: "نَوَيْتُ أَنْ أُصَلِّيَ لِلَّهِ تَعَالَىٰ رَكْعَتَيْ صَلَاةِ الْفَجْرِ فَرْضُ اللَّهِ تَعَالَىٰ مُتَوَجِّهًا إِلَىٰ جِهَةِ الْكَعْبَةِ الشَّرِيفَةِ اللَّهُ أَكْبَرُ",
    meaning: "I intend to pray two rakats of Fajr Farz prayer for Allah facing the Kaaba. Allahu Akbar.",
    meaningBn: "আমি কেবলামুখী হয়ে আল্লাহর ওয়াস্তে ফজরের দুই রাকাত ফরজ নামাজ আদায় করার নিয়ত করছি। আল্লাহু আকবার।",
    transliteration: "Nawaitu an usalliya lillahi ta'ala rak'atay salatil fajri fardullahi ta'ala mutawajjihan ila jihatil ka'batish sharifati Allahu Akbar",
    transliterationBn: "নাওয়াইতু আন উসাল্লিয়া লিল্লাহি তা'আলা রাকা'তাই সালাতিল ফাজরি ফারদুল্লাহি তা'আলা মুতাওয়াজ্জিহান ইলা জিহাতিল কা'বাতিশ শারীফাতি আল্লাহু আকবার",
  },
  {
    id: "dhuhr",
    name: "Dhuhr",
    nameBn: "যোহর",
    rakats: "4 Farz",
    rakatsBn: "৪ রাকাত ফরজ",
    arabic: "نَوَيْتُ أَنْ أُصَلِّيَ لِلَّهِ تَعَالَىٰ أَرْبَعَ رَكَعَاتِ صَلَاةِ الظُّهْرِ فَرْضُ اللَّهِ تَعَالَىٰ مُتَوَجِّهًا إِلَىٰ جِهَةِ الْكَعْبَةِ الشَّرِيفَةِ اللَّهُ أَكْبَرُ",
    meaning: "I intend to pray four rakats of Dhuhr Farz prayer for Allah facing the Kaaba. Allahu Akbar.",
    meaningBn: "আমি কেবলামুখী হয়ে আল্লাহর ওয়াস্তে যোহরের চার রাকাত ফরজ নামাজ আদায় করার নিয়ত করছি। আল্লাহু আকবার।",
    transliteration: "Nawaitu an usalliya lillahi ta'ala arba'a raka'ati salatidh dhuhri fardullahi ta'ala mutawajjihan ila jihatil ka'batish sharifati Allahu Akbar",
    transliterationBn: "নাওয়াইতু আন উসাল্লিয়া লিল্লাহি তা'আলা আরবা'আ রাকা'আতি সালাতিয যুহরি ফারদুল্লাহি তা'আলা মুতাওয়াজ্জিহান ইলা জিহাতিল কা'বাতিশ শারীফাতি আল্লাহু আকবার",
  },
  {
    id: "asr",
    name: "Asr",
    nameBn: "আসর",
    rakats: "4 Farz",
    rakatsBn: "৪ রাকাত ফরজ",
    arabic: "نَوَيْتُ أَنْ أُصَلِّيَ لِلَّهِ تَعَالَىٰ أَرْبَعَ رَكَعَاتِ صَلَاةِ الْعَصْرِ فَرْضُ اللَّهِ تَعَالَىٰ مُتَوَجِّهًا إِلَىٰ جِهَةِ الْكَعْبَةِ الشَّرِيفَةِ اللَّهُ أَكْبَرُ",
    meaning: "I intend to pray four rakats of Asr Farz prayer for Allah facing the Kaaba. Allahu Akbar.",
    meaningBn: "আমি কেবলামুখী হয়ে আল্লাহর ওয়াস্তে আসরের চার রাকাত ফরজ নামাজ আদায় করার নিয়ত করছি। আল্লাহু আকবার।",
    transliteration: "Nawaitu an usalliya lillahi ta'ala arba'a raka'ati salatil asri fardullahi ta'ala mutawajjihan ila jihatil ka'batish sharifati Allahu Akbar",
    transliterationBn: "নাওয়াইতু আন উসাল্লিয়া লিল্লাহি তা'আলা আরবা'আ রাকা'আতি সালাতিল আসরি ফারদুল্লাহি তা'আলা মুতাওয়াজ্জিহান ইলা জিহাতিল কা'বাতিশ শারীফাতি আল্লাহু আকবার",
  },
  {
    id: "maghrib",
    name: "Maghrib",
    nameBn: "মাগরিব",
    rakats: "3 Farz",
    rakatsBn: "৩ রাকাত ফরজ",
    arabic: "نَوَيْتُ أَنْ أُصَلِّيَ لِلَّهِ تَعَالَىٰ ثَلَاثَ رَكَعَاتِ صَلَاةِ الْمَغْرِبِ فَرْضُ اللَّهِ تَعَالَىٰ مُتَوَجِّهًا إِلَىٰ جِهَةِ الْكَعْبَةِ الشَّرِيفَةِ اللَّهُ أَكْبَرُ",
    meaning: "I intend to pray three rakats of Maghrib Farz prayer for Allah facing the Kaaba. Allahu Akbar.",
    meaningBn: "আমি কেবলামুখী হয়ে আল্লাহর ওয়াস্তে মাগরিবের তিন রাকাত ফরজ নামাজ আদায় করার নিয়ত করছি। আল্লাহু আকবার।",
    transliteration: "Nawaitu an usalliya lillahi ta'ala thalatha raka'ati salatil maghribi fardullahi ta'ala mutawajjihan ila jihatil ka'batish sharifati Allahu Akbar",
    transliterationBn: "নাওয়াইতু আন উসাল্লিয়া লিল্লাহি তা'আলা সালাসা রাকা'আতি সালাতিল মাগরিবি ফারদুল্লাহি তা'আলা মুতাওয়াজ্জিহান ইলা জিহাতিল কা'বাতিশ শারীফাতি আল্লাহু আকবার",
  },
  {
    id: "isha",
    name: "Isha",
    nameBn: "ইশা",
    rakats: "4 Farz",
    rakatsBn: "৪ রাকাত ফরজ",
    arabic: "نَوَيْتُ أَنْ أُصَلِّيَ لِلَّهِ تَعَالَىٰ أَرْبَعَ رَكَعَاتِ صَلَاةِ الْعِشَاءِ فَرْضُ اللَّهِ تَعَالَىٰ مُتَوَجِّهًا إِلَىٰ جِهَةِ الْكَعْبَةِ الشَّرِيفَةِ اللَّهُ أَكْبَرُ",
    meaning: "I intend to pray four rakats of Isha Farz prayer for Allah facing the Kaaba. Allahu Akbar.",
    meaningBn: "আমি কেবলামুখী হয়ে আল্লাহর ওয়াস্তে ইশার চার রাকাত ফরজ নামাজ আদায় করার নিয়ত করছি। আল্লাহু আকবার।",
    transliteration: "Nawaitu an usalliya lillahi ta'ala arba'a raka'ati salatil isha'i fardullahi ta'ala mutawajjihan ila jihatil ka'batish sharifati Allahu Akbar",
    transliterationBn: "নাওয়াইতু আন উসাল্লিয়া লিল্লাহি তা'আলা আরবা'আ রাকা'আতি সালাতিল ইশায়ি ফারদুল্লাহি তা'আলা মুতাওয়াজ্জিহান ইলা জিহাতিল কা'বাতিশ শারীফাতি আল্লাহু আকবার",
  },
  {
    id: "witr",
    name: "Witr",
    nameBn: "বিতর",
    rakats: "3 Wajib",
    rakatsBn: "৩ রাকাত ওয়াজিব",
    note: "(Wajib according to Hanafi fiqh; other schools: confirmed sunnah)",
    noteBn: "(হানাফি ফিকহে ওয়াজিব; অন্যান্য মাযহাবে: সুন্নতে মুয়াক্কাদা)",
    arabic: "نَوَيْتُ أَنْ أُصَلِّيَ لِلَّهِ تَعَالَىٰ ثَلَاثَ رَكَعَاتِ صَلَاةِ الْوِتْرِ وَاجِبُ اللَّهِ تَعَالَىٰ مُتَوَجِّهًا إِلَىٰ جِهَةِ الْكَعْبَةِ الشَّرِيفَةِ اللَّهُ أَكْبَرُ",
    meaning: "I intend to pray three rakats of Witr Wajib prayer for Allah facing the Kaaba. Allahu Akbar.",
    meaningBn: "আমি কেবলামুখী হয়ে আল্লাহর ওয়াস্তে বিতরের তিন রাকাত ওয়াজিব নামাজ আদায় করার নিয়ত করছি। আল্লাহু আকবার।",
    transliteration: "Nawaitu an usalliya lillahi ta'ala thalatha raka'ati salatil witri wajibullahi ta'ala mutawajjihan ila jihatil ka'batish sharifati Allahu Akbar",
    transliterationBn: "নাওয়াইতু আন উসাল্লিয়া লিল্লাহি তা'আলা সালাসা রাকা'আতি সালাতিল বিতরি ওয়াজিবুল্লাহি তা'আলা মুতাওয়াজ্জিহান ইলা জিহাতিল কা'বাতিশ শারীফাতি আল্লাহু আকবার",
  },
  {
    id: "sunnah",
    name: "Sunnah",
    nameBn: "সুন্নত",
    rakats: "2/4 Sunnah",
    rakatsBn: "২/৪ রাকাত সুন্নত",
    arabic: "نَوَيْتُ أَنْ أُصَلِّيَ لِلَّهِ تَعَالَىٰ رَكْعَتَيْ صَلَاةِ السُّنَّةِ سُنَّةُ رَسُولِ اللَّهِ تَعَالَىٰ مُتَوَجِّهًا إِلَىٰ جِهَةِ الْكَعْبَةِ الشَّرِيفَةِ اللَّهُ أَكْبَرُ",
    meaning: "I intend to pray Sunnah prayer for Allah following the Sunnah of Rasulullah facing the Kaaba. Allahu Akbar.",
    meaningBn: "আমি কেবলামুখী হয়ে আল্লাহর ওয়াস্তে রাসূলুল্লাহ (সাঃ) এর সুন্নত নামাজ আদায় করার নিয়ত করছি। আল্লাহু আকবার।",
    transliteration: "Nawaitu an usalliya lillahi ta'ala rak'atay salatis sunnati sunnatu rasulillahi ta'ala mutawajjihan ila jihatil ka'batish sharifati Allahu Akbar",
    transliterationBn: "নাওয়াইতু আন উসাল্লিয়া লিল্লাহি তা'আলা রাকা'তাই সালাতিস সুন্নাতি সুন্নাতু রাসূলিল্লাহি তা'আলা মুতাওয়াজ্জিহান ইলা জিহাতিল কা'বাতিশ শারীফাতি আল্লাহু আকবার",
  },
  {
    id: "nafl",
    name: "Nafl",
    nameBn: "নফল",
    rakats: "2 Nafl",
    rakatsBn: "২ রাকাত নফল",
    arabic: "نَوَيْتُ أَنْ أُصَلِّيَ لِلَّهِ تَعَالَىٰ رَكْعَتَيْ صَلَاةِ النَّفْلِ مُتَوَجِّهًا إِلَىٰ جِهَةِ الْكَعْبَةِ الشَّرِيفَةِ اللَّهُ أَكْبَرُ",
    meaning: "I intend to pray two rakats of Nafl prayer for Allah facing the Kaaba. Allahu Akbar.",
    meaningBn: "আমি কেবলামুখী হয়ে আল্লাহর ওয়াস্তে দুই রাকাত নফল নামাজ আদায় করার নিয়ত করছি। আল্লাহু আকবার।",
    transliteration: "Nawaitu an usalliya lillahi ta'ala rak'atay salatin nafli mutawajjihan ila jihatil ka'batish sharifati Allahu Akbar",
    transliterationBn: "নাওয়াইতু আন উসাল্লিয়া লিল্লাহি তা'আলা রাকা'তাই সালাতিন নাফলি মুতাওয়াজ্জিহান ইলা জিহাতিল কা'বাতিশ শারীফাতি আল্লাহু আকবার",
  },
  {
    id: "tahajjud",
    name: "Tahajjud",
    nameBn: "তাহাজ্জুদ",
    rakats: "2-12 Nafl",
    rakatsBn: "২-১২ রাকাত নফল",
    arabic: "نَوَيْتُ أَنْ أُصَلِّيَ لِلَّهِ تَعَالَىٰ رَكْعَتَيْ صَلَاةِ التَّهَجُّدِ مُتَوَجِّهًا إِلَىٰ جِهَةِ الْكَعْبَةِ الشَّرِيفَةِ اللَّهُ أَكْبَرُ",
    meaning: "I intend to pray two rakats of Tahajjud prayer for Allah facing the Kaaba. Allahu Akbar.",
    meaningBn: "আমি কেবলামুখী হয়ে আল্লাহর ওয়াস্তে তাহাজ্জুদের দুই রাকাত নামাজ আদায় করার নিয়ত করছি। আল্লাহু আকবার।",
    transliteration: "Nawaitu an usalliya lillahi ta'ala rak'atay salatit tahajjudi mutawajjihan ila jihatil ka'batish sharifati Allahu Akbar",
    transliterationBn: "নাওয়াইতু আন উসাল্লিয়া লিল্লাহি তা'আলা রাকা'তাই সালাতিত তাহাজ্জুদি মুতাওয়াজ্জিহান ইলা জিহাতিল কা'বাতিশ শারীফাতি আল্লাহু আকবার",
  },
  {
    id: "istikhara",
    name: "Istikhara",
    nameBn: "ইস্তিখারা",
    rakats: "2 Nafl",
    rakatsBn: "২ রাকাত নফল",
    arabic: "نَوَيْتُ أَنْ أُصَلِّيَ لِلَّهِ تَعَالَىٰ رَكْعَتَيْ صَلَاةِ الاِسْتِخَارَةِ مُتَوَجِّهًا إِلَىٰ جِهَةِ الْكَعْبَةِ الشَّرِيفَةِ اللَّهُ أَكْبَرُ",
    meaning: "I intend to pray two rakats of Istikhara prayer for Allah facing the Kaaba. Allahu Akbar.",
    meaningBn: "আমি কেবলামুখী হয়ে আল্লাহর ওয়াস্তে ইস্তিখারার দুই রাকাত নামাজ আদায় করার নিয়ত করছি। আল্লাহু আকবার।",
    transliteration: "Nawaitu an usalliya lillahi ta'ala rak'atay salatil istikharati mutawajjihan ila jihatil ka'batish sharifati Allahu Akbar",
    transliterationBn: "নাওয়াইতু আন উসাল্লিয়া লিল্লাহি তা'আলা রাকা'তাই সালাতিল ইস্তিখারাতি মুতাওয়াজ্জিহান ইলা জিহাতিল কা'বাতিশ শারীফাতি আল্লাহু আকবার",
  },
  {
    id: "eid-ul-fitr",
    name: "Eid ul-Fitr",
    nameBn: "ঈদুল ফিতর",
    rakats: "2 Wajib",
    rakatsBn: "২ রাকাত ওয়াজিব",
    note: "(Wajib and six additional takbirs according to Hanafi fiqh. Other schools: Eid prayer is a confirmed sunnah (Shafi'i/Maliki) or communal obligation (Hanbali), with 12 (7+5) or 11 (6+5) additional takbirs — counting conventions differ.)",
    noteBn: "(হানাফি ফিকহে ওয়াজিব ও ছয় অতিরিক্ত তাকবির। অন্যান্য মাযহাবে: ঈদের নামাজ সুন্নতে মুয়াক্কাদা (শাফেয়ি/মালেকি) বা ফরজে কিফায়া (হাম্বলি); অতিরিক্ত তাকবির ১২ (৭+৫) বা ১১ (৬+৫) — গণনার পদ্ধতি ভিন্ন।)",
    arabic: "نَوَيْتُ أَنْ أُصَلِّيَ لِلَّهِ تَعَالَىٰ رَكْعَتَيْ صَلَاةِ عِيدِ الْفِطْرِ مَعَ سِتِّ تَكْبِيرَاتٍ وَاجِبُ اللَّهِ تَعَالَىٰ مُتَوَجِّهًا إِلَىٰ جِهَةِ الْكَعْبَةِ الشَّرِيفَةِ اللَّهُ أَكْبَرُ",
    meaning: "I intend to pray two rakats of Eid ul-Fitr Wajib prayer with six additional takbirs for Allah facing the Kaaba. Allahu Akbar.",
    meaningBn: "আমি কেবলামুখী হয়ে আল্লাহর ওয়াস্তে ছয় তাকবিরের সাথে ঈদুল ফিতরের দুই রাকাত ওয়াজিব নামাজ আদায় করার নিয়ত করছি। আল্লাহু আকবার।",
    transliteration: "Nawaitu an usalliya lillahi ta'ala rak'atay salati eidil fitri ma'a sitti takbiratin wajibullahi ta'ala mutawajjihan ila jihatil ka'batish sharifati Allahu Akbar",
    transliterationBn: "নাওয়াইতু আন উসাল্লিয়া লিল্লাহি তা'আলা রাকা'তাই সালাতি ঈদিল ফিতরি মা'আ সিত্তি তাকবিরাতিন ওয়াজিবুল্লাহি তা'আলা মুতাওয়াজ্জিহান ইলা জিহাতিল কা'বাতিশ শারীফাতি আল্লাহু আকবার",
  },
  {
    id: "eid-ul-adha",
    name: "Eid ul-Adha",
    nameBn: "ঈদুল আযহা",
    rakats: "2 Wajib",
    rakatsBn: "২ রাকাত ওয়াজিব",
    note: "(Wajib and six additional takbirs according to Hanafi fiqh. Other schools: Eid prayer is a confirmed sunnah (Shafi'i/Maliki) or communal obligation (Hanbali), with 12 (7+5) or 11 (6+5) additional takbirs — counting conventions differ.)",
    noteBn: "(হানাফি ফিকহে ওয়াজিব ও ছয় অতিরিক্ত তাকবির। অন্যান্য মাযহাবে: ঈদের নামাজ সুন্নতে মুয়াক্কাদা (শাফেয়ি/মালেকি) বা ফরজে কিফায়া (হাম্বলি); অতিরিক্ত তাকবির ১২ (৭+৫) বা ১১ (৬+৫) — গণনার পদ্ধতি ভিন্ন।)",
    arabic: "نَوَيْتُ أَنْ أُصَلِّيَ لِلَّهِ تَعَالَىٰ رَكْعَتَيْ صَلَاةِ عِيدِ الْأَضْحَىٰ مَعَ سِتِّ تَكْبِيرَاتٍ وَاجِبُ اللَّهِ تَعَالَىٰ مُتَوَجِّهًا إِلَىٰ جِهَةِ الْكَعْبَةِ الشَّرِيفَةِ اللَّهُ أَكْبَرُ",
    meaning: "I intend to pray two rakats of Eid ul-Adha Wajib prayer with six additional takbirs for Allah facing the Kaaba. Allahu Akbar.",
    meaningBn: "আমি কেবলামুখী হয়ে আল্লাহর ওয়াস্তে ছয় তাকবিরের সাথে ঈদুল আযহার দুই রাকাত ওয়াজিব নামাজ আদায় করার নিয়ত করছি। আল্লাহু আকবার।",
    transliteration: "Nawaitu an usalliya lillahi ta'ala rak'atay salati eidil adha ma'a sitti takbiratin wajibullahi ta'ala mutawajjihan ila jihatil ka'batish sharifati Allahu Akbar",
    transliterationBn: "নাওয়াইতু আন উসাল্লিয়া লিল্লাহি তা'আলা রাকা'তাই সালাতি ঈদিল আদহা মা'আ সিত্তি তাকবিরাতিন ওয়াজিবুল্লাহি তা'আলা মুতাওয়াজ্জিহান ইলা জিহাতিল কা'বাতিশ শারীফাতি আল্লাহু আকবার",
  },
  {
    id: "taraweeh",
    name: "Taraweeh",
    nameBn: "তারাবীহ",
    rakats: "2 Sunnah (20 Rakats)",
    rakatsBn: "২ রাকাত সুন্নত (মোট ২০ রাকাত)",
    arabic: "نَوَيْتُ أَنْ أُصَلِّيَ لِلَّهِ تَعَالَىٰ رَكْعَتَيْ صَلَاةِ التَّرَاوِيحِ سُنَّةُ رَسُولِ اللَّهِ تَعَالَىٰ مُتَوَجِّهًا إِلَىٰ جِهَةِ الْكَعْبَةِ الشَّرِيفَةِ اللَّهُ أَكْبَرُ",
    meaning: "I intend to pray two rakats of Taraweeh Sunnah prayer following the Sunnah of Rasulullah for Allah facing the Kaaba. Allahu Akbar.",
    meaningBn: "আমি কেবলামুখী হয়ে আল্লাহর ওয়াস্তে রাসূলুল্লাহ (সাঃ) এর সুন্নত তারাবীহ নামাজের দুই রাকাত আদায় করার নিয়ত করছি। আল্লাহু আকবার।",
    transliteration: "Nawaitu an usalliya lillahi ta'ala rak'atay salatit tarawihi sunnatu rasulillahi ta'ala mutawajjihan ila jihatil ka'batish sharifati Allahu Akbar",
    transliterationBn: "নাওয়াইতু আন উসাল্লিয়া লিল্লাহি তা'আলা রাকা'তাই সালাতিত তারাবীহি সুন্নাতু রাসূলিল্লাহি তা'আলা মুতাওয়াজ্জিহান ইলা জিহাতিল কা'বাতিশ শারীফাতি আল্লাহু আকবার",
  },
  {
    id: "lailatul-qadr",
    name: "Lailatul Qadr (Shab-e-Qadr)",
    nameBn: "লাইলাতুল কদর (শবে কদর)",
    rakats: "2-12 Nafl",
    rakatsBn: "২-১২ রাকাত নফল",
    note: "(Voluntary night prayer on Laylat al-Qadr — there is no distinct prescribed prayer for the night itself.)",
    noteBn: "(লাইলাতুল কদরের রাতে নফল নামাজ — এই রাতের জন্য কোনো পৃথক নির্ধারিত নামাজ নেই।)",
    arabic: "نَوَيْتُ أَنْ أُصَلِّيَ لِلَّهِ تَعَالَىٰ رَكْعَتَيْ صَلَاةِ لَيْلَةِ الْقَدْرِ مُتَوَجِّهًا إِلَىٰ جِهَةِ الْكَعْبَةِ الشَّرِيفَةِ اللَّهُ أَكْبَرُ",
    meaning: "I intend to pray two rakats of Lailatul Qadr Nafl prayer for Allah facing the Kaaba. Allahu Akbar.",
    meaningBn: "আমি কেবলামুখী হয়ে আল্লাহর ওয়াস্তে লাইলাতুল কদরের দুই রাকাত নফল নামাজ আদায় করার নিয়ত করছি। আল্লাহু আকবার।",
    transliteration: "Nawaitu an usalliya lillahi ta'ala rak'atay salati lailatil qadri mutawajjihan ila jihatil ka'batish sharifati Allahu Akbar",
    transliterationBn: "নাওয়াইতু আন উসাল্লিয়া লিল্লাহি তা'আলা রাকা'তাই সালাতি লাইলাতিল ক্বাদরি মুতাওয়াজ্জিহান ইলা জিহাতিল কা'বাতিশ শারীফাতি আল্লাহু আকবার",
  },
];

// Prayer Learning Data
const PRAYER_LEARNING = {
  whatIsPrayer: {
    title: "What is Salah (Prayer)?",
    titleBn: "সালাত (নামাজ) কী?",
    content: [
      "Salah is the second pillar of Islam and the most important act of worship after Shahada.",
      "It is a direct connection between the worshipper and Allah.",
      "Muslims pray five times a day: Fajr, Dhuhr, Asr, Maghrib, and Isha.",
      "Prayer purifies the soul and keeps believers away from evil.",
    ],
    contentBn: [
      "সালাত ইসলামের দ্বিতীয় স্তম্ভ এবং শাহাদার পর সবচেয়ে গুরুত্বপূর্ণ ইবাদত।",
      "এটি বান্দা এবং আল্লাহর মধ্যে সরাসরি সংযোগ।",
      "মুসলমানরা দিনে পাঁচ ওয়াক্ত নামাজ পড়ে: ফজর, যোহর, আসর, মাগরিব এবং ইশা।",
      "নামাজ আত্মাকে পবিত্র করে এবং মুমিনদের মন্দ কাজ থেকে দূরে রাখে।",
    ],
  },
  farz: {
    title: "Farz (Obligatory) of Prayer — Hanafi Fiqh",
    titleBn: "নামাজের ফরজসমূহ — হানাফি ফিকহ",
    items: [
      "Takbir Tahrimah - Saying 'Allahu Akbar' to begin",
      "Qiyam - Standing position",
      "Qira'at - Reciting from the Quran",
      "Ruku - Bowing position",
      "Sujood - Prostration (twice in each rakat)",
      "Qa'dah Akhirah - Final sitting position",
    ],
    itemsBn: [
      "তাকবীরে তাহরীমা - 'আল্লাহু আকবার' বলে শুরু করা",
      "কিয়াম - দাঁড়ানো অবস্থা",
      "কিরাআত - কুরআন তেলাওয়াত",
      "রুকু - ঝুঁকে যাওয়া",
      "সিজদা - প্রতি রাকাতে দুইবার সিজদা করা",
      "কাদাহ আখিরাহ - শেষ বৈঠক",
    ],
  },
  wajib: {
    title: "Wajib (Necessary) of Prayer — Hanafi Fiqh",
    titleBn: "নামাজের ওয়াজিবসমূহ — হানাফি ফিকহ",
    items: [
      "Reciting Surah Fatiha in every rakat (a pillar of prayer in other schools)",
      "Reciting a Surah after Fatiha in first two rakats",
      "Performing Ruku and Sujood in order",
      "Maintaining tranquility in each position",
      "Sitting for Tashahhud",
      "Saying Salam to end the prayer (one salam suffices in other schools)",
    ],
    itemsBn: [
      "প্রতি রাকাতে সূরা ফাতিহা পড়া (অন্যান্য মাযহাবে নামাজের রুকন)",
      "প্রথম দুই রাকাতে ফাতিহার পর একটি সূরা পড়া",
      "যথাক্রমে রুকু ও সিজদা করা",
      "প্রতিটি অবস্থানে স্থিরতা বজায় রাখা",
      "তাশাহুদের জন্য বসা",
      "সালাম দিয়ে নামাজ শেষ করা (অন্যান্য মাযহাবে এক সালামই যথেষ্ট)",
    ],
  },
  sunnah: {
    title: "Sunnah of Prayer — Hanafi Fiqh",
    titleBn: "নামাজের সুন্নতসমূহ — হানাফি ফিকহ",
    items: [
      "Raising hands at the opening takbir (in Hanafi fiqh)",
      "Placing the right hand over the left below the navel (for men); on the chest (for women)",
      "Looking toward the place of prostration (as an etiquette of prayer; other schools differ)",
      "Reciting Sana (opening dua)",
      "Saying 'Ameen' after Fatiha (silently, in Hanafi fiqh)",
      "Saying Takbir when changing positions (obligatory in the Hanbali school)",
    ],
    itemsBn: [
      "প্রথম তাকবিরের সময় হাত তোলা (হানাফি ফিকহে)",
      "ডান হাত বাম হাতের উপর রাখা — পুরুষরা নাভির নিচে, মহিলারা বুকের উপর",
      "সিজদার স্থানের দিকে দৃষ্টি রাখা (নামাজের আদব হিসেবে; অন্যান্য মাযহাবে মতভেদ আছে)",
      "সানা (শুরুর দোয়া) পড়া",
      "ফাতিহার পর 'আমীন' বলা (হানাফি ফিকহে নীরবে)",
      "অবস্থান পরিবর্তনের সময় তাকবির বলা (হাম্বলি মাযহাবে ওয়াজিব)",
    ],
  },
  breaks: {
    title: "What Breaks Prayer",
    titleBn: "যা নামাজ ভঙ্গ করে",
    items: [
      "Speaking intentionally (in Hanafi fiqh, even unintentional speech can break the prayer)",
      "Eating or drinking",
      "Laughing loudly (smiling does not break the prayer; in Hanafi fiqh, loud laughter also breaks wudu, while most other scholars hold it breaks only the prayer)",
      "Turning away from Qibla",
      "Leaving out any Farz act",
      "Breaking Wudu during prayer",
    ],
    itemsBn: [
      "ইচ্ছাকৃতভাবে কথা বলা (হানাফি ফিকহে অনিচ্ছাকৃত কথাও নামাজ ভঙ্গ করতে পারে)",
      "খাওয়া বা পান করা",
      "উচ্চস্বরে হাসা (মুচকি হাসিতে নামাজ ভাঙে না; হানাফি ফিকহে উচ্চস্বরে হাসলে অজুও ভাঙে, তবে অধিকাংশ আলেমের মতে শুধু নামাজ ভাঙে)",
      "কিবলা থেকে ফিরে যাওয়া",
      "কোনো ফরজ কাজ ছেড়ে দেওয়া",
      "নামাজের মধ্যে অজু ভেঙে যাওয়া",
    ],
  },
};

// Prayer Steps Data
const PRAYER_STEPS = [
  {
    id: 1,
    name: "Takbir Tahrimah",
    nameBn: "তাকবীরে তাহরীমা",
    icon: "🙌",
    action: "Raise both hands to ear level and say Allahu Akbar",
    actionBn: "দুই হাত কানের লতি পর্যন্ত তুলে আল্লাহু আকবার বলুন",
    recitation: "اللَّهُ أَكْبَرُ",
    recitationMeaning: "Allahu Akbar (Allah is the Greatest)",
    recitationMeaningBn: "আল্লাহু আকবার (আল্লাহ সর্বশ্রেষ্ঠ)",
    explanation: "This opening takbir marks the beginning of prayer. Raise your hands with palms facing Qibla, fingers spread naturally.",
    explanationBn: "এই প্রথম তাকবির দিয়ে নামাজ শুরু হয়। হাতের তালু কিবলামুখী করে আঙুল স্বাভাবিকভাবে ছড়িয়ে তুলুন।",
  },
  {
    id: 2,
    name: "Qiyam (Standing)",
    nameBn: "কিয়াম",
    icon: "🧍",
    action: "Place the right hand over the left below the navel (men) or on the chest (women), and look at the place of Sujood",
    actionBn: "পুরুষরা নাভির নিচে (মহিলারা বুকের উপর) ডান হাত বাম হাতের উপর রাখুন এবং সিজদার স্থানে দৃষ্টি রাখুন",
    recitation: "Recite Sana, then Surah Fatiha, then another Surah",
    recitationMeaning: "Begin with opening supplication, then Al-Fatiha, then any Surah",
    recitationMeaningBn: "শুরুতে সানা, তারপর সূরা ফাতিহা, তারপর যেকোনো সূরা পড়ুন",
    explanation: "Stand straight and still. Focus your gaze on the spot where you will prostrate.",
    explanationBn: "সোজা ও স্থির হয়ে দাঁড়ান। যেখানে সিজদা করবেন সেদিকে দৃষ্টি রাখুন।",
  },
  {
    id: 3,
    name: "Ruku (Bowing)",
    nameBn: "রুকু",
    icon: "🙇",
    action: "Bow down with hands on knees, back straight",
    actionBn: "হাত হাঁটুতে রেখে, পিঠ সোজা রেখে ঝুঁকুন",
    recitation: "سُبْحَانَ رَبِّيَ الْعَظِيمِ",
    recitationMeaning: "Subhana Rabbiyal Azeem (Glory be to my Lord, the Magnificent) - 3 times",
    recitationMeaningBn: "সুবহানা রাব্বিয়াল আযীম (মহিমান্বিত আমার রবের পবিত্রতা) - ৩ বার",
    explanation: "Bend forward until your back is parallel to the ground. Keep your head in line with your back.",
    explanationBn: "পিঠ মাটির সমান্তরাল না হওয়া পর্যন্ত সামনে ঝুঁকুন। মাথা পিঠের সাথে সমান রাখুন।",
  },
  {
    id: 4,
    name: "Qawmah (Rising)",
    nameBn: "কওমা",
    icon: "🧍",
    action: "Rise from Ruku saying Sami Allahu liman hamidah",
    actionBn: "সামিআল্লাহু লিমান হামিদাহ বলে রুকু থেকে উঠুন",
    recitation: "سَمِعَ اللَّهُ لِمَنْ حَمِدَهُ - رَبَّنَا لَكَ الْحَمْدُ",
    recitationMeaning: "Sami Allahu liman hamidah, Rabbana lakal hamd (Allah hears who praises Him. Our Lord, praise be to You)",
    recitationMeaningBn: "সামিআল্লাহু লিমান হামিদাহ, রাব্বানা লাকাল হামদ (আল্লাহ তাঁর প্রশংসাকারীর প্রশংসা শোনেন। হে আমাদের রব, সকল প্রশংসা আপনার)",
    explanation: "Stand up straight with arms at your sides. Pause briefly in this position.",
    explanationBn: "হাত দু'পাশে রেখে সোজা হয়ে দাঁড়ান। এই অবস্থায় কিছুক্ষণ থামুন।",
  },
  {
    id: 5,
    name: "Sujood (Prostration)",
    nameBn: "সিজদা",
    icon: "🙏",
    action: "Prostrate with forehead, nose, palms, knees, and toes touching the ground",
    actionBn: "কপাল, নাক, হাতের তালু, হাঁটু ও পায়ের আঙুল মাটিতে রেখে সিজদা করুন",
    recitation: "سُبْحَانَ رَبِّيَ الْأَعْلَىٰ",
    recitationMeaning: "Subhana Rabbiyal A'la (Glory be to my Lord, the Most High) - 3 times",
    recitationMeaningBn: "সুবহানা রাব্বিয়াল আ'লা (সর্বোচ্চ আমার রবের পবিত্রতা) - ৩ বার",
    explanation: "Seven parts must touch the ground: forehead with nose, both palms, both knees, and toes of both feet.",
    explanationBn: "সাতটি অঙ্গ মাটিতে স্পর্শ করতে হবে: কপাল ও নাক, দুই হাতের তালু, দুই হাঁটু, দুই পায়ের আঙুল।",
  },
  {
    id: 6,
    name: "Jalsa (Sitting)",
    nameBn: "জলসা",
    icon: "🧎",
    action: "Sit briefly between the two Sujood",
    actionBn: "দুই সিজদার মাঝে সংক্ষেপে বসুন",
    recitation: "رَبِّ اغْفِرْ لِي",
    recitationMeaning: "Rabbighfirli (My Lord, forgive me)",
    recitationMeaningBn: "রাব্বিগফিরলী (হে আমার রব, আমাকে ক্ষমা করুন)",
    explanation: "Sit on your left foot with right foot upright. Pause briefly before the second Sujood.",
    explanationBn: "বাম পায়ের উপর বসুন, ডান পা খাড়া রাখুন। দ্বিতীয় সিজদার আগে সংক্ষেপে বিরতি নিন।",
  },
  {
    id: 7,
    name: "Second Sujood",
    nameBn: "দ্বিতীয় সিজদা",
    icon: "🙏",
    action: "Perform second prostration exactly like the first",
    actionBn: "প্রথম সিজদার মতো দ্বিতীয় সিজদা করুন",
    recitation: "سُبْحَانَ رَبِّيَ الْأَعْلَىٰ",
    recitationMeaning: "Subhana Rabbiyal A'la (Glory be to my Lord, the Most High) - 3 times",
    recitationMeaningBn: "সুবহানা রাব্বিয়াল আ'লা (সর্বোচ্চ আমার রবের পবিত্রতা) - ৩ বার",
    explanation: "This completes one rakat. Rise for the next rakat or proceed to Tashahhud if it's the final sitting.",
    explanationBn: "এতে এক রাকাত সম্পন্ন হয়। পরবর্তী রাকাতের জন্য উঠুন অথবা শেষ বৈঠক হলে তাশাহুদে যান।",
  },
  {
    id: 8,
    name: "Tashahhud",
    nameBn: "তাশাহুদ",
    icon: "☝️",
    action: "Sit and recite At-Tahiyyat with index finger raised",
    actionBn: "বসে শাহাদাত আঙুল উঁচু করে আত্তাহিয়্যাতু পড়ুন",
    recitation: "التَّحِيَّاتُ لِلَّهِ وَالصَّلَوَاتُ وَالطَّيِّبَاتُ...",
    recitationMeaning: "At-Tahiyyatu lillahi was-salawatu wat-tayyibat...",
    recitationMeaningBn: "আত্তাহিয়্যাতু লিল্লাহি ওয়াস সালাওয়াতু ওয়াত তায়্যিবাতু...",
    explanation: "In the final sitting, recite Tashahhud, Durood, and a final dua before ending the prayer.",
    explanationBn: "শেষ বৈঠকে তাশাহুদ, দুরুদ এবং শেষ দোয়া পড়ে নামাজ শেষ করুন।",
  },
  {
    id: 9,
    name: "Salam",
    nameBn: "সালাম",
    icon: "👋",
    action: "Turn head right then left saying Assalamu Alaikum wa Rahmatullah",
    actionBn: "আসসালামু আলাইকুম ওয়া রাহমাতুল্লাহ বলে প্রথমে ডানে তারপর বামে মাথা ঘোরান",
    recitation: "السَّلَامُ عَلَيْكُمْ وَرَحْمَةُ اللَّهِ",
    recitationMeaning: "Assalamu Alaikum wa Rahmatullah (Peace and mercy of Allah be upon you)",
    recitationMeaningBn: "আসসালামু আলাইকুম ওয়া রাহমাতুল্লাহ (আপনার উপর আল্লাহর শান্তি ও রহমত বর্ষিত হোক)",
    explanation: "This ends the prayer. Turn your head to the right shoulder first, then to the left.",
    explanationBn: "এতে নামাজ শেষ হয়। প্রথমে ডান কাঁধের দিকে, তারপর বাম কাঁধের দিকে মাথা ঘোরান।",
  },
];

// Prayer Duas Data
// Phase C (2026-10-05): optional madhhab/context note shown under the meaning.
interface DuaEntry {
  id: string; name: string; nameBn: string; arabic: string;
  transliteration: string; transliterationBn: string;
  meaning: string; meaningBn: string;
  note?: string; noteBn?: string;
}
const PRAYER_DUAS: DuaEntry[] = [
  {
    id: "sana",
    name: "Sana (Opening Dua)",
    nameBn: "সানা",
    arabic: "سُبْحَانَكَ اللَّهُمَّ وَبِحَمْدِكَ وَتَبَارَكَ اسْمُكَ وَتَعَالَىٰ جَدُّكَ وَلَا إِلَٰهَ غَيْرُكَ",
    transliteration: "Subhanaka Allahumma wa bihamdika wa tabarakasmuka wa ta'ala jadduka wa la ilaha ghairuk",
    transliterationBn: "সুবহানাকা আল্লাহুম্মা ওয়া বিহামদিকা ওয়া তাবারাকাসমুকা ওয়া তা'আলা জাদ্দুকা ওয়া লা ইলাহা গাইরুক",
    meaning: "Glory be to You, O Allah, and praise be to You. Blessed is Your name and exalted is Your majesty. There is no god but You.",
    meaningBn: "হে আল্লাহ! আপনার পবিত্রতা ও প্রশংসা ঘোষণা করছি। আপনার নাম বরকতময়, আপনার মর্যাদা সুউচ্চ। আপনি ছাড়া কোনো উপাস্য নেই।",
  },
  {
    id: "ruku",
    name: "Ruku Tasbih",
    nameBn: "রুকুর তাসবীহ",
    arabic: "سُبْحَانَ رَبِّيَ الْعَظِيمِ",
    transliteration: "Subhana Rabbiyal Azeem",
    transliterationBn: "সুবহানা রব্বিয়াল আযীম",
    meaning: "Glory be to my Lord, the Magnificent. (Recite 3 times)",
    meaningBn: "আমার মহান রবের পবিত্রতা ঘোষণা করছি। (৩ বার পড়ুন)",
  },
  {
    id: "sujood",
    name: "Sujood Tasbih",
    nameBn: "সিজদার তাসবীহ",
    arabic: "سُبْحَانَ رَبِّيَ الْأَعْلَىٰ",
    transliteration: "Subhana Rabbiyal A'la",
    transliterationBn: "সুবহানা রব্বিয়াল আ'লা",
    meaning: "Glory be to my Lord, the Most High. (Recite 3 times)",
    meaningBn: "আমার সর্বোচ্চ রবের পবিত্রতা ঘোষণা করছি। (৩ বার পড়ুন)",
  },
  {
    id: "tashahhud",
    name: "Tashahhud (At-Tahiyyat)",
    nameBn: "তাশাহুদ",
    arabic: "التَّحِيَّاتُ لِلَّهِ وَالصَّلَوَاتُ وَالطَّيِّبَاتُ السَّلَامُ عَلَيْكَ أَيُّهَا النَّبِيُّ وَرَحْمَةُ اللَّهِ وَبَرَكَاتُهُ السَّلَامُ عَلَيْنَا وَعَلَىٰ عِبَادِ اللَّهِ الصَّالِحِينَ أَشْهَدُ أَنْ لَا إِلَٰهَ إِلَّا اللَّهُ وَأَشْهَدُ أَنَّ مُحَمَّدًا عَبْدُهُ وَرَسُولُهُ",
    transliteration: "At-tahiyyatu lillahi was-salawatu wat-tayyibat. Assalamu 'alayka ayyuhan-nabiyyu wa rahmatullahi wa barakatuh. Assalamu 'alayna wa 'ala 'ibadillahis-salihin. Ash-hadu alla ilaha illallah wa ash-hadu anna Muhammadan 'abduhu wa rasuluh.",
    transliterationBn: "আত্তাহিয়্যাতু লিল্লাহি ওয়াস্‌সালাওয়াতু ওয়াত্তায়্যিবাতু। আস্‌সালামু আলাইকা আইয়্যুহান্নাবিয়্যু ওয়া রাহমাতুল্লাহি ওয়া বারাকাতুহু। আস্‌সালামু আলাইনা ওয়া আলা ইবাদিল্লাহিস্ সালিহীন। আশহাদু আল্লা ইলাহা ইল্লাল্লাহু ওয়া আশহাদু আন্না মুহাম্মাদান আবদুহু ওয়া রাসূলুহু।",
    meaning: "All greetings, prayers, and good things are for Allah. Peace be upon you, O Prophet, and the mercy of Allah and His blessings. Peace be upon us and upon the righteous servants of Allah. I bear witness that there is no god but Allah, and I bear witness that Muhammad is His servant and messenger.",
    meaningBn: "সকল সম্মান, নামাজ ও পবিত্র কথা আল্লাহর জন্য। হে নবী! আপনার উপর শান্তি, আল্লাহর রহমত ও বরকত বর্ষিত হোক। আমাদের ও আল্লাহর নেক বান্দাদের উপর শান্তি বর্ষিত হোক। আমি সাক্ষ্য দিচ্ছি, আল্লাহ ছাড়া কোনো উপাস্য নেই এবং মুহাম্মদ (সাঃ) তাঁর বান্দা ও রাসূল।",
  },
  {
    id: "durood",
    name: "Durood Ibrahim",
    nameBn: "দুরুদ ইব্রাহীম",
    arabic: "اللَّهُمَّ صَلِّ عَلَىٰ مُحَمَّدٍ وَعَلَىٰ آلِ مُحَمَّدٍ كَمَا صَلَّيْتَ عَلَىٰ إِبْرَاهِيمَ وَعَلَىٰ آلِ إِبْرَاهِيمَ إِنَّكَ حَمِيدٌ مَجِيدٌ اللَّهُمَّ بَارِكْ عَلَىٰ مُحَمَّدٍ وَعَلَىٰ آلِ مُحَمَّدٍ كَمَا بَارَكْتَ عَلَىٰ إِبْرَاهِيمَ وَعَلَىٰ آلِ إِبْرَاهِيمَ إِنَّكَ حَمِيدٌ مَجِيدٌ",
    transliteration: "Allahumma salli 'ala Muhammadin wa 'ala ali Muhammadin kama sallayta 'ala Ibrahima wa 'ala ali Ibrahima innaka Hamidum Majid. Allahumma barik 'ala Muhammadin wa 'ala ali Muhammadin kama barakta 'ala Ibrahima wa 'ala ali Ibrahima innaka Hamidum Majid.",
    transliterationBn: "আল্লাহুম্মা সাল্লি আলা মুহাম্মাদিন ওয়া আলা আলি মুহাম্মাদিন কামা সাল্লাইতা আলা ইব্রাহীমা ওয়া আলা আলি ইব্রাহীমা ইন্নাকা হামীদুম মাজীদ। আল্লাহুম্মা বারিক আলা মুহাম্মাদিন ওয়া আলা আলি মুহাম্মাদিন কামা বারাকতা আলা ইব্রাহীমা ওয়া আলা আলি ইব্রাহীমা ইন্নাকা হামীদুম মাজীদ।",
    meaning: "O Allah, send blessings upon Muhammad and upon the family of Muhammad, as You sent blessings upon Ibrahim and the family of Ibrahim. You are indeed Praiseworthy, Glorious. O Allah, bless Muhammad and the family of Muhammad as You blessed Ibrahim and the family of Ibrahim. You are indeed Praiseworthy, Glorious.",
    meaningBn: "হে আল্লাহ! মুহাম্মদ ও তাঁর বংশধরদের উপর রহমত বর্ষণ করুন যেমন ইব্রাহীম ও তাঁর বংশধরদের উপর করেছেন। নিশ্চয়ই আপনি প্রশংসিত, মহিমান্বিত। হে আল্লাহ! মুহাম্মদ ও তাঁর বংশধরদের উপর বরকত দিন যেমন ইব্রাহীম ও তাঁর বংশধরদের উপর দিয়েছেন। নিশ্চয়ই আপনি প্রশংসিত, মহিমান্বিত।",
  },
  {
    id: "dua-masura",
    name: "Dua Masura (Final Dua)",
    nameBn: "দোয়া মাসুরা",
    arabic: "رَبَّنَا آتِنَا فِي الدُّنْيَا حَسَنَةً وَفِي الْآخِرَةِ حَسَنَةً وَقِنَا عَذَابَ النَّارِ",
    transliteration: "Rabbana atina fid-dunya hasanatan wa fil-akhirati hasanatan wa qina 'adhaban-nar",
    transliterationBn: "রব্বানা আতিনা ফিদ্দুনইয়া হাসানাতাও ওয়া ফিল আখিরাতি হাসানাতাও ওয়া ক্বিনা আযাবান্নার",
    meaning: "Our Lord, give us good in this world and good in the Hereafter, and save us from the punishment of the Fire.",
    meaningBn: "হে আমাদের রব! আমাদের দুনিয়াতে কল্যাণ দিন, আখেরাতেও কল্যাণ দিন এবং আমাদের জাহান্নামের আগুন থেকে রক্ষা করুন।",
  },
  {
    id: "lailatul-qadr-dua",
    name: "Dua for Lailatul Qadr",
    nameBn: "লাইলাতুল কদরের দোয়া",
    arabic: "اللَّهُمَّ إِنَّكَ عَفُوٌّ تُحِبُّ الْعَفْوَ فَاعْفُ عَنِّي",
    transliteration: "Allahumma innaka 'afuwwun tuhibbul 'afwa fa'fu 'anni",
    transliterationBn: "আল্লাহুম্মা ইন্নাকা আফুউউন তুহিব্বুল আফওয়া ফা'ফু আন্নি",
    meaning: "O Allah, You are the One Who pardons greatly, and You love to pardon, so pardon me.",
    meaningBn: "হে আল্লাহ! নিশ্চয়ই আপনি ক্ষমাশীল, আপনি ক্ষমা করতে ভালোবাসেন, তাই আমাকে ক্ষমা করুন।",
  },
  {
    id: "taraweeh-dua",
    name: "Tasbih After 4 Rakats of Taraweeh (customary — optional)",
    nameBn: "তারাবীহর ৪ রাকাত পর তাসবীহ (প্রচলিত — ঐচ্ছিক)",
    note: "Quoted by Hanafi jurists (Radd al-Muhtar 2/46) as one suggested form of dhikr between sets of four rak'ats. It is not a Prophetic sunnah and is optional — any dhikr may be recited.",
    noteBn: "হানাফি ফকিহগণ (রদ্দুল মুহতার ২/৪৬) চার রাকাতের মাঝে একটি প্রস্তাবিত জিকির হিসেবে এটি উল্লেখ করেছেন। এটি রাসূলুল্লাহ ﷺ-এর সুন্নত নয় এবং ঐচ্ছিক — যেকোনো জিকির পড়া যায়।",
    arabic: "سُبْحَانَ ذِي الْمُلْكِ وَالْمَلَكُوتِ سُبْحَانَ ذِي الْعِزَّةِ وَالْعَظَمَةِ وَالْهَيْبَةِ وَالْقُدْرَةِ وَالْكِبْرِيَاءِ وَالْجَبَرُوتِ سُبْحَانَ الْمَلِكِ الْحَيِّ الَّذِي لَا يَنَامُ وَلَا يَمُوتُ أَبَدًا سُبُّوحٌ قُدُّوسٌ رَبُّنَا وَرَبُّ الْمَلَائِكَةِ وَالرُّوحِ",
    transliteration: "Subhana dhil mulki wal malakuti, subhana dhil izzati wal azamati wal haibati wal qudrati wal kibriyai wal jabarut. Subhanal malikil hayyilladhi la yanamu wa la yamutu abadan. Subbuhun quddusun rabbuna wa rabbul malaikati war ruh.",
    transliterationBn: "সুবহানা যিল মুলকি ওয়াল মালাকুতি, সুবহানা যিল ইযযাতি ওয়াল আযামাতি ওয়াল হাইবাতি ওয়াল কুদরাতি ওয়াল কিবরিয়াই ওয়াল জাবারুতি। সুবহানাল মালিকিল হাইয়্যিল্লাযী লা ইয়ানামু ওয়া লা ইয়ামুতু আবাদান। সুব্বুহুন কুদ্দুসুন রব্বুনা ওয়া রব্বুল মালায়িকাতি ওয়ার রুহ।",
    meaning: "Glory be to the Owner of Kingdom and Dominion. Glory be to the Owner of Honour, Greatness, Awe, Power, Pride and Majesty. Glory be to the Sovereign, the Living, Who neither sleeps nor dies. Most Holy, Most Pure, our Lord and Lord of the angels and the Spirit.",
    meaningBn: "পবিত্র তিনি যিনি রাজত্ব ও মহিমার অধিকারী। পবিত্র তিনি যিনি সম্মান, মহত্ত্ব, প্রতাপ, শক্তি, বড়ত্ব ও প্রভুত্বের অধিকারী। পবিত্র তিনি যিনি চিরঞ্জীব, যিনি ঘুমান না এবং কখনো মৃত্যুবরণ করেন না। তিনি পবিত্র, মহাপবিত্র, আমাদের রব এবং ফেরেশতাদের ও রূহের রব।",
  },
  {
    id: "dua-qunut",
    name: "Dua Qunut (Witr Prayer) — Hanafi wording",
    nameBn: "দোয়া কুনুত (বিতর নামাজ) — হানাফি পাঠ",
    note: "This is the qunut transmitted from 'Umar ibn al-Khattab (ra), used in the Hanafi school. The Shafi'i and Hanbali schools use the wording taught to al-Hasan ibn 'Ali (ra): 'Allahumma ihdini fiman hadayt…' (Abu Dawud 1425; Tirmidhi 464); the Maliki school has no qunut in Witr.",
    noteBn: "এটি উমর ইবনুল খাত্তাব (রাঃ) থেকে বর্ণিত কুনুত, হানাফি মাযহাবে ব্যবহৃত। শাফেয়ি ও হাম্বলি মাযহাবে আল-হাসান ইবনে আলী (রাঃ)-কে শেখানো পাঠ ব্যবহৃত হয়: 'আল্লাহুম্মা ইহদিনী ফীমান হাদাইত…' (আবু দাউদ ১৪২৫; তিরমিযি ৪৬৪); মালেকি মাযহাবে বিতরে কুনুত নেই।",
    arabic: "اللَّهُمَّ إِنَّا نَسْتَعِينُكَ وَنَسْتَغْفِرُكَ وَنُؤْمِنُ بِكَ وَنَتَوَكَّلُ عَلَيْكَ وَنُثْنِي عَلَيْكَ الْخَيْرَ وَنَشْكُرُكَ وَلَا نَكْفُرُكَ وَنَخْلَعُ وَنَتْرُكُ مَنْ يَفْجُرُكَ اللَّهُمَّ إِيَّاكَ نَعْبُدُ وَلَكَ نُصَلِّي وَنَسْجُدُ وَإِلَيْكَ نَسْعَىٰ وَنَحْفِدُ وَنَرْجُو رَحْمَتَكَ وَنَخْشَىٰ عَذَابَكَ إِنَّ عَذَابَكَ بِالْكُفَّارِ مُلْحِقٌ",
    transliteration: "Allahumma inna nasta'inuka wa nastaghfiruka wa nu'minu bika wa natawakkalu 'alayka wa nuthni 'alaykal khayr. Wa nashkuruka wa la nakfuruka wa nakhla'u wa natruku man yafjuruk. Allahumma iyyaka na'budu wa laka nusalli wa nasjudu wa ilayka nas'a wa nahfidu wa narju rahmataka wa nakhsha 'adhabaka inna 'adhabaka bil kuffari mulhiq.",
    transliterationBn: "আল্লাহুম্মা ইন্না নাসতায়ীনুকা ওয়া নাসতাগফিরুকা ওয়া নু'মিনু বিকা ওয়া নাতাওয়াক্কালু আলাইকা ওয়া নুসনী আলাইকাল খাইর। ওয়া নাশকুরুকা ওয়া লা নাকফুরুকা ওয়া নাখলাউ ওয়া নাতরুকু মাই ইয়াফজুরুক। আল্লাহুম্মা ইয়্যাকা না'বুদু ওয়া লাকা নুসাল্লি ওয়া নাসজুদু ওয়া ইলাইকা নাস'আ ওয়া নাহফিদু ওয়া নারজু রাহমাতাকা ওয়া নাখশা আযাবাকা ইন্না আযাবাকা বিল কুফফারি মুলহিক।",
    meaning: "O Allah! We seek Your help, we ask Your forgiveness, we believe in You, we rely on You, and we praise You for all goodness. We thank You and we are not ungrateful. We reject and abandon anyone who disobeys You. O Allah! You alone we worship, to You we pray and prostrate, and to You we hasten. We hope for Your mercy and fear Your punishment, for surely Your punishment will overtake the disbelievers.",
    meaningBn: "হে আল্লাহ! আমরা আপনার সাহায্য চাই, আপনার কাছে ক্ষমা প্রার্থনা করি, আপনার প্রতি ঈমান রাখি, আপনার উপর ভরসা করি এবং সকল কল্যাণে আপনার প্রশংসা করি। আমরা আপনার শুকরিয়া আদায় করি, অকৃতজ্ঞ হই না। আপনার অবাধ্যদের সাথে সম্পর্ক ত্যাগ করি। হে আল্লাহ! একমাত্র আপনারই ইবাদত করি, আপনার জন্যই নামাজ পড়ি ও সিজদা করি, আপনার দিকেই ছুটে যাই, আপনার রহমতের আশা করি ও শাস্তিকে ভয় করি। নিশ্চয়ই আপনার শাস্তি কাফেরদের উপর পতিত হবে।",
  },
];

interface NiyahCardProps {
  niyah: typeof NIYAH_DATA[0];
  isBengali: boolean;
}

const NiyahCard = ({ niyah, isBengali }: NiyahCardProps) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    className="relative rounded-3xl bg-gradient-to-br from-[hsl(158,55%,25%)] to-[hsl(158,64%,20%)] border border-[hsl(45,93%,58%)]/20 shadow-lg overflow-hidden mb-4"
  >
    <div className="absolute top-0 right-0 w-32 h-32 bg-[hsl(45,93%,58%)]/10 rounded-full blur-2xl" />
    <div className="absolute bottom-0 left-0 w-24 h-24 bg-[hsl(158,64%,30%)]/30 rounded-full blur-xl" />

    <div className="relative">
      {/* Header */}
      <div className="flex justify-between items-center px-6 pt-5 pb-3">
        <div>
          <h2 className={`text-lg font-semibold text-white ${isBengali ? "font-bangla" : ""}`}>
            {isBengali ? niyah.nameBn : niyah.name}
          </h2>
          <p className={`text-sm text-white/60 ${isBengali ? "font-bangla" : ""}`}>
            {isBengali ? niyah.rakatsBn : niyah.rakats}
          </p>
        </div>
      </div>

      {/* Arabic Section */}
      <div className="mx-4 mb-3 rounded-2xl bg-gradient-to-br from-[hsl(158,55%,22%)] to-[hsl(158,64%,18%)] border border-[hsl(45,93%,58%)]/15 p-5">
        <div className="flex items-center justify-center gap-2 mb-3">
          <Sparkles className="w-3.5 h-3.5 text-[hsl(45,93%,58%)]" />
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[hsl(45,93%,58%)]">আরবি</span>
          <Sparkles className="w-3.5 h-3.5 text-[hsl(45,93%,58%)]" />
        </div>
        <p className="text-right text-xl md:text-2xl leading-[2] text-white font-arabic">
          {niyah.arabic}
        </p>
      </div>

      {/* Transliteration Section */}
      <div className="mx-4 mb-3 rounded-2xl bg-white/5 border border-white/10 p-5">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="w-3.5 h-3.5 text-[hsl(45,93%,58%)]" />
          <span className="text-xs font-medium text-[hsl(45,93%,58%)]">
            {isBengali ? "বাংলা উচ্চারণ" : "Transliteration"}
          </span>
        </div>
        <p className={`text-white/90 text-base md:text-lg leading-[1.9] tracking-wide ${isBengali ? "font-bangla font-normal" : ""}`}>
          {isBengali ? (niyah.transliterationBn || niyah.transliteration) : niyah.transliteration}
        </p>
      </div>

      {/* Meaning Section */}
      <div className="mx-4 mb-5 rounded-2xl bg-gradient-to-br from-[hsl(45,93%,58%)]/10 to-transparent border border-[hsl(45,93%,58%)]/20 p-5">
        <div className="flex items-center gap-2 mb-3">
          <Heart className="w-3.5 h-3.5 text-[hsl(45,93%,58%)]" />
          <span className="text-xs font-medium text-[hsl(45,93%,58%)]">
            {isBengali ? "বাংলা অর্থ" : "Meaning"}
          </span>
        </div>
        <p className={`text-white text-base md:text-lg leading-[1.9] tracking-wide ${isBengali ? "font-bangla font-normal" : ""}`}>
          {isBengali ? niyah.meaningBn : niyah.meaning}
        </p>
      </div>

      {/* Phase C: madhhab/context note */}
      {niyah.note && (
        <div className="mx-4 mb-5 rounded-2xl bg-white/5 border border-white/10 p-4">
          <p className={`text-white/60 text-sm leading-[1.9] ${isBengali ? "font-bangla" : ""}`}>
            {isBengali ? (niyah.noteBn || niyah.note) : niyah.note}
          </p>
        </div>
      )}
    </div>
  </motion.div>
);

interface DuaCardProps {
  dua: typeof PRAYER_DUAS[0];
  isBengali: boolean;
}

const DuaCard = ({ dua, isBengali }: DuaCardProps) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    className="relative rounded-3xl bg-gradient-to-br from-[hsl(158,55%,25%)] to-[hsl(158,64%,20%)] border border-[hsl(45,93%,58%)]/20 shadow-lg overflow-hidden mb-4"
  >
    <div className="absolute top-0 right-0 w-32 h-32 bg-[hsl(45,93%,58%)]/10 rounded-full blur-2xl" />
    <div className="absolute bottom-0 left-0 w-24 h-24 bg-[hsl(158,64%,30%)]/30 rounded-full blur-xl" />

    <div className="relative">
      {/* Header */}
      <div className="flex justify-between items-center px-6 pt-5 pb-3">
        <h2 className={`text-lg font-semibold text-white ${isBengali ? "font-bangla" : ""}`}>
          {isBengali ? dua.nameBn : dua.name}
        </h2>
      </div>

      {/* Arabic Section */}
      <div className="mx-4 mb-3 rounded-2xl bg-gradient-to-br from-[hsl(158,55%,22%)] to-[hsl(158,64%,18%)] border border-[hsl(45,93%,58%)]/15 p-5">
        <div className="flex items-center justify-center gap-2 mb-3">
          <Sparkles className="w-3.5 h-3.5 text-[hsl(45,93%,58%)]" />
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[hsl(45,93%,58%)]">আরবি</span>
          <Sparkles className="w-3.5 h-3.5 text-[hsl(45,93%,58%)]" />
        </div>
        <p className="text-right text-xl md:text-2xl leading-[2] text-white font-arabic">
          {dua.arabic}
        </p>
      </div>

      {/* Transliteration Section */}
      <div className="mx-4 mb-3 rounded-2xl bg-white/5 border border-white/10 p-5">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="w-3.5 h-3.5 text-[hsl(45,93%,58%)]" />
          <span className="text-xs font-medium text-[hsl(45,93%,58%)]">
            {isBengali ? "বাংলা উচ্চারণ" : "Transliteration"}
          </span>
        </div>
        <p className={`text-white/90 text-base md:text-lg leading-[1.9] tracking-wide ${isBengali ? "font-bangla font-normal" : ""}`}>
          {isBengali ? (dua.transliterationBn || dua.transliteration) : dua.transliteration}
        </p>
      </div>

      {/* Meaning Section */}
      <div className="mx-4 mb-5 rounded-2xl bg-gradient-to-br from-[hsl(45,93%,58%)]/10 to-transparent border border-[hsl(45,93%,58%)]/20 p-5">
        <div className="flex items-center gap-2 mb-3">
          <Heart className="w-3.5 h-3.5 text-[hsl(45,93%,58%)]" />
          <span className="text-xs font-medium text-[hsl(45,93%,58%)]">
            {isBengali ? "বাংলা অর্থ" : "Meaning"}
          </span>
        </div>
        <p className={`text-white text-base md:text-lg leading-[1.9] tracking-wide ${isBengali ? "font-bangla font-normal" : ""}`}>
          {isBengali ? dua.meaningBn : dua.meaning}
        </p>
      </div>

      {/* Phase C: madhhab/context note */}
      {dua.note && (
        <div className="mx-4 mb-5 rounded-2xl bg-white/5 border border-white/10 p-4">
          <p className={`text-white/60 text-sm leading-[1.9] ${isBengali ? "font-bangla" : ""}`}>
            {isBengali ? (dua.noteBn || dua.note) : dua.note}
          </p>
        </div>
      )}
    </div>
  </motion.div>
);

interface StepCardProps {
  step: typeof PRAYER_STEPS[0];
  index: number;
  isBengali: boolean;
  strings: typeof UI_STRINGS.en;
}

const StepCard = ({ step, index, isBengali, strings }: StepCardProps) => (
  <motion.div
    initial={{ opacity: 0, x: -20 }}
    animate={{ opacity: 1, x: 0 }}
    transition={{ delay: index * 0.05 }}
    className="relative rounded-3xl bg-gradient-to-br from-[hsl(158,55%,25%)] to-[hsl(158,64%,20%)] border border-[hsl(45,93%,58%)]/20 shadow-lg overflow-hidden mb-4"
  >
    <div className="absolute top-0 right-0 w-32 h-32 bg-[hsl(45,93%,58%)]/10 rounded-full blur-2xl" />
    <div className="absolute bottom-0 left-0 w-24 h-24 bg-[hsl(158,64%,30%)]/30 rounded-full blur-xl" />

    <div className="relative p-5">
      <div className="flex items-start gap-4">
        <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center text-2xl">
          {step.icon}
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 rounded-full bg-[hsl(45,93%,58%)]/20 text-xs font-medium text-[hsl(45,93%,58%)]">
              {strings.step} {step.id}
            </span>
          </div>
           <h2 className={`text-lg font-semibold text-white ${isBengali ? "font-bangla" : ""}`}>
             {isBengali ? step.nameBn : step.name}
           </h2>
           
           <p className={`text-sm text-white/70 mb-3 ${isBengali ? "font-bangla leading-[1.8]" : ""}`}>
             <strong className="text-[hsl(45,93%,58%)]">{strings.action}:</strong> {isBengali ? step.actionBn : step.action}
           </p>
        </div>
      </div>

      {/* Arabic Recitation Section */}
      <div className="mt-3 rounded-2xl bg-gradient-to-br from-[hsl(158,55%,22%)] to-[hsl(158,64%,18%)] border border-[hsl(45,93%,58%)]/15 p-4">
        <div className="flex items-center justify-center gap-2 mb-2">
          <Sparkles className="w-3.5 h-3.5 text-[hsl(45,93%,58%)]" />
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[hsl(45,93%,58%)]">আরবি</span>
          <Sparkles className="w-3.5 h-3.5 text-[hsl(45,93%,58%)]" />
        </div>
        <p className="text-amber-200/90 text-base font-arabic text-right leading-[2]">
          {step.recitation}
        </p>
      </div>

      {/* Meaning Section */}
      <div className="mt-3 rounded-2xl bg-gradient-to-br from-[hsl(45,93%,58%)]/10 to-transparent border border-[hsl(45,93%,58%)]/20 p-4">
        <div className="flex items-center gap-2 mb-2">
          <Heart className="w-3.5 h-3.5 text-[hsl(45,93%,58%)]" />
          <span className="text-xs font-medium text-[hsl(45,93%,58%)]">
            {isBengali ? "বাংলা অর্থ" : "Meaning"}
          </span>
        </div>
        <p className={`text-white/90 text-sm leading-relaxed ${isBengali ? "font-bangla leading-[1.8]" : ""}`}>
          {isBengali ? step.recitationMeaningBn : step.recitationMeaning}
        </p>
      </div>
      
      <p className={`mt-3 text-xs text-white/50 ${isBengali ? "font-bangla leading-[1.8]" : ""}`}>
        💡 {isBengali ? step.explanationBn : step.explanation}
      </p>
    </div>
  </motion.div>
);

interface LearningSectionProps {
  title: string;
  items: string[];
}

const LearningSection = ({ title, items }: LearningSectionProps) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    className="relative rounded-3xl bg-gradient-to-br from-[hsl(158,55%,25%)] to-[hsl(158,64%,20%)] border border-[hsl(45,93%,58%)]/20 shadow-lg overflow-hidden mb-4"
  >
    <div className="absolute top-0 right-0 w-32 h-32 bg-[hsl(45,93%,58%)]/10 rounded-full blur-2xl" />
    <div className="absolute bottom-0 left-0 w-24 h-24 bg-[hsl(158,64%,30%)]/30 rounded-full blur-xl" />
    <div className="relative p-6">
      <h2 className="text-base font-semibold text-white mb-4">{title}</h2>
      <ul className="space-y-2.5">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-2.5 text-sm text-white/80">
            <span className="text-[hsl(45,93%,58%)] mt-0.5">✦</span>
            {item}
          </li>
        ))}
      </ul>
    </div>
  </motion.div>
);

export default function PrayerGuidePage() {
  const { language } = useAppSettings();
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchQuery, setSearchQuery] = useState("");

  const activeTab = searchParams.get("tab") || "niyah";
  const selectedNiyahId = searchParams.get("niyah");
  const selectedDuaId = searchParams.get("dua");

  const isBengali = language === "bn";
  const strings = UI_STRINGS[language] || UI_STRINGS.en;

  const selectedNiyah = useMemo(() => NIYAH_DATA.find(n => n.id === selectedNiyahId) ?? null, [selectedNiyahId]);
  const selectedDua = useMemo(() => PRAYER_DUAS.find(d => d.id === selectedDuaId) ?? null, [selectedDuaId]);

  const setActiveTab = (tab: string) => {
    setSearchParams({ tab }, { replace: false });
  };

  const openNiyah = (id: string) => {
    setSearchParams({ tab: "niyah", niyah: id }, { replace: false });
  };

  const closeNiyah = () => {
    setSearchParams({ tab: "niyah" }, { replace: false });
  };

  const openDua = (id: string) => {
    setSearchParams({ tab: "duas", dua: id }, { replace: false });
  };

  const closeDua = () => {
    setSearchParams({ tab: "duas" }, { replace: false });
  };

  const filteredNiyah = useMemo(() => {
    if (!searchQuery.trim()) return NIYAH_DATA;
    const q = searchQuery.toLowerCase();
    return NIYAH_DATA.filter(
      (n) =>
        n.name.toLowerCase().includes(q) ||
        n.nameBn.includes(q) ||
        n.rakats.toLowerCase().includes(q) ||
        n.rakatsBn.includes(q)
    );
  }, [searchQuery]);

  const SITE_ORIGIN = "https://noorapp.in";
  const canonicalUrl = `${SITE_ORIGIN}/prayer-guide`;
  const pageTitle = isBengali ? "নামাজ শিক্ষা — ধাপে ধাপে নামাজ শিখুন | Noor" : "Prayer Guide — Learn How to Pray Step by Step | Noor";
  const pageDescription = isBengali 
    ? "নামাজের নিয়ম, নিয়ত, দোয়া ও তাশাহহুদ সহ সম্পূর্ণ নামাজ শিক্ষা গাইড। ধাপে ধাপে নামাজ শিখুন।" 
    : "Step-by-step Salah guide covering prayer steps, Niyah wordings, recitations and Duas in English and Bengali.";

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0a1f1c] via-[#0f2922] to-[#071510] pb-24">
      <Helmet>
        <title>{pageTitle}</title>
        <meta name="description" content={pageDescription} />
        <link rel="canonical" href={canonicalUrl} />
        <meta property="og:title" content={pageTitle} />
        <meta property="og:description" content={pageDescription} />
        <meta property="og:url" content={canonicalUrl} />
        <meta property="og:image" content={`${SITE_ORIGIN}/og-prayer-guide.png`} />
      </Helmet>
      {/* Header */}
      <div className="sticky top-0 z-20 bg-gradient-to-b from-[#0a1f1c] to-transparent backdrop-blur-md pt-safe-top">
        <div className="px-4 py-4">
          <h1 className="text-2xl font-bold text-emerald-50 mb-1">{strings.pageTitle}</h1>
          <p className="text-sm text-emerald-300/60">{strings.pageSubtitle}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="px-4">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="w-full bg-emerald-950/50 border border-emerald-800/30 p-1 rounded-xl mb-4 grid grid-cols-4 gap-1">
            <TabsTrigger 
              value="niyah" 
              className="data-[state=active]:bg-emerald-700 data-[state=active]:text-white text-emerald-300/70 rounded-lg text-xs py-2"
            >
              <Heart className="w-3 h-3 mr-1" />
              {strings.tabNiyah}
            </TabsTrigger>
            <TabsTrigger 
              value="learning" 
              className="data-[state=active]:bg-emerald-700 data-[state=active]:text-white text-emerald-300/70 rounded-lg text-xs py-2"
            >
              <BookOpen className="w-3 h-3 mr-1" />
              {strings.tabLearn}
            </TabsTrigger>
            <TabsTrigger 
              value="steps" 
              className="data-[state=active]:bg-emerald-700 data-[state=active]:text-white text-emerald-300/70 rounded-lg text-xs py-2"
            >
              <Footprints className="w-3 h-3 mr-1" />
              {strings.tabSteps}
            </TabsTrigger>
            <TabsTrigger 
              value="duas" 
              className="data-[state=active]:bg-emerald-700 data-[state=active]:text-white text-emerald-300/70 rounded-lg text-xs py-2"
            >
              <HandHeart className="w-3 h-3 mr-1" />
              {strings.tabDuas}
            </TabsTrigger>
          </TabsList>

          {/* Niyah Tab */}
          <TabsContent value="niyah" className="mt-0">
            <AnimatePresence mode="wait">
              {selectedNiyah ? (
                <motion.div key="niyah-detail" initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -50 }}>
                  <button onClick={closeNiyah} className="flex items-center gap-2 text-[hsl(45,93%,58%)] text-sm mb-4 hover:underline">
                    <ArrowLeft className="w-4 h-4" /> {isBengali ? "তালিকায় ফিরুন" : "Back to list"}
                  </button>
                  <NiyahCard niyah={selectedNiyah} isBengali={isBengali} />
                </motion.div>
              ) : (
                <motion.div key="niyah-list" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  {/* Phase C (PC-01): two-part niyyah disclaimer — heart intention vs. educational formulas */}
                  <div className="mb-4 p-4 rounded-2xl bg-white/5 border border-white/10">
                    <p className={`text-sm text-white/70 leading-relaxed ${isBengali ? "font-bangla" : ""}`}>
                      {isBengali
                        ? "নিয়ত অন্তরে থাকে — মুখে কিছু না বললেও আন্তরিক নিয়তসহ আপনার নামাজ সহিহ হবে। এটিই ইসলামের ইমামগণের ঐকমত্যের অবস্থান।"
                        : "Intention (niyyah) resides in the heart — your prayer is valid with a sincere intention even if you say nothing aloud. This is the agreed position of the imams of Islam."}
                    </p>
                    <p className={`text-sm text-white/70 leading-relaxed mt-2 ${isBengali ? "font-bangla" : ""}`}>
                      {isBengali
                        ? "নিচের আরবি বাক্যগুলো নিয়ত স্থির রাখতে সহায়তার জন্য হানাফি নামাজ-শিক্ষা বইয়ে শেখানো পরবর্তীকালের শিক্ষামূলক বাক্য। এগুলো রাসূলুল্লাহ ﷺ থেকে আসেনি। নিয়ত মুখে বলা নিয়ে আলেমগণ মতভেদ করেছেন: কেউ কেউ মনোযোগের সহায়ক হিসেবে এটিকে পছন্দনীয় বলেছেন, আবার কেউ কেউ এটিকে বিদআত বলেছেন। নামাজ সহিহ হওয়ার জন্য এগুলো বলা আবশ্যক নয়।"
                        : "The Arabic wordings below are later educational formulas taught in Hanafi prayer guides to help you focus your intention. They are not from the Prophet ﷺ. Scholars have differed about saying the intention aloud: some later scholars considered it desirable as an aid to focus, while others considered it an innovation. Saying these wordings is not required for your prayer to be valid."}
                    </p>
                  </div>
                  <div className="relative mb-4">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-400/50" />
                    <Input
                      placeholder={strings.searchPlaceholder}
                      aria-label={strings.searchPlaceholder}
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-10 bg-emerald-950/50 border-emerald-800/30 text-emerald-100 placeholder:text-emerald-500/50"
                    />
                  </div>
                  <div className="space-y-3">
                    {filteredNiyah.map((niyah, index) => (
                      <motion.button
                        key={niyah.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.04 }}
                        onClick={() => openNiyah(niyah.id)}
                        className="w-full text-left p-4 rounded-2xl bg-gradient-to-br from-[hsl(158,55%,25%)] to-[hsl(158,64%,20%)] border border-white/10 hover:border-[hsl(45,93%,58%)]/30 transition-all active:scale-[0.98] group"
                      >
                        <div className="flex items-center justify-between">
                          <div className="space-y-1 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="w-6 h-6 rounded-full bg-[hsl(45,93%,58%)]/20 flex items-center justify-center text-xs font-bold text-[hsl(45,93%,58%)]">
                                {index + 1}
                              </span>
                              <p className="font-semibold text-white">{isBengali ? niyah.nameBn : niyah.name}</p>
                            </div>
                            <p className="text-xs text-white/50 ml-8">{isBengali ? niyah.rakatsBn : niyah.rakats}</p>
                            <p className="text-sm text-white/60 line-clamp-1 font-arabic ml-8">{niyah.arabic}</p>
                          </div>
                          <ChevronRight className="w-5 h-5 text-white/40 group-hover:text-[hsl(45,93%,58%)] transition-colors" />
                        </div>
                      </motion.button>
                    ))}
                  </div>
                  {filteredNiyah.length === 0 && (
                    <div className="text-center py-12 text-emerald-400/60">
                      {strings.noResults} "{searchQuery}"
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </TabsContent>

          {/* Learning Tab */}
          <TabsContent value="learning" className="mt-0">
            {/* Phase C (PC-02): Hanafi scope note */}
            <div className="mb-4 p-4 rounded-2xl bg-white/5 border border-white/10">
              <p className={`text-sm text-white/70 leading-relaxed ${isBengali ? "font-bangla" : ""}`}>
                {isBengali
                  ? "নোট: এই গাইড হানাফি ফিকহ অনুসরণ করে। কিছু বিধানে অন্যান্য মাযহাবের মতভেদ থাকতে পারে।"
                  : "Note: This guide follows Hanafi fiqh. Other schools of thought may differ on some rulings."}
              </p>
            </div>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="relative rounded-3xl bg-gradient-to-br from-[hsl(158,55%,25%)] to-[hsl(158,64%,20%)] border border-[hsl(45,93%,58%)]/20 shadow-lg overflow-hidden mb-4"
            >
              <div className="absolute top-0 right-0 w-32 h-32 bg-[hsl(45,93%,58%)]/10 rounded-full blur-2xl" />
              <div className="absolute bottom-0 left-0 w-24 h-24 bg-[hsl(158,64%,30%)]/30 rounded-full blur-xl" />
              <div className="relative p-6">
                <h2 className="text-base font-semibold text-white flex items-center gap-2 mb-4">
                  🕌 {isBengali ? PRAYER_LEARNING.whatIsPrayer.titleBn : PRAYER_LEARNING.whatIsPrayer.title}
                </h2>
                <ul className="space-y-2.5">
                  {(isBengali ? PRAYER_LEARNING.whatIsPrayer.contentBn : PRAYER_LEARNING.whatIsPrayer.content).map((item, i) => (
                    <li key={i} className="flex items-start gap-2.5 text-sm text-white/80">
                      <span className="text-[hsl(45,93%,58%)] mt-0.5">✦</span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </motion.div>

            <LearningSection 
              title={`📌 ${isBengali ? PRAYER_LEARNING.farz.titleBn : PRAYER_LEARNING.farz.title}`} 
              items={isBengali ? PRAYER_LEARNING.farz.itemsBn : PRAYER_LEARNING.farz.items} 
            />
            <LearningSection 
              title={`📋 ${isBengali ? PRAYER_LEARNING.wajib.titleBn : PRAYER_LEARNING.wajib.title}`} 
              items={isBengali ? PRAYER_LEARNING.wajib.itemsBn : PRAYER_LEARNING.wajib.items} 
            />
            <LearningSection 
              title={`✨ ${isBengali ? PRAYER_LEARNING.sunnah.titleBn : PRAYER_LEARNING.sunnah.title}`} 
              items={isBengali ? PRAYER_LEARNING.sunnah.itemsBn : PRAYER_LEARNING.sunnah.items} 
            />
            <LearningSection 
              title={`⚠️ ${isBengali ? PRAYER_LEARNING.breaks.titleBn : PRAYER_LEARNING.breaks.title}`} 
              items={isBengali ? PRAYER_LEARNING.breaks.itemsBn : PRAYER_LEARNING.breaks.items} 
            />
          </TabsContent>

          {/* Steps Tab */}
          <TabsContent value="steps" className="mt-0">
            <div className="mb-4 p-4 rounded-2xl bg-white/5 border border-white/10">
              <p className="text-sm text-white/70">
                {strings.stepsIntro}
              </p>
            </div>
            {PRAYER_STEPS.map((step, index) => (
              <StepCard key={step.id} step={step} index={index} isBengali={isBengali} strings={strings} />
            ))}
          </TabsContent>

          {/* Duas Tab */}
          <TabsContent value="duas" className="mt-0">
            <AnimatePresence mode="wait">
              {selectedDua ? (
                <motion.div key="dua-detail" initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -50 }}>
                  <button onClick={closeDua} className="flex items-center gap-2 text-[hsl(45,93%,58%)] text-sm mb-4 hover:underline">
                    <ArrowLeft className="w-4 h-4" /> {isBengali ? "তালিকায় ফিরুন" : "Back to list"}
                  </button>
                  <DuaCard dua={selectedDua} isBengali={isBengali} />
                </motion.div>
              ) : (
                <motion.div key="dua-list" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <div className="mb-4 p-4 rounded-2xl bg-white/5 border border-white/10">
                    <p className="text-sm text-white/70">{strings.duasIntro}</p>
                  </div>
                  <div className="space-y-3">
                    {PRAYER_DUAS.map((dua, index) => (
                      <motion.button
                        key={dua.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.04 }}
                        onClick={() => openDua(dua.id)}
                        className="w-full text-left p-4 rounded-2xl bg-gradient-to-br from-[hsl(158,55%,25%)] to-[hsl(158,64%,20%)] border border-white/10 hover:border-[hsl(45,93%,58%)]/30 transition-all active:scale-[0.98] group"
                      >
                        <div className="flex items-center justify-between">
                          <div className="space-y-1 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="w-6 h-6 rounded-full bg-[hsl(45,93%,58%)]/20 flex items-center justify-center text-xs font-bold text-[hsl(45,93%,58%)]">
                                {index + 1}
                              </span>
                              <p className="font-semibold text-white">{isBengali ? dua.nameBn : dua.name}</p>
                            </div>
                            <p className="text-sm text-white/60 line-clamp-1 font-arabic ml-8">{dua.arabic}</p>
                          </div>
                          <ChevronRight className="w-5 h-5 text-white/40 group-hover:text-[hsl(45,93%,58%)] transition-colors" />
                        </div>
                      </motion.button>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </TabsContent>
        </Tabs>
      </div>

      <BottomNavigation />
    </div>
  );
}
