/**
 * Bilingual (Bengali + English) SEO meta defaults for all public pages.
 * Used as fallback when no admin override exists in seo_pages table.
 *
 * Rules:
 * - Titles ≤ 60 chars with main keyword; mixed EN+BN
 * - Descriptions 120–160 chars, mixed EN+BN, natural & human-readable
 * - No duplicate descriptions across pages
 */

import { SEO_STATIC_COPY } from "./seoStaticCopy.js";

export type PageSeoDefaults = {
  title: string;
  description: string;
};

const DEFAULTS: Record<string, PageSeoDefaults> = {
  "/": {
    title: "Noor Islamic App — Quran, Hadith, Dua & Prayer Times",
    description:
      "Use Noor, a free Islamic app for Quran reading, Hadith, daily Duas, prayer times and learning tools. Explore the web app or install it on supported devices.",
  },
  "/quran": {
    title: "Quran Reader — পবিত্র কুরআন | Noor",
    description:
      "Read the Holy Quran with Arabic text, Bengali translation & audio recitation — সূরা তিলাওয়াত, তাফসীর ও অডিও সহ সম্পূর্ণ কুরআন পাঠ করুন।",
  },
  "/dua": {
    title: "Duas & Supplications — দোয়া সমূহ | Noor",
    description:
      "Islamic duas with Arabic, Bengali meaning & audio — দৈনন্দিন মাসনূন দোয়া, কুরআনের দোয়া ও হাদিসের দোয়া সংকলন।",
  },
  "/stories": {
    title: "ইসলামিক গল্প — Islamic Stories | Noor",
    description:
      "নবীদের জীবনী, সাহাবীদের গল্প ও ঈমানদীপ্ত শিক্ষণীয় ইসলামিক গল্প পড়ুন — Read inspiring Islamic stories of the Prophets, Sahaba and lessons of faith on Noor.",
  },
  "/hadith": {
    title: "Hadith Collections | Noor",
    description:
      "Read Sahih al-Bukhari online with Arabic text and translations in Bangla, English & Urdu on Noor. More Hadith collections planned.",
  },
  "/hadith/sahih-bukhari": {
    title: "Sahih al-Bukhari Hadith Collection | Noor",
    description:
      "Read Sahih al-Bukhari in Bangla, English, or Urdu with Arabic text, chapter navigation and collection references on Noor App.",
  },
  "/hadith/sahih-bukhari/bangla": {
    title: "Sahih Bukhari Bangla – সহীহ বুখারী বাংলা হাদিস | Noor",
    description:
      "সহীহ বুখারী শরীফের সম্পূর্ণ হাদিস আরবি ও বাংলা অনুবাদ সহ পড়ুন। Read Sahih Bukhari Bangla with Arabic text & translation on Noor App.",
  },
  "/hadith/sahih-bukhari/english": {
    title: "Sahih Bukhari English – Hadith Collection | Noor",
    description:
      "Read Sahih Bukhari in English with Arabic text, translation, chapter navigation and collection references on Noor App.",
  },
  "/hadith/sahih-bukhari/urdu": {
    title: "Sahih Bukhari Urdu – صحیح بخاری اردو حدیث | Noor",
    description:
      "صحیح بخاری کی مکمل احادیث عربی متن اور اردو ترجمہ کے ساتھ پڑھیں۔ Read Sahih Bukhari Urdu hadith with Arabic text on Noor App.",
  },
  "/hadith/muslim": {
    title: "Sahih Muslim — সহীহ মুসলিম হাদিস | Noor",
    description:
      "Sahih Muslim is planned for a future release on Noor and is not yet available. Learn about the collection, or read Sahih al-Bukhari now.",
  },
  "/hadith/tirmidhi": {
    title: "Jami at-Tirmidhi — জামে তিরমিযী হাদিস | Noor",
    description:
      "Jami at-Tirmidhi is planned for a future release on Noor and is not yet available. Learn about the collection, or read Sahih al-Bukhari now.",
  },
  "/hadith/abu-dawud": {
    title: "Sunan Abu Dawud — সুনানে আবু দাউদ হাদিস | Noor",
    description:
      "Sunan Abu Dawud is planned for a future release on Noor and is not yet available. Learn about the collection, or read Sahih al-Bukhari now.",
  },
  "/names": {
    title: "Islamic Names — ইসলামিক নামের তালিকা | Noor",
    description:
      "Browse thousands of Islamic names with Arabic script & meanings — আরবি, বাংলা উচ্চারণ ও অর্থসহ ইসলামিক নাম খুঁজুন ও শেয়ার করুন।",
  },
  "/contact": {
    title: "Contact Us — যোগাযোগ | Noor",
    description:
      "Get in touch with the NOOR team — প্রশ্ন, পরামর্শ, বাগ রিপোর্ট বা সহযোগিতার জন্য আমাদের সাথে সরাসরি যোগাযোগ করুন।",
  },
  "/settings": {
    title: "Settings — সেটিংস | Noor",
    description:
      "Adjust local Noor app preferences for language, appearance, prayer reminders and other features.",
  },
  "/notifications": {
    title: "Notifications — নোটিফিকেশন | Noor",
    description:
      "View public announcements and important updates from Noor. Notification content is not included in page metadata.",
  },
  "/sitemap": {
    title: "Sitemap — সাইটম্যাপ | Noor",
    description:
      "Browse all pages on Noor Islamic App — Quran, Hadith, Dua, Prayer Times, Quiz ও সকল পেজের সম্পূর্ণ তালিকা দেখুন।",
  },
  ...SEO_STATIC_COPY,
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
