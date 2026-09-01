/**
 * Bilingual (Bengali + English) SEO meta defaults for all public pages.
 * Used as fallback when no admin override exists in seo_pages table.
 *
 * Rules:
 * - Titles ≤ 60 chars with main keyword; mixed EN+BN
 * - Descriptions 120–160 chars, mixed EN+BN, natural & human-readable
 * - No duplicate descriptions across pages
 */

export type PageSeoDefaults = {
  title: string;
  description: string;
};

const DEFAULTS: Record<string, PageSeoDefaults> = {
  "/": {
    title: "Noor – Quran, Hadith, Dua & Prayer Times",
    description:
      "Read authentic Quran, Hadith, Dua, Prayer Times, Qibla, Islamic Stories and Baby Names in Bengali with a fast and beautiful Islamic app.",
  },
  "/islamic-app": {
    title: "Islamic App – Quran, Hadith, Dua & Prayer Times",
    description:
      "Noor brings Quran reading, Hadith, Duas, Prayer Times, Qibla, Islamic calendar and a daily quiz together for Bengali-speaking Muslims.",
  },
  "/quran": {
    title: "Quran Reader — পবিত্র কুরআন | NOOR",
    description:
      "Read the Holy Quran with Arabic text, Bengali translation & audio recitation — সূরা তিলাওয়াত, তাফসীর ও অডিও সহ সম্পূর্ণ কুরআন পাঠ করুন।",
  },
  "/prayer-times": {
    title: "Prayer Times — নামাজের সময়সূচী | NOOR",
    description:
      "Accurate daily Salah times for your location — ফজর, যোহর, আসর, মাগরিব ও এশার সঠিক সময় জানুন। Athan alerts & countdown timer included.",
  },
  "/dua": {
    title: "Duas & Supplications — দোয়া সমূহ | NOOR",
    description:
      "Authentic Islamic duas with Arabic, Bengali meaning & audio — দৈনন্দিন মাসনূন দোয়া, কুরআনের দোয়া ও হাদিসের দোয়া সংকলন।",
  },
  "/quiz": {
    title: "Daily Islamic Quiz — ইসলামিক কুইজ | NOOR",
    description:
      "Test & improve your Islamic knowledge daily — প্রতিদিন ৫টি কুইজে অংশ নিন, স্কোর অর্জন করুন, streak বজায় রাখুন ও নতুন কিছু শিখুন।",
  },
  "/hadith": {
    title: "Authentic Hadith Collections – Noor App",
    description:
      "Browse authentic Hadith collections — Sahih Bukhari, Sahih Muslim, Jami at-Tirmidhi & Sunan Abu Dawud with Arabic text and translations in Bangla, English & Urdu.",
  },
  "/hadith/sahih-bukhari": {
    title: "Sahih al-Bukhari Hadith Collection – Noor App",
    description:
      "Read Sahih al-Bukhari in Bangla, English, or Urdu with Arabic text, chapter navigation and collection references on Noor App.",
  },
  "/hadith/sahih-bukhari/bangla": {
    title: "Sahih Bukhari Bangla – সহীহ বুখারী বাংলা হাদিস | Noor App",
    description:
      "সহীহ বুখারী শরীফের সম্পূর্ণ হাদিস আরবি ও বাংলা অনুবাদ সহ পড়ুন। Read Sahih Bukhari Bangla with Arabic text & translation on Noor App.",
  },
  "/hadith/sahih-bukhari/english": {
    title: "Sahih Bukhari English – Authentic Hadith Collection | Noor App",
    description:
      "Read Sahih Bukhari in English with Arabic text, translation, chapter navigation and collection references on Noor App.",
  },
  "/hadith/sahih-bukhari/urdu": {
    title: "Sahih Bukhari Urdu – صحیح بخاری اردو حدیث | Noor App",
    description:
      "صحیح بخاری کی مکمل احادیث عربی متن اور اردو ترجمہ کے ساتھ پڑھیں۔ Read Sahih Bukhari Urdu hadith with Arabic text on Noor App.",
  },
  "/hadith/muslim": {
    title: "Sahih Muslim — সহীহ মুসলিম হাদিস | Noor",
    description:
      "Read Sahih Muslim Hadith with Arabic text, Bengali translation, chapter navigation and collection references on Noor App.",
  },
  "/hadith/tirmidhi": {
    title: "Jami at-Tirmidhi — জামে তিরমিযী হাদিস | Noor",
    description:
      "Explore Jami at-Tirmidhi with Arabic text, Bengali translation, chapter navigation and available hadith grading on Noor App.",
  },
  "/hadith/abu-dawud": {
    title: "Sunan Abu Dawud — সুনানে আবু দাউদ হাদিস | Noor",
    description:
      "Read Sunan Abu Dawud with Arabic text, Bengali translation, chapter navigation and collection references on Noor App.",
  },
  "/prayer-guide": {
    title: "Prayer Guide — নামাজ শিক্ষা | NOOR",
    description:
      "Step-by-step Salah tutorial with illustrations — ওযু, নামাজের নিয়ম, সূরা, দোয়া ও তাশাহহুদ সহ সম্পূর্ণ নামাজ শিক্ষা গাইড।",
  },
  "/tasbih": {
    title: "Digital Tasbih — ডিজিটাল তাসবীহ | NOOR",
    description:
      "Beautiful digital Tasbih counter for dhikr — সুবহানাল্লাহ, আলহামদুলিল্লাহ, আল্লাহু আকবার সহজে গণনা করুন। Haptic feedback supported.",
  },
  "/qibla": {
    title: "Qibla Finder — কিবলার দিক | NOOR",
    description:
      "Find accurate Qibla direction using compass — আপনার বর্তমান অবস্থান থেকে মক্কার কাবা শরীফের সঠিক দিক নির্ণয় করুন।",
  },
  "/99-names": {
    title: "99 Names of Allah — আল্লাহর ৯৯ নাম | NOOR",
    description:
      "Learn the 99 beautiful names (Asma ul Husna) of Allah — আল্লাহ তাআলার ৯৯টি গুণবাচক নাম আরবি, অর্থ ও ফযীলত সহ জানুন।",
  },
  "/baby-names": {
    title: "Muslim Baby Names with Meaning – Islamic Boys & Girls Names (1000+) | Noor App",
    description:
      "Find beautiful Muslim baby names for boys and girls with Arabic spelling and meanings. Browse thousands of Islamic names in Bangla and English on Noor App. ইসলামিক ছেলে ও মেয়েদের সুন্দর নাম অর্থসহ দেখুন।",
  },
  "/names": {
    title: "Islamic Names — ইসলামিক নামের তালিকা | NOOR",
    description:
      "Browse thousands of Islamic names with Arabic script & meanings — আরবি, বাংলা উচ্চারণ ও অর্থসহ ইসলামিক নাম খুঁজুন ও শেয়ার করুন।",
  },
  "/calendar": {
    title: "Islamic Calendar — হিজরি ক্যালেন্ডার | NOOR",
    description:
      "Hijri calendar with key Islamic dates — রমজান, ঈদুল ফিতর, ঈদুল আযহা, শবে কদর ও অন্যান্য গুরুত্বপূর্ণ ইসলামিক দিবস দেখুন।",
  },
  "/about": {
    title: "About NOOR — আমাদের সম্পর্কে | NOOR",
    description:
      "Learn about the NOOR app mission & team — ইসলামিক শিক্ষা ও আধুনিক প্রযুক্তি একত্রে আনার আমাদের লক্ষ্য, উদ্দেশ্য ও গল্প।",
  },
  "/contact": {
    title: "Contact Us — যোগাযোগ | NOOR",
    description:
      "Get in touch with the NOOR team — প্রশ্ন, পরামর্শ, বাগ রিপোর্ট বা সহযোগিতার জন্য আমাদের সাথে সরাসরি যোগাযোগ করুন।",
  },
  "/privacy-policy": {
    title: "Privacy Policy — গোপনীয়তা নীতি | NOOR",
    description:
      "NOOR app privacy policy & data protection — আপনার ব্যক্তিগত তথ্যের নিরাপত্তা, সংরক্ষণ ও ব্যবহার সম্পর্কে বিস্তারিত জানুন।",
  },
  "/terms": {
    title: "Terms of Service — ব্যবহারের শর্তাবলী | NOOR",
    description:
      "NOOR app terms & conditions — অ্যাপ ব্যবহারের শর্তাবলী, ব্যবহারকারীর দায়িত্ব ও অধিকার সম্পর্কে বিস্তারিত পড়ুন।",
  },
  "/settings": {
    title: "Settings — সেটিংস | NOOR",
    description:
      "Customize your NOOR experience — ভাষা, থিম, নোটিফিকেশন, আযানের সেটিংস ও অন্যান্য পছন্দ অনুযায়ী কাস্টমাইজ করুন।",
  },
  "/notifications": {
    title: "Notifications — নোটিফিকেশন | NOOR",
    description:
      "Manage your notification preferences — নামাজের আযান, কুইজ রিমাইন্ডার ও গুরুত্বপূর্ণ আপডেট নোটিফিকেশন পরিচালনা করুন।",
  },
  "/download": {
    title: "Download Noor App — Android APK | NOOR",
    description:
      "Download Noor Islamic App for Android — কুরআন, হাদিস, নামাজের সময়, দোয়া ও ইসলামিক কুইজ সহ সম্পূর্ণ ইসলামিক অ্যাপ ডাউনলোড করুন।",
  },
  "/sitemap": {
    title: "Sitemap — সাইটম্যাপ | NOOR",
    description:
      "Browse all pages on Noor Islamic App — Quran, Hadith, Dua, Prayer Times, Quiz ও সকল পেজের সম্পূর্ণ তালিকা দেখুন।",
  },
};

/**
 * Returns bilingual SEO defaults for a given pathname.
 * Falls back to null for unknown routes.
 * Accepts optional appName to personalise the title.
 */
export function getPageSeoDefaults(
  pathname: string,
  appName?: string,
): PageSeoDefaults | null {
  // Check exact match first
  let entry = DEFAULTS[pathname];

  // Dynamic chapter routes: /hadith/sahih-bukhari/:lang/chapter-:id
  if (!entry) {
    const chapterMatch = pathname.match(
      /^\/hadith\/sahih-bukhari\/(bangla|english|urdu)\/chapter-(\d+)$/,
    );
    if (chapterMatch) {
      const [, lang, chapterNum] = chapterMatch;
      const langLabels: Record<string, PageSeoDefaults> = {
        bangla: {
          title: `Sahih Bukhari Bangla Chapter ${chapterNum} – সহীহ বুখারী অধ্যায় ${chapterNum} | Noor`,
          description: `Read Sahih Bukhari Chapter ${chapterNum} in Bangla with Arabic text — সহীহ বুখারী অধ্যায় ${chapterNum} এর সকল হাদিস বাংলা অনুবাদ সহ পড়ুন।`,
        },
        english: {
          title: `Sahih Bukhari Chapter ${chapterNum} – English Hadith | Noor`,
          description: `Browse all hadiths in Sahih Bukhari Chapter ${chapterNum} with Arabic text and English translation on Noor App.`,
        },
        urdu: {
          title: `Sahih Bukhari Chapter ${chapterNum} – صحیح بخاری باب ${chapterNum} | Noor`,
          description: `صحیح بخاری باب ${chapterNum} کی تمام احادیث عربی متن اور اردو ترجمے کے ساتھ پڑھیں۔`,
        },
      };
      entry = langLabels[lang] || langLabels.english;
    }
  }

  if (!entry) return null;

  // Optionally replace "NOOR" with the configured app name
  if (appName && appName !== "NOOR" && appName !== "Noor") {
    return {
      title: entry.title.replace(/NOOR/g, appName),
      description: entry.description.replace(/NOOR/g, appName),
    };
  }

  return entry;
}
