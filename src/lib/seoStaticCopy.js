/**
 * seoStaticCopy.js — SINGLE SOURCE OF TRUTH (M-05, Option C) for the
 * title/description of the 14 Tier 1 static routes, shared by the SPA
 * (src/lib/seoDefaults.ts) and the prerender function (api/prerender.js).
 *
 * Migration rule (owner-approved 2026-10-24): the SPA wording is the
 * default; /sources keeps its existing prerender wording and gains a
 * corresponding SPA entry through this module. Heading, intro and
 * sections stay in api/prerender.js STATIC_PAGE_COPY and are NOT part
 * of this module. Hub branches (/quran, /dua, /stories, /hadith,
 * /contact) and deep-route metadata are out of scope for M-05.
 *
 * Plain JavaScript on purpose: both the Vite SPA bundle and the plain
 * Node handler harness import this file directly, with no TS bridge.
 */

export const SEO_STATIC_COPY = {
  "/99-names": {
    title: "99 Names of Allah — আল্লাহর ৯৯ নাম | Noor",
    description: "Learn the 99 beautiful names (Asma ul Husna) of Allah — আল্লাহ তাআলার ৯৯টি গুণবাচক নাম আরবি, অর্থ ও ফযীলত সহ জানুন।",
  },
  "/about": {
    title: "About Noor — আমাদের সম্পর্কে | Noor",
    description: "Learn about the NOOR app mission & team — ইসলামিক শিক্ষা ও আধুনিক প্রযুক্তি একত্রে আনার আমাদের লক্ষ্য, উদ্দেশ্য ও গল্প।",
  },
  "/baby-names": {
    title: "Muslim Baby Names with Meaning – Islamic Boys & Girls Names (1000+) | Noor",
    description: "Find beautiful Muslim baby names for boys and girls with Arabic spelling and meanings. Browse thousands of Islamic names in Bangla and English on Noor App. ইসলামিক ছেলে ও মেয়েদের সুন্দর নাম অর্থসহ দেখুন।",
  },
  "/calendar": {
    title: "Islamic Calendar — হিজরি ক্যালেন্ডার | Noor",
    description: "Hijri calendar with key Islamic dates — রমজান, ঈদুল ফিতর, ঈদুল আযহা, শবে কদর ও অন্যান্য গুরুত্বপূর্ণ ইসলামিক দিবস দেখুন।",
  },
  "/download": {
    title: "Download Noor App — Install the Web App | Noor",
    description: "Learn how to install Noor as a Progressive Web App on supported devices, with access to Quran, Hadith, prayer times, Dua and Islamic learning tools.",
  },
  "/islamic-app": {
    title: "Islamic App – Quran, Hadith, Dua & Prayer Times",
    description: "Noor brings Quran reading, Hadith, Duas, Prayer Times, Qibla, Islamic calendar and a daily quiz together for Bengali-speaking Muslims.",
  },
  "/prayer-guide": {
    title: "Prayer Guide — নামাজ শিক্ষা | Noor",
    description: "Step-by-step Salah tutorial with illustrations — ওযু, নামাজের নিয়ম, সূরা, দোয়া ও তাশাহহুদ সহ সম্পূর্ণ নামাজ শিক্ষা গাইড।",
  },
  "/prayer-times": {
    title: "Prayer Times — নামাজের সময়সূচী | Noor",
    description: "Accurate daily Salah times for your location — ফজর, যোহর, আসর, মাগরিব ও এশার সঠিক সময় জানুন। Athan alerts & countdown timer included.",
  },
  "/privacy-policy": {
    title: "Privacy Policy — গোপনীয়তা নীতি | Noor",
    description: "NOOR app privacy policy & data protection — আপনার ব্যক্তিগত তথ্যের নিরাপত্তা, সংরক্ষণ ও ব্যবহার সম্পর্কে বিস্তারিত জানুন।",
  },
  "/qibla": {
    title: "Qibla Finder — কিবলার দিক | Noor",
    description: "Find accurate Qibla direction using compass — আপনার বর্তমান অবস্থান থেকে মক্কার কাবা শরীফের সঠিক দিক নির্ণয় করুন।",
  },
  "/quiz": {
    title: "Daily Islamic Quiz — ইসলামিক কুইজ | Noor",
    description: "Test & improve your Islamic knowledge daily — প্রতিদিন ৫টি কুইজে অংশ নিন, স্কোর অর্জন করুন, streak বজায় রাখুন ও নতুন কিছু শিখুন।",
  },
  "/sources": {
    title: "Islamic Sources | Noor",
    description: "Understand the Quran, Hadith and editorial sources used across Noor's Islamic content.",
  },
  "/tasbih": {
    title: "Digital Tasbih — ডিজিটাল তাসবীহ | Noor",
    description: "Beautiful digital Tasbih counter for dhikr — সুবহানাল্লাহ, আলহামদুলিল্লাহ, আল্লাহু আকবার সহজে গণনা করুন। Haptic feedback supported.",
  },
  "/terms": {
    title: "Terms of Service — ব্যবহারের শর্তাবলী | Noor",
    description: "NOOR app terms & conditions — অ্যাপ ব্যবহারের শর্তাবলী, ব্যবহারকারীর দায়িত্ব ও অধিকার সম্পর্কে বিস্তারিত পড়ুন।",
  },
};
