import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

const SITE_ORIGIN = "https://noorapp.in";
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "https://llicfiepatzgllmjhzbw.supabase.co";
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxsaWNmaWVwYXR6Z2xsbWpoemJ3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg0ODA4MDksImV4cCI6MjA4NDA1NjgwOX0.T7xnXRSM2jx92gVH8Of1dePj609C7WKKflv2I_VZpy0";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const CATEGORY_MAP = {
  "Balanced Life": "ভারসাম্যপূর্ণ জীবন",
  "Character": "চরিত্র",
  "Daily": "দৈনিক",
  "Death": "মৃত্যু",
  "Evening": "সন্ধ্যা",
  "Faith": "ঈমান",
  "Family": "পরিবার",
  "Fasting": "রোজা",
  "Food": "খাবার",
  "Forgiveness": "ক্ষমা",
  "Gratitude": "কৃতজ্ঞতা",
  "Guidance": "হেদায়েত",
  "Hajj": "হজ",
  "Healing": "আরোগ্য",
  "Health": "স্বাস্থ্য",
  "Hereafter": "পরকাল",
  "Hope": "আশা",
  "Journey": "সফর",
  "Justice": "ইনসাফ",
  "Knowledge": "জ্ঞান",
  "Legacy": "উত্তরাধিকার",
  "Masjid": "মসজিদ",
  "Morning": "সকাল",
  "Names of Allah": "আল্লাহর নাম",
  "Parents": "পিতা-মাতা",
  "Praise": "প্রশংসা",
  "Promise": "প্রতিশ্রুতি",
  "Protection": "সুরক্ষা",
  "Quran": "কুরআন",
  "Ramadan": "রমজান",
  "Remembrance": "জিকির",
  "Repentance": "তওবা",
  "Responsibility": "দায়িত্ব",
  "Ruqyah": "রুকইয়াহ",
  "Salah": "নামাজ",
  "Sleep": "ঘুম",
  "Steadfastness": "অবিচলতা",
  "Submission": "আত্মসমর্পণ",
  "Tawhid": "তাওহীদ",
  "Travel": "ভ্রমণ",
  "Weather": "আবহাওয়া",
  "Wisdom": "প্রজ্ঞা",
  "Worship": "ইবাদত",
  "Wudu": "ওযু",
  "Dua": "🤲",
};

const getCategoryLabel = (cat) => {
  if (!cat) return "সাধারণ";
  return CATEGORY_MAP[cat] || cat;
};

const CATEGORY_ICONS = {
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

const getCategoryIcon = (cat) => {
  return CATEGORY_ICONS[cat] || "🤲";
};

const ISLAMIC_PATTERN_1 = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='136' viewBox='0 0 160 136'%3E%3Cg fill='none' stroke='%23ffffff' stroke-opacity='0.05' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath stroke-width='3.4' d='M-10 29C10 7 39 4 59 17c16 11 18 32 5 44-13 11-34 7-38-8-3-13 9-24 22-19 16 6 21 27 12 43-11 22-35 31-60 22'/%3E%3Cpath stroke-width='2.7' d='M68-10C56 13 61 38 81 49c18 10 39 0 40-19 1-16-15-25-28-15-14 11-8 35 9 44 18 9 39 7 52-5'/%3E%3Cpath stroke-width='3.2' d='M82 61c18-20 49-22 68-5 16 14 13 40-7 50-17 9-36-1-37-18-1-15 16-25 29-16 16 11 17 36 3 54-15 20-44 27-69 14'/%3E%3Cpath stroke-width='2' d='M2 87c16-15 39-17 55-6M132 103c-8 8-10 19-4 29M45 112c9-10 24-12 36-5'/%3E%3C/g%3E%3Cg fill='%23ffffff' fill-opacity='0.04'%3E%3Ccircle cx='13' cy='52' r='2.4'/%3E%3Ccircle cx='20' cy='48' r='1.5'/%3E%3Ccircle cx='72' cy='103' r='2.2'/%3E%3Cpath d='M34 8c6 7 6 15 0 22-6-7-6-15 0-22ZM102 122c8-10 17-10 25 0-8-4-17-4-25 0Z'/%3E%3C/g%3E%3Cg fill='%23ffffff' font-family='serif' text-anchor='middle' opacity='0.05'%3E%3Ctext x='44' y='55' font-size='17' transform='rotate(-18 44 55)'%3Eالله%3C/text%3E%3Ctext x='118' y='34' font-size='14' transform='rotate(13 118 34)'%3Eرب%3C/text%3E%3Ctext x='42' y='105' font-size='13'%3Eنور%3C/text%3E%3C/g%3E%3C/svg%3E")`;
const ISLAMIC_PATTERN_2 = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='72' height='61' viewBox='0 0 72 61'%3E%3Cg fill='none' stroke='%23ffffff' stroke-width='1.45' stroke-opacity='0.03' stroke-linecap='round'%3E%3Cpath d='M-4 25c9-13 22-15 31-7 8 7 5 18-3 22-8 3-16-2-14-9 1-6 8-9 14-5 7 5 6 15-1 22-8 8-20 8-29 2M38-4c-6 11-3 21 5 26 9 4 18-2 18-10-1-7-8-10-13-6-5 5-2 14 5 18M39 42c9-10 22-10 30-2'/%3E%3C/g%3E%3C/svg%3E")`;
const ISLAMIC_PATTERN = `${ISLAMIC_PATTERN_1}, ${ISLAMIC_PATTERN_2}`;

const FALLBACK_SURAHS = [
  {"number": 1, "english_name": "Al-Fatiha", "name": "الفاتحة", "number_of_ayahs": 7, "english_name_translation": "The Opening"},
  {"number": 2, "english_name": "Al-Baqarah", "name": "البقرة", "number_of_ayahs": 286, "english_name_translation": "The Cow"},
  {"number": 3, "english_name": "Al-Imran", "name": "آل عمران", "number_of_ayahs": 200, "english_name_translation": "The Family of Imraan"},
  {"number": 4, "english_name": "An-Nisa", "name": "النساء", "number_of_ayahs": 176, "english_name_translation": "The Women"},
  {"number": 5, "english_name": "Al-Ma'idah", "name": "المائدة", "number_of_ayahs": 120, "english_name_translation": "The Table"}
];

const esc = (s) => {
  if (!s) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
};

const shortenMetaText = (value, limit) => {
  const text = String(value || "").trim().replace(/\s+/g, " ");
  if (text.length <= limit) return text;
  const clipped = text.slice(0, limit + 1);
  const boundary = clipped.lastIndexOf(" ");
  return (boundary > 25 ? clipped.slice(0, boundary) : clipped.slice(0, limit)).replace(/[\s,;:—–-]+$/u, "").trim();
};

const uniqueStoryTitle = (value) => {
  const base = String(value || "Islamic Story")
    .trim()
    .replace(/(?:\s*\|\s*Noor(?:\s*App)?)+$/iu, "")
    .trim();
  return shortenMetaText(`${base} | Noor`, 70);
};

const enrichStoryDescription = (value, title) => {
  const base = String(value || "").trim().replace(/\s+/g, " ");
  const expanded = base.length >= 90
    ? base
    : `${base || title} — read this Islamic story, its authentic lesson and reflection on Noor.`;
  return shortenMetaText(expanded, 160);
};

const storyFallbackLabel = (slug) => String(slug || "islamic-story")
  .split("-")
  .filter(Boolean)
  .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
  .join(" ");

const ISLAMIC_PATTERN_HTML = ISLAMIC_PATTERN.replace(/"/g, "&quot;");
const HADITH_CARD_STYLE = `background-image: ${ISLAMIC_PATTERN_HTML}, linear-gradient(to bottom right, hsl(158,55%,25%), hsl(158,64%,20%))`;

const isUsableSocialImage = (value) => {
  if (typeof value !== "string" || !value.trim()) return false;
  const normalized = value.trim().toLowerCase();
  if (normalized.includes("yourwebsite.com")) return false;
  // Older imports pointed at a non-existent local slug image. Do not expose it to crawlers.
  if (normalized.startsWith("https://noorapp.in/assets/og-images/") || normalized.startsWith("https://www.noorapp.in/assets/og-images/")) return false;
  return normalized.startsWith("https://") || normalized.startsWith("http://") || value.startsWith("/assets/");
};

const resolveStoredSocialImage = (raw, folder = "dua-og") => {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const value = raw.trim();
  if (value.startsWith("https://") || value.startsWith("http://")) return value;
  if (value.startsWith("/assets/")) return `${SITE_ORIGIN}${value}`;

  let storagePath = value;
  while (storagePath.startsWith("/")) storagePath = storagePath.slice(1);
  if (storagePath.startsWith("media/")) storagePath = storagePath.slice("media/".length);
  if (!storagePath.includes("/")) storagePath = `${folder}/${storagePath}`;
  return `${SUPABASE_URL}/storage/v1/object/public/media/${storagePath}`;
};

const getDuaOgImage = (dua) => {
  const ogData = dua?.og_image_data && typeof dua.og_image_data === "object" ? dua.og_image_data : {};
  const seoData = dua?.seo && typeof dua.seo === "object" ? dua.seo : {};
  const openGraph = seoData.open_graph && typeof seoData.open_graph === "object" ? seoData.open_graph : {};
  const candidates = [
    dua?.image_url,
    dua?.og_image_url,
    ogData.og_image_url,
    ogData.og_image,
    ogData.storage_path,
    ogData.og_url,
    ogData.url,
    seoData.og_image,
    seoData.ogImage,
    openGraph["og:image"],
  ];

  for (const candidate of candidates) {
    const resolved = resolveStoredSocialImage(candidate);
    if (resolved && isUsableSocialImage(resolved)) return resolved;
  }

  // Keep Dua shares on a Dua-specific fallback instead of the app/logo image.
  return `${SITE_ORIGIN}/og-dua.png`;
};

const loadBundledStories = () => {
  const candidates = [
    path.join(process.cwd(), "dist", "stories.json"),
    path.join(process.cwd(), "public", "stories.json"),
    path.join("/var/task", "dist", "stories.json"),
  ];

  for (const file of candidates) {
    try {
      if (fs.existsSync(file)) {
        const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (error) {
      console.error("[SSR] Story bundle read failed", error);
    }
  }
  return [];
};

const BUNDLED_STORIES = loadBundledStories();

const STATIC_PAGE_COPY = {
  "/about": {
    title: "About Noor | Free Islamic App",
    description: "Learn about Noor's mission to make Quran, Hadith, prayer times, Dua and Islamic learning tools accessible and trustworthy.",
    heading: "About Noor",
    intro: "Noor is a free Islamic app designed to make everyday worship, learning and reflection simpler for Muslims in India, Bangladesh and around the world.",
    sections: [
      ["Our mission", "We bring Quran reading, authentic Hadith, prayer times, Dua, Qibla, Islamic stories and learning tools together in one calm and accessible experience."],
      ["Built for daily use", "Noor focuses on practical tools that people return to every day: prayer reminders, Quran reading, supplications, Islamic calendar information and gentle learning activities."],
      ["Trust and responsibility", "We aim to present Islamic content with clear references, respectful language and transparent source information. If you find an error, please contact the Noor team so it can be reviewed."],
    ],
  },
  "/sources": {
    title: "Islamic Sources | Noor",
    description: "Understand the Quran, Hadith and editorial sources used across Noor's Islamic content.",
    heading: "Our Islamic Sources",
    intro: "Noor is committed to showing where its Islamic content comes from and how readers can evaluate it.",
    sections: [
      ["Quran", "Quran text and translations are presented for reading and study. Readers should consult qualified scholars for detailed tafsir and matters requiring formal religious guidance."],
      ["Hadith", "Hadith pages identify the collection and language where available. Sahih Al-Bukhari and other collections are presented as educational references, with care taken not to remove important context."],
      ["Editorial review", "Our editorial approach prioritizes clarity, respectful presentation and source notes. Corrections and feedback can be sent through the Contact page."],
    ],
  },
  "/data-sources": {
    title: "Data Sources and Methodology | Noor",
    description: "Learn how Noor uses Quran, Hadith, prayer-time and location data to provide its Islamic tools.",
    heading: "Data Sources and Methodology",
    intro: "Noor combines structured Islamic content with public service data to make its tools useful while keeping the source of key information visible.",
    sections: [
      ["Prayer times and location", "Prayer times are calculated using location-aware prayer-time services. Location is used to show relevant city information and is not intended to identify a person."],
      ["Islamic content", "Quran, Hadith, Dua and story content is organized for reading, search and learning. Where available, the app displays collection, book or reference details."],
      ["Corrections and feedback", "Data can change as services and content are improved. If you find a missing reference, translation issue or factual error, please report it through Noor Support."],
    ],
  },
  "/privacy": {
    title: "Privacy Policy | Noor",
    description: "Read Noor's privacy policy covering local preferences, analytics, advertising cookies, third-party services and user rights.",
    heading: "Privacy Policy",
    intro: "Noor uses the minimum information needed to operate its tools and improve the experience. Many preferences, such as language, theme, prayer and notification settings, remain on your device.",
    sections: [
      ["Information and local storage", "Settings and progress may be stored locally in your browser or device. Anonymous usage information may be aggregated to understand feature usage."],
      ["Advertising and third-party services", "Noor may use advertising and service providers such as Google AdSense, prayer-time APIs and location services. Cookies and similar technologies may be used according to the applicable provider policies."],
      ["Your choices", "You can clear local app data from your browser or device settings and manage personalized advertising through the controls described in the full policy."],
    ],
  },
  "/privacy-policy": {
    title: "Privacy Policy | Noor",
    description: "Read Noor's privacy policy covering local preferences, analytics, advertising cookies, third-party services and user rights.",
    heading: "Privacy Policy",
    intro: "Noor uses the minimum information needed to operate its tools and improve the experience. Many preferences, such as language, theme, prayer and notification settings, remain on your device.",
    sections: [
      ["Information and local storage", "Settings and progress may be stored locally in your browser or device. Anonymous usage information may be aggregated to understand feature usage."],
      ["Advertising and third-party services", "Noor may use advertising and service providers such as Google AdSense, prayer-time APIs and location services. Cookies and similar technologies may be used according to the applicable provider policies."],
      ["Your choices", "You can clear local app data from your browser or device settings and manage personalized advertising through the controls described in the full policy."],
    ],
  },
  "/terms": {
    title: "Terms & Conditions | Noor",
    description: "Read Noor's terms, acceptable-use guidelines and content limitations for using the free Islamic app.",
    heading: "Terms & Conditions",
    intro: "By using Noor, you agree to use its tools respectfully and understand that the app provides general educational and devotional information.",
    sections: [
      ["Educational use", "Noor is not a replacement for a qualified scholar, imam, medical professional or other specialist. Please seek appropriate guidance for personal religious, legal, medical or financial decisions."],
      ["Acceptable use", "Do not misuse the service, attempt unauthorized access, disrupt availability or copy and redistribute protected material without permission."],
      ["Content and availability", "We work to keep information accurate and available, but third-party services, translations and calculations may change. Report problems through Support so they can be reviewed."],
    ],
  },
  "/download": {
    title: "Download Noor Islamic App | Noor",
    description: "Use Noor on Android or install the Noor Progressive Web App for Quran, Hadith, prayer times, Dua and more.",
    heading: "Download Noor",
    intro: "Noor is available as a fast web experience and can be installed as a Progressive Web App on supported devices.",
    sections: [
      ["Install on your device", "Open Noor in a supported mobile browser and choose the browser's install or Add to Home Screen option when available."],
      ["What you get", "The installed experience gives you quick access to prayer times, Quran reading, Hadith, Dua, Qibla, Tasbih, Islamic stories and learning tools."],
      ["Need help?", "If installation, notifications or a page does not work as expected, use the Support & Feedback form and include the affected page."],
    ],
  },
  "/islamic-app": {
    title: "Noor Islamic App | Quran, Hadith, Dua and Prayer Times",
    description: "Explore Noor, a free Islamic app with Quran, authentic Hadith, prayer times, Dua, Qibla, Islamic stories and more.",
    heading: "Noor Islamic App",
    intro: "Noor brings essential Islamic reading, prayer and learning tools together in one clean, free app.",
    sections: [
      ["Read and listen", "Read the Quran with Arabic text and translations, explore Hadith collections and discover Islamic stories with practical lessons."],
      ["Practice every day", "Use prayer times, countdowns, Qibla, morning and evening Dua, Tasbih and the Islamic calendar to support your daily routine."],
      ["Designed for Bengali readers", "Noor supports Bengali-first Islamic learning while also offering English, Arabic and Urdu experiences in selected sections."],
    ],
  },
  "/prayer-times": {
    title: "Prayer Times | Accurate Salah Times | Noor",
    description: "Find Fajr, Sunrise, Dhuhr, Asr, Maghrib and Isha prayer times with a live countdown and location-based calculation on Noor.",
    heading: "Prayer Times",
    intro: "Noor helps you view the five daily Salah times, the next-prayer countdown and relevant location information in one place.",
    sections: [
      ["Daily schedule", "See Fajr, Sunrise, Dhuhr, Asr, Maghrib and Isha times for your selected location and date."],
      ["Location and calculation", "Prayer times depend on your location and calculation settings. Check the selected city and method if a time appears different from your local mosque timetable."],
      ["Reminders", "Where supported, Noor can help you configure prayer reminders and notifications. Browser and device permissions must be enabled by the user."],
    ],
  },
  "/prayer-guide": {
    title: "Prayer Guide | Salah and Wudu Guidance | Noor",
    description: "Use Noor's prayer guide to review key Salah steps, Wudu guidance and daily prayer information in a clear format.",
    heading: "Prayer Guide",
    intro: "This guide is designed as a simple reference for reviewing the structure and essential considerations of daily prayer.",
    sections: [
      ["Before Salah", "Review cleanliness, Wudu, prayer time, direction of the Qibla and suitable clothing before beginning."],
      ["During prayer", "Follow the prayer method taught by your trusted scholar or local imam. Noor provides a general learning reference and does not replace qualified instruction."],
      ["Keep learning", "For differences of opinion or personal questions, consult a trusted qualified scholar and the established practice of your community."],
    ],
  },
  "/qibla": {
    title: "Qibla Finder | Find the Direction of Makkah | Noor",
    description: "Use Noor's Qibla finder to estimate the direction of the Kaaba from your current location.",
    heading: "Qibla Finder",
    intro: "The Qibla finder helps you estimate the direction of the Kaaba using your device location and compass support where available.",
    sections: [
      ["Allow location access", "Location permission is needed to calculate the direction from your selected position. Noor uses it for this feature's purpose."],
      ["Calibrate your compass", "Keep the device away from magnetic objects and follow the on-screen calibration guidance if the compass appears unstable."],
      ["Use as a guide", "For a mosque, travel or unfamiliar place, compare the result with local signage or a trusted Qibla reference when possible."],
    ],
  },
  "/tasbih": {
    title: "Digital Tasbih | Dhikr Counter | Noor",
    description: "Use Noor's digital Tasbih to count dhikr with a simple, respectful and customizable counter.",
    heading: "Digital Tasbih",
    intro: "Noor's Tasbih counter is a simple tool for keeping track of dhikr without distracting from remembrance.",
    sections: [
      ["Simple counting", "Tap to increase the count, choose a target and reset when you begin a new session."],
      ["Your privacy", "Counter preferences and progress can be stored locally on your device so the tool remains quick and personal."],
      ["Remember with presence", "A digital counter is only a support tool. The value of dhikr is in sincere remembrance, intention and consistency."],
    ],
  },
  "/99-names": {
    title: "99 Names of Allah | Asma ul Husna | Noor",
    description: "Explore the 99 Names of Allah with Arabic names, transliteration, Bengali meanings and reflective explanations on Noor.",
    heading: "99 Names of Allah",
    intro: "Explore Asma ul Husna with Arabic names, pronunciation support and meanings intended for reflection and learning.",
    sections: [
      ["Read and reflect", "Open each name to review its Arabic form, transliteration and meaning, then reflect on how the name relates to worship and character."],
      ["Language support", "Noor presents Bengali meaning and additional language support where available so learners can understand the names more clearly."],
      ["Use reliable guidance", "For detailed theology and interpretation, consult established Islamic scholarship and trusted teachers."],
    ],
  },
  "/baby-names": {
    title: "Islamic Baby Names | Muslim Names and Meanings | Noor",
    description: "Browse meaningful Islamic baby names with Arabic origins, Bengali meanings and information for boys and girls.",
    heading: "Islamic Baby Names",
    intro: "Explore a collection of Muslim baby names with meanings and origin information to help families begin their search.",
    sections: [
      ["Search by meaning", "Use the name list to explore names for boys and girls and compare meanings, spellings and origins."],
      ["Choose thoughtfully", "Name meanings and transliterations can vary by language. Families should verify spelling and consult trusted references before making a final decision."],
      ["A helpful starting point", "Noor provides educational information and suggestions; the final choice belongs to the family."],
    ],
  },
  "/calendar": {
    title: "Islamic Calendar | Hijri Dates and Events | Noor",
    description: "View Hijri and Gregorian dates, Ramadan information and important Islamic occasions with Noor's calendar.",
    heading: "Islamic Calendar",
    intro: "Use Noor's calendar to understand the relationship between Hijri and Gregorian dates and to review important Islamic occasions.",
    sections: [
      ["Hijri dates", "The Islamic calendar is lunar, so dates can vary by local moon sighting and authority. Use the calendar as a helpful reference."],
      ["Important occasions", "Review Ramadan, Eid and other important dates while checking your local mosque or recognized authority for official announcements."],
      ["Plan your worship", "Use the calendar alongside prayer times and Dua tools to prepare for important days and personal goals."],
    ],
  },
  "/quiz": {
    title: "Daily Islamic Quiz | Learn Quran and Hadith | Noor",
    description: "Test and grow your Islamic knowledge with Noor's daily quiz covering Quran, Hadith, history and the lives of the Prophets.",
    heading: "Daily Islamic Quiz",
    intro: "Noor's quiz turns short daily learning sessions into an opportunity to review Islamic knowledge and discover new topics.",
    sections: [
      ["What the quiz covers", "Questions may cover the Quran, authentic Hadith, Islamic history, Fiqh basics and the lives of the Prophets."],
      ["Learn from every answer", "Use explanations and references where available to review the answer instead of treating the score as the goal."],
      ["A respectful learning tool", "The quiz is educational and should be complemented with reading, qualified teaching and careful study."],
    ],
  },
};

const renderStaticPage = (page) => `
  <div class="min-h-screen bg-background pb-24">
    <header class="bg-gradient-to-br from-emerald-700 to-teal-800 px-5 py-12 text-white">
      <div class="mx-auto max-w-3xl">
        <p class="mb-3 text-xs font-bold uppercase tracking-[0.18em] text-emerald-100">NOOR ISLAMIC APP</p>
        <h1 class="text-3xl font-bold leading-tight md:text-4xl">${esc(page.heading)}</h1>
        <p class="mt-4 max-w-2xl text-base leading-7 text-white/85">${esc(page.intro)}</p>
      </div>
    </header>
    <main class="mx-auto max-w-3xl space-y-5 px-4 py-7">
      ${page.sections.map(([heading, content]) => `
        <section class="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <h2 class="text-xl font-bold text-foreground">${esc(heading)}</h2>
          <p class="mt-3 leading-7 text-muted-foreground">${esc(content)}</p>
        </section>
      `).join("")}
      <p class="pt-3 text-center text-sm text-muted-foreground">For questions, corrections or source concerns, please visit <a href="/contact" class="font-semibold text-primary">Support &amp; Feedback</a>.</p>
    </main>
  </div>
`;

const findBundledStory = (slug) => BUNDLED_STORIES.find((story) => story.slug === slug);


const HADITH_LANG_META = {
  bangla: { label: "বাংলা", title: "সহিহ বুখারী শরীফ", subtitle: "আরবি + বাংলা অনুবাদ", field: "bengali", file: null, rtl: false, read: "বিস্তারিত পড়ুন" },
  english: { label: "English", title: "Sahih Al-Bukhari", subtitle: "Arabic + English Translation", field: "english", file: "/data/sahih_bukhari_en.json", rtl: false, read: "Read full details" },
  urdu: { label: "اردو", title: "صحیح البخاری", subtitle: "عربی + اردو ترجمہ", field: "urdu", file: "/data/sahih_bukhari_ur.json", rtl: true, read: "تفصیل پڑھیں" },
};

const normalizeHadithLang = (value) => {
  const raw = String(value || "").toLowerCase().trim();
  if (raw === "bn" || raw === "bengali" || raw === "bangla") return "bangla";
  if (raw === "en" || raw === "english") return "english";
  if (raw === "ur" || raw === "urdu") return "urdu";
  return null;
};

const flattenHadithBooks = (json) => Object.keys(json || {})
  .sort((a, b) => (parseInt(a.replace(/\D/g, ""), 10) || 0) - (parseInt(b.replace(/\D/g, ""), 10) || 0))
  .flatMap((key) => Array.isArray(json[key]) ? json[key] : []);

async function loadHadithRowsSsr(lang, chapterId) {
  const meta = HADITH_LANG_META[lang];
  let rows = [];

  if (meta.file) {
    try {
      const candidates = [
        path.join(process.cwd(), "dist", meta.file),
        path.join("/var/task", "dist", meta.file),
      ];
      let json = null;
      for (const file of candidates) {
        if (fs.existsSync(file)) {
          json = JSON.parse(fs.readFileSync(file, "utf8"));
          break;
        }
      }
      
      if (json) {
        rows = flattenHadithBooks(json)
          .filter((row) => row.arabic && row[meta.field] && (!chapterId || Number(row.chapter_id) === chapterId))
          .slice(0, 20)
          .map((row) => ({
            id: row.id,
            chapterId: Number(row.chapter_id),
            number: Number(row.hadith_number),
            arabic: row.arabic,
            translation: row[meta.field],
          }));
      }
    } catch (e) {
      console.error("[SSR] Hadith file read failed", e);
    }
  }

  if (rows.length === 0) {
    try {
      let query = supabase
        .from("hadiths")
        .select(`id, chapter_id, hadith_number, arabic, ${meta.field}`)
        .eq("book_key", "bukhari")
        .not(meta.field, "is", null)
        .order("chapter_id", { ascending: true })
        .order("hadith_number", { ascending: true })
        .range(0, 19);
      if (chapterId) query = query.eq("chapter_id", chapterId);
      const { data, error } = await query;
      if (!error && data) {
        rows = data.map((row) => ({
          id: row.id,
          chapterId: Number(row.chapter_id),
          number: Number(row.hadith_number),
          arabic: row.arabic,
          translation: row[meta.field],
        }));
      }
    } catch (e) {
      console.error("[SSR] Hadith DB query failed", e);
    }
  }

  return rows;
}

const getHadithChapterName = (chapter, lang) => {
  if (!chapter) return `${lang === "bangla" ? "কিতাব" : lang === "urdu" ? "کتاب" : "Book"}`;
  if (lang === "bangla") return chapter.title_bn || chapter.title;
  if (lang === "urdu") return chapter.title_ar || chapter.title;
  return chapter.title;
};

const hadithCardMarkup = (row, lang, meta, chapterMap) => `
  <article class="relative bg-gradient-to-br from-[hsl(158,55%,25%)] to-[hsl(158,64%,20%)] rounded-2xl p-5 border border-white/10 hover:border-[hsl(45,93%,58%)]/50 shadow-lg transition-all overflow-hidden" style="${HADITH_CARD_STYLE}">
    <div class="relative z-10 flex items-center justify-between mb-4">
      <span class="text-xs font-bold text-[hsl(45,93%,58%)] px-2 py-1 bg-[hsl(45,93%,58%)]/15 rounded-lg border border-[hsl(45,93%,58%)]/20">${lang === "bangla" ? "হাদিস নং" : lang === "urdu" ? "حدیث نمبر" : "Hadith No"} ${row.number}</span>
      <span class="text-[10px] text-[hsl(45,93%,58%)]/75 uppercase tracking-wider">${esc(getHadithChapterName(chapterMap.get(row.chapterId), lang))}</span>
    </div>
    <p dir="rtl" class="relative z-10 text-xl leading-[1.8] text-right mb-4 font-arabic line-clamp-3 text-white">${esc(row.arabic)}</p>
    <p dir="${meta.rtl ? "rtl" : "ltr"}" class="relative z-10 text-xl md:text-2xl leading-[1.8] line-clamp-4 text-white font-bangla-serif mb-4">${esc(row.translation)}</p>
    <a href="/hadith/sahih-bukhari/${lang}/${row.chapterId}/${row.number}" class="relative z-10 w-full py-2.5 bg-[hsl(45,93%,58%)]/15 hover:bg-[hsl(45,93%,58%)] text-[hsl(45,93%,58%)] hover:text-[hsl(158,64%,15%)] rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 border border-[hsl(45,93%,58%)]/20">📖 ${meta.read}</a>
  </article>
`;

const getAppTemplate = () => {
  const candidates = [
    path.join(process.cwd(), "dist", "app.html"),
    path.join("/var/task", "dist", "app.html"),
  ];
  for (const file of candidates) {
    try {
      if (fs.existsSync(file)) return fs.readFileSync(file, "utf8");
    } catch (e) {}
  }
  return `<!DOCTYPE html><html><head><title>{{TITLE}}</title></head><body><div id="root"></div></body></html>`;
};

function inject(html, { title, description, canonical, ogImage, body }) {
  // 1. Remove ALL existing meta/link/title tags that we want to override
  // We use a very broad match to ensure nothing is missed
  let cleanHtml = html
    .replace(/<title[^>]*>[\s\S]*?<\/title>/gi, "")
    .replace(/<meta\s+(name|property)=["'](description|og:title|og:description|og:url|og:image|og:image:secure_url|og:image:type|og:image:width|og:image:height|og:image:alt|twitter:title|twitter:description|twitter:image|twitter:card)["'][^>]*>/gi, "")
    .replace(/<link\s+rel=["']canonical["'][^>]*>/gi, "");

  // 2. Define new tags with explicit values
  const newTags = [
    `<title>${esc(title)}</title>`,
    `<meta name="description" content="${esc(description)}" />`,
    `<link rel="canonical" href="${esc(canonical)}" />`,
    `<meta property="og:type" content="article" />`,
    `<meta property="og:title" content="${esc(title)}" />`,
    `<meta property="og:description" content="${esc(description)}" />`,
    `<meta property="og:url" content="${esc(canonical)}" />`,
    `<meta property="og:image" content="${esc(ogImage)}" />`,
    `<meta property="og:image:secure_url" content="${esc(ogImage)}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta name="twitter:title" content="${esc(title)}" />`,
    `<meta name="twitter:description" content="${esc(description)}" />`,
    `<meta name="twitter:image" content="${esc(ogImage)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`
  ];

  // 3. Inject new tags at the top of the head for maximum visibility
  cleanHtml = cleanHtml.replace("<head>", `<head>\n    ${newTags.join("\n    ")}`);

  // 4. Inject body content
  let finalHtml = cleanHtml.replace(/<div\s+id=["']root["'][^>]*>[\s\S]*?<\/div>/i, `<div id="root">${body}</div>`);
  
  // 5. Final cleanup to avoid quirks mode (no whitespace before <!doctype)
  // We ensure the string starts EXACTLY with <!DOCTYPE html>
  const cleaned = finalHtml.trim();
  if (cleaned.toLowerCase().startsWith("<!doctype")) {
    return cleaned;
  }
  return "<!DOCTYPE html>\n" + cleaned;
}

export default async function handler(req, res) {
  let routePath = req.query.path || "/";
  if (!routePath.startsWith("/")) routePath = `/${routePath}`;
  routePath = routePath.replace(/\/$/, "") || "/";
  
  console.log("[PRERENDER] Processing Path:", routePath);
  
  let title = "Noor – Prayer Times, Quran & More";
  let description = "Read authentic Quran, Hadith, Dua, Prayer Times, Qibla, Islamic Stories and Baby Names in Bengali with a fast and beautiful Islamic app.";
  let bodyContent = "";
  let canonicalUrl = `${SITE_ORIGIN}${routePath === "/" ? "" : routePath}`;

  try {
    // --- Homepage ---
    // Keep the first byte visually consistent with the React fallback. This is
    // deliberately a compact, layout-matched skeleton rather than a branded
    // splash screen, so slow WebViews never show a misleading intermediate page.
    if (routePath === "/") {
      title = "Noor – Quran, Hadith, Dua & Prayer Times";
      description = "Explore Noor's free Islamic learning tools: Quran reading, Hadith collections, daily Duas, prayer times, Islamic stories and more.";
      bodyContent = `
        <div class="min-h-screen bg-background pb-24 text-foreground">
          <header class="bg-gradient-to-br from-emerald-700 to-teal-800 px-5 py-12 text-white">
            <div class="mx-auto max-w-3xl">
              <p class="mb-3 text-xs font-bold uppercase tracking-[0.18em] text-emerald-100">NOOR ISLAMIC APP</p>
              <h1 class="text-3xl font-bold leading-tight md:text-4xl">Quran, Hadith, Dua &amp; Prayer Times</h1>
              <p class="mt-4 max-w-2xl text-base leading-7 text-white/85">Noor is a free Islamic learning platform for Bengali and English readers. Read, listen and study Islamic resources with clear navigation, source notes and practical daily tools.</p>
            </div>
          </header>
          <main class="mx-auto max-w-3xl space-y-6 px-4 py-7">
            <section class="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <h2 class="text-xl font-bold text-foreground">Explore Noor</h2>
              <p class="mt-3 leading-7 text-muted-foreground">Use the tools below to read the Quran, browse Hadith, find daily supplications and plan your worship. Each section is available directly without a subscription.</p>
              <nav aria-label="Primary Islamic resources" class="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                <a href="/quran" class="rounded-xl border border-border px-4 py-3 font-semibold text-primary hover:bg-muted">Read Quran</a>
                <a href="/hadith" class="rounded-xl border border-border px-4 py-3 font-semibold text-primary hover:bg-muted">Hadith</a>
                <a href="/dua" class="rounded-xl border border-border px-4 py-3 font-semibold text-primary hover:bg-muted">Daily Duas</a>
                <a href="/prayer-times" class="rounded-xl border border-border px-4 py-3 font-semibold text-primary hover:bg-muted">Prayer Times</a>
                <a href="/prayer-guide" class="rounded-xl border border-border px-4 py-3 font-semibold text-primary hover:bg-muted">Prayer Guide</a>
                <a href="/stories" class="rounded-xl border border-border px-4 py-3 font-semibold text-primary hover:bg-muted">Islamic Stories</a>
              </nav>
            </section>
            <section class="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <h2 class="text-xl font-bold text-foreground">What makes the site useful?</h2>
              <div class="mt-3 space-y-3 leading-7 text-muted-foreground">
                <p><strong class="text-foreground">Reading and listening:</strong> Browse Quran chapters with Arabic text, translations and available recitation features.</p>
                <p><strong class="text-foreground">Daily practice:</strong> Check local prayer times, read Duas, use the Qibla finder and keep a personal learning routine.</p>
                <p><strong class="text-foreground">Responsible study:</strong> Noor is a digital learning tool, not a substitute for a qualified scholar. Source notes and correction guidance are available on the <a href="/sources" class="font-semibold text-primary">Islamic sources</a> page.</p>
              </div>
            </section>
            <section class="rounded-2xl border border-primary/20 bg-primary/5 p-5">
              <h2 class="text-xl font-bold text-foreground">About Noor</h2>
              <p class="mt-3 leading-7 text-muted-foreground">Learn about the project, its editorial approach and how to contact the developer. Please visit <a href="/about" class="font-semibold text-primary">About Noor</a>, <a href="/contact" class="font-semibold text-primary">Support &amp; Feedback</a>, or the <a href="/privacy-policy" class="font-semibold text-primary">Privacy Policy</a>.</p>
            </section>
          </main>
        </div>
      `;
    }

    // --- Quran Root Page ---
    else if (routePath === "/quran") {
      title = "Quran Reader — পবিত্র কুরআন | NOOR";
      description = "Read all 114 Surahs of the Holy Quran with Arabic text and Bengali translation.";
      
      let surahHtml = "";
      let surahs = FALLBACK_SURAHS;
      
      try {
        const response = await fetch("https://api.alquran.cloud/v1/surah", { signal: AbortSignal.timeout(5000) });
        const json = await response.json();
        if (json.code === 200) surahs = json.data;
      } catch (e) {
        console.error("[SSR] Quran API failed, using fallback/DB");
        try {
          const { data } = await supabase.from("quran_surahs").select("number, english_name, name, number_of_ayahs, english_name_translation").order("number");
          if (data && data.length > 0) surahs = data.map(s => ({
            number: s.number,
            englishName: s.english_name,
            name: s.name,
            numberOfAyahs: s.number_of_ayahs,
            englishNameTranslation: s.english_name_translation
          }));
        } catch (dbErr) {}
      }

      surahHtml = surahs.map(s => `
        <a href="/quran/${s.number}" class="flex items-center justify-between p-4 bg-card border border-border rounded-2xl mb-3 hover:shadow-md transition-all group">
          <div class="flex items-center gap-4">
            <span class="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center font-bold text-xs">${s.number}</span>
            <div>
              <h3 class="font-bold text-lg group-hover:text-primary transition-colors">${esc(s.englishName)}</h3>
              <p class="text-xs text-muted-foreground">${esc(s.englishNameTranslation)} • ${s.numberOfAyahs} Ayahs</p>
            </div>
          </div>
          <span class="text-2xl font-arabic text-primary/80">${esc(s.name)}</span>
        </a>
      `).join("");

      bodyContent = `
        <div class="min-h-screen bg-background">
          <header class="bg-gradient-to-br from-emerald-600 to-teal-700 p-8 text-white text-center">
            <h1 class="text-3xl font-bold mb-2">পবিত্র কুরআন</h1>
            <p class="text-white/80 max-w-md mx-auto">সহজ বাংলা অনুবাদ ও উচ্চারণসহ আল-কুরআন পড়ুন</p>
          </header>
          <div class="p-4 max-w-2xl mx-auto -mt-6">
            <div class="bg-card rounded-2xl shadow-xl p-2">
              ${surahHtml}
            </div>
          </div>
        </div>
      `;
    }

    // --- Quran Detail Page ---
    else if (routePath.startsWith("/quran/")) {
      const num = routePath.split("/")[2];
      if (num && !isNaN(num)) {
        try {
          const response = await fetch(`https://api.alquran.cloud/v1/surah/${num}/editions/quran-uthmani,bn.bengali`, { signal: AbortSignal.timeout(8000) });
          const json = await response.json();
          if (json.code === 200) {
            const ar = json.data[0];
            const bn = json.data[1];
            title = shortenMetaText(`Surah ${ar.englishName} (${ar.name}) — বাংলা অর্থ ও আরবি | Noor`, 70);
            description = shortenMetaText(
              `Read Surah ${ar.englishName}, the ${ar.numberOfAyahs}-verse chapter of the Holy Quran, with Arabic text and Bengali translation on Noor.`,
              160,
            );
            
            const ayahs = ar.ayahs.map((a, i) => `
              <div class="p-6 border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                <div class="flex justify-between items-start mb-4">
                  <span class="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">${a.numberInSurah}</span>
                </div>
                <p dir="rtl" class="text-3xl md:text-4xl font-arabic leading-[2.5] text-right mb-4">${esc(a.text)}</p>
                <p class="text-lg text-muted-foreground leading-relaxed">${esc(bn.ayahs[i].text)}</p>
              </div>
            `).join("");

            bodyContent = `
              <div class="min-h-screen bg-background">
                <header class="bg-gradient-to-br from-emerald-600 to-teal-700 p-6 text-white sticky top-0 z-30">
                  <div class="max-w-3xl mx-auto flex items-center justify-between">
                    <a href="/quran" class="p-2 bg-white/10 rounded-full">←</a>
                    <div class="text-center">
                      <h1 class="text-xl font-bold">${esc(ar.englishName)}</h1>
                      <p class="text-xs opacity-80">${esc(ar.englishNameTranslation)} • ${ar.numberOfAyahs} Ayahs</p>
                    </div>
                    <span class="text-2xl font-arabic">${esc(ar.name)}</span>
                  </div>
                </header>
                <main class="max-w-3xl mx-auto bg-card shadow-sm border-x border-border min-h-screen">
                  ${ayahs}
                </main>
              </div>
            `;
          }
        } catch (e) {}
      }
    }

    // --- Sahih Bukhari language and chapter pages ---
    else if (routePath === "/hadith/sahih-bukhari" || routePath.startsWith("/hadith/sahih-bukhari/")) {
      const parts = routePath.split("/").filter(Boolean);
      const rawLang = parts[2] || "";
      const lang = normalizeHadithLang(rawLang);

      if (!rawLang) {
        title = "Sahih Al-Bukhari — বাংলা, English ও اردو | Noor";
        description = "Read Sahih Al-Bukhari in Bengali, English and Urdu with Arabic text on Noor.";
        bodyContent = `
          <div class="min-h-screen bg-[hsl(158,64%,12%)] text-white pb-20" style="background-image: ${ISLAMIC_PATTERN_HTML}">
            <header class="bg-gradient-to-b from-[hsl(158,55%,22%)] to-[hsl(158,55%,22%)]/95 p-8 text-center border-b border-white/10 relative overflow-hidden" style="background-image: ${ISLAMIC_PATTERN_HTML}">
              <div class="relative z-10">
                <h1 class="text-3xl font-bold mb-2">সহিহ বুখারী শরীফ</h1>
                <p class="text-white/70">বিশ্বস্ত অনুবাদে হাদিস পড়ুন</p>
              </div>
            </header>
            <main class="p-4 max-w-3xl mx-auto space-y-4">
              ${[
                ["bangla", "সহিহ বুখারী (বাংলা)", "আরবি + সম্পূর্ণ বাংলা অনুবাদ"],
                ["english", "Sahih Al-Bukhari (English)", "Arabic + complete English translation"],
                ["urdu", "صحیح البخاری (اردو)", "عربی متن کے ساتھ اردو ترجمہ"],
              ].map(([slug, heading, sub]) => `
                <a href="/hadith/sahih-bukhari/${slug}" class="relative flex items-center justify-between p-6 bg-gradient-to-br from-[hsl(158,55%,25%)] to-[hsl(158,64%,20%)] rounded-2xl border border-white/10 hover:border-[hsl(45,93%,58%)]/50 shadow-lg transition-all overflow-hidden group" style="${HADITH_CARD_STYLE}">
                  <div class="relative z-10">
                    <h2 class="text-xl font-bold text-white group-hover:text-[hsl(45,93%,58%)] transition-colors">${heading}</h2>
                    <p class="text-sm text-white/70 mt-1">${sub}</p>
                  </div>
                  <span class="relative z-10 text-2xl text-[hsl(45,93%,58%)]">→</span>
                </a>
              `).join("")}
            </main>
          </div>
        `;
      } else if (!lang) {
        title = "Hadith language not found | Noor";
        bodyContent = `
          <div class="min-h-screen bg-[hsl(158,64%,12%)] text-white p-8" style="background-image: ${ISLAMIC_PATTERN_HTML}">
            <main class="max-w-2xl mx-auto text-center py-20">
              <h1 class="text-2xl font-bold mb-3">ভাষা নির্বাচন সঠিক নয়</h1>
              <p class="text-white/70 mb-6">বাংলা, English অথবা اردو নির্বাচন করুন।</p>
              <a href="/hadith/sahih-bukhari" class="inline-flex px-5 py-3 rounded-xl bg-[hsl(45,93%,58%)] text-[hsl(158,64%,15%)] font-bold">ভাষা নির্বাচন করুন</a>
            </main>
          </div>
        `;
      } else {
        const meta = HADITH_LANG_META[lang];
        const chapterToken = parts[3] || "";
        const hadithToken = parts[4] || "";
        const chapterMatch = chapterToken.match(/^(?:chapter-)?(\d+)$/);
        const chapterId = chapterMatch ? Number(chapterMatch[1]) : null;
        const hadithNumber = /^\d+$/.test(hadithToken) ? Number(hadithToken) : null;
        const { data: chapterData } = await supabase
          .from("hadith_chapters")
          .select("chapter_number, title, title_bn, title_ar, hadith_count")
          .eq("book_id", "bukhari")
          .order("chapter_number");
        const chapterList = chapterData || [];
        const chapterMap = new Map(chapterList.map((chapter) => [Number(chapter.chapter_number), chapter]));
        const rows = await loadHadithRowsSsr(lang, chapterId);
        const currentChapter = chapterId ? chapterMap.get(chapterId) : null;
        const chapterName = currentChapter
          ? getHadithChapterName(currentChapter, lang)
          : (chapterId ? `${meta.title} — Chapter ${chapterId}` : meta.title);
        const chapterOrdinal = lang === "bangla"
          ? `অধ্যায় ${chapterId}`
          : lang === "urdu"
            ? `باب ${chapterId}`
            : `Chapter ${chapterId}`;
        title = shortenMetaText(
          chapterId
            ? `${chapterName} (${chapterOrdinal}) — ${meta.label} | Noor`
            : `${chapterName} — ${meta.label} | Noor`,
          70,
        );
        description = shortenMetaText(
          chapterId
            ? `Read ${chapterName}, chapter ${chapterId} of Sahih Al-Bukhari in ${meta.label}, with authentic Arabic Hadith and translation on Noor.`
            : `${meta.title} ${meta.subtitle}. Browse authentic Hadith chapters with Arabic text and translation on Noor.`,
          160,
        );
        canonicalUrl = `${SITE_ORIGIN}${routePath}`;

        const detail = hadithNumber ? rows.find((row) => row.number === hadithNumber) : null;
        const chapterCards = chapterList.map((chapter) => `
          <a href="/hadith/sahih-bukhari/${lang}/chapter-${chapter.chapter_number}" class="relative flex items-center gap-4 p-4 bg-gradient-to-br from-[hsl(158,55%,25%)] to-[hsl(158,64%,20%)] rounded-2xl border border-white/10 hover:border-[hsl(45,93%,58%)]/50 shadow-lg transition-all overflow-hidden group" style="${HADITH_CARD_STYLE}">
            <span class="relative z-10 w-12 h-12 rounded-xl bg-[hsl(45,93%,58%)]/15 flex items-center justify-center text-[hsl(45,93%,58%)] font-bold border border-[hsl(45,93%,58%)]/25">${chapter.chapter_number}</span>
            <span class="relative z-10 flex-1 min-w-0"><strong class="block truncate text-white group-hover:text-[hsl(45,93%,58%)]">${esc(getHadithChapterName(chapter, lang))}</strong><small class="text-white/65">${chapter.hadith_count || ""} ${lang === "bangla" ? "টি হাদিস" : lang === "urdu" ? "احادیث" : "Hadiths"}</small></span>
            <span class="relative z-10 text-[hsl(45,93%,58%)]/70">→</span>
          </a>
        `).join("");
        const cardRows = detail ? [detail] : rows;
        const listMarkup = cardRows.length ? cardRows.map((row) => hadithCardMarkup(row, lang, meta, chapterMap)).join("") : `<div class="rounded-3xl border border-dashed border-white/10 bg-white/5 p-12 text-center text-white/60">${lang === "bangla" ? "হাদিস লোড হচ্ছে..." : lang === "urdu" ? "احادیث لوڈ ہو رہی ہیں..." : "Loading hadiths..."}</div>`;

        bodyContent = `
          <div class="min-h-screen bg-[hsl(158,64%,12%)] text-white pb-20" style="background-image: ${ISLAMIC_PATTERN_HTML}">
            <header class="sticky top-0 z-30 bg-gradient-to-b from-[hsl(158,55%,22%)] to-[hsl(158,55%,22%)]/95 backdrop-blur-lg border-b border-white/10 p-4 relative overflow-hidden" style="background-image: ${ISLAMIC_PATTERN_HTML}">
              <div class="max-w-4xl mx-auto flex items-center gap-3 relative z-10">
                <a href="${chapterId ? `/hadith/sahih-bukhari/${lang}` : "/hadith/sahih-bukhari"}" class="p-2 bg-white/10 rounded-full text-white">←</a>
                <div class="min-w-0 flex-1">
                  <h1 class="text-xl font-bold truncate">${esc(currentChapter ? getHadithChapterName(currentChapter, lang) : meta.title)}</h1>
                  <p class="text-xs text-[hsl(45,93%,58%)] font-medium">${esc(meta.subtitle)}</p>
                </div>
              </div>
            </header>
            <main class="max-w-4xl mx-auto p-4 space-y-6">
              <nav class="flex gap-2 overflow-x-auto pb-1 scrollbar-hide" aria-label="Hadith languages">
                ${Object.entries(HADITH_LANG_META).map(([slug, item]) => `<a href="/hadith/sahih-bukhari/${slug}${chapterId ? `/chapter-${chapterId}` : ""}" class="shrink-0 px-4 py-2 rounded-full text-sm font-medium ${slug === lang ? "bg-gradient-to-r from-[hsl(45,93%,58%)] to-[hsl(45,93%,48%)] text-[hsl(158,64%,15%)]" : "bg-white/10 text-white/70"}">${item.label}</a>`).join("")}
              </nav>
              ${!chapterId && !detail && chapterCards ? `<section><h2 class="text-lg font-bold mb-3">${lang === "bangla" ? "কিতাবসমূহ" : lang === "urdu" ? "کتب" : "Books (Kitab)"}</h2><div class="grid grid-cols-1 md:grid-cols-2 gap-3">${chapterCards}</div></section>` : ""}
              <section class="space-y-4">
                ${detail ? `<h2 class="text-lg font-bold">${lang === "bangla" ? "হাদিসের বিস্তারিত" : lang === "urdu" ? "حدیث کی تفصیل" : "Hadith details"}</h2>` : `<h2 class="text-lg font-bold">${currentChapter ? esc(getHadithChapterName(currentChapter, lang)) : (lang === "bangla" ? "সকল হাদিস" : lang === "urdu" ? "تمام احادیث" : "All Hadiths")}</h2>`}
                ${listMarkup}
              </section>
            </main>
          </div>
        `;
      }
    }

    // --- Hadith Root Page ---
    else if (routePath === "/hadith") {
      title = "Hadith Collections — হাদিস সংকলন | Noor";
      description = "Browse authentic Hadith collections on Noor, including Sahih Al-Bukhari with Arabic text and Bengali, English and Urdu translations.";
      bodyContent = `
        <div class="min-h-screen bg-background">
          <header class="bg-gradient-to-br from-amber-500 to-orange-600 p-8 text-white text-center">
            <h1 class="text-3xl font-bold mb-2">হাদিস সংকলন</h1>
            <p class="text-white/80">সহীহ হাদিসের নির্ভরযোগ্য ভাণ্ডার</p>
          </header>
          <div class="p-4 max-w-2xl mx-auto -mt-6">
            <div class="grid grid-cols-1 gap-4">
              <a href="/hadith/sahih-bukhari/bangla" class="bg-card p-6 rounded-2xl border border-border hover:shadow-lg transition-all flex items-center justify-between group">
                <div>
                  <h3 class="text-xl font-bold group-hover:text-primary transition-colors">সহীহ বুখারী (বাংলা)</h3>
                  <p class="text-sm text-muted-foreground">সম্পূর্ণ বাংলা অনুবাদসহ</p>
                </div>
                <span class="text-2xl">→</span>
              </a>
              <a href="/hadith/sahih-bukhari/english" class="bg-card p-6 rounded-2xl border border-border hover:shadow-lg transition-all flex items-center justify-between group">
                <div>
                  <h3 class="text-xl font-bold group-hover:text-primary transition-colors">Sahih Al-Bukhari (English)</h3>
                  <p class="text-sm text-muted-foreground">Complete English translation</p>
                </div>
                <span class="text-2xl">→</span>
              </a>
              <a href="/hadith/sahih-bukhari/urdu" class="bg-card p-6 rounded-2xl border border-border hover:shadow-lg transition-all flex items-center justify-between group">
                <div>
                  <h3 class="text-xl font-bold group-hover:text-primary transition-colors">صحیح البخاری (Urdu)</h3>
                  <p class="text-sm text-muted-foreground">Urdu translation</p>
                </div>
                <span class="text-2xl">→</span>
              </a>
            </div>
          </div>
        </div>
      `;
    }

    // --- Dua Root Page ---
    else if (routePath === "/dua") {
      title = "Daily Duas & Supplications — দোয়া সমূহ | Noor";
      description = "দৈনন্দিন জীবনের প্রয়োজনীয় দোয়া ও জিকিরসমূহ অর্থ ও ফজিলতসহ পড়ুন।";
      
      const { data: duas } = await supabase
        .from("admin_content")
        .select("category")
        .eq("content_type", "dua")
        .eq("status", "published");

      const categories = [...new Set((duas || []).map(d => d.category))].filter(Boolean);

      const categoryList = categories.map(cat => `
        <a href="/dua/category/${cat.toLowerCase().replace(/ /g, '-')}" class="shrink-0 w-32 p-4 rounded-2xl bg-white/5 border border-white/10 hover:border-amber-400/30 transition-all flex flex-col items-center text-center relative overflow-hidden" style="background-image: ${ISLAMIC_PATTERN}">
          <div class="w-10 h-10 rounded-xl bg-amber-400/10 flex items-center justify-center text-xl mb-2 relative z-10">
            ${getCategoryIcon(cat)}
          </div>
          <p class="text-xs font-bold text-white line-clamp-1 relative z-10">${esc(getCategoryLabel(cat))}</p>
          <p class="text-[9px] text-white/40 mt-1 uppercase tracking-wider whitespace-nowrap relative z-10">সব দোয়া দেখুন →</p>
        </a>
      `).join("");

      bodyContent = `
        <div class="min-h-screen bg-[hsl(158,64%,18%)]">
          <header class="bg-gradient-to-br from-[hsl(158,55%,22%)] to-[hsl(158,64%,15%)] p-10 text-white text-center border-b border-white/10 relative overflow-hidden" style="background-image: ${ISLAMIC_PATTERN}, linear-gradient(to bottom right, hsl(158,55%,22%), hsl(158,64%,15%))">
            <div class="relative z-10">
              <h1 class="text-4xl font-bold mb-3">দোয়া সংকলন</h1>
              <p class="text-white/70 max-w-md mx-auto">দৈনন্দিন জীবনের প্রয়োজনীয় দোয়া ও জিকিরসমূহ</p>
            </div>
          </header>
          <div class="p-4 max-w-4xl mx-auto">
            <div class="flex gap-3 overflow-x-auto pb-4 scrollbar-hide">
              ${categoryList || '<p class="text-center p-8 text-white/50 w-full">দোয়া লোড হচ্ছে...</p>'}
            </div>
          </div>
        </div>
      `;
    }

    // --- Dua Detail Page ---
    else if (routePath.startsWith("/dua/")) {
      const slug = routePath.split("/")[2];
      const { data: dua } = await supabase
        .from("admin_content")
        .select("*")
        .eq("slug", slug)
        .in("content_type", ["dua", "Dua"])
        .eq("status", "published")
        .maybeSingle();

      if (dua) {
        title = `${dua.title || "দোয়া"} — বাংলা অর্থ, ফজিলত ও আরবি টেক্সট | Noor`;
        description = dua.explanation_bn || dua.content || `${dua.title || "এই দোয়া"} এর আরবি, বাংলা উচ্চারণ, অর্থ ও ফজিলত পড়ুন।`;
        req.storyOgImage = getDuaOgImage(dua);
        
        bodyContent = `
          <div class="min-h-screen bg-[hsl(158,64%,18%)] pb-20">
            <header class="bg-gradient-to-br from-[hsl(158,55%,22%)] to-[hsl(158,64%,15%)] p-6 text-white sticky top-0 z-30 relative overflow-hidden" style="background-image: ${ISLAMIC_PATTERN}">
              <div class="max-w-3xl mx-auto flex items-center gap-4 relative z-10">
                <a href="/dua" class="p-2 bg-white/10 rounded-full">←</a>
                <div class="min-w-0">
                  <h1 class="text-xl font-bold truncate">${esc(dua.title)}</h1>
                  <p class="text-[10px] uppercase tracking-widest opacity-70">বিভাগ: ${esc(getCategoryLabel(dua.category))}</p>
                </div>
              </div>
            </header>
            
            <main class="max-w-3xl mx-auto p-4 space-y-6">
              <img src="${esc(req.storyOgImage)}" alt="${esc(dua.title || "দোয়া")}" width="1200" height="630" class="sr-only" />
              <!-- Arabic Card -->
              <div class="relative bg-gradient-to-br from-[hsl(158,55%,25%)] to-[hsl(158,64%,20%)] border border-white/10 rounded-3xl shadow-xl overflow-hidden" style="background-image: ${ISLAMIC_PATTERN}, linear-gradient(to bottom right, hsl(158,55%,25%), hsl(158,64%,20%))">
                <div class="absolute inset-0 border border-white/5 rounded-3xl pointer-events-none"></div>
                <div class="p-8 text-center relative z-10">
                  <p class="text-amber-400 text-[10px] font-bold uppercase tracking-[0.2em] mb-4 opacity-80">আরবি</p>
                  <p dir="rtl" class="text-3xl md:text-5xl font-arabic leading-[2.2] text-white drop-shadow-md">${esc(dua.content_arabic)}</p>
                </div>
              </div>

              <!-- Pronunciation Card -->
              <div class="bg-white/5 border border-white/10 rounded-2xl p-6 relative overflow-hidden shadow-sm" style="background-image: ${ISLAMIC_PATTERN}">
                <div class="absolute inset-0 border border-white/5 rounded-2xl pointer-events-none"></div>
                <h2 class="text-[10px] font-bold text-amber-400 uppercase tracking-[0.2em] mb-3 opacity-80">উচ্চারণ</h2>
                <p class="text-xl md:text-2xl leading-[1.8] tracking-wide font-bangla" style="color: #FFFFFF !important; font-weight: 500; text-shadow: 0 1px 2px rgba(0,0,0,0.2);">${esc(dua.content_pronunciation)}</p>
              </div>

              <!-- Meaning Card -->
              <div class="bg-gradient-to-br from-amber-400/10 to-transparent border border-amber-400/20 rounded-2xl p-6 relative overflow-hidden shadow-sm" style="background-image: ${ISLAMIC_PATTERN}, linear-gradient(to bottom right, rgba(251, 191, 36, 0.1), transparent)">
                <div class="absolute inset-0 border border-white/5 rounded-2xl pointer-events-none"></div>
                <h2 class="text-[10px] font-bold text-amber-400 uppercase tracking-[0.2em] mb-3 opacity-80">অর্থ</h2>
                <p class="text-xl md:text-2xl leading-[1.8] tracking-wide font-bangla-serif" style="color: #FFFFFF !important; font-weight: 500; text-shadow: 0 1px 2px rgba(0,0,0,0.2);">${esc(dua.content)}</p>
              </div>
              
              <!-- Virtues & Explanation -->
              ${dua.virtue ? `
                <div class="bg-white/5 border border-white/10 rounded-3xl p-6">
                  <h3 class="text-amber-400 font-bold mb-3 flex items-center gap-2">
                    <span>✨</span> ফজিলত
                  </h3>
                  <p class="text-white/80 italic leading-relaxed">
                    ${esc(dua.virtue)}
                  </p>
                  ${dua.virtue_reference ? `<p class="mt-4 text-xs text-white/40">[রেফারেন্স: ${esc(dua.virtue_reference)}]</p>` : ''}
                </div>
              ` : ''}
              
              ${dua.explanation_bn ? `
                <div class="bg-white/5 border border-white/10 rounded-3xl p-6">
                  <h3 class="text-amber-400 font-bold mb-3 flex items-center gap-2">
                    <span>📚</span> বিস্তারিত ব্যাখ্যা
                  </h3>
                  <div class="text-white/70 leading-relaxed whitespace-pre-line">
                    ${esc(dua.explanation_bn)}
                  </div>
                </div>
              ` : ''}
              
              <!-- Footer Reference -->
              <div class="text-center py-8 opacity-30 text-xs text-white">
                <p>উৎস: ${esc(dua.reference || "হাদিস সংকলন")}</p>
                <p class="mt-1">© Noor Islamic App</p>
              </div>
            </main>
          </div>
        `;
      }
    }

    // --- Stories Root Page ---
    else if (routePath === "/stories") {
      title = "Islamic Stories | Noor";
      description = "Read Islamic stories of the Prophets, Sahaba and inspiring lessons of faith, character and mercy on Noor.";
      
      const { data: stories } = await supabase
        .from("admin_content")
        .select("slug, title, content")
        .eq("content_type", "story")
        .eq("status", "published");

      const storyList = (stories || []).map(s => `
        <div class="bg-card border border-border rounded-2xl overflow-hidden shadow-sm mb-4">
          <div class="p-5">
            <h3 class="text-xl font-bold mb-2">${esc(s.title)}</h3>
            <a href="/stories/${s.slug}" class="text-primary font-bold">পড়ুন →</a>
          </div>
        </div>
      `).join("");

      bodyContent = `
        <div class="min-h-screen bg-background pb-24">
          <section class="bg-emerald-800 text-white p-10">
            <h1 class="text-3xl font-bold">Islamic Stories</h1>
            <p class="mt-2">Authentic stories of the Prophets and Sahaba.</p>
          </section>
          <div class="p-4 max-w-4xl mx-auto">
            ${storyList || '<p class="text-center text-muted-foreground">No stories found.</p>'}
          </div>
        </div>
      `;
    }

    // --- Story Detail Page ---
    else if (routePath.startsWith("/stories/")) {
      const slug = routePath.split("/")[2];
      let story = findBundledStory(slug);

      if (!story) {
        const { data } = await supabase
          .from("admin_content")
          .select("*")
          .eq("slug", slug)
          .eq("content_type", "story")
          .eq("status", "published")
          .maybeSingle();
        story = data;
      }

      if (story) {
        const storyTitle = story.title_bn || story.title || story.title_en || "Islamic Story";
        const storyContent = story.content_bn || story.content || story.content_en || "Read this beautiful Islamic story on NoorApp.";
        const storyDescription = story.seo?.meta_description || story.seo?.open_graph?.["og:description"] || story.moral_bn || story.moral_en || storyContent.slice(0, 160);
        const ogImage = story.og_image_url || story.seo?.open_graph?.["og:image"] || `https://llicfiepatzgllmjhzbw.supabase.co/storage/v1/object/public/og-images/stories/${slug}.webp`;
        const sourceLabel = story.reference || story.source_detail || story.source_name || "Islamic source reference";
        const moral = story.moral_bn || story.moral_en || "আল্লাহর উপর ভরসা, সত্য ও উত্তম চরিত্রের শিক্ষা গ্রহণ করুন।";

        title = uniqueStoryTitle(story.seo?.title || storyTitle);
        description = enrichStoryDescription(storyDescription, storyTitle);
        req.storyOgImage = ogImage;

        bodyContent = `
          <div class="min-h-screen bg-background pb-24">
            <article class="mx-auto max-w-3xl space-y-6 p-4 md:p-6">
              <header class="space-y-4">
                <p class="text-sm font-semibold uppercase tracking-wide text-primary">Islamic Story</p>
                <h1 class="text-3xl font-bold leading-tight md:text-4xl">${esc(storyTitle)}</h1>
                <p class="text-base leading-7 text-muted-foreground">${esc(storyDescription)}</p>
                <img src="${esc(ogImage)}" alt="${esc(storyTitle)}" class="w-full rounded-2xl shadow-lg" loading="eager" />
              </header>
              <div class="rounded-2xl border border-primary/20 bg-primary/5 p-5">
                <h2 class="text-lg font-bold text-primary">গল্পের শিক্ষা</h2>
                <p class="mt-2 leading-7 text-foreground/85">${esc(moral)}</p>
              </div>
              <div class="prose prose-emerald max-w-none dark:prose-invert">
                ${esc(storyContent).replace(/\n/g, '<br/>')}
              </div>
              <footer class="rounded-2xl border border-border bg-card p-5 text-sm text-muted-foreground">
                <strong class="text-foreground">উৎস ও রেফারেন্স:</strong> ${esc(sourceLabel)}
              </footer>
            </article>
          </div>
        `;
      } else {
        const fallbackTitle = storyFallbackLabel(slug);
        title = uniqueStoryTitle(`${fallbackTitle} | Islamic Story`);
        description = enrichStoryDescription("", fallbackTitle);
      }
    }

    // --- Crawlable HTML sitemap ---
    else if (routePath === "/sitemap") {
      title = "Sitemap — Noor Islamic App";
      description = "Browse Noor's public Quran, Hadith, Dua, prayer, learning, support and policy pages.";
      bodyContent = `
        <div class="min-h-screen bg-background pb-24">
          <header class="bg-gradient-to-br from-emerald-700 to-teal-800 px-5 py-10 text-white">
            <div class="mx-auto max-w-3xl">
              <p class="mb-3 text-xs font-bold uppercase tracking-[0.18em] text-emerald-100">NOOR ISLAMIC APP</p>
              <h1 class="text-3xl font-bold">Sitemap</h1>
              <p class="mt-3 text-white/85">Browse the public pages and learning tools available on Noor.</p>
            </div>
          </header>
          <main class="mx-auto max-w-3xl space-y-6 px-4 py-7">
            <section class="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <h2 class="text-xl font-bold">Islamic resources</h2>
              <ul class="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
                <li><a class="text-primary hover:underline" href="/quran">Quran</a></li>
                <li><a class="text-primary hover:underline" href="/hadith">Hadith</a></li>
                <li><a class="text-primary hover:underline" href="/dua">Daily Duas</a></li>
                <li><a class="text-primary hover:underline" href="/prayer-times">Prayer Times</a></li>
                <li><a class="text-primary hover:underline" href="/prayer-guide">Prayer Guide</a></li>
                <li><a class="text-primary hover:underline" href="/stories">Islamic Stories</a></li>
                <li><a class="text-primary hover:underline" href="/99-names">99 Names of Allah</a></li>
                <li><a class="text-primary hover:underline" href="/baby-names">Islamic Baby Names</a></li>
                <li><a class="text-primary hover:underline" href="/calendar">Islamic Calendar</a></li>
                <li><a class="text-primary hover:underline" href="/quiz">Islamic Quiz</a></li>
                <li><a class="text-primary hover:underline" href="/qibla">Qibla Finder</a></li>
                <li><a class="text-primary hover:underline" href="/tasbih">Tasbih Counter</a></li>
              </ul>
            </section>
            <section class="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <h2 class="text-xl font-bold">About and support</h2>
              <ul class="mt-4 space-y-2 text-sm"><li><a class="text-primary hover:underline" href="/about">About Noor</a></li><li><a class="text-primary hover:underline" href="/sources">Islamic Sources</a></li><li><a class="text-primary hover:underline" href="/contact">Support &amp; Feedback</a></li><li><a class="text-primary hover:underline" href="/privacy-policy">Privacy Policy</a></li><li><a class="text-primary hover:underline" href="/terms">Terms &amp; Conditions</a></li></ul>
            </section>
          </main>
        </div>
      `;
    }
    // --- Public Trust, Legal and Feature Pages ---
    else if (STATIC_PAGE_COPY[routePath]) {
      const page = STATIC_PAGE_COPY[routePath];
      title = page.title;
      description = page.description;
      bodyContent = renderStaticPage(page);
    }

    // --- Contact Page ---
    else if (routePath === "/contact") {
      title = "Contact Us | Noor";
      description = "Contact Noor support for help with Quran, Hadith, Dua, prayer times, account questions and feedback about the Islamic app.";
      bodyContent = `
        <div class="min-h-screen bg-background p-4">
          <header class="mb-8">
            <h1 class="text-2xl font-bold">Contact Us</h1>
            <p class="text-muted-foreground">যোগাযোগ করুন</p>
          </header>
          <div class="max-w-2xl mx-auto space-y-6">
            <section class="bg-card p-6 rounded-2xl border border-border">
              <h2 class="text-lg font-bold mb-4">Get in Touch</h2>
              <p class="mb-4">Email: <a href="mailto:support@noorapp.in" class="text-primary">support@noorapp.in</a></p>
              <p class="text-sm text-muted-foreground">We typically respond within 24-48 hours.</p>
            </section>
          </div>
        </div>
      `;
    }

    // --- Fallback for other routes ---
    if (!bodyContent) {
      bodyContent = `
        <div class="min-h-screen flex items-center justify-center p-4 bg-background">
          <div class="text-center">
            <h1 class="text-2xl font-bold mb-2">${esc(title)}</h1>
            <div style="display: flex; flex-direction: column; align-items: center; gap: 1.5rem; padding: 2rem;">
              <div style="position: relative; width: 80px; height: 80px; display: flex; align-items: center; justify-center; background: linear-gradient(135deg, #fbbf24, #d97706); border-radius: 20px; box-shadow: 0 10px 25px -5px rgba(251, 191, 36, 0.4); animation: pulse-premium 2s ease-in-out infinite;">
                <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z"></path><path d="M8 7h6"></path><path d="M8 11h8"></path></svg>
              </div>
              <div style="text-align: center;">
                <p style="color: #ffffff; font-family: 'Noto Sans Bengali', sans-serif; font-weight: 600; font-size: 1.1rem; margin-bottom: 0.25rem; opacity: 0.9;">বিসমিল্লাহির রাহমানির রাহিম</p>
                <p style="color: rgba(255,255,255,0.5); font-family: sans-serif; font-weight: 500; font-size: 0.8rem; letter-spacing: 0.1em; text-transform: uppercase;">Preparing Your Experience</p>
              </div>
            </div>
            <style>
              @keyframes pulse-premium {
                0%, 100% { transform: scale(1); box-shadow: 0 10px 25px -5px rgba(251, 191, 36, 0.4); }
                50% { transform: scale(1.05); box-shadow: 0 15px 35px -5px rgba(251, 191, 36, 0.6); }
              }
              body { background-color: #064e3b !important; }
            </style>
          </div>
        </div>
      `;
    }

    // Use actual app.html as base
    const appTemplate = getAppTemplate();
    
    // Inject custom styles for premium typography
    const customStyles = `
      <style>
        .font-bangla { font-family: 'Noto Sans Bengali', 'Hind Siliguri', sans-serif !important; }
        .font-bangla-serif { font-family: 'Noto Serif Bengali', serif !important; }
        .font-arabic { font-family: 'Scheherazade New', 'Amiri', serif !important; }
        [dir="rtl"] { text-align: right; }
        @keyframes noor-skeleton-shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
        .noor-skeleton-shimmer {
          background: linear-gradient(105deg, hsl(210 20% 94%) 24%, hsl(158 45% 82% / .52) 42%, hsl(210 20% 94%) 60%);
          background-size: 300% 100%;
          animation: noor-skeleton-shimmer 1.8s ease-in-out infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .noor-skeleton-shimmer { animation: none; background-position: 0 0; }
        }
      </style>
    `;
    
    const finalHtml = inject(appTemplate.replace('</head>', `${customStyles}</head>`), {
      title,
      description,
      canonical: canonicalUrl,
      ogImage: req.storyOgImage || `${SITE_ORIGIN}/og-image.png`,
      body: bodyContent
    });

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    // Metadata changes must reach Googlebot and visitors promptly after each release.
    res.setHeader("Cache-Control", "public, max-age=0, s-maxage=300, stale-while-revalidate=300");
    res.setHeader("X-Noor-Prerender", "v101");
    res.setHeader("X-Noor-OG-Image", req.storyOgImage || "default");
    res.status(200).send(finalHtml);
  } catch (error) {
    console.error("Prerender error:", error);
    res.setHeader("X-Noor-Prerender-Error", "true");
    res.status(200).send(getAppTemplate());
  }
}
