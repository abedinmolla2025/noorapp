import { useEffect, useState } from "react";
import { ArrowLeft, Search, BookOpen, ChevronRight, Globe } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { motion, AnimatePresence } from "framer-motion";

type Language = "bn" | "en" | "ar";

interface Hadith {
  id: number;
  number: string;
  arabic: string;
  translations: {
    bn: string;
    en: string;
    ar: string;
  };
  narrator: {
    bn: string;
    en: string;
    ar: string;
  };
  chapter: {
    bn: string;
    en: string;
    ar: string;
  };
}

const languages = [
  { code: "bn" as Language, name: "বাংলা" },
  { code: "en" as Language, name: "English" },
  { code: "ar" as Language, name: "العربية" },
];

const chapters = [
  { id: 1, name: { bn: "ওহীর সূচনা", en: "Revelation", ar: "بدء الوحي" }, count: 7 },
  { id: 2, name: { bn: "ঈমান", en: "Belief", ar: "الإيمان" }, count: 51 },
  { id: 3, name: { bn: "ইলম (জ্ঞান)", en: "Knowledge", ar: "العلم" }, count: 76 },
  { id: 4, name: { bn: "অযু", en: "Ablution", ar: "الوضوء" }, count: 113 },
  { id: 5, name: { bn: "গোসল", en: "Bathing", ar: "الغسل" }, count: 46 },
  { id: 6, name: { bn: "হায়েয", en: "Menstrual Periods", ar: "الحيض" }, count: 32 },
  { id: 7, name: { bn: "তায়াম্মুম", en: "Tayammum", ar: "التيمم" }, count: 15 },
  { id: 8, name: { bn: "সালাত", en: "Prayer", ar: "الصلاة" }, count: 172 },
  { id: 9, name: { bn: "সালাতের সময়", en: "Prayer Times", ar: "مواقيت الصلاة" }, count: 41 },
  { id: 10, name: { bn: "আযান", en: "Call to Prayer", ar: "الأذان" }, count: 105 },
];

const hadiths: Hadith[] = [
  // Chapter 1: Revelation (ওহীর সূচনা)
  {
    id: 1,
    number: "1",
    arabic: "إِنَّمَا الأَعْمَالُ بِالنِّيَّاتِ، وَإِنَّمَا لِكُلِّ امْرِئٍ مَا نَوَى",
    translations: {
      bn: "কর্মের ফলাফল নিয়তের উপর নির্ভরশীল। প্রত্যেক ব্যক্তি তাই পাবে যা সে নিয়ত করে।",
      en: "Actions are judged by intentions. Everyone will get what they intended.",
      ar: "إِنَّمَا الأَعْمَالُ بِالنِّيَّاتِ، وَإِنَّمَا لِكُلِّ امْرِئٍ مَا نَوَى",
    },
    narrator: { bn: "উমার ইবনুল খাত্তাব (রাঃ)", en: "Umar ibn Al-Khattab (RA)", ar: "عمر بن الخطاب رضي الله عنه" },
    chapter: { bn: "ওহীর সূচনা", en: "Revelation", ar: "بدء الوحي" },
  },
  {
    id: 2,
    number: "2",
    arabic: "أَوَّلُ مَا بُدِئَ بِهِ رَسُولُ اللَّهِ صلى الله عليه وسلم مِنَ الْوَحْيِ الرُّؤْيَا الصَّالِحَةُ",
    translations: {
      bn: "রাসূলুল্লাহ (সাঃ) এর কাছে ওহীর সূচনা হয়েছিল সত্য স্বপ্নের মাধ্যমে।",
      en: "The first form of revelation to the Messenger of Allah was true dreams.",
      ar: "أَوَّلُ مَا بُدِئَ بِهِ رَسُولُ اللَّهِ صلى الله عليه وسلم مِنَ الْوَحْيِ الرُّؤْيَا الصَّالِحَةُ",
    },
    narrator: { bn: "আয়েশা (রাঃ)", en: "Aisha (RA)", ar: "عائشة رضي الله عنها" },
    chapter: { bn: "ওহীর সূচনা", en: "Revelation", ar: "بدء الوحي" },
  },
  {
    id: 3,
    number: "3",
    arabic: "كَانَ يَخْلُو بِغَارِ حِرَاءٍ فَيَتَحَنَّثُ فِيهِ اللَّيَالِيَ ذَوَاتِ الْعَدَدِ",
    translations: {
      bn: "তিনি হেরা গুহায় একাকী থাকতেন এবং সেখানে কয়েক রাত ইবাদতে মগ্ন থাকতেন।",
      en: "He used to seclude himself in the cave of Hira and worship there for many nights.",
      ar: "كَانَ يَخْلُو بِغَارِ حِرَاءٍ فَيَتَحَنَّثُ فِيهِ اللَّيَالِيَ ذَوَاتِ الْعَدَدِ",
    },
    narrator: { bn: "আয়েশা (রাঃ)", en: "Aisha (RA)", ar: "عائشة رضي الله عنها" },
    chapter: { bn: "ওহীর সূচনা", en: "Revelation", ar: "بدء الوحي" },
  },
  {
    id: 4,
    number: "4",
    arabic: "فَجَاءَهُ الْمَلَكُ فَقَالَ اقْرَأْ قَالَ مَا أَنَا بِقَارِئٍ",
    translations: {
      bn: "ফেরেশতা এসে বললেন, 'পড়ুন।' তিনি বললেন, 'আমি পড়তে জানি না।'",
      en: "The angel came to him and said, 'Read!' He said, 'I cannot read.'",
      ar: "فَجَاءَهُ الْمَلَكُ فَقَالَ اقْرَأْ قَالَ مَا أَنَا بِقَارِئٍ",
    },
    narrator: { bn: "আয়েশা (রাঃ)", en: "Aisha (RA)", ar: "عائشة رضي الله عنها" },
    chapter: { bn: "ওহীর সূচনা", en: "Revelation", ar: "بدء الوحي" },
  },
  {
    id: 5,
    number: "5",
    arabic: "فَرَجَعَ بِهَا رَسُولُ اللَّهِ صلى الله عليه وسلم يَرْجُفُ فُؤَادُهُ",
    translations: {
      bn: "রাসূলুল্লাহ (সাঃ) কম্পিত হৃদয়ে ফিরে এলেন।",
      en: "The Messenger of Allah returned with his heart trembling.",
      ar: "فَرَجَعَ بِهَا رَسُولُ اللَّهِ صلى الله عليه وسلم يَرْجُفُ فُؤَادُهُ",
    },
    narrator: { bn: "আয়েশা (রাঃ)", en: "Aisha (RA)", ar: "عائشة رضي الله عنها" },
    chapter: { bn: "ওহীর সূচনা", en: "Revelation", ar: "بدء الوحي" },
  },
  {
    id: 6,
    number: "6",
    arabic: "زَمِّلُونِي زَمِّلُونِي فَزَمَّلُوهُ حَتَّى ذَهَبَ عَنْهُ الرَّوْعُ",
    translations: {
      bn: "'আমাকে কম্বল দিয়ে ঢেকে দাও, ঢেকে দাও।' তারা তাঁকে ঢেকে দিলেন যতক্ষণ না ভয় দূর হলো।",
      en: "'Cover me! Cover me!' They covered him until the fear left him.",
      ar: "زَمِّلُونِي زَمِّلُونِي فَزَمَّلُوهُ حَتَّى ذَهَبَ عَنْهُ الرَّوْعُ",
    },
    narrator: { bn: "আয়েশা (রাঃ)", en: "Aisha (RA)", ar: "عائشة رضي الله عنها" },
    chapter: { bn: "ওহীর সূচনা", en: "Revelation", ar: "بدء الوحي" },
  },
  {
    id: 7,
    number: "7",
    arabic: "كَلاَّ وَاللَّهِ مَا يُخْزِيكَ اللَّهُ أَبَدًا",
    translations: {
      bn: "কখনোই না! আল্লাহর কসম, আল্লাহ কখনো আপনাকে অপমানিত করবেন না।",
      en: "Never! By Allah, Allah will never disgrace you.",
      ar: "كَلاَّ وَاللَّهِ مَا يُخْزِيكَ اللَّهُ أَبَدًا",
    },
    narrator: { bn: "খাদিজা (রাঃ)", en: "Khadijah (RA)", ar: "خديجة رضي الله عنها" },
    chapter: { bn: "ওহীর সূচনা", en: "Revelation", ar: "بدء الوحي" },
  },

  // Chapter 2: Belief (ঈমান)
  {
    id: 8,
    number: "8",
    arabic: "بُنِيَ الإِسْلاَمُ عَلَى خَمْسٍ",
    translations: {
      bn: "ইসলাম পাঁচটি স্তম্ভের উপর প্রতিষ্ঠিত।",
      en: "Islam is built upon five pillars.",
      ar: "بُنِيَ الإِسْلاَمُ عَلَى خَمْسٍ",
    },
    narrator: { bn: "ইবনে উমার (রাঃ)", en: "Ibn Umar (RA)", ar: "ابن عمر رضي الله عنه" },
    chapter: { bn: "ঈমান", en: "Belief", ar: "الإيمان" },
  },
  {
    id: 9,
    number: "9",
    arabic: "الْمُسْلِمُ مَنْ سَلِمَ الْمُسْلِمُونَ مِنْ لِسَانِهِ وَيَدِهِ",
    translations: {
      bn: "মুসলিম সেই ব্যক্তি যার জিহ্বা ও হাত থেকে অন্য মুসলিমরা নিরাপদ থাকে।",
      en: "A Muslim is the one from whose tongue and hands other Muslims are safe.",
      ar: "الْمُسْلِمُ مَنْ سَلِمَ الْمُسْلِمُونَ مِنْ لِسَانِهِ وَيَدِهِ",
    },
    narrator: { bn: "আব্দুল্লাহ ইবনে আমর (রাঃ)", en: "Abdullah ibn Amr (RA)", ar: "عبد الله بن عمرو رضي الله عنه" },
    chapter: { bn: "ঈমান", en: "Belief", ar: "الإيمان" },
  },
  {
    id: 10,
    number: "10",
    arabic: "لاَ يُؤْمِنُ أَحَدُكُمْ حَتَّى يُحِبَّ لأَخِيهِ مَا يُحِبُّ لِنَفْسِهِ",
    translations: {
      bn: "তোমাদের কেউ প্রকৃত মুমিন হতে পারবে না যতক্ষণ না সে তার ভাইয়ের জন্য তা পছন্দ করে যা নিজের জন্য পছন্দ করে।",
      en: "None of you truly believes until he loves for his brother what he loves for himself.",
      ar: "لاَ يُؤْمِنُ أَحَدُكُمْ حَتَّى يُحِبَّ لأَخِيهِ مَا يُحِبُّ لِنَفْسِهِ",
    },
    narrator: { bn: "আনাস ইবনে মালিক (রাঃ)", en: "Anas ibn Malik (RA)", ar: "أنس بن مالك رضي الله عنه" },
    chapter: { bn: "ঈমান", en: "Belief", ar: "الإيمان" },
  },
  {
    id: 11,
    number: "11",
    arabic: "الْحَيَاءُ مِنَ الإِيمَانِ",
    translations: {
      bn: "লজ্জাশীলতা ঈমানের অংশ।",
      en: "Modesty is part of faith.",
      ar: "الْحَيَاءُ مِنَ الإِيمَانِ",
    },
    narrator: { bn: "আবু হুরায়রা (রাঃ)", en: "Abu Hurairah (RA)", ar: "أبو هريرة رضي الله عنه" },
    chapter: { bn: "ঈমান", en: "Belief", ar: "الإيمان" },
  },
  {
    id: 12,
    number: "12",
    arabic: "الدِّينُ النَّصِيحَةُ",
    translations: {
      bn: "দ্বীন হলো নসীহত (উপদেশ)।",
      en: "Religion is sincere advice.",
      ar: "الدِّينُ النَّصِيحَةُ",
    },
    narrator: { bn: "তামীম আদ-দারী (রাঃ)", en: "Tamim ad-Dari (RA)", ar: "تميم الداري رضي الله عنه" },
    chapter: { bn: "ঈমান", en: "Belief", ar: "الإيمان" },
  },
  {
    id: 13,
    number: "13",
    arabic: "آيَةُ الْمُنَافِقِ ثَلاَثٌ إِذَا حَدَّثَ كَذَبَ وَإِذَا وَعَدَ أَخْلَفَ وَإِذَا اؤْتُمِنَ خَانَ",
    translations: {
      bn: "মুনাফিকের তিনটি লক্ষণ: যখন কথা বলে মিথ্যা বলে, প্রতিশ্রুতি দিলে ভঙ্গ করে এবং আমানত রাখলে খেয়ানত করে।",
      en: "The signs of a hypocrite are three: when he speaks he lies, when he promises he breaks it, and when entrusted he betrays.",
      ar: "آيَةُ الْمُنَافِقِ ثَلاَثٌ إِذَا حَدَّثَ كَذَبَ وَإِذَا وَعَدَ أَخْلَفَ وَإِذَا اؤْتُمِنَ خَانَ",
    },
    narrator: { bn: "আবু হুরায়রা (রাঃ)", en: "Abu Hurairah (RA)", ar: "أبو هريرة رضي الله عنه" },
    chapter: { bn: "ঈমান", en: "Belief", ar: "الإيمان" },
  },
  {
    id: 14,
    number: "14",
    arabic: "أَكْمَلُ الْمُؤْمِنِينَ إِيمَانًا أَحْسَنُهُمْ خُلُقًا",
    translations: {
      bn: "মুমিনদের মধ্যে সবচেয়ে পূর্ণ ঈমানের অধিকারী সে যার চরিত্র সবচেয়ে সুন্দর।",
      en: "The most complete believer in faith is the one with the best character.",
      ar: "أَكْمَلُ الْمُؤْمِنِينَ إِيمَانًا أَحْسَنُهُمْ خُلُقًا",
    },
    narrator: { bn: "আবু হুরায়রা (রাঃ)", en: "Abu Hurairah (RA)", ar: "أبو هريرة رضي الله عنه" },
    chapter: { bn: "ঈমান", en: "Belief", ar: "الإيمان" },
  },

  // Chapter 3: Knowledge (ইলম)
  {
    id: 15,
    number: "15",
    arabic: "مَنْ يُرِدِ اللَّهُ بِهِ خَيْرًا يُفَقِّهْهُ فِي الدِّينِ",
    translations: {
      bn: "আল্লাহ যার কল্যাণ চান তাকে দ্বীনের জ্ঞান দান করেন।",
      en: "When Allah wishes good for someone, He bestows upon him understanding of the religion.",
      ar: "مَنْ يُرِدِ اللَّهُ بِهِ خَيْرًا يُفَقِّهْهُ فِي الدِّينِ",
    },
    narrator: { bn: "মুআবিয়া (রাঃ)", en: "Muawiyah (RA)", ar: "معاوية رضي الله عنه" },
    chapter: { bn: "ইলম (জ্ঞান)", en: "Knowledge", ar: "العلم" },
  },
  {
    id: 16,
    number: "16",
    arabic: "خَيْرُكُمْ مَنْ تَعَلَّمَ الْقُرْآنَ وَعَلَّمَهُ",
    translations: {
      bn: "তোমাদের মধ্যে সর্বোত্তম সেই ব্যক্তি যে কুরআন শেখে এবং অন্যদের শেখায়।",
      en: "The best of you is the one who learns the Quran and teaches it.",
      ar: "خَيْرُكُمْ مَنْ تَعَلَّمَ الْقُرْآنَ وَعَلَّمَهُ",
    },
    narrator: { bn: "উসমান ইবনে আফফান (রাঃ)", en: "Uthman ibn Affan (RA)", ar: "عثمان بن عفان رضي الله عنه" },
    chapter: { bn: "ইলম (জ্ঞান)", en: "Knowledge", ar: "العلم" },
  },
  {
    id: 17,
    number: "17",
    arabic: "بَلِّغُوا عَنِّي وَلَوْ آيَةً",
    translations: {
      bn: "আমার পক্ষ থেকে একটি আয়াত হলেও পৌঁছে দাও।",
      en: "Convey from me even if it is one verse.",
      ar: "بَلِّغُوا عَنِّي وَلَوْ آيَةً",
    },
    narrator: { bn: "আব্দুল্লাহ ইবনে আমর (রাঃ)", en: "Abdullah ibn Amr (RA)", ar: "عبد الله بن عمرو رضي الله عنه" },
    chapter: { bn: "ইলম (জ্ঞান)", en: "Knowledge", ar: "العلم" },
  },
  {
    id: 18,
    number: "18",
    arabic: "طَلَبُ الْعِلْمِ فَرِيضَةٌ عَلَى كُلِّ مُسْلِمٍ",
    translations: {
      bn: "জ্ঞান অর্জন করা প্রত্যেক মুসলিমের উপর ফরজ।",
      en: "Seeking knowledge is an obligation upon every Muslim.",
      ar: "طَلَبُ الْعِلْمِ فَرِيضَةٌ عَلَى كُلِّ مُسْلِمٍ",
    },
    narrator: { bn: "আনাস ইবনে মালিক (রাঃ)", en: "Anas ibn Malik (RA)", ar: "أنس بن مالك رضي الله عنه" },
    chapter: { bn: "ইলম (জ্ঞান)", en: "Knowledge", ar: "العلم" },
  },
  {
    id: 19,
    number: "19",
    arabic: "مَنْ سَلَكَ طَرِيقًا يَلْتَمِسُ فِيهِ عِلْمًا سَهَّلَ اللَّهُ لَهُ بِهِ طَرِيقًا إِلَى الْجَنَّةِ",
    translations: {
      bn: "যে ব্যক্তি জ্ঞান অন্বেষণে পথ চলে, আল্লাহ তার জন্য জান্নাতের পথ সহজ করে দেন।",
      en: "Whoever travels a path seeking knowledge, Allah will make easy for him a path to Paradise.",
      ar: "مَنْ سَلَكَ طَرِيقًا يَلْتَمِسُ فِيهِ عِلْمًا سَهَّلَ اللَّهُ لَهُ بِهِ طَرِيقًا إِلَى الْجَنَّةِ",
    },
    narrator: { bn: "আবু হুরায়রা (রাঃ)", en: "Abu Hurairah (RA)", ar: "أبو هريرة رضي الله عنه" },
    chapter: { bn: "ইলম (জ্ঞান)", en: "Knowledge", ar: "العلم" },
  },
  {
    id: 20,
    number: "20",
    arabic: "الْعُلَمَاءُ وَرَثَةُ الأَنْبِيَاءِ",
    translations: {
      bn: "আলেমগণ নবীদের উত্তরাধিকারী।",
      en: "The scholars are the heirs of the Prophets.",
      ar: "الْعُلَمَاءُ وَرَثَةُ الأَنْبِيَاءِ",
    },
    narrator: { bn: "আবু দারদা (রাঃ)", en: "Abu Darda (RA)", ar: "أبو الدرداء رضي الله عنه" },
    chapter: { bn: "ইলম (জ্ঞান)", en: "Knowledge", ar: "العلم" },
  },
  {
    id: 21,
    number: "21",
    arabic: "إِذَا مَاتَ ابْنُ آدَمَ انْقَطَعَ عَمَلُهُ إِلاَّ مِنْ ثَلاَثٍ صَدَقَةٍ جَارِيَةٍ أَوْ عِلْمٍ يُنْتَفَعُ بِهِ أَوْ وَلَدٍ صَالِحٍ يَدْعُو لَهُ",
    translations: {
      bn: "মানুষ মারা গেলে তার আমল বন্ধ হয়ে যায়, তিনটি ছাড়া: সদকায়ে জারিয়া, উপকারী ইলম, অথবা সৎ সন্তান যে তার জন্য দোয়া করে।",
      en: "When a person dies, his deeds end except for three: ongoing charity, beneficial knowledge, or a righteous child who prays for him.",
      ar: "إِذَا مَاتَ ابْنُ آدَمَ انْقَطَعَ عَمَلُهُ إِلاَّ مِنْ ثَلاَثٍ صَدَقَةٍ جَارِيَةٍ أَوْ عِلْمٍ يُنْتَفَعُ بِهِ أَوْ وَلَدٍ صَالِحٍ يَدْعُو لَهُ",
    },
    narrator: { bn: "আবু হুরায়রা (রাঃ)", en: "Abu Hurairah (RA)", ar: "أبو هريرة رضي الله عنه" },
    chapter: { bn: "ইলম (জ্ঞান)", en: "Knowledge", ar: "العلم" },
  },

  // Chapter 4: Ablution (অযু)
  {
    id: 22,
    number: "22",
    arabic: "لاَ تُقْبَلُ صَلاَةٌ بِغَيْرِ طُهُورٍ",
    translations: {
      bn: "পবিত্রতা ছাড়া নামাজ কবুল হয় না।",
      en: "No prayer is accepted without purification.",
      ar: "لاَ تُقْبَلُ صَلاَةٌ بِغَيْرِ طُهُورٍ",
    },
    narrator: { bn: "ইবনে উমার (রাঃ)", en: "Ibn Umar (RA)", ar: "ابن عمر رضي الله عنه" },
    chapter: { bn: "অযু", en: "Ablution", ar: "الوضوء" },
  },
  {
    id: 23,
    number: "23",
    arabic: "الطُّهُورُ شَطْرُ الإِيمَانِ",
    translations: {
      bn: "পবিত্রতা ঈমানের অর্ধেক।",
      en: "Purification is half of faith.",
      ar: "الطُّهُورُ شَطْرُ الإِيمَانِ",
    },
    narrator: { bn: "আবু মালিক আশআরী (রাঃ)", en: "Abu Malik Al-Ashari (RA)", ar: "أبو مالك الأشعري رضي الله عنه" },
    chapter: { bn: "অযু", en: "Ablution", ar: "الوضوء" },
  },
  {
    id: 24,
    number: "24",
    arabic: "مِفْتَاحُ الصَّلاَةِ الطُّهُورُ",
    translations: {
      bn: "নামাজের চাবি হলো পবিত্রতা।",
      en: "The key to prayer is purification.",
      ar: "مِفْتَاحُ الصَّلاَةِ الطُّهُورُ",
    },
    narrator: { bn: "আলী (রাঃ)", en: "Ali (RA)", ar: "علي رضي الله عنه" },
    chapter: { bn: "অযু", en: "Ablution", ar: "الوضوء" },
  },
  {
    id: 25,
    number: "25",
    arabic: "إِسْبَاغُ الْوُضُوءِ عَلَى الْمَكَارِهِ",
    translations: {
      bn: "কষ্টের সময়েও পরিপূর্ণ অযু করা।",
      en: "Performing complete ablution despite difficulties.",
      ar: "إِسْبَاغُ الْوُضُوءِ عَلَى الْمَكَارِهِ",
    },
    narrator: { bn: "আবু হুরায়রা (রাঃ)", en: "Abu Hurairah (RA)", ar: "أبو هريرة رضي الله عنه" },
    chapter: { bn: "অযু", en: "Ablution", ar: "الوضوء" },
  },
  {
    id: 26,
    number: "26",
    arabic: "وَيْلٌ لِلأَعْقَابِ مِنَ النَّارِ",
    translations: {
      bn: "পায়ের গোড়ালির জন্য দুর্ভোগ জাহান্নামের আগুনে।",
      en: "Woe to the heels from the Fire.",
      ar: "وَيْلٌ لِلأَعْقَابِ مِنَ النَّارِ",
    },
    narrator: { bn: "আব্দুল্লাহ ইবনে আমর (রাঃ)", en: "Abdullah ibn Amr (RA)", ar: "عبد الله بن عمرو رضي الله عنه" },
    chapter: { bn: "অযু", en: "Ablution", ar: "الوضوء" },
  },
  {
    id: 27,
    number: "27",
    arabic: "مَنْ تَوَضَّأَ فَأَحْسَنَ الْوُضُوءَ خَرَجَتْ خَطَايَاهُ مِنْ جَسَدِهِ",
    translations: {
      bn: "যে সুন্দরভাবে অযু করে তার শরীর থেকে গুনাহ বের হয়ে যায়।",
      en: "Whoever performs ablution well, his sins come out from his body.",
      ar: "مَنْ تَوَضَّأَ فَأَحْسَنَ الْوُضُوءَ خَرَجَتْ خَطَايَاهُ مِنْ جَسَدِهِ",
    },
    narrator: { bn: "উসমান (রাঃ)", en: "Uthman (RA)", ar: "عثمان رضي الله عنه" },
    chapter: { bn: "অযু", en: "Ablution", ar: "الوضوء" },
  },
  {
    id: 28,
    number: "28",
    arabic: "أَلاَ أَدُلُّكُمْ عَلَى مَا يَمْحُو اللَّهُ بِهِ الْخَطَايَا وَيَرْفَعُ بِهِ الدَّرَجَاتِ إِسْبَاغُ الْوُضُوءِ",
    translations: {
      bn: "আমি কি তোমাদের বলব না যা দিয়ে আল্লাহ গুনাহ মুছে দেন এবং মর্যাদা বাড়িয়ে দেন? পরিপূর্ণ অযু।",
      en: "Shall I tell you what erases sins and raises ranks? Perfecting ablution.",
      ar: "أَلاَ أَدُلُّكُمْ عَلَى مَا يَمْحُو اللَّهُ بِهِ الْخَطَايَا وَيَرْفَعُ بِهِ الدَّرَجَاتِ إِسْبَاغُ الْوُضُوءِ",
    },
    narrator: { bn: "আবু হুরায়রা (রাঃ)", en: "Abu Hurairah (RA)", ar: "أبو هريرة رضي الله عنه" },
    chapter: { bn: "অযু", en: "Ablution", ar: "الوضوء" },
  },

  // Chapter 5: Bathing (গোসল)
  {
    id: 29,
    number: "29",
    arabic: "إِذَا الْتَقَى الْخِتَانَانِ فَقَدْ وَجَبَ الْغُسْلُ",
    translations: {
      bn: "যখন দুই খাতনার স্থান মিলিত হয় তখন গোসল ফরজ হয়ে যায়।",
      en: "When the two circumcised parts meet, bathing becomes obligatory.",
      ar: "إِذَا الْتَقَى الْخِتَانَانِ فَقَدْ وَجَبَ الْغُسْلُ",
    },
    narrator: { bn: "আয়েশা (রাঃ)", en: "Aisha (RA)", ar: "عائشة رضي الله عنها" },
    chapter: { bn: "গোসল", en: "Bathing", ar: "الغسل" },
  },
  {
    id: 30,
    number: "30",
    arabic: "غُسْلُ يَوْمِ الْجُمُعَةِ وَاجِبٌ عَلَى كُلِّ مُحْتَلِمٍ",
    translations: {
      bn: "জুমার দিনের গোসল প্রত্যেক প্রাপ্তবয়স্কের উপর ওয়াজিব।",
      en: "Friday bath is obligatory for every adult.",
      ar: "غُسْلُ يَوْمِ الْجُمُعَةِ وَاجِبٌ عَلَى كُلِّ مُحْتَلِمٍ",
    },
    narrator: { bn: "আবু সাঈদ খুদরী (রাঃ)", en: "Abu Said Al-Khudri (RA)", ar: "أبو سعيد الخدري رضي الله عنه" },
    chapter: { bn: "গোসল", en: "Bathing", ar: "الغسل" },
  },
  {
    id: 31,
    number: "31",
    arabic: "كَانَ رَسُولُ اللَّهِ صلى الله عليه وسلم يَغْتَسِلُ بِالصَّاعِ",
    translations: {
      bn: "রাসূলুল্লাহ (সাঃ) এক সা (প্রায় ৩ লিটার) পানি দিয়ে গোসল করতেন।",
      en: "The Messenger of Allah used to bathe with one Sa (about 3 liters) of water.",
      ar: "كَانَ رَسُولُ اللَّهِ صلى الله عليه وسلم يَغْتَسِلُ بِالصَّاعِ",
    },
    narrator: { bn: "আনাস (রাঃ)", en: "Anas (RA)", ar: "أنس رضي الله عنه" },
    chapter: { bn: "গোসল", en: "Bathing", ar: "الغسل" },
  },
  {
    id: 32,
    number: "32",
    arabic: "كَانَ يَبْدَأُ فَيَغْسِلُ يَدَيْهِ ثُمَّ يَتَوَضَّأُ",
    translations: {
      bn: "তিনি প্রথমে হাত ধুতেন তারপর অযু করতেন।",
      en: "He would start by washing his hands then perform ablution.",
      ar: "كَانَ يَبْدَأُ فَيَغْسِلُ يَدَيْهِ ثُمَّ يَتَوَضَّأُ",
    },
    narrator: { bn: "আয়েশা (রাঃ)", en: "Aisha (RA)", ar: "عائشة رضي الله عنها" },
    chapter: { bn: "গোসল", en: "Bathing", ar: "الغسل" },
  },
  {
    id: 33,
    number: "33",
    arabic: "كَانَ يُخَلِّلُ شَعْرَهُ بِالْمَاءِ",
    translations: {
      bn: "তিনি পানি দিয়ে চুলের মধ্যে খিলাল করতেন।",
      en: "He would run water through his hair.",
      ar: "كَانَ يُخَلِّلُ شَعْرَهُ بِالْمَاءِ",
    },
    narrator: { bn: "আয়েশা (রাঃ)", en: "Aisha (RA)", ar: "عائشة رضي الله عنها" },
    chapter: { bn: "গোসল", en: "Bathing", ar: "الغسل" },
  },

  // Chapter 6: Menstrual Periods (হায়েয)
  {
    id: 34,
    number: "34",
    arabic: "هَذَا شَيْءٌ كَتَبَهُ اللَّهُ عَلَى بَنَاتِ آدَمَ",
    translations: {
      bn: "এটি এমন কিছু যা আল্লাহ আদমের কন্যাদের জন্য নির্ধারণ করেছেন।",
      en: "This is something Allah has ordained for the daughters of Adam.",
      ar: "هَذَا شَيْءٌ كَتَبَهُ اللَّهُ عَلَى بَنَاتِ آدَمَ",
    },
    narrator: { bn: "আয়েশা (রাঃ)", en: "Aisha (RA)", ar: "عائشة رضي الله عنها" },
    chapter: { bn: "হায়েয", en: "Menstrual Periods", ar: "الحيض" },
  },
  {
    id: 35,
    number: "35",
    arabic: "كَانَ يَأْمُرُنِي فَأَتَّزِرُ فَيُبَاشِرُنِي وَأَنَا حَائِضٌ",
    translations: {
      bn: "তিনি আমাকে আদেশ করতেন, আমি কাপড় পরতাম এবং হায়েয অবস্থায় তিনি আমার সাথে মেলামেশা করতেন।",
      en: "He would order me to wear a cloth and then embrace me while I was menstruating.",
      ar: "كَانَ يَأْمُرُنِي فَأَتَّزِرُ فَيُبَاشِرُنِي وَأَنَا حَائِضٌ",
    },
    narrator: { bn: "আয়েশা (রাঃ)", en: "Aisha (RA)", ar: "عائشة رضي الله عنها" },
    chapter: { bn: "হায়েয", en: "Menstrual Periods", ar: "الحيض" },
  },
  {
    id: 36,
    number: "36",
    arabic: "افْعَلِي مَا يَفْعَلُ الْحَاجُّ غَيْرَ أَنْ لاَ تَطُوفِي بِالْبَيْتِ",
    translations: {
      bn: "হাজীরা যা করে তাই করো, তবে বাইতুল্লাহ তাওয়াফ করো না।",
      en: "Do what the pilgrims do except do not circumambulate the House.",
      ar: "افْعَلِي مَا يَفْعَلُ الْحَاجُّ غَيْرَ أَنْ لاَ تَطُوفِي بِالْبَيْتِ",
    },
    narrator: { bn: "আয়েশা (রাঃ)", en: "Aisha (RA)", ar: "عائشة رضي الله عنها" },
    chapter: { bn: "হায়েয", en: "Menstrual Periods", ar: "الحيض" },
  },

  // Chapter 7: Tayammum (তায়াম্মুম)
  {
    id: 37,
    number: "37",
    arabic: "جُعِلَتْ لِي الأَرْضُ مَسْجِدًا وَطَهُورًا",
    translations: {
      bn: "পৃথিবীকে আমার জন্য মসজিদ ও পবিত্রতার মাধ্যম করা হয়েছে।",
      en: "The earth has been made for me a place of prayer and a means of purification.",
      ar: "جُعِلَتْ لِي الأَرْضُ مَسْجِدًا وَطَهُورًا",
    },
    narrator: { bn: "আবু হুরায়রা (রাঃ)", en: "Abu Hurairah (RA)", ar: "أبو هريرة رضي الله عنه" },
    chapter: { bn: "তায়াম্মুম", en: "Tayammum", ar: "التيمم" },
  },
  {
    id: 38,
    number: "38",
    arabic: "الصَّعِيدُ الطَّيِّبُ وَضُوءُ الْمُسْلِمِ وَلَوْ إِلَى عَشْرِ سِنِينَ",
    translations: {
      bn: "পবিত্র মাটি মুসলিমের অযু, দশ বছর পর্যন্ত হলেও।",
      en: "Pure earth is the Muslim's purification even if for ten years.",
      ar: "الصَّعِيدُ الطَّيِّبُ وَضُوءُ الْمُسْلِمِ وَلَوْ إِلَى عَشْرِ سِنِينَ",
    },
    narrator: { bn: "আবু যর (রাঃ)", en: "Abu Dharr (RA)", ar: "أبو ذر رضي الله عنه" },
    chapter: { bn: "তায়াম্মুম", en: "Tayammum", ar: "التيمم" },
  },
  {
    id: 39,
    number: "39",
    arabic: "إِنَّمَا كَانَ يَكْفِيكَ أَنْ تَضْرِبَ بِيَدَيْكَ الأَرْضَ",
    translations: {
      bn: "তোমার জন্য দুই হাত মাটিতে মারাই যথেষ্ট ছিল।",
      en: "It would have been enough for you to strike the ground with your hands.",
      ar: "إِنَّمَا كَانَ يَكْفِيكَ أَنْ تَضْرِبَ بِيَدَيْكَ الأَرْضَ",
    },
    narrator: { bn: "আম্মার ইবনে ইয়াসির (রাঃ)", en: "Ammar ibn Yasir (RA)", ar: "عمار بن ياسر رضي الله عنه" },
    chapter: { bn: "তায়াম্মুম", en: "Tayammum", ar: "التيمم" },
  },

  // Chapter 8: Prayer (সালাত)
  {
    id: 40,
    number: "40",
    arabic: "الصَّلاَةُ عِمَادُ الدِّينِ",
    translations: {
      bn: "নামাজ দ্বীনের স্তম্ভ।",
      en: "Prayer is the pillar of religion.",
      ar: "الصَّلاَةُ عِمَادُ الدِّينِ",
    },
    narrator: { bn: "উমার (রাঃ)", en: "Umar (RA)", ar: "عمر رضي الله عنه" },
    chapter: { bn: "সালাত", en: "Prayer", ar: "الصلاة" },
  },
  {
    id: 41,
    number: "41",
    arabic: "صَلُّوا كَمَا رَأَيْتُمُونِي أُصَلِّي",
    translations: {
      bn: "তোমরা সেভাবে নামাজ পড়ো যেভাবে আমাকে পড়তে দেখেছ।",
      en: "Pray as you have seen me praying.",
      ar: "صَلُّوا كَمَا رَأَيْتُمُونِي أُصَلِّي",
    },
    narrator: { bn: "মালিক ইবনে হুওয়াইরিস (রাঃ)", en: "Malik ibn Huwayrith (RA)", ar: "مالك بن الحويرث رضي الله عنه" },
    chapter: { bn: "সালাত", en: "Prayer", ar: "الصلاة" },
  },
  {
    id: 42,
    number: "42",
    arabic: "أَوَّلُ مَا يُحَاسَبُ بِهِ الْعَبْدُ يَوْمَ الْقِيَامَةِ الصَّلاَةُ",
    translations: {
      bn: "কিয়ামতের দিন বান্দার সর্বপ্রথম যে বিষয়ের হিসাব নেওয়া হবে তা হলো নামাজ।",
      en: "The first thing a servant will be held accountable for on the Day of Judgment is prayer.",
      ar: "أَوَّلُ مَا يُحَاسَبُ بِهِ الْعَبْدُ يَوْمَ الْقِيَامَةِ الصَّلاَةُ",
    },
    narrator: { bn: "আবু হুরায়রা (রাঃ)", en: "Abu Hurairah (RA)", ar: "أبو هريرة رضي الله عنه" },
    chapter: { bn: "সালাত", en: "Prayer", ar: "الصلاة" },
  },
  {
    id: 43,
    number: "43",
    arabic: "بَيْنَ الْعَبْدِ وَبَيْنَ الْكُفْرِ تَرْكُ الصَّلاَةِ",
    translations: {
      bn: "বান্দা এবং কুফরের মধ্যে পার্থক্য হলো নামাজ ছেড়ে দেওয়া।",
      en: "Between a servant and disbelief is abandoning prayer.",
      ar: "بَيْنَ الْعَبْدِ وَبَيْنَ الْكُفْرِ تَرْكُ الصَّلاَةِ",
    },
    narrator: { bn: "জাবির (রাঃ)", en: "Jabir (RA)", ar: "جابر رضي الله عنه" },
    chapter: { bn: "সালাত", en: "Prayer", ar: "الصلاة" },
  },
  {
    id: 44,
    number: "44",
    arabic: "إِنَّ فِي الصَّلاَةِ لَشُغْلاً",
    translations: {
      bn: "নিশ্চয়ই নামাজে যথেষ্ট ব্যস্ততা রয়েছে।",
      en: "Indeed, there is enough preoccupation in prayer.",
      ar: "إِنَّ فِي الصَّلاَةِ لَشُغْلاً",
    },
    narrator: { bn: "ইবনে মাসউদ (রাঃ)", en: "Ibn Masud (RA)", ar: "ابن مسعود رضي الله عنه" },
    chapter: { bn: "সালাত", en: "Prayer", ar: "الصلاة" },
  },
  {
    id: 45,
    number: "45",
    arabic: "جُعِلَتْ قُرَّةُ عَيْنِي فِي الصَّلاَةِ",
    translations: {
      bn: "নামাজে আমার চোখের শীতলতা রাখা হয়েছে।",
      en: "The coolness of my eyes has been placed in prayer.",
      ar: "جُعِلَتْ قُرَّةُ عَيْنِي فِي الصَّلاَةِ",
    },
    narrator: { bn: "আনাস (রাঃ)", en: "Anas (RA)", ar: "أنس رضي الله عنه" },
    chapter: { bn: "সালাত", en: "Prayer", ar: "الصلاة" },
  },
  {
    id: 46,
    number: "46",
    arabic: "صَلاَةُ الْجَمَاعَةِ أَفْضَلُ مِنْ صَلاَةِ الْفَذِّ بِسَبْعٍ وَعِشْرِينَ دَرَجَةً",
    translations: {
      bn: "জামাতে নামাজ একা নামাজের চেয়ে সাতাশ গুণ বেশি মর্যাদাপূর্ণ।",
      en: "Congregational prayer is twenty-seven times more virtuous than praying alone.",
      ar: "صَلاَةُ الْجَمَاعَةِ أَفْضَلُ مِنْ صَلاَةِ الْفَذِّ بِسَبْعٍ وَعِشْرِينَ دَرَجَةً",
    },
    narrator: { bn: "ইবনে উমার (রাঃ)", en: "Ibn Umar (RA)", ar: "ابن عمر رضي الله عنه" },
    chapter: { bn: "সালাত", en: "Prayer", ar: "الصلاة" },
  },

  // Chapter 9: Prayer Times (সালাতের সময়)
  {
    id: 47,
    number: "47",
    arabic: "أَمَّنِي جِبْرِيلُ عِنْدَ الْبَيْتِ مَرَّتَيْنِ",
    translations: {
      bn: "জিবরীল আমাকে বাইতুল্লাহর কাছে দুইবার নামাজ পড়িয়েছেন।",
      en: "Gabriel led me in prayer at the House twice.",
      ar: "أَمَّنِي جِبْرِيلُ عِنْدَ الْبَيْتِ مَرَّتَيْنِ",
    },
    narrator: { bn: "ইবনে আব্বাস (রাঃ)", en: "Ibn Abbas (RA)", ar: "ابن عباس رضي الله عنه" },
    chapter: { bn: "সালাতের সময়", en: "Prayer Times", ar: "مواقيت الصلاة" },
  },
  {
    id: 48,
    number: "48",
    arabic: "الْوَقْتُ بَيْنَ هَذَيْنِ",
    translations: {
      bn: "এই দুইয়ের মাঝেই হলো সময়।",
      en: "The time is between these two.",
      ar: "الْوَقْتُ بَيْنَ هَذَيْنِ",
    },
    narrator: { bn: "জাবির (রাঃ)", en: "Jabir (RA)", ar: "جابر رضي الله عنه" },
    chapter: { bn: "সালাতের সময়", en: "Prayer Times", ar: "مواقيت الصلاة" },
  },
  {
    id: 49,
    number: "49",
    arabic: "أَبْرِدُوا بِالظُّهْرِ فَإِنَّ شِدَّةَ الْحَرِّ مِنْ فَيْحِ جَهَنَّمَ",
    translations: {
      bn: "যোহরের নামাজ ঠান্ডায় পড়ো, কারণ প্রচণ্ড গরম জাহান্নামের উত্তাপ থেকে।",
      en: "Delay Dhuhr prayer in hot weather because intense heat is from the blazing of Hell.",
      ar: "أَبْرِدُوا بِالظُّهْرِ فَإِنَّ شِدَّةَ الْحَرِّ مِنْ فَيْحِ جَهَنَّمَ",
    },
    narrator: { bn: "আবু হুরায়রা (রাঃ)", en: "Abu Hurairah (RA)", ar: "أبو هريرة رضي الله عنه" },
    chapter: { bn: "সালাতের সময়", en: "Prayer Times", ar: "مواقيت الصلاة" },
  },
  {
    id: 50,
    number: "50",
    arabic: "مَنْ أَدْرَكَ رَكْعَةً مِنَ الصَّلاَةِ فَقَدْ أَدْرَكَ الصَّلاَةَ",
    translations: {
      bn: "যে নামাজের এক রাকাত পেল সে নামাজ পেল।",
      en: "Whoever catches one rakah of prayer has caught the prayer.",
      ar: "مَنْ أَدْرَكَ رَكْعَةً مِنَ الصَّلاَةِ فَقَدْ أَدْرَكَ الصَّلاَةَ",
    },
    narrator: { bn: "আবু হুরায়রা (রাঃ)", en: "Abu Hurairah (RA)", ar: "أبو هريرة رضي الله عنه" },
    chapter: { bn: "সালাতের সময়", en: "Prayer Times", ar: "مواقيت الصلاة" },
  },
  {
    id: 51,
    number: "51",
    arabic: "لَوْ يَعْلَمُ النَّاسُ مَا فِي النِّدَاءِ وَالصَّفِّ الأَوَّلِ ثُمَّ لَمْ يَجِدُوا إِلاَّ أَنْ يَسْتَهِمُوا عَلَيْهِ لاَسْتَهَمُوا",
    translations: {
      bn: "মানুষ যদি জানত আযান দেওয়া ও প্রথম কাতারে দাঁড়ানোর সওয়াব, তাহলে লটারি করে হলেও তা অর্জন করত।",
      en: "If people knew the reward of calling the Adhan and standing in the first row, they would draw lots for it.",
      ar: "لَوْ يَعْلَمُ النَّاسُ مَا فِي النِّدَاءِ وَالصَّفِّ الأَوَّلِ ثُمَّ لَمْ يَجِدُوا إِلاَّ أَنْ يَسْتَهِمُوا عَلَيْهِ لاَسْتَهَمُوا",
    },
    narrator: { bn: "আবু হুরায়রা (রাঃ)", en: "Abu Hurairah (RA)", ar: "أبو هريرة رضي الله عنه" },
    chapter: { bn: "সালাতের সময়", en: "Prayer Times", ar: "مواقيت الصلاة" },
  },

  // Chapter 10: Call to Prayer (আযান)
  {
    id: 52,
    number: "52",
    arabic: "إِذَا سَمِعْتُمُ الْمُؤَذِّنَ فَقُولُوا مِثْلَ مَا يَقُولُ",
    translations: {
      bn: "যখন মুয়াজ্জিনের আযান শোনো, সে যা বলে তাই বলো।",
      en: "When you hear the muezzin, repeat what he says.",
      ar: "إِذَا سَمِعْتُمُ الْمُؤَذِّنَ فَقُولُوا مِثْلَ مَا يَقُولُ",
    },
    narrator: { bn: "আবু সাঈদ খুদরী (রাঃ)", en: "Abu Said Al-Khudri (RA)", ar: "أبو سعيد الخدري رضي الله عنه" },
    chapter: { bn: "আযান", en: "Call to Prayer", ar: "الأذان" },
  },
  {
    id: 53,
    number: "53",
    arabic: "الْمُؤَذِّنُونَ أَطْوَلُ النَّاسِ أَعْنَاقًا يَوْمَ الْقِيَامَةِ",
    translations: {
      bn: "মুয়াজ্জিনরা কিয়ামতের দিন সবচেয়ে লম্বা ঘাড়ের অধিকারী হবে।",
      en: "The muezzins will have the longest necks on the Day of Resurrection.",
      ar: "الْمُؤَذِّنُونَ أَطْوَلُ النَّاسِ أَعْنَاقًا يَوْمَ الْقِيَامَةِ",
    },
    narrator: { bn: "মুআবিয়া (রাঃ)", en: "Muawiyah (RA)", ar: "معاوية رضي الله عنه" },
    chapter: { bn: "আযান", en: "Call to Prayer", ar: "الأذان" },
  },
  {
    id: 54,
    number: "54",
    arabic: "الدُّعَاءُ لاَ يُرَدُّ بَيْنَ الأَذَانِ وَالإِقَامَةِ",
    translations: {
      bn: "আযান ও ইকামতের মাঝে দোয়া ফিরিয়ে দেওয়া হয় না।",
      en: "Supplication between the Adhan and Iqamah is not rejected.",
      ar: "الدُّعَاءُ لاَ يُرَدُّ بَيْنَ الأَذَانِ وَالإِقَامَةِ",
    },
    narrator: { bn: "আনাস (রাঃ)", en: "Anas (RA)", ar: "أنس رضي الله عنه" },
    chapter: { bn: "আযান", en: "Call to Prayer", ar: "الأذان" },
  },
  {
    id: 55,
    number: "55",
    arabic: "إِذَا نُودِيَ بِالصَّلاَةِ أَدْبَرَ الشَّيْطَانُ وَلَهُ ضُرَاطٌ",
    translations: {
      bn: "যখন নামাজের জন্য আযান দেওয়া হয় শয়তান পালিয়ে যায়।",
      en: "When the call to prayer is made, Satan flees.",
      ar: "إِذَا نُودِيَ بِالصَّلاَةِ أَدْبَرَ الشَّيْطَانُ وَلَهُ ضُرَاطٌ",
    },
    narrator: { bn: "আবু হুরায়রা (রাঃ)", en: "Abu Hurairah (RA)", ar: "أبو هريرة رضي الله عنه" },
    chapter: { bn: "আযান", en: "Call to Prayer", ar: "الأذان" },
  },
  {
    id: 56,
    number: "56",
    arabic: "مَنْ قَالَ حِينَ يَسْمَعُ النِّدَاءَ اللَّهُمَّ رَبَّ هَذِهِ الدَّعْوَةِ التَّامَّةِ",
    translations: {
      bn: "যে ব্যক্তি আযান শুনে বলে, 'হে আল্লাহ, এই পরিপূর্ণ আহ্বানের রব...'",
      en: "Whoever says upon hearing the call, 'O Allah, Lord of this complete call...'",
      ar: "مَنْ قَالَ حِينَ يَسْمَعُ النِّدَاءَ اللَّهُمَّ رَبَّ هَذِهِ الدَّعْوَةِ التَّامَّةِ",
    },
    narrator: { bn: "জাবির (রাঃ)", en: "Jabir (RA)", ar: "جابر رضي الله عنه" },
    chapter: { bn: "আযান", en: "Call to Prayer", ar: "الأذان" },
  },
  {
    id: 57,
    number: "57",
    arabic: "لاَ يَسْمَعُ مَدَى صَوْتِ الْمُؤَذِّنِ جِنٌّ وَلاَ إِنْسٌ وَلاَ شَيْءٌ إِلاَّ شَهِدَ لَهُ يَوْمَ الْقِيَامَةِ",
    translations: {
      bn: "মুয়াজ্জিনের আওয়াজ যত দূর পর্যন্ত পৌঁছে, জ্বিন, মানুষ সবই কিয়ামতের দিন তার পক্ষে সাক্ষ্য দেবে।",
      en: "Whatever hears the voice of the muezzin - jinn, human, or anything - will testify for him on the Day of Judgment.",
      ar: "لاَ يَسْمَعُ مَدَى صَوْتِ الْمُؤَذِّنِ جِنٌّ وَلاَ إِنْسٌ وَلاَ شَيْءٌ إِلاَّ شَهِدَ لَهُ يَوْمَ الْقِيَامَةِ",
    },
    narrator: { bn: "আবু সাঈদ খুদরী (রাঃ)", en: "Abu Said Al-Khudri (RA)", ar: "أبو سعيد الخدري رضي الله عنه" },
    chapter: { bn: "আযান", en: "Call to Prayer", ar: "الأذان" },
  },
  {
    id: 58,
    number: "58",
    arabic: "بِلاَلٌ يُؤَذِّنُ بِلَيْلٍ فَكُلُوا وَاشْرَبُوا حَتَّى يُؤَذِّنَ ابْنُ أُمِّ مَكْتُومٍ",
    translations: {
      bn: "বেলাল রাতে আযান দেয়, তাই তোমরা খাও-পান করো যতক্ষণ না ইবনে উম্মে মাকতুম আযান দেয়।",
      en: "Bilal calls the Adhan at night, so eat and drink until Ibn Umm Maktum calls the Adhan.",
      ar: "بِلاَلٌ يُؤَذِّنُ بِلَيْلٍ فَكُلُوا وَاشْرَبُوا حَتَّى يُؤَذِّنَ ابْنُ أُمِّ مَكْتُومٍ",
    },
    narrator: { bn: "ইবনে উমার (রাঃ)", en: "Ibn Umar (RA)", ar: "ابن عمر رضي الله عنه" },
    chapter: { bn: "আযান", en: "Call to Prayer", ar: "الأذان" },
  },
];

const uiText = {
  bn: {
    title: "সহিহ বুখারী শরীফ",
    subtitle: "সর্বাধিক বিশ্বস্ত হাদিস সংকলন",
    searchPlaceholder: "হাদিস খুঁজুন...",
    chapters: "অধ্যায়সমূহ",
    allHadiths: "সকল হাদিস",
    hadithNo: "হাদিস নং",
    narrator: "বর্ণনাকারী",
    chapter: "অধ্যায়",
    hadiths: "টি হাদিস",
  },
  en: {
    title: "Sahih Al-Bukhari",
    subtitle: "The Hadith Collection",
    searchPlaceholder: "Search hadiths...",
    chapters: "Chapters",
    allHadiths: "All Hadiths",
    hadithNo: "Hadith No",
    narrator: "Narrator",
    chapter: "Chapter",
    hadiths: "Hadiths",
  },
  ar: {
    title: "صحيح البخاري",
    subtitle: "أصح كتب الحديث",
    searchPlaceholder: "ابحث عن الأحاديث...",
    chapters: "الأبواب",
    allHadiths: "جميع الأحاديث",
    hadithNo: "حديث رقم",
    narrator: "الراوي",
    chapter: "الباب",
    hadiths: "أحاديث",
  },
};

const BukhariPage = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [language, setLanguage] = useState<Language>("bn");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedHadith, setSelectedHadith] = useState<Hadith | null>(null);
  const [selectedChapter, setSelectedChapter] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<"chapters" | "hadiths">("hadiths");
  const [showLanguageMenu, setShowLanguageMenu] = useState(false);

  const chapterParam = searchParams.get("chapter");
  const hadithParam = searchParams.get("hadith");
  const chapterId = chapterParam ? Number(chapterParam) : null;

  useEffect(() => {
    if (!chapterId || !Number.isFinite(chapterId)) {
      setSelectedChapter(null);
      return;
    }
    setSelectedChapter(chapterId);
  }, [chapterId]);

  useEffect(() => {
    if (!hadithParam) {
      setSelectedHadith(null);
      return;
    }
    const found = hadiths.find((h) => String(h.id) === hadithParam) ?? null;
    setSelectedHadith(found);
  }, [hadithParam]);

  const goBack = () => navigate(-1);

  const openChapter = (id: number) => {
    setSearchParams({ chapter: String(id) }, { replace: false });
    setActiveTab("hadiths");
  };

  const openHadith = (id: number) => {
    const next: Record<string, string> = {};
    if (selectedChapter !== null) next.chapter = String(selectedChapter);
    next.hadith = String(id);
    setSearchParams(next, { replace: false });
  };

  const t = uiText[language];
  const isRtl = language === "ar";

  const filteredHadiths = hadiths.filter((hadith) => {
    const searchLower = searchQuery.toLowerCase();
    const matchesSearch = 
      hadith.translations[language].toLowerCase().includes(searchLower) ||
      hadith.arabic.includes(searchQuery) ||
      hadith.number.includes(searchQuery) ||
      hadith.narrator[language].toLowerCase().includes(searchLower);
    
    // Filter by chapter if selected
    if (selectedChapter !== null) {
      const chapterName = chapters.find(c => c.id === selectedChapter)?.name[language];
      return matchesSearch && hadith.chapter[language] === chapterName;
    }
    
    return matchesSearch;
  });

  return (
    <div 
      className="min-h-screen bg-gradient-to-b from-emerald-900 via-emerald-800 to-teal-900"
      style={{ direction: isRtl ? "rtl" : "ltr" }}
    >
      {/* Header */}
      <motion.header
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="sticky top-0 z-50 bg-emerald-900/95 backdrop-blur-lg border-b border-white/10"
      >
        <div className="flex items-center justify-between px-4 py-4">
          <div className="flex items-center gap-3">
            <button
              onClick={goBack}
              className="p-2 -ml-2 text-white/80 hover:text-white hover:bg-white/10 rounded-full transition-colors"
            >
              <ArrowLeft className="w-5 h-5" style={{ transform: isRtl ? "scaleX(-1)" : "none" }} />
            </button>
            <div>
              <h1 className="text-xl font-display font-bold text-white tracking-wide">
                {selectedChapter !== null 
                  ? chapters.find(c => c.id === selectedChapter)?.name[language] 
                  : t.title}
              </h1>
              <p className="text-xs text-white/70">
                {selectedChapter !== null 
                  ? `${filteredHadiths.length} ${t.hadiths}` 
                  : t.subtitle}
              </p>
            </div>
          </div>

          {/* Language Selector */}
          <div className="relative">
            <button
              onClick={() => setShowLanguageMenu(!showLanguageMenu)}
              className="flex items-center gap-2 px-3 py-2 bg-white/10 hover:bg-white/15 rounded-full transition-colors text-white"
            >
              <Globe size={16} />
              <span className="text-sm">{languages.find(l => l.code === language)?.name}</span>
            </button>
            
            <AnimatePresence>
              {showLanguageMenu && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="absolute top-full mt-2 right-0 bg-emerald-800 rounded-xl shadow-xl overflow-hidden min-w-[120px] z-50"
                >
                  {languages.map((lang) => (
                    <button
                      key={lang.code}
                      onClick={() => {
                        setLanguage(lang.code);
                        setShowLanguageMenu(false);
                      }}
                      className={`w-full px-4 py-3 text-left hover:bg-white/10 transition-colors ${
                        language === lang.code ? "bg-white/10 text-emerald-300" : "text-white"
                      }`}
                    >
                      {lang.name}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Search */}
        {!selectedHadith && (
          <div className="px-4 pb-4">
            <div className="relative">
              <Search 
                className="absolute top-1/2 -translate-y-1/2 w-5 h-5 text-white/50" 
                style={{ left: isRtl ? "auto" : "1rem", right: isRtl ? "1rem" : "auto" }}
              />
              <Input
                placeholder={t.searchPlaceholder}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-12 rounded-xl bg-white/15 border-0 text-white placeholder:text-white/50"
                style={{ paddingLeft: isRtl ? "1rem" : "3rem", paddingRight: isRtl ? "3rem" : "1rem" }}
              />
            </div>
          </div>
        )}
      </motion.header>

      <AnimatePresence mode="wait">
        {selectedHadith ? (
          // Hadith Detail View
          <motion.div
            key="detail"
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -50 }}
            className="p-4 space-y-4"
          >
            {/* Hadith Number Badge */}
            <div className="flex justify-center">
              <div className="bg-white/20 backdrop-blur-sm border border-white/30 px-8 py-3 rounded-full shadow-lg">
                <span className="text-white font-display font-bold text-lg tracking-wide">{t.hadithNo} {selectedHadith.number}</span>
              </div>
            </div>

            {/* Arabic Text */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="bg-white/10 backdrop-blur-md rounded-3xl p-8 border border-white/20 shadow-2xl"
            >
              <p className="text-3xl font-arabic text-white leading-[2.2] text-right drop-shadow-sm" dir="rtl">
                {selectedHadith.arabic}
              </p>
            </motion.div>

            {/* Translation */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="bg-white/10 backdrop-blur-md rounded-3xl p-8 border border-white/20 shadow-2xl"
            >
              <p className={`text-lg text-white leading-relaxed font-medium ${isRtl ? "text-right font-arabic" : ""}`}>
                {selectedHadith.translations[language]}
              </p>
            </motion.div>

            {/* Narrator & Chapter Info */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="grid grid-cols-2 gap-4"
            >
              <div className="bg-white/10 backdrop-blur-md rounded-2xl p-5 border border-white/20 shadow-xl">
                <p className="text-white/70 text-sm mb-2 font-medium uppercase tracking-wider">{t.narrator}</p>
                <p className="text-white font-semibold text-base">{selectedHadith.narrator[language]}</p>
              </div>
              <div className="bg-white/10 backdrop-blur-md rounded-2xl p-5 border border-white/20 shadow-xl">
                <p className="text-white/70 text-sm mb-2 font-medium uppercase tracking-wider">{t.chapter}</p>
                <p className="text-white font-semibold text-base">{selectedHadith.chapter[language]}</p>
              </div>
            </motion.div>
          </motion.div>
        ) : (
          // List View
          <motion.div
            key="list"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="p-4"
          >
            {/* Tabs */}
            <div className="flex gap-3 mb-6">
              <button
                onClick={() => setActiveTab("hadiths")}
                className={`flex-1 py-4 rounded-2xl font-display font-semibold tracking-wide transition-all shadow-xl ${
                  activeTab === "hadiths"
                    ? "bg-white/20 text-white border border-white/30 backdrop-blur-sm"
                    : "bg-white/5 text-white/70 border border-white/10"
                }`}
              >
                {t.allHadiths}
              </button>
              <button
                onClick={() => setActiveTab("chapters")}
                className={`flex-1 py-4 rounded-2xl font-display font-semibold tracking-wide transition-all shadow-xl ${
                  activeTab === "chapters"
                    ? "bg-white/20 text-white border border-white/30 backdrop-blur-sm"
                    : "bg-white/5 text-white/70 border border-white/10"
                }`}
              >
                {t.chapters}
              </button>
            </div>

            {activeTab === "hadiths" ? (
              // Hadiths List
              <div className="space-y-4">
                {filteredHadiths.map((hadith, index) => (
                  <motion.button
                    key={hadith.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.03 }}
                    onClick={() => openHadith(hadith.id)}
                    className="w-full text-left bg-white/10 backdrop-blur-md rounded-2xl p-5 hover:bg-white/15 transition-all active:scale-[0.98] shadow-xl border border-white/20"
                  >
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0 border border-white/30">
                        <span className="text-white font-display font-bold">{hadith.number}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-white line-clamp-2 mb-2 font-medium leading-relaxed">
                          {hadith.translations[language]}
                        </p>
                        <div className="flex items-center gap-2 text-sm text-white/60">
                          <BookOpen size={14} />
                          <span>{hadith.narrator[language]}</span>
                        </div>
                      </div>
                      <ChevronRight className="text-white/50 flex-shrink-0 mt-1" size={22} />
                    </div>
                  </motion.button>
                ))}
              </div>
            ) : (
              // Chapters List
              <div className="space-y-4">
                {chapters.map((chapter, index) => {
                  // Count hadiths in this chapter
                  const chapterHadithCount = hadiths.filter(
                    h => h.chapter[language] === chapter.name[language]
                  ).length;
                  
                  return (
                    <motion.button
                      key={chapter.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.03 }}
                      onClick={() => {
                        openChapter(chapter.id);
                      }}
                      className="w-full text-left bg-white/10 backdrop-blur-md rounded-2xl p-5 hover:bg-white/15 transition-all active:scale-[0.98] shadow-xl border border-white/20"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center border border-white/30">
                            <span className="text-white font-display font-bold">{chapter.id}</span>
                          </div>
                          <div>
                            <p className="text-white font-semibold text-base">{chapter.name[language]}</p>
                            <p className="text-white/60 text-sm">{chapterHadithCount} {t.hadiths}</p>
                          </div>
                        </div>
                        <ChevronRight className="text-white/50" size={22} />
                      </div>
                    </motion.button>
                  );
                })}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default BukhariPage;
