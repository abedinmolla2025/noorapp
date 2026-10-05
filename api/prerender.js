import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";
import { assignBabyNameSlugs, isValidBabyNameSlugSegment } from "../src/lib/babyNameSlug.js";
import { assignAllahNameSlugs, isValidAllahNameSlugSegment } from "../src/lib/allahNameSlug.js";

const SITE_ORIGIN = "https://noorapp.in";

// Phase A (2026-10-05): route-specific OG images so prerender and SPA emit the
// identical og:image. Only routes listed here override the default og-image.png.
const TOOL_OG_IMAGES = {
  "/prayer-guide": `${SITE_ORIGIN}/og-prayer-guide.png`,
};
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "https://llicfiepatzgllmjhzbw.supabase.co";
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxsaWNmaWVwYXR6Z2xsbWpoemJ3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg0ODA4MDksImV4cCI6MjA4NDA1NjgwOX0.T7xnXRSM2jx92gVH8Of1dePj609C7WKKflv2I_VZpy0";
const LOCAL_CANONICAL_OG_SLUGS = new Set([
  "al-baqarah-2-285", "al-baqarah-2-286", "ayatul-kursi", "dua-after-wudu",
  "dua-before-entering-toilet", "dua-before-sleeping", "dua-for-parents",
  "dua-for-sehri-intention-for-fasting", "dua-for-the-sick", "dua-for-travel",
  "dua-in-times-of-distress", "dua-when-looking-in-the-mirror",
  "dua-when-provoked-while-fasting", "dua-when-wearing-new-clothes",
  "surah-al-falaq", "surah-al-fatihah", "surah-al-ikhlas", "surah-al-ikhlas-2",
  "surah-an-nas", "ইসমে-আযমের-দোয়া-অত্যন্ত-ফজিলতপূর্ণ",
]);

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
const normalizeDuaDisplayText = (value) => {
  if (!value) return "";
  const normalized = String(value)
    .replace(/\\+r\\+n/g, "\n")
    .replace(/\\+n/g, "\n")
    .replace(/\\+r/g, "\n")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
  const lines = normalized.split("\n").map((line) => line.trim()).filter(Boolean);
  const deduped = [];
  for (const line of lines) {
    if (line !== deduped[deduped.length - 1]) deduped.push(line);
  }
  return deduped.join("\n");
};
const formatBanglaPronunciation = (value) => {
  const normalized = normalizeDuaDisplayText(value);
  if (!normalized) return "";
  return normalized.split("\n").map((line) => {
    let formatted = line.trim();
    if (formatted.length >= 60) formatted = formatted.replace(/\s+(ও|এবং)\s+/g, ", $1 ");
    if (!/[।!?]$/u.test(formatted)) formatted += "।";
    return formatted;
  }).join("\n");
};

const shortenMetaText = (value, limit) => {
  const text = String(value || "").trim().replace(/\s+/g, " ");
  if (text.length <= limit) return text;
  const clipped = text.slice(0, limit + 1);
  const boundary = clipped.lastIndexOf(" ");
  return (boundary > 25 ? clipped.slice(0, boundary) : clipped.slice(0, limit)).replace(/[\s,;:—–\-|]+$/u, "").trim();
};

const uniqueStoryTitle = (value) => {
  const base = String(value || "Islamic Story")
    .trim()
    .replace(/(?:\s*\|\s*Noor(?:\s*App)?)+$/iu, "")
    .trim();
  return shortenMetaText(`${base} | Noor`, 70);
};

const isClippedStoryDescription = (value) => {
  const text = String(value || "").trim();
  return /(?:\bstreng|\bstrengthen|\bstrengthens|\bfa|\bf)\.$/iu.test(text);
};

const enrichStoryDescription = (value, title) => {
  const base = String(value || "").trim().replace(/\s+/g, " ");
  const expanded = base.length >= 90
    ? base
    : `${base || title} — read this Islamic story, its authentic lesson and reflection on Noor.`;
  return shortenMetaText(expanded, 160);
};

// Visible breadcrumb trail with real crawlable links (bot-facing).
// items: [{ label, href }] — the last item is the current page (no link).
const breadcrumbMarkup = (items) => {
  const links = items.map((item, i) => {
    const isLast = i === items.length - 1;
    const sep = i > 0 ? `<span class="mx-2 text-muted-foreground/60">/</span>` : "";
    return `${sep}${isLast
      ? `<span class="text-foreground font-medium" aria-current="page">${esc(item.label)}</span>`
      : `<a class="text-muted-foreground hover:text-primary hover:underline" href="${esc(item.href)}">${esc(item.label)}</a>`}`;
  }).join("");
  return `<nav aria-label="Breadcrumb" class="mb-4 text-sm"><div class="flex flex-wrap items-center">${links}</div></nav>`;
};

// BreadcrumbList JSON-LD for a trail of { label, href } (last item = current page).
const breadcrumbJsonLd = (items) => {
  const list = items.map((item, i) => ({
    "@type": "ListItem",
    position: i + 1,
    name: item.label,
    ...(i < items.length - 1 ? { item: `${SITE_ORIGIN}${item.href}` } : {}),
  }));
  return `<script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: list,
  })}</script>`;
};

// CollectionPage JSON-LD for hub/listing pages. Only include fields we can
// populate truthfully — no invented dates, counts, or authorship.
const collectionJsonLd = ({ name, description, url }) => {
  return `<script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name,
    description: String(description || "").slice(0, 500),
    url,
    inLanguage: ["en", "bn"],
    publisher: { "@id": `${SITE_ORIGIN}/#organization` },
  })}</script>`;
};

// Article JSON-LD. Only include fields we can populate truthfully — no dates,
// ratings, or invented authorship.
const articleJsonLd = ({ headline, description, image, url, inLanguage = "bn" }) => {
  const article = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: String(headline || "").slice(0, 200),
    description: String(description || "").slice(0, 500),
    inLanguage,
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    author: { "@type": "Organization", name: "Noor", url: SITE_ORIGIN },
    publisher: {
      "@type": "Organization",
      name: "Noor",
      url: SITE_ORIGIN,
      logo: { "@type": "ImageObject", url: `${SITE_ORIGIN}/logo.png` },
    },
  };
  if (image) article.image = image;
  return `<script type="application/ld+json">${JSON.stringify(article)}</script>`;
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
  if (dua?.slug && LOCAL_CANONICAL_OG_SLUGS.has(dua.slug)) {
    return `${SITE_ORIGIN}/assets/dua-og/${encodeURIComponent(dua.slug)}.webp`;
  }
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
    heading: "Authentic Islamic Sources",
    intro: "Because trustworthiness is central to Islamic knowledge, you deserve to know exactly where Noor's content comes from and how it is verified. This page lists every classical source Noor draws from, the scholars behind them, and our editorial process.",
    sections: [
      ["The Qur'an", "The Qur'an is the literal word of Allah, revealed to the Prophet Muhammad ﷺ over 23 years and preserved unchanged for over 1,400 years. Arabic text: Uthmani Mus-haf (Madinah script), consonantal text agreed by consensus. Translations are served from the AlQuran Cloud API — Bengali by Muhiuddin Khan, English by Saheeh International, Urdu by Ahmed Ali — and the active translator is shown in the Qur'an reader under the language selector. Verse numbering follows the standard Kufan system."],
      ["Hadith collections", "Hadith are the sayings, actions and tacit approvals of the Prophet Muhammad ﷺ, transmitted through rigorously verified chains of narrators. Noor currently publishes Sahih al-Bukhari — compiled by Imam Muhammad ibn Isma'il al-Bukhari (d. 256 AH / 870 CE), widely regarded in Sunni scholarship as one of the most rigorously authenticated hadith collections. Further collections from the six major Sunni collections (Kutub as-Sittah) — Sahih Muslim (Imam Muslim ibn al-Hajjaj, d. 261 AH / 875 CE), Sunan Abu Dawud (Imam Abu Dawud as-Sijistani, d. 275 AH), Jami' at-Tirmidhi (Imam Muhammad at-Tirmidhi, d. 279 AH, known for grading each hadith), Sunan an-Nasa'i (Imam Ahmad an-Nasa'i, d. 303 AH), and Sunan Ibn Majah (Imam Ibn Majah, d. 273 AH) — are planned for future release and are not yet available on Noor."],
      ["Grading and methodology", "Where a hadith is graded (Sahih, Hasan, Da'if) we follow the classical rulings of Imam al-Bukhari, Imam Muslim, Imam at-Tirmidhi and later authorities such as Ibn Hajar al-'Asqalani and Shaykh Muhammad Nasir ad-Din al-Albani."],
      ["Editorial review", "Individual hadith, dua and story entries should identify the collection or Qur'an reference, book/chapter or verse where available, translation/edition information, and the date of the latest editorial review. If a source or translation edition is not yet available in the record, it is marked for editorial follow-up rather than presented as independently verified. Found an inaccurate reference or a translation issue? Please report it through the Contact page."],
    ],
  },
  "/privacy-policy": {
    title: "Privacy Policy | Noor",
    description: "Read Noor's privacy policy covering local preferences, analytics, advertising cookies, third-party services and user rights.",
    heading: "Privacy Policy",
    intro: "How Noor handles your data. Noor is designed to help you with prayer times, Quran, duas and other Islamic content, collecting only the minimum information needed to keep the app working smoothly and improve your experience. This policy explains local storage, analytics, advertising cookies, third-party processors, data retention, children's privacy, and how to request deletion or contact us about privacy.",
    sections: [
      ["What we store on your device", "Preferences such as theme mode, language selection, quiz progress, notification and prayer settings are stored locally on your device using localStorage. This data never leaves your device unless your platform (for example, backup services) syncs it."],
      ["Usage information", "The app may collect anonymous usage information (such as which screens are visited most) to understand how features are used. This information is aggregated and does not identify you personally."],
      ["Your rights", "You can clear app data (such as local preferences or quiz history) from your device at any time through your browser or device settings. If you stop using the app, we do not keep any additional personal information about you inside the app."],
      ["Advertising & cookies", "Noor may display advertisements provided by third-party advertising networks, including Google AdSense. These services may use cookies and similar tracking technologies to serve ads based on your prior visits to this app or other websites. You can opt out of personalized advertising at any time by visiting Google Ads Settings, and you can withdraw or change consent any time from the cookie banner in this app."],
      ["Third-party services", "Noor uses third-party services that may collect data: Aladhan API for accurate prayer time calculations based on your location, OpenStreetMap / Nominatim for reverse geocoding your location to display city names, and Google AdSense for displaying relevant advertisements."],
      ["Changes & contact", "This privacy policy may be updated as the app evolves. If you have questions or concerns, you may reach out to the Noor team through the Contact page (/contact) or via the store page where the app is published, or email support@noorapp.in. Noor does not ask for sensitive religious, financial or authentication information to use its public reading pages."],
    ],
  },
  "/terms": {
    title: "Terms & Conditions | Noor",
    description: "Read Noor's terms, acceptable-use guidelines and content limitations for using the free Islamic app.",
    heading: "Terms & Conditions",
    intro: "Guidelines for using Noor. These terms describe acceptable use, service availability limits, content disclaimers, intellectual-property expectations, updates, and how to contact the developer about a dispute or correction. Noor is developed and maintained by ABEDIN MOLLA from India — a humble effort to bring daily Islamic reminders, prayer times, Quran and duas together in one beautiful place.",
    sections: [
      ["Purpose of the app", "Noor is provided for educational and spiritual benefit only. It should not be used for any harmful, offensive or unlawful activity."],
      ["Personal responsibility", "You remain responsible for verifying important information such as prayer times or religious rulings with trusted local scholars or sources. The app is a helpful tool, not a replacement for qualified scholarship."],
      ["Acceptable use", "You agree not to misuse the app, attempt to break security, or disturb other users' experience in any way. Any abusive or harmful use is strictly prohibited. Do not misuse the service, attempt unauthorized access, disrupt availability or copy and redistribute protected material without permission."],
      ["Developer information", "This app has been developed and maintained by ABEDIN MOLLA from India, with the intention of serving the Muslim community with a clean and focused Islamic experience."],
      ["Changes to these terms", "These terms may be updated over time as the app improves. Continued use of the app after changes means you accept the updated terms."],
      ["Contact", "For questions, disputes or corrections regarding these terms, please contact the developer through the Contact page (/contact)."],
    ],
  },
  "/download": {
    title: "Download Noor App — Install the Web App | Noor",
    description: "Learn how to install Noor as a Progressive Web App on supported devices, with access to Quran, Hadith, prayer times, Dua and Islamic learning tools.",
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
    title: "Prayer Guide | Step-by-Step Salah Guide | Noor",
    description: "Use Noor's prayer guide to review key Salah steps, Niyah wordings, recitations and Duas in a clear English and Bengali format.",
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

const renderStaticPage = (page, extraHtml = "") => `
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
      ${extraHtml}
      <p class="pt-3 text-center text-sm text-muted-foreground">For questions, corrections or source concerns, please visit <a href="/contact" class="font-semibold text-primary">Support &amp; Feedback</a>.</p>
    </main>
  </div>
`;

// --- Tool content for SEO: server-render the same data the React tool pages
// use, so crawlers see real content instead of an empty app shell. Data comes
// from public/data/*.json, generated at build time by
// scripts/extract-tool-data.mjs from the TSX page sources (single source of
// truth). File candidates mirror the hadith JSON loading pattern.
const loadToolData = (filename) => {
  const candidates = [
    path.join(process.cwd(), "public", "data", filename),
    path.join(process.cwd(), "dist", "data", filename),
    path.join("/var/task", "dist", "data", filename),
  ];
  for (const file of candidates) {
    try {
      if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8"));
    } catch (e) { /* try next candidate */ }
  }
  return null;
};

// Baby-name detail rollout (2026-10-05): verification-gated allowlist.
// Only slugs listed in public/data/baby-name-sitemap-allowlist.json exist as
// /baby-names/:slug pages. Everything else fails closed (404 + noindex).
// Missing file => empty list => no name detail pages render (fail-safe).
let babyNameAllowlist = null;
const getBabyNameAllowlist = () => {
  if (babyNameAllowlist === null) {
    const data = loadToolData("baby-name-sitemap-allowlist.json");
    babyNameAllowlist = Array.isArray(data) ? data.filter((s) => isValidBabyNameSlugSegment(s)) : [];
  }
  return babyNameAllowlist;
};

// Published baby-name records, cached per cold start. Fail-closed: on error
// return [] so the detail branch 404s instead of rendering a broken page.
// Paginated: PostgREST clamps limit to 1000 rows, so offset-loop to get all.
let cachedBabyNames = null;
async function fetchPublishedBabyNames() {
  if (cachedBabyNames !== null) return cachedBabyNames;
  try {
    const all = [];
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await supabase
        .from("admin_content")
        .select("id,title,title_arabic,content,content_en,content_arabic,category")
        .eq("content_type", "name")
        .eq("is_published", true)
        .order("created_at", { ascending: true })
        .range(offset, offset + 999);
      if (error) throw error;
      all.push(...(data || []));
      if (!data || data.length < 1000) break;
    }
    cachedBabyNames = all;
  } catch (e) {
    console.error("[SSR] baby-names fetch failed", e);
    cachedBabyNames = [];
  }
  return cachedBabyNames;
}

// /99-names/:slug pages. Same fail-closed pattern as baby names.
// Missing file => empty list => no detail pages render (fail-safe).
let allahNameAllowlist = null;
const getAllahNameAllowlist = () => {
  if (allahNameAllowlist === null) {
    const data = loadToolData("allah-name-sitemap-allowlist.json");
    allahNameAllowlist = Array.isArray(data) ? data.filter((s) => isValidAllahNameSlugSegment(s)) : [];
  }
  return allahNameAllowlist;
};

// 99 Names records, cached per cold start. Fail-closed: on error return []
// so the detail branch 404s instead of rendering a broken page.
let cachedAllahNames = null;
function getAllahNames() {
  if (cachedAllahNames === null) {
    const data = loadToolData("names-of-allah.json");
    cachedAllahNames = Array.isArray(data) ? data : [];
  }
  return cachedAllahNames;
}

// Quiz duplicate -> canonical-primary map (2026-09-28 forensic consolidation).
// Render-layer only: exact-duplicate question URLs canonicalize to the
// strongest verified record (see QUIZ_FORENSIC_AUDIT_2026-09-28.md and
// src/data/quiz-duplicate-canonicals.json). DB untouched. Missing file =>
// empty map => every URL self-canonicalizes (fail-safe).
let quizCanonicalMap = null;
const getQuizCanonicalId = (id) => {
  if (quizCanonicalMap === null) {
    const doc = loadToolData("quiz-canonicals.json");
    quizCanonicalMap = doc && typeof doc.map === "object" && !Array.isArray(doc.map) ? doc.map : {};
  }
  const primary = quizCanonicalMap[id];
  return typeof primary === "string" && primary ? primary : id;
};

const renderNamesOfAllah = () => {
  const names = loadToolData("names-of-allah.json");
  if (!Array.isArray(names) || names.length === 0) return "";
  const cards = names.map((n) => `
    <li class="rounded-2xl border border-border bg-card p-4 text-center shadow-sm">
      <p class="text-2xl font-bold text-foreground" lang="ar" dir="rtl">${esc(n.arabic || "")}</p>
      <p class="mt-2 text-sm font-semibold text-primary">${esc(n.transliteration || "")}</p>
      <p class="mt-1 text-sm text-muted-foreground">${esc(n.meaning || "")}</p>
      ${n.bengaliMeaning ? `<p class="mt-1 text-sm text-muted-foreground">${esc(n.bengaliMeaning)}</p>` : ""}
    </li>`).join("");
  return `
    <section class="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <h2 class="text-xl font-bold text-foreground">All 99 Names of Allah (আল্লাহর ৯৯টি নাম)</h2>
      <p class="mt-2 text-sm leading-7 text-muted-foreground">The complete list of the 99 Names of Allah with Arabic text, transliteration, and English and Bengali meanings.</p>
      <ol class="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">${cards}</ol>
    </section>`;
};

const renderPrayerGuideSteps = () => {
  const steps = loadToolData("prayer-guide-steps.json");
  if (!Array.isArray(steps) || steps.length === 0) return "";
  const items = steps.map((s, i) => `
    <li class="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <h3 class="text-lg font-bold text-foreground">${i + 1}. ${esc(s.name || "")}${s.nameBn ? ` <span class="font-normal text-muted-foreground">(${esc(s.nameBn)})</span>` : ""}</h3>
      <p class="mt-2 text-sm leading-7 text-muted-foreground">${esc(s.action || "")}</p>
      ${s.actionBn ? `<p class="mt-1 text-sm leading-7 text-muted-foreground">${esc(s.actionBn)}</p>` : ""}
      ${s.recitation ? `<p class="mt-3 text-xl font-semibold text-foreground" lang="ar" dir="rtl">${esc(s.recitation)}</p>` : ""}
      ${s.recitationMeaning ? `<p class="mt-1 text-sm text-muted-foreground">${esc(s.recitationMeaning)}</p>` : ""}
      ${s.explanation ? `<p class="mt-2 text-sm leading-7 text-muted-foreground">${esc(s.explanation)}</p>` : ""}
    </li>`).join("");
  return `
    <section>
      <h2 class="px-1 text-xl font-bold text-foreground">Step-by-step prayer guide</h2>
      <ol class="mt-3 space-y-4">${items}</ol>
    </section>`;
};

// Prayer Guide Phase A (2026-10-05): crawler parity for the Niyah tab.
// Content mirrors src/pages/PrayerGuidePage.tsx NIYAH_DATA via prayer-guide-niyah.json.
const renderPrayerGuideNiyah = () => {
  const list = loadToolData("prayer-guide-niyah.json");
  if (!Array.isArray(list) || list.length === 0) return "";
  const items = list.map((n) => `
    <li class="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <h3 class="text-lg font-bold text-foreground">${esc(n.name || "")}${n.nameBn ? ` <span class="font-normal text-muted-foreground">(${esc(n.nameBn)})</span>` : ""}</h3>
      <p class="mt-1 text-sm font-semibold text-primary">${esc(n.rakats || "")}${n.rakatsBn ? ` <span class="font-normal text-muted-foreground">(${esc(n.rakatsBn)})</span>` : ""}</p>
      ${n.arabic ? `<p class="mt-3 text-xl font-semibold text-foreground" lang="ar" dir="rtl">${esc(n.arabic)}</p>` : ""}
      ${n.transliteration ? `<p class="mt-2 text-sm text-muted-foreground">${esc(n.transliteration)}</p>` : ""}
      ${n.meaning ? `<p class="mt-1 text-sm leading-7 text-muted-foreground">${esc(n.meaning)}</p>` : ""}
      ${n.note ? `<p class="mt-1 text-sm leading-7 text-muted-foreground">${esc(n.note)}</p>` : ""}
    </li>`).join("");
  return `
    <section>
      <h2 class="px-1 text-xl font-bold text-foreground">Niyah for each prayer</h2>
      <p class="mt-2 text-sm leading-7 text-muted-foreground">Intention (niyyah) resides in the heart — your prayer is valid with a sincere intention even if you say nothing aloud. This is the agreed position of the imams of Islam.</p>
      <p class="mt-1 text-sm leading-7 text-muted-foreground">The Arabic wordings below are later educational formulas taught in Hanafi prayer guides to help you focus your intention. They are not from the Prophet ﷺ. Scholars have differed about saying the intention aloud: some later scholars considered it desirable as an aid to focus, while others considered it an innovation. Saying these wordings is not required for your prayer to be valid.</p>
      <ul class="mt-3 space-y-4">${items}</ul>
    </section>`;
};

// Prayer Guide Phase A (2026-10-05): crawler parity for the Learn tab.
// Content mirrors src/pages/PrayerGuidePage.tsx PRAYER_LEARNING via prayer-guide-learning.json.
const renderPrayerGuideLearning = () => {
  const data = loadToolData("prayer-guide-learning.json");
  if (!data || typeof data !== "object" || Array.isArray(data)) return "";
  const sections = Object.values(data);
  if (sections.length === 0) return "";
  const blocks = sections.map((s) => {
    const bullets = s.content || s.items || [];
    if (!Array.isArray(bullets) || bullets.length === 0) return "";
    return `
    <div class="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <h3 class="text-lg font-bold text-foreground">${esc(s.title || "")}${s.titleBn ? ` <span class="font-normal text-muted-foreground">(${esc(s.titleBn)})</span>` : ""}</h3>
      <ul class="mt-2 space-y-2">${bullets.map((b) => `<li class="text-sm leading-7 text-muted-foreground">✦ ${esc(b)}</li>`).join("")}</ul>
    </div>`;
  }).join("");
  if (!blocks) return "";
  return `
    <section>
      <h2 class="px-1 text-xl font-bold text-foreground">Learn about prayer</h2>
      <p class="mt-2 text-sm leading-7 text-muted-foreground">Note: This guide follows Hanafi fiqh. Other schools of thought may differ on some rulings.</p>
      <div class="mt-3 space-y-4">${blocks}</div>
    </section>`;
};

// Prayer Guide Phase A (2026-10-05): crawler parity for the Duas tab.
// Content mirrors src/pages/PrayerGuidePage.tsx PRAYER_DUAS via prayer-guide-duas.json.
const renderPrayerGuideDuas = () => {
  const list = loadToolData("prayer-guide-duas.json");
  if (!Array.isArray(list) || list.length === 0) return "";
  const items = list.map((d) => `
    <li class="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <h3 class="text-lg font-bold text-foreground">${esc(d.name || "")}${d.nameBn ? ` <span class="font-normal text-muted-foreground">(${esc(d.nameBn)})</span>` : ""}</h3>
      ${d.arabic ? `<p class="mt-3 text-xl font-semibold text-foreground" lang="ar" dir="rtl">${esc(d.arabic)}</p>` : ""}
      ${d.transliteration ? `<p class="mt-2 text-sm text-muted-foreground">${esc(d.transliteration)}</p>` : ""}
      ${d.meaning ? `<p class="mt-1 text-sm leading-7 text-muted-foreground">${esc(d.meaning)}</p>` : ""}
      ${d.note ? `<p class="mt-1 text-sm leading-7 text-muted-foreground">${esc(d.note)}</p>` : ""}
    </li>`).join("");
  return `
    <section>
      <h2 class="px-1 text-xl font-bold text-foreground">Duas recited during prayer</h2>
      <ul class="mt-3 space-y-4">${items}</ul>
    </section>`;
};

// Prayer Guide Phase A (2026-10-05): FAQ JSON-LD parity with the SPA (SeoHead).
// Uses only the FAQ entries defined for /prayer-guide in src/components/seo/SeoHead.tsx.
const prayerGuideFaqJsonLd = () => {
  const faqs = [
    { q: "Can beginners learn Salah on Noor?", a: "Absolutely. The prayer guide is designed for beginners with clear Bengali and English instructions for every step of Salah." },
  ];
  return `<script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  })}</script>`;
};

const renderDhikrList = () => {
  const list = loadToolData("dhikr-list.json");
  if (!Array.isArray(list) || list.length === 0) return "";
  const items = list.map((d) => `
    <li class="rounded-2xl border border-border bg-card p-5 text-center shadow-sm">
      <p class="text-2xl font-bold text-foreground" lang="ar" dir="rtl">${esc(d.arabic || "")}</p>
      <p class="mt-2 text-sm font-semibold text-primary">${esc(d.transliteration || "")}</p>
      <p class="mt-1 text-sm text-muted-foreground">${esc(d.meaning || "")}${d.target ? ` · ${esc(String(d.target))}×` : ""}</p>
      ${d.virtue ? `<p class="mt-1 text-xs text-muted-foreground">Virtue: ${esc(d.virtue)}</p>` : ""}
    </li>`).join("");
  return `
    <section class="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <h2 class="text-xl font-bold text-foreground">Dhikr for your Tasbih</h2>
      <p class="mt-2 text-sm leading-7 text-muted-foreground">Authentic remembrances you can count with the Tasbih counter, with their recommended counts.</p>
      <ul class="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">${items}</ul>
    </section>`;
};

const renderHijriCalendar = () => {
  const months = loadToolData("hijri-months.json");
  const dates = loadToolData("islamic-important-dates.json");
  let html = "";
  if (Array.isArray(months) && months.length > 0) {
    html += `
    <section class="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <h2 class="text-xl font-bold text-foreground">The 12 Hijri months (হিজরি মাসসমূহ)</h2>
      <ol class="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">${months.map((m, i) =>
        `<li class="rounded-xl bg-muted px-3 py-2 text-sm"><span class="font-semibold text-foreground">${i + 1}.</span> ${esc(String(m))}</li>`
      ).join("")}</ol>
    </section>`;
  }
  if (Array.isArray(dates) && dates.length > 0) {
    html += `
    <section class="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <h2 class="text-xl font-bold text-foreground">Important Islamic dates</h2>
      <ul class="mt-3 space-y-3">${dates.map((d) => `
        <li class="border-b border-border pb-3 last:border-0 last:pb-0">
          <p class="text-sm font-semibold text-foreground">${esc(d.name || "")}${d.nameEn ? ` (${esc(d.nameEn)})` : ""}</p>
          <p class="mt-0.5 text-xs text-muted-foreground">${esc(d.month || "")}${d.day ? ` ${esc(String(d.day))}` : ""}${d.description ? ` — ${esc(d.description)}` : ""}</p>
        </li>`).join("")}</ul>
      <p class="mt-3 text-xs text-muted-foreground">Exact Gregorian dates vary by moon sighting in your region.</p>
    </section>`;
  }
  return html;
};

// Route → server-rendered tool content. Returns "" for routes without any.
const buildToolContent = async (routePath) => {
  switch (routePath) {
    case "/99-names": return renderNamesOfAllah();
    case "/prayer-guide": return renderPrayerGuideSteps() + renderPrayerGuideNiyah() + renderPrayerGuideLearning() + renderPrayerGuideDuas();
    case "/tasbih": return renderDhikrList();
    case "/calendar": return renderHijriCalendar();
    default: return "";
  }
};

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

// Phase 5 (2026-10-02): route-aware <html lang> for crawler-visible markup.
// Bengali-primary routes declare "bn"; Urdu hadith routes declare "ur";
// everything else keeps the shell default "en". Deliberately NOT blanket:
// /stories and /quiz stay "en" (mixed/EN-chrome templates; audit judgment call).
// Must stay in sync with the client default in AppSettingsContext.tsx.
const getHtmlLang = (routePath) => {
  if (routePath === "/dua" || routePath.startsWith("/hadith/sahih-bukhari/bangla")) return "bn";
  if (routePath.startsWith("/hadith/sahih-bukhari/urdu")) return "ur";
  return "en";
};

// Phase 5 (2026-10-02): crawler-visible hreflang for hadith language variants.
// Mirrors the client-side pattern in SeoHead.tsx (isHadithArticlePage):
// /hadith/sahih-bukhari/{bangla|english|urdu}(/chapter-N)? — the 3 hubs + 291 chapter URLs.
// Only emitted for HTTP 200 responses so alternates always exist.
const getHreflangTags = (routePath, siteOrigin) => {
  const m = routePath.match(/^\/hadith\/sahih-bukhari\/(bangla|english|urdu)(\/chapter-\d+)?$/);
  if (!m) return "";
  const suffix = m[2] || "";
  return [
    `<link rel="alternate" hreflang="bn" href="${siteOrigin}/hadith/sahih-bukhari/bangla${suffix}" />`,
    `<link rel="alternate" hreflang="en" href="${siteOrigin}/hadith/sahih-bukhari/english${suffix}" />`,
    `<link rel="alternate" hreflang="ur" href="${siteOrigin}/hadith/sahih-bukhari/urdu${suffix}" />`,
    `<link rel="alternate" hreflang="x-default" href="${siteOrigin}/hadith/sahih-bukhari/english${suffix}" />`,
  ].join("\n    ");
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
        path.join(process.cwd(), "public", meta.file),
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

// ── Sahih al-Bukhari chapter title-selection contract ─────────────────────
// Canonical rule lives in src/lib/hadithChapterTitle.ts (selectHadithChapterTitle).
// This implementation MUST stay behaviorally identical to it: the serverless
// function cannot import the TS module, so the rule is mirrored here verbatim.
// Behavioral parity is asserted by scripts/verify-hadith-title-consistency.mjs
// over all 97 chapters × bangla/english/urdu on every run.
// Contract: bangla → verified title_bn else verified English title;
//           english → verified English title; urdu → verified title_ar else
//           verified English title. Never Arabic for bangla/english, never
//           invented. DB (hadith_chapters) is the source of truth.
const HADITH_CHAPTER_OVERRIDES = {
  38: { bangla: "হাওয়ালা (ঋণ হস্তান্তর)", english: "Transfer of a Debt (Al-Hawaala)", urdu: "حوالہ (قرض کی منتقلی)" },
  82: { bangla: "তাকদির (আল-কদর)", english: "Divine Will (Al-Qadar)", urdu: "تقدیر (القدر)" },
};
const HADITH_GENERIC_BOOK_LABEL = { bangla: "কিতাব", english: "Book", urdu: "کتاب" };
const getHadithChapterName = (chapter, lang) => {
  if (!chapter) return HADITH_GENERIC_BOOK_LABEL[lang] || HADITH_GENERIC_BOOK_LABEL.english;
  const override = HADITH_CHAPTER_OVERRIDES[Number(chapter.chapter_number)];
  if (override && override[lang]) return override[lang];
  const title = (chapter.title || "").trim();
  if (lang === "bangla") return (chapter.title_bn || "").trim() || title;
  if (lang === "urdu") return (chapter.title_ar || "").trim() || title;
  return title;
};

const hadithCardMarkup = (row, lang, meta, chapterMap, isDetail = false) => {
  // In detail mode the card shows the full hadith, so the CTA must not link
  // to the current URL (self-link). Link back to the chapter listing instead.
  const href = isDetail
    ? `/hadith/sahih-bukhari/${lang}/chapter-${row.chapterId}`
    : `/hadith/sahih-bukhari/${lang}/${row.chapterId}/${row.number}`;
  const ctaLabel = isDetail
    ? (lang === "bangla" ? "অধ্যায়ের সকল হাদিস" : lang === "urdu" ? "باب کی تمام احادیث" : "All hadiths in this chapter")
    : meta.read;
  return `
  <article class="relative bg-gradient-to-br from-[hsl(158,55%,25%)] to-[hsl(158,64%,20%)] rounded-2xl p-5 border border-white/10 hover:border-[hsl(45,93%,58%)]/50 shadow-lg transition-all overflow-hidden" style="${HADITH_CARD_STYLE}">
    <div class="relative z-10 flex items-center justify-between mb-4">
      <span class="text-xs font-bold text-[hsl(45,93%,58%)] px-2 py-1 bg-[hsl(45,93%,58%)]/15 rounded-lg border border-[hsl(45,93%,58%)]/20">${lang === "bangla" ? "হাদিস নং" : lang === "urdu" ? "حدیث نمبر" : "Hadith No"} ${row.number}</span>
      <span class="text-[10px] text-[hsl(45,93%,58%)]/75 uppercase tracking-wider">${esc(getHadithChapterName(chapterMap.get(row.chapterId), lang))}</span>
    </div>
    <p dir="rtl" class="relative z-10 text-xl leading-[1.8] text-right mb-4 font-arabic line-clamp-3 text-white">${esc(row.arabic)}</p>
    <p dir="${meta.rtl ? "rtl" : "ltr"}" class="relative z-10 text-xl md:text-2xl leading-[1.8] line-clamp-4 text-white font-bangla-serif mb-4">${esc(row.translation)}</p>
    <a href="${href}" class="relative z-10 w-full py-2.5 bg-[hsl(45,93%,58%)]/15 hover:bg-[hsl(45,93%,58%)] text-[hsl(45,93%,58%)] hover:text-[hsl(158,64%,15%)] rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 border border-[hsl(45,93%,58%)]/20">📖 ${ctaLabel}</a>
  </article>
`;
};

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

const getOgType = (canonical) => {
  const pathname = new URL(canonical || SITE_ORIGIN).pathname.replace(/\/$/, "") || "/";
  const websiteRoutes = new Set(["/", "/quran", "/hadith", "/dua", "/stories", "/quiz", "/about", "/sources", "/settings", "/notifications", "/sitemap"]);
  return websiteRoutes.has(pathname) ? "website" : "article";
};

function structuredData({ description }) {
  const graph = [
    {
      "@type": "WebSite",
      "@id": `${SITE_ORIGIN}/#website`,
      "url": SITE_ORIGIN,
      "name": "Noor Islamic App",
      "description": description,
      "inLanguage": ["en", "bn"],
      "publisher": { "@id": `${SITE_ORIGIN}/#organization` }
    },
    {
      "@type": "Organization",
      "@id": `${SITE_ORIGIN}/#organization`,
      "url": SITE_ORIGIN,
      "name": "Noor Islamic App",
      "description": "Free Quran, Hadith, Dua, prayer times and Islamic learning tools."
    }
  ];
  return `<script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@graph": graph }).replace(/</g, "\\u003c")}</script>`;
}

function quizStructuredData(record, canonical) {
  const questionText = [record.question_bn, record.question_en].filter(Boolean).join(" / ");
  const answerBn = Array.isArray(record.options_bn) ? record.options_bn[record.correct_answer] : null;
  const answerEn = Array.isArray(record.options_en) ? record.options_en[record.correct_answer] : null;
  const answerText = [answerBn, answerEn].filter(Boolean).join(" / ");
  if (!questionText || !answerText) return "";
  const data = {
    "@context": "https://schema.org",
    "@type": "Quiz",
    "@id": `${canonical}#quiz`,
    "url": canonical,
    "name": questionText,
    "about": { "@type": "Thing", "name": record.category || "Islamic studies" },
    "educationalAlignment": [{
      "@type": "AlignmentObject",
      "alignmentType": "educationalSubject",
      "targetName": `Islamic studies — ${record.category || "General"}`,
    }],
    "hasPart": [{
      "@type": "Question",
      "eduQuestionType": "Flashcard",
      "text": questionText,
      "acceptedAnswer": { "@type": "Answer", "text": answerText },
    }],
  };
  return `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, "\\u003c")}</script>`;
}

function inject(html, { title, description, canonical, ogImage, body, extraStructuredData = "", robots = "index,follow", htmlLang = "en", hreflangTags = "" }) {
  // 1. Remove ALL existing meta/link/title tags that we want to override
  // We use a very broad match to ensure nothing is missed
  let cleanHtml = html
    .replace(/<title[^>]*>[\s\S]*?<\/title>/gi, "")
    .replace(/<meta\s+(name|property)=["'](description|og:type|og:title|og:description|og:url|og:image|og:image:secure_url|og:image:type|og:image:width|og:image:height|og:image:alt|twitter:title|twitter:description|twitter:image|twitter:card)["'][^>]*>/gi, "")
    .replace(/<link\s+rel=["']canonical["'][^>]*>/gi, "")
    .replace(/<link\s+rel=["']alternate["']\s+hreflang=[^>]*>/gi, "");

  // 1b. Phase 5 (2026-10-02): route-aware <html lang> — replace the shell's
  // hardcoded lang with the route-appropriate value.
  cleanHtml = cleanHtml.replace(/<html(\s+[^>]*)?>/i, `<html lang="${htmlLang}">`);

  // 2. Define new tags with explicit values
  const newTags = [
    structuredData({ description }),
    extraStructuredData,
    ...(hreflangTags ? [hreflangTags] : []),
    `<title>${esc(title)}</title>`,
    `<meta name="description" content="${esc(description)}" data-rh="true" />`,
    `<link rel="canonical" href="${esc(canonical)}" data-rh="true" />`,
    `<meta name="robots" content="${esc(robots)}" data-rh="true" />`,
    `<meta property="og:type" content="${getOgType(canonical)}" />`,
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
  let extraStructuredData = "";
  let robotsDirective = "index,follow";
  let statusCode = 200;
  let canonicalUrl = `${SITE_ORIGIN}${routePath === "/" ? "/" : routePath}`;

  try {
    // --- Canonical redirects for legacy / duplicate routes ---
    // These mirror the vercel.json edge redirects so that direct access to the
    // prerender function (which bypasses edge redirects) returns the same
    // consistent 301 instead of serving a duplicate indexable page.
    //   /support       -> /contact        (crawler-only artifact; /contact is the canonical support page)
    //   /data-sources  -> /sources        (vercel.json 301s this at the edge)
    //   /privacy       -> /privacy-policy (vercel.json 301s this at the edge)
    //   /hadith/bukhari -> /hadith/sahih-bukhari (vercel.json 301s this at the edge;
    //                      /hadith/sahih-bukhari is the real collection route)
    const CANONICAL_REDIRECTS = {
      "/names": "/baby-names",
      "/support": "/contact",
      "/data-sources": "/sources",
      "/privacy": "/privacy-policy",
      "/hadith/bukhari": "/hadith/sahih-bukhari",
    };
    if (CANONICAL_REDIRECTS[routePath]) {
      const target = `${SITE_ORIGIN}${CANONICAL_REDIRECTS[routePath]}`;
      res.setHeader("Location", target);
      res.setHeader("Cache-Control", "public, max-age=0, s-maxage=300, stale-while-revalidate=300");
      res.setHeader("X-Noor-Prerender", "v101");
      res.status(301).send("");
      return;
    }

    // --- Homepage ---
    // Keep the first byte visually consistent with the React fallback. This is
    // deliberately a compact, layout-matched skeleton rather than a branded
    // splash screen, so slow WebViews never show a misleading intermediate page.
    if (routePath === "/") {
      title = "Noor Islamic App — Quran, Hadith, Dua & Prayer Times";
      description = "Use Noor, a free Islamic app for Quran reading, Hadith, daily Duas, prayer times and learning tools. Explore the web app or install it on supported devices.";
      bodyContent = `
        <div class="min-h-screen bg-background pb-24 text-foreground">
          <header class="bg-gradient-to-br from-emerald-700 to-teal-800 px-5 py-12 text-white">
            <div class="mx-auto max-w-3xl">
              <p class="mb-3 text-xs font-bold uppercase tracking-[0.18em] text-emerald-100">NOOR ISLAMIC APP</p>
              <h1 class="text-3xl font-bold leading-tight md:text-4xl">Noor Islamic App for Quran, Hadith, Dua &amp; Prayer Times</h1>
              <p class="mt-4 max-w-2xl text-base leading-7 text-white/85">Use Noor, a free Islamic app for Quran reading, Hadith, daily Duas, prayer times and learning tools. Explore the web app or install it on supported devices.</p>
              <a href="/download" class="mt-5 inline-flex rounded-xl bg-white px-4 py-3 font-semibold text-emerald-800 hover:bg-emerald-50">Download / Install Noor</a>
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
                <a href="/quiz" class="rounded-xl border border-border px-4 py-3 font-semibold text-primary hover:bg-muted">Islamic Quiz</a>
                <a href="/99-names" class="rounded-xl border border-border px-4 py-3 font-semibold text-primary hover:bg-muted">99 Names of Allah</a>
                <a href="/tasbih" class="rounded-xl border border-border px-4 py-3 font-semibold text-primary hover:bg-muted">Digital Tasbih</a>
                <a href="/calendar" class="rounded-xl border border-border px-4 py-3 font-semibold text-primary hover:bg-muted">Islamic Calendar</a>
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
              <p class="mt-3 leading-7 text-muted-foreground">Learn about the project, its editorial approach and how to contact the developer. Please visit <a href="/about" class="font-semibold text-primary">About Noor</a>, <a href="/contact" class="font-semibold text-primary">Support &amp; Feedback</a>, the <a href="/privacy-policy" class="font-semibold text-primary">Privacy Policy</a> or <a href="/terms" class="font-semibold text-primary">Terms of Use</a>.</p>
            </section>
          </main>
        </div>
      `;
    }

    // --- Quran Root Page ---
    else if (routePath === "/quran") {
      title = "Quran Reader — পবিত্র কুরআন | Noor";
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
      // The Holy Quran has exactly 114 surahs. Any other surah ID is invalid
      // and must return 404 + noindex instead of the generic 200 app shell.
      const surahNum = /^\d+$/.test(num || "") ? Number(num) : NaN;
      const isValidSurah = Number.isInteger(surahNum) && surahNum >= 1 && surahNum <= 114;

      if (!isValidSurah) {
        statusCode = 404;
        robotsDirective = "noindex,follow";
        title = "Surah not found | Noor";
        description = "The requested Quran chapter could not be found.";
        bodyContent = `
          <main class="min-h-screen bg-background px-4 py-16 text-center">
            <h1 class="text-3xl font-bold">Surah not found</h1>
            <p class="mx-auto mt-3 max-w-xl text-muted-foreground">This Quran chapter does not exist or the link is incorrect.</p>
            <a class="mt-6 inline-block rounded-lg bg-primary px-5 py-3 font-semibold text-primary-foreground" href="/quran">Browse all surahs</a>
          </main>`;
      } else {
        // /quran/:surahId/:ayahId renders the full surah; canonicalize to the
        // surah URL to avoid duplicate content.
        const ayahToken = routePath.split("/")[3];
        if (ayahToken) {
          canonicalUrl = `${SITE_ORIGIN}/quran/${surahNum}`;
        }
        try {
          const response = await fetch(`https://api.alquran.cloud/v1/surah/${surahNum}/editions/quran-uthmani,bn.bengali`, { signal: AbortSignal.timeout(8000) });
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

            // P1 (2026-09-27): surah context from the repo's own verified metadata
            // (src/data/quran_surahs.json → dist/data/quran-surahs.json via the
            // build extractor). Adds prev/next navigation, Meccan/Medinan badge,
            // and translator attribution so bot-visible HTML matches the SPA's
            // transparency (SurahReader shows the same attribution to JS clients).
            const surahMetaList = loadToolData("quran-surahs.json");
            const surahMeta = Array.isArray(surahMetaList)
              ? surahMetaList.find((s) => Number(s.number) === surahNum)
              : null;
            const prevMeta = Array.isArray(surahMetaList)
              ? surahMetaList.find((s) => Number(s.number) === surahNum - 1)
              : null;
            const nextMeta = Array.isArray(surahMetaList)
              ? surahMetaList.find((s) => Number(s.number) === surahNum + 1)
              : null;
            const revelationBadge = surahMeta && surahMeta.revelationType
              ? `<span class="inline-block rounded-full border border-white/30 bg-white/10 px-2.5 py-0.5 text-[10px] font-medium">${surahMeta.revelationType === "Meccan" ? "মক্কী" : "মাদানী"}</span>`
              : "";
            // Evidence-first surah introductions (research 2026-09-28): only
            // surahs whose every published claim reached VERIFIED are present
            // in surah-intros.json. Rendered with source attribution; surahs
            // without a verified intro render nothing — no placeholder.
            const surahIntroList = loadToolData("surah-intros.json");
            const surahIntro = Array.isArray(surahIntroList)
              ? surahIntroList.find((s) => Number(s.number) === surahNum)
              : null;
            const typeBadge = (t) =>
              t === "primary"
                ? ` <span style="border:1px solid #ccc;border-radius:3px;padding:0 3px;font-size:9px;text-transform:uppercase;letter-spacing:0.04em;">Primary source</span>`
                : t === "secondary"
                ? ` <span style="border:1px solid #ccc;border-radius:3px;padding:0 3px;font-size:9px;text-transform:uppercase;letter-spacing:0.04em;">Secondary source</span>`
                : "";
            const surahIntroHtml = surahIntro && surahIntro.intro_en
              ? `<div class="border-b border-border bg-card"><p class="mx-auto max-w-3xl px-4 pt-4 text-sm">${esc(surahIntro.intro_en)}</p>
                 <p class="mx-auto max-w-3xl px-4 pt-2 text-[11px] text-muted-foreground">Sources: ${surahIntro.sources.map((s) => `<a href="${esc(s.url)}" class="underline">${esc(s.name)}</a>${typeBadge(s.type)}`).join(" · ")}</p>
                 <p class="mx-auto max-w-3xl px-4 pb-4 pt-1 text-[10px] italic text-muted-foreground">Source-verified research · Not reviewed by a scholar</p></div>`
              : "";
            const surahNav = `
              <nav aria-label="Surah navigation" class="mx-auto flex max-w-3xl items-stretch justify-between gap-3 border-t border-border bg-card px-4 py-5">
                ${prevMeta ? `<a href="/quran/${prevMeta.number}" class="flex-1 rounded-xl border border-border px-4 py-3 text-left hover:bg-muted"><span class="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">← Previous Surah</span><span class="mt-1 block font-semibold text-primary">${esc(prevMeta.englishName)}</span></a>` : `<span class="flex-1"></span>`}
                <a href="/quran" class="rounded-xl border border-border px-4 py-3 text-center font-semibold text-primary hover:bg-muted">All Surahs</a>
                ${nextMeta ? `<a href="/quran/${nextMeta.number}" class="flex-1 rounded-xl border border-border px-4 py-3 text-right hover:bg-muted"><span class="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Next Surah →</span><span class="mt-1 block font-semibold text-primary">${esc(nextMeta.englishName)}</span></a>` : `<span class="flex-1"></span>`}
              </nav>`;

            bodyContent = `
              <div class="min-h-screen bg-background">
                <header class="bg-gradient-to-br from-emerald-600 to-teal-700 p-6 text-white sticky top-0 z-30">
                  <div class="max-w-3xl mx-auto flex items-center justify-between">
                    <a href="/quran" class="p-2 bg-white/10 rounded-full">←</a>
                    <div class="text-center">
                      <h1 class="text-xl font-bold">${esc(ar.englishName)}</h1>
                      <p class="text-xs opacity-80">${esc(ar.englishNameTranslation)} • ${ar.numberOfAyahs} Ayahs</p>
                      <div class="mt-1.5 flex items-center justify-center gap-2">${revelationBadge}<span class="text-[10px] opacity-75">Bengali translation: Muhiuddin Khan · via AlQuran Cloud API</span></div>
                    </div>
                    <span class="text-2xl font-arabic">${esc(ar.name)}</span>
                  </div>
                </header>
                ${surahIntroHtml}
                <main class="max-w-3xl mx-auto bg-card shadow-sm border-x border-border min-h-screen">
                  ${ayahs}
                </main>
                ${surahNav}
              </div>
            `;
          }
        } catch (e) {}
      }
    }

    // --- Sahih Bukhari language and chapter pages ---
    // --- Hadith Detail by Slug (canonical detail URL) ---
    // React's HadithDetailPage uses /hadith/h/:slug as the canonical URL when a
    // slug exists. Without this branch, bots receive the thin generic fallback.
    else if (routePath.startsWith("/hadith/h/")) {
      const slug = decodeURIComponent(routePath.split("/")[3] || "");
      let hadith = null;
      try {
        const { data } = await supabase
          .from("hadiths")
          .select("id, slug, book_key, chapter_id, hadith_number, arabic, bengali, english, urdu, topic_bn, explanation_bn")
          .eq("slug", slug)
          .maybeSingle();
        hadith = data;
      } catch (e) {
        hadith = null;
      }

      if (!hadith) {
        statusCode = 404;
        robotsDirective = "noindex,follow";
        title = "Hadith not found | Noor";
        description = "The requested hadith could not be found.";
        bodyContent = `
          <main class="min-h-screen bg-[hsl(158,64%,12%)] text-white px-4 py-16 text-center">
            <h1 class="text-3xl font-bold">Hadith not found</h1>
            <p class="mx-auto mt-3 max-w-xl text-white/70">This hadith is not available or the link is incorrect.</p>
            <a class="mt-6 inline-block rounded-lg bg-[hsl(45,93%,58%)] px-5 py-3 font-semibold text-[hsl(158,64%,15%)]" href="/hadith">Browse hadith collections</a>
          </main>`;
      } else {
        // Internal linking (2026-10-05): crawlable prev/next anchors mirroring the
        // SPA HadithDetailPage semantics exactly (same book_key, hadith_number
        // ordering, slug IS NOT NULL). Bounded single-row queries; first/last
        // narration omits the missing side; neighbors without a valid slug are
        // omitted. Plain <a href> only.
        let prevNextNav = "";
        try {
          const [prevRes, nextRes] = await Promise.all([
            supabase.from("hadiths").select("slug, hadith_number").eq("book_key", hadith.book_key).lt("hadith_number", hadith.hadith_number).not("slug", "is", null).order("hadith_number", { ascending: false }).limit(1).maybeSingle(),
            supabase.from("hadiths").select("slug, hadith_number").eq("book_key", hadith.book_key).gt("hadith_number", hadith.hadith_number).not("slug", "is", null).order("hadith_number", { ascending: true }).limit(1).maybeSingle(),
          ]);
          const validSlug = (r) => (r && typeof r.slug === "string" && /^[a-z0-9-]+$/.test(r.slug.trim()) ? r.slug.trim() : null);
          const prevSlug = validSlug(prevRes.data);
          const nextSlug = validSlug(nextRes.data);
          if (prevSlug || nextSlug) {
            prevNextNav = `
              <nav aria-label="Hadith navigation" class="grid grid-cols-2 gap-3">
                ${prevSlug ? `<a href="/hadith/h/${prevSlug}" class="rounded-2xl bg-white/5 border border-white/10 p-4 hover:border-[hsl(45,93%,58%)]/40"><span class="block text-[10px] uppercase tracking-wide text-white/60">← আগের হাদিস</span><span class="block text-sm font-medium text-white mt-1">হাদিস ${Number(prevRes.data.hadith_number)}</span></a>` : `<span></span>`}
                ${nextSlug ? `<a href="/hadith/h/${nextSlug}" class="rounded-2xl bg-white/5 border border-white/10 p-4 text-right hover:border-[hsl(45,93%,58%)]/40"><span class="block text-[10px] uppercase tracking-wide text-white/60">পরবর্তী হাদিস →</span><span class="block text-sm font-medium text-white mt-1">হাদিস ${Number(nextRes.data.hadith_number)}</span></a>` : `<span></span>`}
              </nav>`;
          }
        } catch (e) { prevNextNav = ""; }
        const bookLabel = hadith.book_key === "bukhari" ? "Sahih Al-Bukhari" : String(hadith.book_key || "Hadith");
        const heading = `${bookLabel} — Hadith ${hadith.hadith_number}`;
        title = shortenMetaText(`${heading} | অর্থ ও ব্যাখ্যা | Noor`, 70);
        description = shortenMetaText(
          hadith.explanation_bn?.replace(/\s+/g, " ").trim() ||
          hadith.bengali?.replace(/\s+/g, " ").trim() ||
          `${heading} এর আরবি, বাংলা অনুবাদ ও ব্যাখ্যা পড়ুন।`,
          160,
        );
        canonicalUrl = `${SITE_ORIGIN}/hadith/h/${slug}`;
        const hadithCanonical = `${SITE_ORIGIN}/hadith/h/${slug}`;
        const hadithCrumbs = [
          { label: "Home", href: "/" },
          { label: "Hadith", href: "/hadith" },
          { label: bookLabel, href: "/hadith/sahih-bukhari" },
          { label: `Hadith ${hadith.hadith_number}`, href: `/hadith/h/${slug}` },
        ];
        extraStructuredData =
          breadcrumbJsonLd(hadithCrumbs) +
          articleJsonLd({
            headline: heading,
            description: String(description).slice(0, 500),
            image: `${SITE_ORIGIN}/og-bukhari.png`,
            url: hadithCanonical,
            inLanguage: ["ar", "bn"],
          });
        const translations = [
          hadith.bengali ? `<div class="rounded-2xl bg-white/5 border border-white/10 p-5"><h2 class="text-amber-400 font-bold mb-2 text-sm uppercase tracking-widest">বাংলা অনুবাদ</h2><p class="text-lg leading-relaxed text-white/90">${esc(hadith.bengali)}</p></div>` : "",
          hadith.english ? `<div class="rounded-2xl bg-white/5 border border-white/10 p-5"><h2 class="text-amber-400 font-bold mb-2 text-sm uppercase tracking-widest">English Translation</h2><p class="text-lg leading-relaxed text-white/90" dir="ltr">${esc(hadith.english)}</p></div>` : "",
          hadith.urdu ? `<div class="rounded-2xl bg-white/5 border border-white/10 p-5"><h2 class="text-amber-400 font-bold mb-2 text-sm uppercase tracking-widest">اردو ترجمہ</h2><p class="text-lg leading-relaxed text-white/90" dir="rtl">${esc(hadith.urdu)}</p></div>` : "",
        ].join("");
        bodyContent = `
          <div class="min-h-screen bg-[hsl(158,64%,12%)] text-white pb-20">
            <main class="max-w-3xl mx-auto p-4 space-y-5">
              ${breadcrumbMarkup(hadithCrumbs)}
              <p class="text-sm font-semibold uppercase tracking-widest text-amber-400">${esc(bookLabel)}</p>
              <h1 class="text-2xl font-bold">${esc(heading)}</h1>
              ${hadith.topic_bn ? `<p class="text-white/70">${esc(hadith.topic_bn)}</p>` : ""}
              <div class="rounded-2xl bg-white/5 border border-white/10 p-6">
                <h2 class="text-amber-400 font-bold mb-3 text-sm uppercase tracking-widest">আরবি</h2>
                <p dir="rtl" class="text-2xl leading-[2] font-arabic text-right">${esc(hadith.arabic)}</p>
              </div>
              ${translations}
              ${hadith.explanation_bn ? `<div class="rounded-2xl bg-amber-400/10 border border-amber-400/20 p-5"><h2 class="text-amber-400 font-bold mb-2">ব্যাখ্যা</h2><p class="leading-relaxed text-white/85 whitespace-pre-line">${esc(hadith.explanation_bn)}</p></div>` : ""}
              <p class="text-xs leading-relaxed text-white/50">বাংলা অনুবাদে বন্ধনীতে আধুনিক প্রকাশনী ও ইসলামিক ফাউন্ডেশন বাংলাদেশ সংস্করণের নম্বর দেওয়া আছে। English ও اردو অনুবাদের অনুবাদকের নাম উৎস-ডেটায় সংরক্ষিত নেই।</p>
              ${prevNextNav}
              <a href="/hadith/sahih-bukhari" class="inline-block rounded-xl bg-white/10 px-5 py-3 font-semibold hover:bg-white/15">← সকল হাদিস</a>
            </main>
          </div>
        `;
      }
    }

    else if (routePath === "/hadith/sahih-bukhari" || routePath.startsWith("/hadith/sahih-bukhari/")) {
      const parts = routePath.split("/").filter(Boolean);
      const rawLang = parts[2] || "";
      const lang = normalizeHadithLang(rawLang);

      if (!rawLang) {
        title = "Sahih Al-Bukhari — বাংলা, English ও اردو | Noor";
        description = "Read Sahih Al-Bukhari in Bengali, English and Urdu with Arabic text on Noor.";
        // P1 (2026-09-27): the hub was a bare language chooser (~260 chars).
        // Enrich with facts already established in this repo's trust copy
        // (STATIC_PAGE_COPY "Hadith collections", api/prerender.js line 366)
        // plus a live chapter count — no new claims.
        let bukhariChapterCount = 0;
        try {
          const { count } = await supabase
            .from("hadith_chapters")
            .select("chapter_number", { count: "exact", head: true })
            .eq("book_id", "bukhari");
          bukhariChapterCount = Number(count) || 0;
        } catch (e) { bukhariChapterCount = 0; }
        bodyContent = `
          <div class="min-h-screen bg-[hsl(158,64%,12%)] text-white pb-20" style="background-image: ${ISLAMIC_PATTERN_HTML}">
            <header class="bg-gradient-to-b from-[hsl(158,55%,22%)] to-[hsl(158,55%,22%)]/95 p-8 text-center border-b border-white/10 relative overflow-hidden" style="background-image: ${ISLAMIC_PATTERN_HTML}">
              <div class="relative z-10">
                <h1 class="text-3xl font-bold mb-2">সহিহ বুখারী শরীফ</h1>
                <p class="text-white/70">বিশ্বস্ত অনুবাদে হাদিস পড়ুন</p>
              </div>
            </header>
            <main class="p-4 max-w-3xl mx-auto space-y-4">
              <section class="rounded-2xl border border-white/10 bg-white/5 p-6">
                <h2 class="text-lg font-bold mb-3">এই সংকলন সম্পর্কে</h2>
                <div class="space-y-3 text-sm leading-relaxed text-white/75">
                  <p>সহিহ আল-বুখারী — ইমাম মুহাম্মদ ইবনে ইসমাঈল আল-বুখারী (রহ.) সংকলিত হাদিস গ্রন্থ, সুন্নি পণ্ডিতদের দৃষ্টিতে সবচেয়ে কঠোরভাবে প্রামাণিক হাদিস সংকলনগুলোর একটি। প্রতিটি হাদিস আরবি মূলপাঠসহ বাংলা, ইংরেজি ও উর্দু অনুবাদে পড়া যাবে।</p>
                  ${bukhariChapterCount ? `<p>এই সংস্করণে <strong class="text-white">${bukhariChapterCount}টি অধ্যায় (কিতাব)</strong> রয়েছে — নিচে আপনার ভাষা বেছে নিয়ে অধ্যায় তালিকা দেখুন।</p>` : ""}
                  <p class="text-xs text-white/50">বাংলা অনুবাদে বন্ধনীতে আধুনিক প্রকাশনী ও ইসলামিক ফাউন্ডেশন বাংলাদেশ সংস্করণের নম্বর দেওয়া আছে। English ও اردو অনুবাদের অনুবাদকের নাম উৎস-ডেটায় সংরক্ষিত নেই। সূত্র ও পদ্ধতি সম্পর্কে বিস্তারিত জানতে <a href="/sources" class="font-semibold text-[hsl(45,93%,58%)]">উৎস পাতা</a> দেখুন।</p>
                </div>
              </section>
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
        // Invalid hadith language slug: real 404 + noindex so it cannot be
        // indexed as a thin page.
        statusCode = 404;
        robotsDirective = "noindex,follow";
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
        // Nonexistent chapter: real 404 + noindex so invented chapter URLs
        // cannot become indexable thin pages. The guard uses `!== null`
        // (not truthiness) because chapter-0 is falsy but equally nonexistent.
        if (chapterId !== null && !chapterMap.has(chapterId)) {
          statusCode = 404;
          robotsDirective = "noindex,follow";
          title = "Hadith chapter not found | Noor";
          bodyContent = `
          <div class="min-h-screen bg-[hsl(158,64%,12%)] text-white p-8" style="background-image: ${ISLAMIC_PATTERN_HTML}">
            <main class="max-w-2xl mx-auto text-center py-20">
              <h1 class="text-2xl font-bold mb-3">অধ্যায় পাওয়া যায়নি</h1>
              <p class="text-white/70 mb-6">এই অধ্যায়টি সহিহ বুখারীতে নেই। সঠিক অধ্যায় নির্বাচন করুন।</p>
              <a href="/hadith/sahih-bukhari/${lang}" class="inline-flex px-5 py-3 rounded-xl bg-[hsl(45,93%,58%)] text-[hsl(158,64%,15%)] font-bold">অধ্যায় তালিকা দেখুন</a>
            </main>
          </div>`;
        } else {
        const rows = await loadHadithRowsSsr(lang, chapterId);
        const currentChapter = chapterId ? chapterMap.get(chapterId) : null;
        // Evidence-first hadith chapter introductions (research 2026-09-28):
        // only chapters whose every published claim reached VERIFIED (>=2
        // independent reputable sources) AND whose app title matches the
        // actual hadith content are present in hadith-chapter-intros.json.
        // Chapters without a verified intro render nothing — no placeholder.
        const chapterIntroList = loadToolData("hadith-chapter-intros.json");
        const chapterIntro = Array.isArray(chapterIntroList)
          ? chapterIntroList.find((i) => Number(i.chapter) === chapterId)
          : null;
        const introTypeBadge = (t) =>
          t === "primary"
            ? ` <span style="border:1px solid rgba(255,255,255,0.25);border-radius:3px;padding:0 3px;font-size:9px;text-transform:uppercase;letter-spacing:0.04em;">Primary source</span>`
            : t === "secondary"
            ? ` <span style="border:1px solid rgba(255,255,255,0.25);border-radius:3px;padding:0 3px;font-size:9px;text-transform:uppercase;letter-spacing:0.04em;">Secondary source</span>`
            : "";
        const chapterIntroHtml = chapterIntro && chapterIntro.intro_en
          ? `<div class="mx-auto mt-3 max-w-4xl rounded-xl border border-white/10 bg-white/5 px-4 py-3"><p class="text-sm text-white/85">${esc(chapterIntro.intro_en)}</p>
             <p class="mt-2 text-[11px] text-white/50">Sources: ${chapterIntro.sources.map((s) => `<a href="${esc(s.url)}" class="underline">${esc(s.name)}</a>${introTypeBadge(s.type)}`).join(" · ")}</p>
             <p class="mt-1 text-[10px] italic text-white/35">Source-verified research · Not reviewed by a scholar</p></div>`
          : "";
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
        // P0 duplicate-content fix (2026-09-27): numeric single-hadith URLs
        // (/hadith/sahih-bukhari/:lang/chapter-N/M) render the same hadith that
        // also lives on the chapter page and (for Bangla) at /hadith/h/:slug.
        // Self-canonicalizing them created a second indexable URL for identical
        // content. Consolidate into the chapter URL instead. Chapter pages
        // (no hadith number) keep self-canonical.
        canonicalUrl = hadithNumber
          ? `${SITE_ORIGIN}/hadith/sahih-bukhari/${lang}/chapter-${chapterId}`
          : `${SITE_ORIGIN}${routePath}`;

        const detail = hadithNumber ? rows.find((row) => row.number === hadithNumber) : null;
        // Breadcrumb trail: Home → Hadith → Sahih Bukhari → [Language] → [Chapter] → [Hadith]
        const hadithCrumbs = [
          { label: "Home", href: "/" },
          { label: "Hadith", href: "/hadith" },
          { label: "Sahih Bukhari", href: "/hadith/sahih-bukhari" },
          { label: meta.label, href: `/hadith/sahih-bukhari/${lang}` },
        ];
        if (chapterId) {
          hadithCrumbs.push({
            label: currentChapter ? getHadithChapterName(currentChapter, lang) : `${chapterOrdinal}`,
            href: `/hadith/sahih-bukhari/${lang}/chapter-${chapterId}`,
          });
        }
        if (detail) {
          hadithCrumbs.push({
            label: `${lang === "bangla" ? "হাদিস" : lang === "urdu" ? "حدیث" : "Hadith"} ${detail.number}`,
            href: `${routePath}`,
          });
        }
        extraStructuredData = breadcrumbJsonLd(hadithCrumbs);
        const chapterCards = chapterList.map((chapter) => `
          <a href="/hadith/sahih-bukhari/${lang}/chapter-${chapter.chapter_number}" class="relative flex items-center gap-4 p-4 bg-gradient-to-br from-[hsl(158,55%,25%)] to-[hsl(158,64%,20%)] rounded-2xl border border-white/10 hover:border-[hsl(45,93%,58%)]/50 shadow-lg transition-all overflow-hidden group" style="${HADITH_CARD_STYLE}">
            <span class="relative z-10 w-12 h-12 rounded-xl bg-[hsl(45,93%,58%)]/15 flex items-center justify-center text-[hsl(45,93%,58%)] font-bold border border-[hsl(45,93%,58%)]/25">${chapter.chapter_number}</span>
            <span class="relative z-10 flex-1 min-w-0"><strong class="block truncate text-white group-hover:text-[hsl(45,93%,58%)]">${esc(getHadithChapterName(chapter, lang))}</strong><small class="text-white/65">${chapter.hadith_count || ""} ${lang === "bangla" ? "টি হাদিস" : lang === "urdu" ? "احادیث" : "Hadiths"}</small></span>
            <span class="relative z-10 text-[hsl(45,93%,58%)]/70">→</span>
          </a>
        `).join("");
        const cardRows = detail ? [detail] : rows;
        // Internal linking (2026-10-05): compact crawlable index of EVERY narration
        // in this chapter. Chapter listing pages only (chapterId && !detail);
        // numeric single-hadith URLs keep their frozen P0 behavior (no index).
        // Minimal columns, one bounded query, no pagination URLs.
        let chapterNarrationIndex = "";
        if (chapterId && !detail) {
          try {
            const { data: idxRows } = await supabase
              .from("hadiths")
              .select("slug, hadith_number")
              .eq("book_key", "bukhari")
              .eq("chapter_id", chapterId)
              .not("slug", "is", null)
              .order("hadith_number", { ascending: true });
            const idxLinks = (idxRows || [])
              .filter((r) => typeof r.slug === "string" && /^[a-z0-9-]+$/.test(r.slug.trim()))
              .map((r) => `<a href="/hadith/h/${r.slug.trim()}" class="inline-block rounded-lg bg-white/5 border border-white/10 px-3 py-1.5 text-sm text-white/85 hover:border-[hsl(45,93%,58%)]/50 hover:text-[hsl(45,93%,58%)]">${lang === "bangla" ? "হাদিস" : lang === "urdu" ? "حدیث" : "Hadith"} ${Number(r.hadith_number)}</a>`)
              .join("");
            if (idxLinks) {
              chapterNarrationIndex = `
              <section>
                <h2 class="text-lg font-bold mb-3">${lang === "bangla" ? "এই অধ্যায়ের সকল হাদিস" : lang === "urdu" ? "اس باب کی تمام احادیث" : "All hadiths in this chapter"}</h2>
                <nav aria-label="${lang === "bangla" ? "অধ্যায়ের হাদিস সূচি" : lang === "urdu" ? "باب کی احادیث کی فہرست" : "Chapter hadith index"}" class="flex flex-wrap gap-2">${idxLinks}</nav>
              </section>`;
            }
          } catch (e) { chapterNarrationIndex = ""; }
        }
        const listMarkup = cardRows.length ? cardRows.map((row) => hadithCardMarkup(row, lang, meta, chapterMap, !!detail)).join("") : `<div class="rounded-3xl border border-dashed border-white/10 bg-white/5 p-8 text-center text-white/75"><p class="font-semibold">${lang === "bangla" ? "এই অধ্যায়ের হাদিস এখন পাওয়া যাচ্ছে না" : lang === "urdu" ? "اس باب کی احادیث اس وقت دستیاب نہیں" : "The hadith text is temporarily unavailable"}</p><p class="mt-2 text-sm text-white/55">${lang === "bangla" ? "অনুগ্রহ করে আবার চেষ্টা করুন অথবা অন্য একটি কিতাব নির্বাচন করুন।" : lang === "urdu" ? "براہ کرم دوبارہ کوشش کریں یا دوسرا باب منتخب کریں۔" : "Please try again or choose another book."}</p></div>`;

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
            ${chapterIntroHtml}
            <main class="max-w-4xl mx-auto p-4 space-y-6">
              ${breadcrumbMarkup(hadithCrumbs)}
              <nav class="flex gap-2 overflow-x-auto pb-1 scrollbar-hide" aria-label="Hadith languages">
                ${Object.entries(HADITH_LANG_META).map(([slug, item]) => `<a href="/hadith/sahih-bukhari/${slug}${chapterId ? `/chapter-${chapterId}` : ""}" class="shrink-0 px-4 py-2 rounded-full text-sm font-medium ${slug === lang ? "bg-gradient-to-r from-[hsl(45,93%,58%)] to-[hsl(45,93%,48%)] text-[hsl(158,64%,15%)]" : "bg-white/10 text-white/70"}">${item.label}</a>`).join("")}
              </nav>
              ${!chapterId && !detail && chapterCards ? `<section><h2 class="text-lg font-bold mb-3">${lang === "bangla" ? "কিতাবসমূহ" : lang === "urdu" ? "کتب" : "Books (Kitab)"}</h2><div class="grid grid-cols-1 md:grid-cols-2 gap-3">${chapterCards}</div></section>` : ""}
              <section class="space-y-4">
                ${detail ? `<h2 class="text-lg font-bold">${lang === "bangla" ? "হাদিসের বিস্তারিত" : lang === "urdu" ? "حدیث کی تفصیل" : "Hadith details"}</h2>` : `<h2 class="text-lg font-bold">${currentChapter ? esc(getHadithChapterName(currentChapter, lang)) : (lang === "bangla" ? "সকল হাদিস" : lang === "urdu" ? "تمام احادیث" : "All Hadiths")}</h2>`}
                ${listMarkup}
              </section>
              ${chapterNarrationIndex}
              ${chapterId && !detail ? `
              <nav aria-label="Chapter navigation" class="flex items-stretch justify-between gap-3 pb-2">
                ${chapterMap.has(chapterId - 1) ? `<a href="/hadith/sahih-bukhari/${lang}/chapter-${chapterId - 1}" class="flex-1 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-left hover:border-[hsl(45,93%,58%)]/50"><span class="block text-[10px] font-bold uppercase tracking-wider text-white/50">← ${lang === "bangla" ? "পূর্ববর্তী অধ্যায়" : lang === "urdu" ? "پچھلا باب" : "Previous"}</span><span class="mt-1 block truncate font-semibold text-white/90">${esc(getHadithChapterName(chapterMap.get(chapterId - 1), lang))}</span></a>` : `<span class="flex-1"></span>`}
                ${chapterMap.has(chapterId + 1) ? `<a href="/hadith/sahih-bukhari/${lang}/chapter-${chapterId + 1}" class="flex-1 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-right hover:border-[hsl(45,93%,58%)]/50"><span class="block text-[10px] font-bold uppercase tracking-wider text-white/50">${lang === "bangla" ? "পরবর্তী অধ্যায়" : lang === "urdu" ? "اگلا باب" : "Next"} →</span><span class="mt-1 block truncate font-semibold text-white/90">${esc(getHadithChapterName(chapterMap.get(chapterId + 1), lang))}</span></a>` : `<span class="flex-1"></span>`}
              </nav>` : ""}
            </main>
          </div>
        `;
      }
    }
    } // close sahih-bukhari route block

    // --- Hadith Root Page ---
    else if (routePath === "/hadith") {
      title = "Hadith Collections — হাদিস সংকলন | Noor";
      description = "Read Sahih Al-Bukhari with Arabic text and Bengali, English and Urdu translations on Noor. More Hadith collections are planned for a future release.";
      // Book metadata mirrors the client HadithPage (hadith_books table with
      // the same fallback values). Total hadith counts are deliberately NOT
      // exposed: the app carries an editorial caution that counts vary by
      // edition and must not be shown until verified.
      const { data: bookRows } = await supabase
        .from("hadith_books")
        .select("id, title, title_bn, total_chapters")
        .eq("is_active", true)
        .order("display_order");
      const fallbackBooks = [
        { id: "bukhari", title: "Sahih Bukhari", title_bn: "সহীহ বুখারী", total_chapters: 97 },
        { id: "muslim", title: "Sahih Muslim", title_bn: "সহীহ মুসলিম", total_chapters: 56 },
        { id: "tirmidhi", title: "Jami at-Tirmidhi", title_bn: "জামে তিরমিযী", total_chapters: 49 },
        { id: "abu-dawud", title: "Sunan Abu Dawud", title_bn: "সুনানে আবু দাউদ", total_chapters: 43 },
      ];
      const hadithBooks = (bookRows && bookRows.length ? bookRows : fallbackBooks);
      const bookCards = hadithBooks.map((b) => {
        const available = b.id === "bukhari";
        const chapters = b.total_chapters ? `${esc(String(b.total_chapters))} chapters` : "Hadith collection";
        const inner = `
          <div>
            <h2 class="text-xl font-bold group-hover:text-primary transition-colors">${esc(b.title || "")}</h2>
            <p class="text-sm text-muted-foreground">${esc(b.title_bn || "")} · ${chapters}</p>
            ${available ? "" : '<p class="mt-1 text-xs font-semibold text-amber-600">Planned — not yet available</p>'}
          </div>
          ${available ? '<span class="text-2xl">→</span>' : ""}`;
        const cls = "bg-card p-6 rounded-2xl border border-border hover:shadow-lg transition-all flex items-center justify-between group";
        return available
          ? `<a href="/hadith/sahih-bukhari" class="${cls}">${inner}</a>`
          : `<div class="${cls} opacity-90">${inner}</div>`;
      }).join("");
      bodyContent = `
        <div class="min-h-screen bg-background">
          <header class="bg-gradient-to-br from-amber-500 to-orange-600 p-8 text-white text-center">
            <h1 class="text-3xl font-bold mb-2">হাদিস সংকলন</h1>
            <p class="text-white/80">সহীহ হাদিসের নির্ভরযোগ্য ভাণ্ডার</p>
          </header>
          <div class="p-4 max-w-2xl mx-auto -mt-6">
            <p class="text-muted-foreground text-center mb-6">Read authentic Hadith with Arabic text and trusted translations. Start with Sahih Al-Bukhari in your language.</p>
            <div class="grid grid-cols-1 gap-4">
              ${bookCards}
            </div>
            <h2 class="mt-8 mb-4 text-lg font-bold text-center">Read Sahih Al-Bukhari in your language</h2>
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

    // --- Hadith Book Placeholder (noindex) ---
    // React's HadithBookPlaceholder marks these pages noindex (collections not
    // yet published). Mirror that here so bots don't index thin placeholders.
    else if (/^\/hadith\/[^/]+$/.test(routePath)) {
      const bookId = decodeURIComponent(routePath.split("/")[2] || "");
      statusCode = 200;
      robotsDirective = "noindex,follow";
      title = "Hadith collection not yet available | Noor";
      description = "This Hadith collection is not yet available on Noor.";
      bodyContent = `
        <main class="min-h-screen bg-[hsl(158,64%,12%)] text-white px-4 py-16 text-center">
          <p class="text-sm font-semibold uppercase tracking-widest text-amber-400 mb-3">Noor Hadith</p>
          <h1 class="text-3xl font-bold">Collection not yet available</h1>
          <p class="mx-auto mt-3 max-w-xl text-white/70">The ${esc(bookId)} collection is planned for a future release and is not yet available on Noor.</p>
          <a class="mt-6 inline-block rounded-lg bg-[hsl(45,93%,58%)] px-5 py-3 font-semibold text-[hsl(158,64%,15%)]" href="/hadith/sahih-bukhari">Read Sahih Al-Bukhari</a>
        </main>`;
    }

    // --- Dua Root Page ---
    else if (routePath === "/dua") {
      title = "Daily Duas & Supplications — দোয়া সমূহ | Noor";
      description = "দৈনন্দিন জীবনের প্রয়োজনীয় দোয়া ও জিকিরসমূহ আরবি, বাংলা উচ্চারণ ও অর্থসহ পড়ুন।";
      extraStructuredData = collectionJsonLd({
        name: title,
        description,
        url: `${SITE_ORIGIN}/dua`,
      });
      
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

    // --- Dua Category Page ---
    // Must come before the /dua/ detail branch: otherwise "category" is
    // looked up as a dua slug and valid category pages return 404.
    else if (routePath.startsWith("/dua/category/")) {
      const catSlug = decodeURIComponent(routePath.split("/")[3] || "").toLowerCase();
      const { data: duas } = await supabase
        .from("admin_content")
        .select("slug, title, content_arabic, category")
        .in("content_type", ["dua", "Dua"])
        .eq("status", "published");

      const slugifyCat = (c) => String(c || "").toLowerCase().trim().replace(/[^a-z0-9\u0980-\u09FF]+/g, "-").replace(/(^-+|-+$)/g, "");
      const matched = (duas || []).filter((d) => slugifyCat(d.category) === catSlug);
      const categoryName = matched.length ? matched[0].category : null;

      if (!categoryName) {
        statusCode = 404;
        robotsDirective = "noindex,follow";
        title = "Dua category not found | Noor";
        description = "The requested dua category could not be found.";
        bodyContent = `
          <main class="min-h-screen bg-[hsl(158,64%,18%)] px-4 py-16 text-center text-white">
            <h1 class="text-3xl font-bold">Category not found</h1>
            <p class="mx-auto mt-3 max-w-xl text-white/70">This dua category is not available.</p>
            <a class="mt-6 inline-block rounded-lg bg-amber-400 px-5 py-3 font-semibold text-[hsl(158,64%,15%)]" href="/dua">Browse all duas</a>
          </main>`;
      } else {
        const catLabel = getCategoryLabel(categoryName);
        title = `${catLabel} দোয়া সমূহ | Noor`;
        description = `${catLabel} বিষয়ক দোয়াসমূহ আরবি, বাংলা উচ্চারণ ও অর্থসহ পড়ুন।`;
        canonicalUrl = `${SITE_ORIGIN}/dua/category/${catSlug}`;
        // No slice cap: every published dua in the category must be linked
        // (a cap previously orphaned 3 Guidance duas from crawlers).
        const duaCards = matched.map((d) => `
          <a href="/dua/${esc(d.slug)}" class="block rounded-2xl bg-white/5 border border-white/10 p-5 hover:border-amber-400/40 transition-all">
            <h2 class="text-lg font-bold text-white">${esc(d.title || "দোয়া")}</h2>
            ${d.content_arabic ? `<p dir="rtl" class="mt-2 text-white/80 font-arabic line-clamp-2">${esc(String(d.content_arabic).slice(0, 120))}</p>` : ""}
            <span class="mt-3 inline-block text-sm font-semibold text-amber-400">পড়ুন →</span>
          </a>
        `).join("");
        const crumbs = [
          { label: "Home", href: "/" },
          { label: "Dua", href: "/dua" },
          { label: catLabel, href: `/dua/category/${catSlug}` },
        ];
        extraStructuredData = breadcrumbJsonLd(crumbs);
        bodyContent = `
          <div class="min-h-screen bg-[hsl(158,64%,18%)] pb-20">
            <header class="bg-gradient-to-br from-[hsl(158,55%,22%)] to-[hsl(158,64%,15%)] p-8 text-white text-center border-b border-white/10">
              <div class="max-w-3xl mx-auto">
                ${breadcrumbMarkup(crumbs)}
                <h1 class="text-3xl font-bold">${esc(catLabel)} দোয়া</h1>
                <p class="mt-2 text-white/70">${matched.length}টি দোয়া</p>
              </div>
            </header>
            <main class="max-w-3xl mx-auto p-4 grid gap-4">
              ${duaCards}
            </main>
          </div>
        `;
      }
    }

    // --- Dua Detail Page ---
    else if (routePath.startsWith("/dua/")) {
      const slug = decodeURIComponent(routePath.split("/")[2] || "");
      const { data: dua } = await supabase
        .from("admin_content")
        .select("*")
        .eq("slug", slug)
        .in("content_type", ["dua", "Dua"])
        .eq("status", "published")
        .maybeSingle();

      if (dua) {
        // Disambiguate same-titled duas (several authentic duas can share a
        // common name, e.g. for waking up) with the row's own reference.
        // Redundant title prefixes inside the reference are stripped.
        const duaBaseTitle = dua.title || "দোয়া";
        let duaRefBit = (dua.reference || "").trim();
        if (duaRefBit.startsWith(duaBaseTitle)) duaRefBit = duaRefBit.slice(duaBaseTitle.length).trim();
        const duaDistinctTitle = duaRefBit ? `${duaBaseTitle} (${duaRefBit})` : duaBaseTitle;
        title = `${duaDistinctTitle} — বাংলা অর্থ ও আরবি টেক্সট | Noor`;
        description = dua.explanation_bn || dua.content || `${dua.title || "এই দোয়া"} এর আরবি, বাংলা উচ্চারণ ও অর্থ পড়ুন।`;
        req.storyOgImage = getDuaOgImage(dua);

        // Related duas (same category) for internal linking depth.
        const { data: relatedDuas } = await supabase
          .from("admin_content")
          .select("slug, title")
          .in("content_type", ["dua", "Dua"])
          .eq("status", "published")
          .eq("category", dua.category)
          .neq("slug", dua.slug)
          .limit(6);
        const relatedDuaCards = (relatedDuas || []).map((r) => `
          <a href="/dua/${esc(r.slug)}" class="block rounded-2xl bg-white/5 border border-white/10 p-4 hover:border-amber-400/40 transition-all">
            <span class="text-white font-semibold">${esc(r.title || "দোয়া")}</span>
            <span class="block mt-1 text-sm text-amber-400">পড়ুন →</span>
          </a>`).join("");

        const duaCanonical = `${SITE_ORIGIN}/dua/${dua.slug}`;
        const duaCrumbs = [
          { label: "Home", href: "/" },
          { label: "Dua", href: "/dua" },
          { label: dua.title || "দোয়া", href: `/dua/${dua.slug}` },
        ];
        extraStructuredData =
          breadcrumbJsonLd(duaCrumbs) +
          articleJsonLd({
            headline: dua.title || "দোয়া",
            description: String(description).slice(0, 500),
            image: req.storyOgImage,
            url: duaCanonical,
            inLanguage: "bn",
          });

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
            <div class="max-w-3xl mx-auto px-4 pt-4">
              ${breadcrumbMarkup(duaCrumbs)}
            </div>
            
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
                <p class="whitespace-pre-line text-xl md:text-2xl leading-[1.8] tracking-wide font-bangla" style="color: #FFFFFF !important; font-weight: 500; text-shadow: 0 1px 2px rgba(0,0,0,0.2);">${esc(formatBanglaPronunciation(dua.content_pronunciation))}</p>
              </div>

              <!-- Meaning Card -->
              <div class="bg-gradient-to-br from-amber-400/10 to-transparent border border-amber-400/20 rounded-2xl p-6 relative overflow-hidden shadow-sm" style="background-image: ${ISLAMIC_PATTERN}, linear-gradient(to bottom right, rgba(251, 191, 36, 0.1), transparent)">
                <div class="absolute inset-0 border border-white/5 rounded-2xl pointer-events-none"></div>
                <h2 class="text-[10px] font-bold text-amber-400 uppercase tracking-[0.2em] mb-3 opacity-80">অর্থ</h2>
                <p class="text-xl md:text-2xl leading-[1.8] tracking-wide font-bangla-serif" style="color: #FFFFFF !important; font-weight: 500; text-shadow: 0 1px 2px rgba(0,0,0,0.2);">${esc(normalizeDuaDisplayText(dua.content))}</p>
              </div>
              
              <!-- Virtues: intentionally not rendered.
                   P0 AdSense trust fix (2026-09-27): the dua virtue/virtue_reference
                   columns carry templated, unsupported claims (forensic audit:
                   NOOR_DUA_VIRTUE_FORENSIC_AUDIT.md — 158/218 rows share 8 generic
                   sentences, 0 backed by a specific virtue narration). Publishing
                   them under a "ফজিলত" heading would assert religious merit without
                   evidence. The section stays hidden until virtue texts are
                   source-backed. Canonical cleanup = privileged SQL in the audit
                   report; the database rows are untouched by this change. -->
              
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
              
              <!-- Related duas (same category) -->
              ${relatedDuaCards ? `
              <nav aria-label="Related duas" class="bg-white/5 border border-white/10 rounded-3xl p-6">
                <h3 class="text-amber-400 font-bold mb-4">আরও দোয়া পড়ুন</h3>
                <div class="grid gap-3">
                  ${relatedDuaCards}
                </div>
              </nav>` : ''}

              <!-- Footer Reference -->
              <div class="text-center py-8 opacity-30 text-xs text-white">
                <p>উৎস: ${esc(dua.reference || "হাদিস সংকলন")}</p>
                <p class="mt-1">© Noor Islamic App</p>
              </div>
            </main>
          </div>
        `;
      } else {
        // Unknown dua slug: return a real 404 + noindex instead of the
        // generic 200 app shell so invalid slugs cannot become indexable.
        statusCode = 404;
        robotsDirective = "noindex,follow";
        title = "Dua not found | Noor";
        description = "The requested dua could not be found.";
        bodyContent = `
          <main class="min-h-screen bg-background px-4 py-16 text-center">
            <h1 class="text-3xl font-bold">Dua not found</h1>
            <p class="mx-auto mt-3 max-w-xl text-muted-foreground">This dua is not available or the link is incorrect.</p>
            <a class="mt-6 inline-block rounded-lg bg-primary px-5 py-3 font-semibold text-primary-foreground" href="/dua">Browse all duas</a>
          </main>`;
      }
    }

    // --- Stories Root Page ---
    else if (routePath === "/stories") {
      title = "Islamic Stories | Noor";
      description = "Read Islamic stories of the Prophets, Sahaba and inspiring lessons of faith, character and mercy on Noor.";
      extraStructuredData = collectionJsonLd({
        name: title,
        description,
        url: `${SITE_ORIGIN}/stories`,
      });
      
      const { data: stories } = await supabase
        .from("admin_content")
        .select("slug, title, content")
        .eq("content_type", "story")
        .eq("status", "published");

      // Union bundled + DB so bundled-only sitemap URLs (e.g.
      // prophet-lut-story-islam, umar-ibn-khattab-story-islam) are
      // discoverable from the hub. Mirrors the category page logic.
      const seenHub = new Set((stories || []).map((s) => s.slug));
      const hubItems = [...(stories || [])];
      for (const b of BUNDLED_STORIES) {
        if (b.slug && !seenHub.has(b.slug)) {
          seenHub.add(b.slug);
          hubItems.push({ slug: b.slug, title: b.title_bn || b.title_en || b.title || "Islamic Story", content: b.content_bn || "" });
        }
      }

      const storyList = hubItems.map(s => `
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

    // --- Story Category Page ---
    // Must come before the /stories/ detail branch: otherwise "category" is
    // looked up as a story slug and valid category pages return 404.
    else if (routePath.startsWith("/stories/category/")) {
      const catSlug = decodeURIComponent(routePath.split("/")[3] || "");
      const STORY_CATEGORY_LABELS = {
        prophets: "Stories of the Prophets",
        sahaba: "Companions of the Prophet",
        islamic_historical_events: "Islamic Historical Events",
        "islamic-history": "Islamic History",
        inspirational: "Inspirational Stories",
        kids_friendly: "Stories for Kids",
      };
      const catLabel = STORY_CATEGORY_LABELS[catSlug] || catSlug.replace(/[_-]/g, " ");

      // Include both bundled stories and published DB stories in this category.
      const bundledItems = BUNDLED_STORIES.filter((s) => s.category === catSlug)
        .map((s) => ({ slug: s.slug, title: s.title_en, title_bn: s.title_bn, category: s.category }));
      const { data: dbStories } = await supabase
        .from("admin_content")
        .select("slug, title, title_bn, category")
        .eq("content_type", "story")
        .eq("status", "published")
        .eq("category", catSlug);
      const seen = new Set();
      const items = [...bundledItems, ...(dbStories || [])].filter((s) => {
        if (!s.slug || seen.has(s.slug)) return false;
        seen.add(s.slug);
        return true;
      });

      if (!items.length) {
        statusCode = 404;
        robotsDirective = "noindex,follow";
        title = "Story category not found | Noor";
        description = "The requested story category could not be found.";
        bodyContent = `
          <main class="min-h-screen bg-background px-4 py-16 text-center">
            <h1 class="text-3xl font-bold">Category not found</h1>
            <p class="mx-auto mt-3 max-w-xl text-muted-foreground">This story category is not available.</p>
            <a class="mt-6 inline-block rounded-lg bg-primary px-5 py-3 font-semibold text-primary-foreground" href="/stories">Browse all stories</a>
          </main>`;
      } else {
        title = uniqueStoryTitle(`${catLabel} — Islamic Stories | Noor`);
        description = `Read authentic ${catLabel.toLowerCase()} on Noor.`;
        canonicalUrl = `${SITE_ORIGIN}/stories/category/${catSlug}`;
        const storyCards = items.map((s) => {
          const t = s.title_bn || s.title || "Islamic Story";
          return `
          <a href="/stories/${esc(s.slug)}" class="block bg-card border border-border rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-all">
            <div class="p-5">
              <h2 class="text-xl font-bold mb-2">${esc(t)}</h2>
              <span class="text-primary font-bold">পড়ুন →</span>
            </div>
          </a>`;
        }).join("");
        const crumbs = [
          { label: "Home", href: "/" },
          { label: "Stories", href: "/stories" },
          { label: catLabel, href: `/stories/category/${catSlug}` },
        ];
        extraStructuredData = breadcrumbJsonLd(crumbs);
        bodyContent = `
          <div class="min-h-screen bg-background pb-24">
            <section class="bg-emerald-800 text-white p-10">
              <div class="max-w-4xl mx-auto">
                ${breadcrumbMarkup(crumbs)}
                <h1 class="text-3xl font-bold">${esc(catLabel)}</h1>
                <p class="mt-2">${items.length}টি গল্প</p>
              </div>
            </section>
            <div class="p-4 max-w-4xl mx-auto grid gap-4">
              ${storyCards}
            </div>
          </div>
        `;
      }
    }

    // --- Story Detail Page ---
    else if (routePath.startsWith("/stories/")) {
      const slug = routePath.split("/")[2];
      // Targeted 410 for known test/draft story slugs (defense in depth).
      // Unknown slugs already 404 below; this ensures test URLs can never
      // become indexable even if a matching record is published by mistake.
      const isTestStorySlug = slug === "test-story-manus" || slug.startsWith("test-");
      let story = null;
      if (!isTestStorySlug) {
        story = findBundledStory(slug);

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
      }

      if (isTestStorySlug) {
        statusCode = 410;
        robotsDirective = "noindex,follow";
        title = "Page removed | Noor";
        description = "This page has been permanently removed.";
        bodyContent = `
          <main class="min-h-screen bg-background px-4 py-16 text-center">
            <h1 class="text-3xl font-bold">Page removed</h1>
            <p class="mx-auto mt-3 max-w-xl text-muted-foreground">This page has been permanently removed.</p>
            <a class="mt-6 inline-block rounded-lg bg-primary px-5 py-3 font-semibold text-primary-foreground" href="/stories">Browse published stories</a>
          </main>`;
      } else if (story) {
        const storyTitle = story.title_bn || story.title || story.title_en || "Islamic Story";
        const storyContent = story.content_bn || story.content || story.content_en || "Read this beautiful Islamic story on NoorApp.";
        const storedStoryDescription = story.seo?.meta_description || story.seo?.open_graph?.["og:description"] || "";
        const storyDescription = story.slug === "prophet-yusuf-story-islam"
          ? "Discover how Prophet Yusuf (Joseph) responds to betrayal, temptation and hardship with patience, purity and forgiveness in this Quran-based Islamic story."
          : isClippedStoryDescription(storedStoryDescription)
            ? (story.moral_en || story.moral_bn || storyContent.slice(0, 160))
            : (storedStoryDescription || story.moral_bn || story.moral_en || storyContent.slice(0, 160));
        const ogImage = story.og_image_url || story.seo?.open_graph?.["og:image"] || `https://llicfiepatzgllmjhzbw.supabase.co/storage/v1/object/public/og-images/stories/${slug}.webp`;
        const sourceLabel = story.reference || story.source_detail || story.source_name || "Islamic source reference";
        const moral = story.moral_bn || story.moral_en || "আল্লাহর উপর ভরসা, সত্য ও উত্তম চরিত্রের শিক্ষা গ্রহণ করুন।";

        // Pilot: high-value enrichment layers. Rendered only for stories whose
        // record carries the editorial value fields; all other stories render
        // exactly as before. Applications/takeaways are editorial content
        // derived from the story's own moral/narrative; source links are
        // derived from the record's existing reference field. Nothing is
        // fabricated: no new facts, citations, or claims are introduced.
        const enrichmentApps = Array.isArray(story.applications_bn) ? story.applications_bn.filter(Boolean) : [];
        const enrichment = enrichmentApps.length ? {
          applications: enrichmentApps,
          takeaways: Array.isArray(story.takeaways_bn) ? story.takeaways_bn.filter(Boolean) : [],
          sourceLinks: Array.isArray(story.related_source_links)
            ? story.related_source_links.filter((l) => l && l.label && l.href)
            : [],
        } : null;
        const takeawaysHtml = enrichment && enrichment.takeaways.length ? `
              <section class="rounded-2xl border border-border bg-card p-5">
                <h2 class="text-lg font-bold">মূল শিক্ষা</h2>
                <p class="mt-1 text-sm text-muted-foreground">গল্পের শিক্ষা থেকে নেওয়া সংক্ষিপ্ত সারসংক্ষেপ (সম্পাদকীয়)</p>
                <ol class="mt-3 space-y-2 list-decimal list-inside">
                  ${enrichment.takeaways.map((t) => `<li class="leading-7 text-foreground/85">${esc(t)}</li>`).join("")}
                </ol>
              </section>` : "";
        const applicationsHtml = enrichment ? `
              <section class="rounded-2xl border border-primary/20 bg-primary/5 p-5">
                <h2 class="text-lg font-bold text-primary">বাস্তব জীবনে প্রয়োগ</h2>
                <p class="mt-1 text-sm text-muted-foreground">এই গল্প থেকে নেওয়া ব্যবহারিক পরামর্শ (সম্পাদকীয় — কুরআন/হাদিসের সরাসরি বক্তব্য নয়)</p>
                <ul class="mt-3 space-y-2 list-disc list-inside">
                  ${enrichment.applications.map((a) => `<li class="leading-7 text-foreground/85">${esc(a)}</li>`).join("")}
                </ul>
              </section>` : "";
        const sourceLinksHtml = enrichment && enrichment.sourceLinks.length ? `
              <section class="rounded-2xl border border-border bg-card p-5">
                <h2 class="text-lg font-bold">সম্পর্কিত প্রামাণ্য উৎস</h2>
                <ul class="mt-3 space-y-2">
                  ${enrichment.sourceLinks.map((l) => `<li><a href="${esc(l.href)}" class="font-semibold text-primary hover:underline">${esc(l.label)}</a><span class="text-sm text-muted-foreground"> — নূর-এ পড়ুন</span></li>`).join("")}
                </ul>
              </section>` : "";
        const editorialNoteHtml = enrichment ? `
                <p class="mt-2 border-t border-border pt-2"><strong class="text-foreground">উৎস বনাম সম্পাদকীয়:</strong> উপরের "উৎস" অংশে উল্লেখিত প্রামাণ্য উৎস থেকে প্রাপ্ত তথ্য; "গল্পের শিক্ষা" ও "মূল শিক্ষা" শিক্ষামূলক ব্যাখ্যা; "বাস্তব জীবনে প্রয়োগ" সম্পাদকীয় পরামর্শ — শেষোক্ত দুটি কুরআন/হাদিসের সরাসরি বক্তব্য নয়।</p>` : "";

        // Related-story navigation (parity with the SPA's relatedStories /
        // nextStory): resolved from the record's own navigation data against
        // bundled stories, falling back to same-category stories. Every link
        // targets an existing story URL — no new content is introduced.
        const navRefs = (story.navigation && Array.isArray(story.navigation.related_stories))
          ? story.navigation.related_stories : [];
        const relatedLinks = [];
        for (const r of navRefs) {
          if (relatedLinks.length >= 3) break;
          const target = r && r.slug ? findBundledStory(r.slug) : null;
          if (target && target.slug !== story.slug) {
            relatedLinks.push({ slug: target.slug, title: target.title_bn || target.title_en || target.slug });
          }
        }
        if (relatedLinks.length < 3) {
          for (const s of BUNDLED_STORIES) {
            if (relatedLinks.length >= 3) break;
            if (s.slug === story.slug) continue;
            if (s.category === story.category && !relatedLinks.find((l) => l.slug === s.slug)) {
              relatedLinks.push({ slug: s.slug, title: s.title_bn || s.title_en || s.slug });
            }
          }
        }
        const nextRef = story.navigation ? story.navigation.next_story : null;
        const nextStoryTarget = (nextRef && nextRef.slug && nextRef.slug !== story.slug)
          ? findBundledStory(nextRef.slug) : null;
        const relatedHtml = (relatedLinks.length > 0 || nextStoryTarget) ? `
              <nav class="rounded-2xl border border-border bg-card p-5" aria-label="Related stories">
                <h2 class="text-lg font-bold">আরও গল্প পড়ুন</h2>
                <ul class="mt-3 space-y-2">
                  ${relatedLinks.map((l) => `<li><a href="/stories/${esc(l.slug)}" class="font-semibold text-primary hover:underline">${esc(l.title)}</a></li>`).join("")}
                </ul>
                ${nextStoryTarget ? `<a href="/stories/${esc(nextStoryTarget.slug)}" class="mt-4 inline-block rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">পরের গল্প: ${esc(nextStoryTarget.title_bn || nextStoryTarget.title_en || nextStoryTarget.slug)}</a>` : ""}
              </nav>` : "";

        title = uniqueStoryTitle(story.seo?.title || storyTitle);
        description = enrichStoryDescription(storyDescription, storyTitle);
        req.storyOgImage = ogImage;

        // Trailer URLs render the story body; canonicalize to the story URL
        // to avoid duplicate content.
        const isTrailer = routePath.endsWith("/trailer");
        if (isTrailer) {
          canonicalUrl = `${SITE_ORIGIN}/stories/${slug}`;
        }
        const storyCanonical = `${SITE_ORIGIN}/stories/${slug}`;
        const storyCrumbs = [
          { label: "Home", href: "/" },
          { label: "Stories", href: "/stories" },
          { label: storyTitle, href: `/stories/${slug}` },
        ];
        extraStructuredData =
          breadcrumbJsonLd(storyCrumbs) +
          articleJsonLd({
            headline: storyTitle,
            description: storyDescription,
            image: ogImage,
            url: storyCanonical,
            inLanguage: ["bn", "en"],
          });

        bodyContent = `
          <div class="min-h-screen bg-background pb-24">
            <article class="mx-auto max-w-3xl space-y-6 p-4 md:p-6">
              ${breadcrumbMarkup(storyCrumbs)}
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
              ${takeawaysHtml}
              ${applicationsHtml}
              <div class="prose prose-emerald max-w-none dark:prose-invert">
                ${esc(storyContent).replace(/\n/g, '<br/>')}
              </div>
              ${sourceLinksHtml}
              ${relatedHtml}
              <footer class="rounded-2xl border border-border bg-card p-5 text-sm text-muted-foreground">
                <strong class="text-foreground">উৎস ও রেফারেন্স:</strong> ${esc(sourceLabel)}
                ${editorialNoteHtml}
              </footer>
            </article>
          </div>
        `;
      } else {
        statusCode = 404;
        robotsDirective = "noindex,follow";
        title = uniqueStoryTitle(`Story not found | Noor`);
        description = "The requested Islamic story could not be found.";
        bodyContent = `
          <main class="min-h-screen bg-background px-4 py-16 text-center">
            <h1 class="text-3xl font-bold">Story not found</h1>
            <p class="mx-auto mt-3 max-w-xl text-muted-foreground">This story is no longer published or the link is incorrect.</p>
            <a class="mt-6 inline-block rounded-lg bg-primary px-5 py-3 font-semibold text-primary-foreground" href="/stories">Browse published stories</a>
          </main>`;
      }
    }

    // --- Crawlable HTML sitemap ---
    else if (routePath === "/sitemap") {
      title = "Sitemap — Noor Islamic App";
      description = "Browse Noor's public Quran, Hadith, Dua, prayer, learning, support and policy pages.";
      // Match the SPA SitemapPage (noindex,follow): the XML sitemap is the
      // crawler authority; this HTML page is a navigation aid.
      robotsDirective = "noindex,follow";
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
    // --- Verified Quiz Detail Page ---
    else if (routePath.startsWith("/quiz/") && routePath.split("/")[2]) {
      const quizId = decodeURIComponent(routePath.split("/")[2]);
      const { data: record } = await supabase
        .from("quiz_questions")
        .select("id, category, question_bn, question_en, options_bn, options_en, correct_answer, explanation_bn, explanation_en, source_reference, related_url, verification_status")
        .eq("id", quizId)
        .eq("is_active", true)
        .maybeSingle();
      const eligible = ["verified", "verified_primary", "verified_secondary"].includes(record?.verification_status);
      if (!record || !eligible) {
        statusCode = 404;
        robotsDirective = "noindex,follow";
        title = "Quiz question unavailable | Noor";
        description = "This Noor quiz question is not published or is awaiting editorial review.";
        bodyContent = `<main class="min-h-screen bg-background p-8"><div class="mx-auto max-w-2xl rounded-2xl border border-border bg-card p-8"><h1 class="text-2xl font-bold">Quiz question unavailable</h1><p class="mt-3 text-muted-foreground">This question is not published or is awaiting editorial review.</p><a class="mt-6 inline-block text-primary hover:underline" href="/quiz">Browse the daily quiz</a></div></main>`;
      } else {
        const answerBn = Array.isArray(record.options_bn) ? record.options_bn[record.correct_answer] : null;
        const answerEn = Array.isArray(record.options_en) ? record.options_en[record.correct_answer] : null;
        const questionBn = record.question_bn || record.question_en || "Islamic quiz question";
        const questionEn = record.question_en && record.question_bn ? `<p lang="en" class="mt-2 text-muted-foreground">${esc(record.question_en)}</p>` : "";
        const options = Array.isArray(record.options_bn) && record.options_bn.length ? record.options_bn : (record.options_en || []);
        const optionHtml = options.map((option, index) => `<li class="rounded-xl border border-border p-4 ${index === record.correct_answer ? "border-primary bg-primary/10" : ""}"><strong>${String.fromCharCode(65 + index)}.</strong> ${esc(option)}${record.options_en?.[index] && record.options_en[index] !== option ? `<span lang="en" class="mt-1 block text-sm text-muted-foreground">${esc(record.options_en[index])}</span>` : ""}</li>`).join("");
        // Duplicate question URLs consolidate here: the link canonical (and og:url)
        // point at the primary record; JSON-LD below reuses the same URL.
        canonicalUrl = `${SITE_ORIGIN}/quiz/${encodeURIComponent(getQuizCanonicalId(record.id))}`;
        const canonical = canonicalUrl;
        title = shortenMetaText(`${questionBn} | Noor Quiz`, 70);
        description = shortenMetaText(record.explanation_bn || record.explanation_en || "Verified Islamic quiz question from Noor.", 160);
        // Related questions (same category) for internal linking depth.
        let relatedQuizHtml = "";
        try {
          const { data: relatedQs } = await supabase
            .from("quiz_questions")
            .select("id, question_bn, question_en")
            .eq("is_active", true)
            .in("verification_status", ["verified", "verified_primary", "verified_secondary"])
            .eq("category", record.category || "General")
            .neq("id", record.id)
            .limit(6);
          const rel = (relatedQs || []).filter((q) => q && q.id && (q.question_bn || q.question_en));
          if (rel.length > 0) {
            relatedQuizHtml = `<nav aria-label="Related quiz questions" class="mt-6 rounded-2xl border border-border bg-card p-5"><h2 class="font-bold">আরও কুইজ প্রশ্ন</h2><ul class="mt-3 space-y-2">${rel.map((q) => `<li><a href="/quiz/${esc(String(q.id))}" class="text-sm text-primary hover:underline">${esc(q.question_bn || q.question_en)}</a></li>`).join("")}</ul></nav>`;
          }
        } catch (e) { console.error("[SSR] quiz detail related failed", e); }
        bodyContent = `<main class="min-h-screen bg-background px-4 py-8"><article class="mx-auto max-w-3xl"><nav aria-label="Breadcrumb" class="mb-2 flex flex-wrap items-center gap-1 text-xs text-muted-foreground"><a href="/" class="hover:underline">Home</a><span aria-hidden="true">›</span><a href="/quiz" class="hover:underline">Quiz</a><span aria-hidden="true">›</span><span>${esc(record.category || "Islamic studies")}</span></nav><div class="rounded-2xl border border-border bg-card p-6 shadow-sm"><a class="text-sm text-primary hover:underline" href="/quiz">← Back to Daily Quiz</a><p class="mt-6 text-sm font-semibold text-primary">${esc(record.category || "Islamic studies")}</p><h1 class="mt-2 text-2xl font-bold leading-relaxed">${esc(questionBn)}</h1>${questionEn}<ol class="mt-6 grid gap-3">${optionHtml}</ol><section aria-labelledby="answer-heading" class="mt-6 rounded-xl bg-primary/10 p-4"><h2 id="answer-heading" class="font-semibold">সঠিক উত্তর / Correct answer</h2><p class="mt-2">${esc(answerBn || answerEn || "")}</p>${answerBn && answerEn ? `<p lang="en" class="text-sm text-muted-foreground">${esc(answerEn)}</p>` : ""}</section>${record.explanation_bn || record.explanation_en ? `<section class="mt-6"><h2 class="font-semibold">ব্যাখ্যা / Explanation</h2><p class="mt-2 leading-7">${esc(record.explanation_bn || record.explanation_en)}</p>${record.explanation_bn && record.explanation_en ? `<p lang="en" class="mt-2 text-muted-foreground">${esc(record.explanation_en)}</p>` : ""}</section>` : ""}${record.source_reference ? `<section class="mt-6"><h2 class="font-semibold">Source</h2><p class="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">${esc(record.source_reference)}</p></section>` : ""}<p class="mt-6 border-t border-border pt-4 text-sm"><a class="text-primary hover:underline" href="/sources">Editorial sources and methodology</a></p></div>${relatedQuizHtml}</article></main>`;
        extraStructuredData = quizStructuredData(record, canonical);
      }
    }
    // --- Quiz Hub Page: category-grouped index of verified questions ---
    // The 281 indexed /quiz/<id> pages were previously unreachable from the
    // hub. This renders the same eligibility filter as the quiz detail branch
    // (is_active + verified statuses) so only published questions are linked.
    else if (routePath === "/quiz") {
      const page = STATIC_PAGE_COPY["/quiz"];
      title = page.title;
      description = page.description;
      extraStructuredData = collectionJsonLd({
        name: title,
        description,
        url: `${SITE_ORIGIN}/quiz`,
      });
      let indexHtml = "";
      try {
        const { data: questions } = await supabase
          .from("quiz_questions")
          .select("id, category, question_bn, question_en")
          .eq("is_active", true)
          .in("verification_status", ["verified", "verified_primary", "verified_secondary"])
          .order("category", { ascending: true })
          .limit(500);
        const eligible = (questions || []).filter((q) => q && q.id && (q.question_bn || q.question_en));
        if (eligible.length > 0) {
          const byCat = new Map();
          for (const q of eligible) {
            const cat = String(q.category || "General").trim() || "General";
            if (!byCat.has(cat)) byCat.set(cat, []);
            byCat.get(cat).push(q);
          }
          const catSections = [...byCat.entries()].map(([cat, qs]) => `
            <section class="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <h2 class="text-lg font-bold text-foreground">${esc(cat)} <span class="text-sm font-normal text-muted-foreground">(${qs.length})</span></h2>
              <ul class="mt-3 space-y-2">
                ${qs.map((q) => `<li><a href="/quiz/${esc(String(q.id))}" class="text-sm text-primary hover:underline">${esc(q.question_bn || q.question_en)}</a></li>`).join("")}
              </ul>
            </section>`).join("");
          indexHtml = `
            <section>
              <h2 class="px-1 text-xl font-bold text-foreground">Browse quiz questions by category</h2>
              <p class="mt-1 px-1 text-sm text-muted-foreground">${eligible.length} verified questions across ${byCat.size} categories.</p>
              <div class="mt-3 space-y-5">${catSections}</div>
            </section>`;
        }
      } catch (e) { console.error("[SSR] quiz hub index failed", e); }
      bodyContent = renderStaticPage(page, indexHtml);
    }

    // --- Baby Name Detail Pages (/baby-names/:slug) ---
    // Verification-gated rollout (2026-10-05): only allowlisted slugs render.
    // Every field below comes from the admin_content name row — no invented
    // content. Non-allowlisted or unknown slugs fail closed (404 + noindex).
    else if (routePath.startsWith("/baby-names/") && routePath.split("/")[2]) {
      const nameSlug = decodeURIComponent(routePath.split("/")[2]);
      let nameRecord = null;
      if (isValidBabyNameSlugSegment(nameSlug) && getBabyNameAllowlist().includes(nameSlug)) {
        const nameRows = await fetchPublishedBabyNames();
        const nameSlugMap = assignBabyNameSlugs(nameRows.map((r) => ({ id: String(r.id), title: r.title })));
        nameRecord = nameRows.find((r) => nameSlugMap.get(String(r.id)) === nameSlug) || null;
      }
      if (!nameRecord) {
        statusCode = 404;
        robotsDirective = "noindex,follow";
        title = "Name not found | Noor";
        description = "This baby name page does not exist.";
        bodyContent = `<main class="min-h-screen bg-background p-8"><div class="mx-auto max-w-2xl rounded-2xl border border-border bg-card p-8"><h1 class="text-2xl font-bold">Name not found</h1><p class="mt-3 text-muted-foreground">This baby name page does not exist.</p><a class="mt-6 inline-block text-primary hover:underline" href="/baby-names">Browse baby names</a></div></main>`;
      } else {
        const nameGender = String(nameRecord.category || "").trim().toLowerCase() === "girl" ? "Girl" : "Boy";
        canonicalUrl = `${SITE_ORIGIN}/baby-names/${encodeURIComponent(nameSlug)}`;
        title = `${nameRecord.title} (${nameRecord.title_arabic}) — Meaning in Bengali & English | Noor`;
        description = shortenMetaText(`The name ${nameRecord.title} (${nameRecord.title_arabic}) means "${nameRecord.content_en}" in English and "${nameRecord.content}" in Bengali. ${nameGender} Islamic baby name.`, 160);
        robotsDirective = "index,follow";
        const arabicMeaning = nameRecord.content_arabic && String(nameRecord.content_arabic).trim()
          ? `<section class="rounded-xl border border-border p-4"><h2 class="text-xs font-bold uppercase tracking-widest text-muted-foreground">المعنى — العربية</h2><p lang="ar" dir="rtl" class="mt-2 text-lg leading-relaxed">${esc(nameRecord.content_arabic)}</p></section>`
          : "";
        bodyContent = `<main class="min-h-screen bg-background px-4 py-8"><article class="mx-auto max-w-3xl"><nav aria-label="Breadcrumb" class="mb-2 flex flex-wrap items-center gap-1 text-xs text-muted-foreground"><a href="/" class="hover:underline">Home</a><span aria-hidden="true">›</span><a href="/baby-names" class="hover:underline">Baby Names</a><span aria-hidden="true">›</span><span>${esc(nameRecord.title)}</span></nav><div class="rounded-2xl border border-border bg-card p-6 shadow-sm"><p class="text-sm font-semibold text-primary">${nameGender} name</p><h1 class="mt-2 text-3xl font-bold">${esc(nameRecord.title)} <span lang="ar" dir="rtl">(${esc(nameRecord.title_arabic)})</span></h1><div class="mt-6 grid gap-4"><section class="rounded-xl border border-border p-4"><h2 class="text-xs font-bold uppercase tracking-widest text-muted-foreground">Meaning — English</h2><p lang="en" class="mt-2 text-lg leading-relaxed">${esc(nameRecord.content_en)}</p></section><section class="rounded-xl border border-border p-4"><h2 class="text-xs font-bold uppercase tracking-widest text-muted-foreground">অর্থ — বাংলা</h2><p lang="bn" class="mt-2 text-lg leading-relaxed">${esc(nameRecord.content)}</p></section>${arabicMeaning}<section class="rounded-xl border border-border p-4"><h2 class="text-xs font-bold uppercase tracking-widest text-muted-foreground">Details</h2><p class="mt-2 text-sm">Gender: ${nameGender} · Category: ${esc(nameRecord.category || "")}</p></section></div><p class="mt-6 border-t border-border pt-4 text-xs text-muted-foreground">Name meanings are provided for educational purposes. Families should verify spelling with trusted references before making a final choice.</p></div></article></main>`;
        extraStructuredData = `<script type="application/ld+json">${JSON.stringify({
          "@context": "https://schema.org",
          "@type": "DefinedTerm",
          name: nameRecord.title,
          description: nameRecord.content_en,
          inDefinedTermSet: { "@type": "DefinedTermSet", name: "Islamic Baby Names", url: `${SITE_ORIGIN}/baby-names` },
        })}</script>`;
      }
    }

    // --- 99 Names of Allah Detail Pages (/99-names/:slug) ---
    // Verification-gated rollout: only allowlisted slugs render.
    // Every field below comes from the names-of-allah.json record — no invented
    // content. Non-allowlisted or unknown slugs fail closed (404 + noindex).
    else if (routePath.startsWith("/99-names/") && routePath.split("/")[2]) {
      const allahSlug = decodeURIComponent(routePath.split("/")[2]);
      let allahRecord = null;
      let allahPrev = null;
      let allahNext = null;
      if (isValidAllahNameSlugSegment(allahSlug) && getAllahNameAllowlist().includes(allahSlug)) {
        const allahRows = getAllahNames();
        const allahSlugMap = assignAllahNameSlugs(allahRows.map((r) => ({ id: r.id, transliteration: r.transliteration })));
        allahRecord = allahRows.find((r) => allahSlugMap.get(r.id) === allahSlug) || null;
        if (allahRecord) {
          const ordered = [...allahRows].sort((a, b) => a.id - b.id);
          const idx = ordered.findIndex((r) => r.id === allahRecord.id);
          if (idx > 0) allahPrev = { ...ordered[idx - 1], _slug: allahSlugMap.get(ordered[idx - 1].id) };
          if (idx < ordered.length - 1) allahNext = { ...ordered[idx + 1], _slug: allahSlugMap.get(ordered[idx + 1].id) };
        }
      }
      if (!allahRecord) {
        statusCode = 404;
        robotsDirective = "noindex,follow";
        title = "Name not found | Noor";
        description = "This page does not exist.";
        bodyContent = `<main class="min-h-screen bg-background p-8"><div class="mx-auto max-w-2xl rounded-2xl border border-border bg-card p-8"><h1 class="text-2xl font-bold">Name not found</h1><p class="mt-3 text-muted-foreground">This page does not exist.</p><a class="mt-6 inline-block text-primary hover:underline" href="/99-names">Browse the 99 names</a></div></main>`;
      } else {
        const prevLink = allahPrev && allahPrev._slug
          ? `<a href="/99-names/${allahPrev._slug}" class="text-sm text-primary hover:underline">← ${esc(allahPrev.transliteration)}</a>`
          : `<span></span>`;
        const nextLink = allahNext && allahNext._slug
          ? `<a href="/99-names/${allahNext._slug}" class="text-sm text-primary hover:underline">${esc(allahNext.transliteration)} →</a>`
          : `<span></span>`;
        canonicalUrl = `${SITE_ORIGIN}/99-names/${encodeURIComponent(allahSlug)}`;
        title = `${allahRecord.transliteration} (${allahRecord.arabic}) — Meaning in English & Bengali | Noor`;
        description = shortenMetaText(`Allah's name ${allahRecord.transliteration} (${allahRecord.arabic}) means "${allahRecord.meaning}" in English and "${allahRecord.bengaliMeaning}" in Bengali.`, 160);
        robotsDirective = "index,follow";
        bodyContent = `<main class="min-h-screen bg-background px-4 py-8"><article class="mx-auto max-w-3xl"><nav aria-label="Breadcrumb" class="mb-2 flex flex-wrap items-center gap-1 text-xs text-muted-foreground"><a href="/" class="hover:underline">Home</a><span aria-hidden="true">›</span><a href="/99-names" class="hover:underline">99 Names of Allah</a><span aria-hidden="true">›</span><span>${esc(allahRecord.transliteration)}</span></nav><div class="rounded-2xl border border-border bg-card p-6 shadow-sm"><p class="text-sm font-semibold text-primary">Name ${allahRecord.id} of 99</p><h1 class="mt-2 text-3xl font-bold">${esc(allahRecord.transliteration)} <span lang="ar" dir="rtl">(${esc(allahRecord.arabic)})</span></h1><div class="mt-6 grid gap-4"><section class="rounded-xl border border-border p-4"><h2 class="text-xs font-bold uppercase tracking-widest text-muted-foreground">Meaning — English</h2><p lang="en" class="mt-2 text-lg leading-relaxed">${esc(allahRecord.meaning)}</p></section><section class="rounded-xl border border-border p-4"><h2 class="text-xs font-bold uppercase tracking-widest text-muted-foreground">অর্থ — বাংলা</h2><p lang="bn" class="mt-2 text-lg leading-relaxed">${esc(allahRecord.bengaliMeaning)}</p></section><section class="rounded-xl border border-border p-4"><h2 class="text-xs font-bold uppercase tracking-widest text-muted-foreground">Details</h2><p class="mt-2 text-sm">Transliteration: ${esc(allahRecord.transliteration)} · Position: ${allahRecord.id} of 99</p></section></div><nav aria-label="More names" class="mt-6 flex items-center justify-between gap-3 rounded-2xl border border-border bg-muted/40 p-4">${prevLink}${nextLink}</nav><p class="mt-6 border-t border-border pt-4 text-xs text-muted-foreground">Meanings are provided for educational purposes.</p></div></article></main>`;
        extraStructuredData = `<script type="application/ld+json">${JSON.stringify({
          "@context": "https://schema.org",
          "@type": "DefinedTerm",
          name: allahRecord.transliteration,
          description: allahRecord.meaning,
          inDefinedTermSet: { "@type": "DefinedTermSet", name: "99 Names of Allah", url: `${SITE_ORIGIN}/99-names` },
        })}</script>`;
      }
    }

    // --- Public Trust, Legal and Feature Pages ---
    else if (STATIC_PAGE_COPY[routePath]) {
      const page = STATIC_PAGE_COPY[routePath];
      title = page.title;
      description = page.description;
      bodyContent = renderStaticPage(page, await buildToolContent(routePath));
      // Phase A (2026-10-05): FAQ JSON-LD parity with the SPA for /prayer-guide.
      if (routePath === "/prayer-guide") extraStructuredData += prayerGuideFaqJsonLd();
    }

    // --- Contact Page ---
    else if (routePath === "/contact") {
      title = "Contact Us | Noor";
      description = "Contact Noor support for help with Quran, Hadith, Dua, prayer times, account questions and feedback about the Islamic app.";
      // Contact channels come from the same app_settings legal config the
      // React ContactPage reads via GlobalConfig. Email is configured;
      // Facebook/WhatsApp render only when actually configured (no placeholders).
      const { data: legalRows } = await supabase
        .from("app_settings")
        .select("setting_value")
        .eq("setting_key", "legal")
        .limit(1);
      const legalCfg = (legalRows && legalRows[0] && legalRows[0].setting_value) || {};
      const contactEmail = legalCfg.contactEmail || "support@noorapp.in";
      const facebookUrl = legalCfg.facebookUrl || "";
      const whatsappUrl = legalCfg.whatsappUrl || "";
      const channelCard = (label, sub, href, external) => `
        <a href="${href}"${external ? ' target="_blank" rel="noreferrer"' : ""} class="flex items-center gap-3 rounded-xl border border-border bg-card p-3.5 hover:border-primary/35 transition-all">
          <div class="min-w-0">
            <p class="text-sm font-semibold">${label}</p>
            <p class="truncate text-xs text-muted-foreground">${sub}</p>
          </div>
        </a>`;
      bodyContent = `
        <div class="min-h-screen bg-background p-4">
          <header class="mb-8">
            <h1 class="text-2xl font-bold">Contact Us</h1>
            <p class="text-muted-foreground">যোগাযোগ করুন</p>
          </header>
          <div class="max-w-2xl mx-auto space-y-6">
            <section class="bg-card p-6 rounded-2xl border border-border">
              <h2 class="text-lg font-bold mb-2">We&apos;re here to help!</h2>
              <p class="text-muted-foreground">Report a bug, request a feature, or share your feedback. Our team will get back to you as soon as possible.</p>
            </section>
            <section class="bg-card p-6 rounded-2xl border border-border">
              <h2 class="text-lg font-bold mb-4">Other Contact Methods</h2>
              <div class="space-y-3">
                ${channelCard("Email", esc(contactEmail), `mailto:${esc(contactEmail)}`, false)}
                ${facebookUrl ? channelCard("Facebook", "Visit our Facebook page", esc(facebookUrl), true) : ""}
                ${whatsappUrl ? channelCard("WhatsApp", "Message us on WhatsApp", esc(whatsappUrl), true) : ""}
              </div>
              <p class="mt-4 text-sm text-muted-foreground">We typically respond within 24-48 hours.</p>
            </section>
            <section class="bg-card p-6 rounded-2xl border border-border">
              <h2 class="text-lg font-bold mb-2">Report Content Issues</h2>
              <p class="text-sm leading-6 text-muted-foreground">If you notice any inaccuracy in Quran text, hadith references, prayer time calculations, or any other Islamic content, please report it immediately via email. We take content accuracy seriously and will address the issue promptly.</p>
            </section>
            <nav class="flex flex-wrap gap-2 text-sm" aria-label="Related pages">
              <a href="/about" class="rounded-full border border-border px-4 py-2 hover:border-primary/40">About Noor</a>
              <a href="/privacy-policy" class="rounded-full border border-border px-4 py-2 hover:border-primary/40">Privacy Policy</a>
              <a href="/sources" class="rounded-full border border-border px-4 py-2 hover:border-primary/40">Our Islamic Sources</a>
            </nav>
          </div>
        </div>
      `;
    }

    // --- Fallback for other routes ---
    // Legitimate client-side routes without a dedicated prerender branch keep
    // the app-shell fallback so React can hydrate them. These are the only
    // React-router routes with no prerender coverage (see src/App.tsx):
    // /names (redirects to /baby-names), /settings, /notifications.
    // Anything else reaching this fallback is genuinely unknown and must
    // return 404 + noindex instead of an indexable 200 app shell.
    const CLIENT_ONLY_METADATA = {
      "/settings": {
        title: "Settings — Noor Islamic App",
        description: "Adjust local Noor app preferences for language, appearance, prayer reminders and other features.",
        robots: "noindex,nofollow",
      },
      "/notifications": {
        title: "Notifications — Noor Islamic App",
        description: "View public announcements and important updates from Noor.",
        robots: "noindex,nofollow",
      },
    };
    const CLIENT_ONLY_ROUTES = new Set(Object.keys(CLIENT_ONLY_METADATA));
    if (!bodyContent) {
      if (!CLIENT_ONLY_ROUTES.has(routePath)) {
        statusCode = 404;
        robotsDirective = "noindex,follow";
        title = "Page not found | Noor";
        description = "The page you are looking for could not be found.";
        bodyContent = `
          <main class="min-h-screen bg-background px-4 py-16 text-center">
            <h1 class="text-3xl font-bold">Page not found</h1>
            <p class="mx-auto mt-3 max-w-xl text-muted-foreground">The page you are looking for does not exist or the link is incorrect.</p>
            <a class="mt-6 inline-block rounded-lg bg-primary px-5 py-3 font-semibold text-primary-foreground" href="/">Go to homepage</a>
          </main>`;
      } else {
        const metadata = CLIENT_ONLY_METADATA[routePath];
        title = metadata.title;
        description = metadata.description;
        robotsDirective = metadata.robots;
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
    
    let finalHtml = inject(appTemplate.replace('</head>', `${customStyles}</head>`), {
      title,
      description,
      canonical: canonicalUrl,
      ogImage: req.storyOgImage || TOOL_OG_IMAGES[routePath] || `${SITE_ORIGIN}/og-image.png`,
      body: bodyContent,
      extraStructuredData,
      robots: robotsDirective,
      // Phase 5 (2026-10-02): route-aware <html lang> + crawler-visible hreflang.
      // hreflang only on 200s so every alternate URL is real.
      htmlLang: getHtmlLang(routePath),
      hreflangTags: statusCode === 200 ? getHreflangTags(routePath, SITE_ORIGIN) : "",
    });

    // P1-1: error (404/410) and noindex pages must never carry ad-loading code.
    // The base template (dist/app.html, built from index.html) may include the
    // AdSense script; strip it (and the account verification meta) from any
    // error/noindex response so those pages are never ad-bearing.
    if (statusCode >= 400 || robotsDirective.startsWith("noindex")) {
      finalHtml = finalHtml
        .replace(/<script[^>]*pagead2\.googlesyndication\.com[^>]*>[\s\S]*?<\/script>/gi, "")
        .replace(/<meta[^>]*name=["']google-adsense-account["'][^>]*>/gi, "");
    }

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    // Metadata changes must reach Googlebot and visitors promptly after each release.
    res.setHeader("Cache-Control", "public, max-age=0, s-maxage=300, stale-while-revalidate=300");
    res.setHeader("X-Noor-Prerender", "v101");
    res.setHeader("X-Noor-OG-Image", req.storyOgImage || "default");
    res.status(statusCode).send(finalHtml);
  } catch (error) {
    console.error("Prerender error:", error);
    res.setHeader("X-Noor-Prerender-Error", "true");
    // Fail closed: an uncaught exception must never produce an indexable
    // HTTP 200 app shell. A 500 + noindex tells crawlers to retry later
    // without indexing an error page.
    res.status(500).send(`<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Service temporarily unavailable | Noor</title><meta name="robots" content="noindex,follow"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="font-family:system-ui,sans-serif;text-align:center;padding:4rem 1rem"><h1>Service temporarily unavailable</h1><p>Please try again shortly.</p><p><a href="/">Noor Islamic App</a></p></body></html>`);
  }
}
