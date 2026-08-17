import { Helmet } from "react-helmet-async";
import { useLocation } from "react-router-dom";
import { useGlobalConfig } from "@/context/GlobalConfigContext";
import { isAdminRoutePath } from "@/lib/ads";
import { usePageSeo } from "@/hooks/usePageSeo";
import { getPageSeoDefaults } from "@/lib/seoDefaults";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";

const BRAND_SUFFIX = " | Noor";
const TITLE_MAX = 60;
const DESC_MAX = 160;
const DESC_MIN = 120;
const DESC_FALLBACK = " Read authentic Islamic content in Bengali.";

/** Trim a string to a max length at the nearest word boundary (no ellipsis). */
function trimAtWord(input: string, max: number): string {
  const s = input.trim();
  if (s.length <= max) return s;
  const slice = s.slice(0, max + 1);
  const lastSpace = slice.lastIndexOf(" ");
  const cut = lastSpace > 0 ? slice.slice(0, lastSpace) : slice.slice(0, max);
  return cut.replace(/[\s,;:\-–—|·•]+$/u, "").trim();
}

function normalizeTitle(title?: string | null): string | undefined {
  if (!title) return undefined;
  // Strip duplicated brand fragments so we can re-append cleanly.
  let base = title.trim().replace(/\s+/g, " ");
  base = base.replace(/\s*[|·—–-]\s*Noor(\s+(Islamic\s+App|App))?\s*$/i, "").trim();
  base = base.replace(/\s+\|\s+.*Noor.*$/i, "").trim();

  if (base.length + BRAND_SUFFIX.length <= TITLE_MAX) {
    return `${base}${BRAND_SUFFIX}`;
  }
  if (base.length <= TITLE_MAX) return base;
  return trimAtWord(base, TITLE_MAX);
}

function normalizeDescription(description?: string | null): string | undefined {
  if (!description) return undefined;
  const s = description.trim().replace(/\s+/g, " ");
  if (s.length > DESC_MAX) return trimAtWord(s, DESC_MAX);
  if (s.length < DESC_MIN) {
    const padded = (s + DESC_FALLBACK).trim();
    return padded.length > DESC_MAX ? trimAtWord(padded, DESC_MAX) : padded;
  }
  return s;
}

/** Strip query, hash, duplicate slashes, and trailing slash (except root). */
function sanitizeCanonical(url: string): string {
  let out = url.split("#")[0].split("?")[0];
  // Preserve the "https://" double-slash, dedupe the rest.
  out = out.replace(/([^:])\/{2,}/g, "$1/");
  // Trim trailing slash (except when it's just the origin root).
  out = out.replace(/(?<!:\/)\/+$/g, "");
  if (/^https?:\/\/[^/]+$/.test(out)) out += "/";
  return out;
}

const BREADCRUMB_NAMES: Record<string, string> = {
  quran: "Quran",
  hadith: "Hadith",
  "sahih-bukhari": "Sahih Bukhari",
  bukhari: "Sahih Bukhari",
  muslim: "Sahih Muslim",
  tirmidhi: "Jami at-Tirmidhi",
  "abu-dawud": "Sunan Abu Dawud",
  bangla: "Bangla",
  english: "English",
  urdu: "Urdu",
  "prayer-times": "Prayer Times",
  "prayer-guide": "Prayer Guide",
  dua: "Dua",
  quiz: "Daily Quiz",
  tasbih: "Tasbih",
  qibla: "Qibla",
  "99-names": "99 Names of Allah",
  "baby-names": "Baby Names",
  names: "Baby Names",
  calendar: "Islamic Calendar",
  "islamic-app": "Islamic App",
  about: "About",
  contact: "Contact",
  settings: "Settings",
  notifications: "Notifications",
  "privacy-policy": "Privacy Policy",
  terms: "Terms",
  sitemap: "Sitemap",
  download: "Download App",
};

function buildBreadcrumbJsonLd(pathname: string) {
  const origin = "https://noorapp.in";
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length === 0) return null;

  const items = [
    { "@type": "ListItem" as const, position: 1, name: "Home", item: `${origin}/` },
  ];

  let path = "";
  segments.forEach((seg, i) => {
    path += `/${seg}`;
    items.push({
      "@type": "ListItem" as const,
      position: i + 2,
      name: BREADCRUMB_NAMES[seg] || seg.charAt(0).toUpperCase() + seg.slice(1).replace(/-/g, " "),
      item: `${origin}${path}`,
    });
  });

  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items,
  };
}

const PAGE_FAQS: Record<string, { q: string; a: string }[]> = {
  "/quran": [
    { q: "Can I read the Quran online for free on Noor?", a: "Yes, Noor provides the complete Quran with Arabic text, English and Urdu translations, and audio recitation — all completely free." },
    { q: "Does Noor have Quran audio recitation?", a: "Yes, you can listen to beautiful Quran recitations by renowned Qaris directly within the app while following along with the text." },
    { q: "Can I search for a specific Surah in Noor?", a: "Absolutely. Noor lets you browse all 114 Surahs and jump to any Surah or Ayah instantly." },
    { q: "Is the Quran text on Noor authentic?", a: "Yes, the Arabic text follows the Uthmani script and translations are sourced from widely accepted scholarly works." },
  ],
  "/hadith": [
    { q: "Which Hadith collections are available on Noor?", a: "Noor features major Hadith collections including Sahih Bukhari, Sahih Muslim, Jami at-Tirmidhi, and Sunan Abu Dawud." },
    { q: "Can I read Sahih Bukhari online for free?", a: "Yes, the complete Sahih Bukhari collection is available on Noor with English translations, organized by book and chapter." },
    { q: "Are the Hadith on Noor authentic?", a: "Noor sources Hadith from the most authentic and widely accepted collections in Islamic scholarship." },
    { q: "Can I browse Hadith by chapter?", a: "Yes, each Hadith book is organized by chapters so you can easily find Hadith on specific topics." },
  ],
  "/dua": [
    { q: "Where can I find daily Islamic Duas?", a: "Noor provides a curated collection of authentic Duas for daily life, including morning and evening Adhkar, travel Duas, and more." },
    { q: "Are the Duas on Noor in Arabic with translation?", a: "Yes, every Dua includes Arabic text, transliteration for easy pronunciation, and English translation." },
    { q: "Can I listen to Dua audio on Noor?", a: "Yes, Noor offers audio playback for Duas so you can learn the correct pronunciation." },
    { q: "Are the Duas on Noor from authentic sources?", a: "Yes, all Duas are sourced from the Quran and authentic Hadith collections." },
  ],
  "/quiz": [
    { q: "What is the Islamic Quiz on Noor?", a: "Noor features a daily Islamic quiz that tests your knowledge on Quran, Hadith, Islamic history, and general Islamic teachings." },
    { q: "Is the Islamic Quiz free?", a: "Yes, the daily quiz is completely free. You can take it every day to learn something new about Islam." },
    { q: "How many questions are in each quiz?", a: "Each daily quiz session includes multiple-choice questions covering various Islamic topics with instant feedback." },
    { q: "Can I track my quiz progress?", a: "Yes, Noor tracks your quiz streaks, scores, and badges so you can monitor your Islamic knowledge growth over time." },
  ],
  "/hadith/sahih-bukhari/bangla": [
    { q: "সহীহ বুখারী বাংলা হাদিস কি Noor অ্যাপে পড়া যায়?", a: "হ্যাঁ, Noor অ্যাপে সহীহ বুখারীর সম্পূর্ণ ৭,৫৬৩টি হাদিস আরবি টেক্সট ও বাংলা অনুবাদ সহ বিনামূল্যে পড়া যায়।" },
    { q: "Sahih Bukhari Bangla translation কি বিশ্বস্ত?", a: "হ্যাঁ, Noor অ্যাপের বাংলা অনুবাদ বিশ্বস্ত ও নির্ভরযোগ্য উৎস থেকে সংগৃহীত।" },
    { q: "সহীহ বুখারীতে কতটি অধ্যায় আছে?", a: "সহীহ বুখারীতে ৯৭টি অধ্যায় (কিতাব) রয়েছে, যেগুলো বিষয়ভিত্তিকভাবে সাজানো।" },
    { q: "Can I read Sahih Bukhari in Bangla for free?", a: "Yes, Noor App provides the complete Sahih Bukhari collection with Arabic text and authentic Bangla translation — completely free." },
  ],
  "/hadith/sahih-bukhari/english": [
    { q: "Can I read Sahih Bukhari in English on Noor?", a: "Yes, the complete Sahih al-Bukhari collection with 7,563 hadiths is available in English with Arabic text on Noor App, completely free." },
    { q: "Is Sahih Bukhari the most authentic hadith collection?", a: "Yes, Sahih al-Bukhari by Imam Bukhari is widely regarded as the most authentic hadith collection in Sunni Islam." },
    { q: "How many hadiths are in Sahih Bukhari?", a: "Sahih al-Bukhari contains 7,563 hadiths organized across 97 chapters covering topics from faith to daily life." },
    { q: "Can I browse Sahih Bukhari by chapter in English?", a: "Yes, Noor App organizes Sahih Bukhari into 97 chapters so you can easily find hadiths on specific topics." },
  ],
  "/hadith/sahih-bukhari/urdu": [
    { q: "کیا Noor ایپ پر صحیح بخاری اردو میں پڑھ سکتے ہیں؟", a: "جی ہاں، Noor ایپ پر صحیح بخاری کی مکمل ۷,۵۶۳ احادیث عربی متن اور اردو ترجمے کے ساتھ مفت دستیاب ہیں۔" },
    { q: "صحیح بخاری میں کتنے ابواب ہیں؟", a: "صحیح بخاری میں ۹۷ ابواب ہیں جو مختلف موضوعات جیسے ایمان، نماز، روزہ اور معاملات پر مشتمل ہیں۔" },
    { q: "Is Sahih Bukhari available in Urdu on Noor?", a: "Yes, Noor App provides the complete Sahih Bukhari collection with Arabic text and Urdu translation, free of charge." },
    { q: "کیا Noor ایپ کا اردو ترجمہ معتبر ہے؟", a: "جی ہاں، Noor ایپ کا اردو ترجمہ معتبر علمی ذرائع سے لیا گیا ہے۔" },
  ],
  "/hadith/sahih-bukhari": [
    { q: "What is Sahih al-Bukhari?", a: "Sahih al-Bukhari is the most authentic collection of Hadith in Sunni Islam, compiled by Imam Muhammad ibn Ismail al-Bukhari (810–870 CE). It contains 7,563 hadiths organized in 97 chapters." },
    { q: "How many hadiths are in Sahih Bukhari?", a: "Sahih al-Bukhari contains 7,563 hadiths carefully selected from over 600,000 narrations based on strict criteria of authenticity." },
    { q: "In which languages can I read Sahih Bukhari on Noor?", a: "Noor App offers Sahih Bukhari in Bangla (বাংলা), English, and Urdu (اردو) — all with the original Arabic text, completely free." },
    { q: "Is Sahih Bukhari free to read on Noor App?", a: "Yes, the complete Sahih al-Bukhari collection is available for free on Noor App with Arabic text and translations in three languages." },
  ],
  "/about": [
    { q: "What is Noor App?", a: "Noor is a free Islamic app that provides Quran reading, Hadith collections, daily Duas, Prayer Times, Qibla direction, Islamic quiz, and more — designed for Muslims worldwide." },
    { q: "Is Noor App free?", a: "Yes, Noor App is completely free with no ads on core Islamic content. All features including Quran, Hadith, and Prayer Times are available at no cost." },
    { q: "Which platforms is Noor available on?", a: "Noor is available as a web app at noorapp.in and as an Android app. It works on any modern browser on mobile and desktop." },
  ],
  "/prayer-times": [
    { q: "How does Noor calculate prayer times?", a: "Noor uses your GPS location and the Aladhan API with configurable calculation methods to provide accurate Fajr, Dhuhr, Asr, Maghrib, and Isha times." },
    { q: "Can I get Athan alerts from Noor?", a: "Yes, Noor supports push notification alerts for each prayer time so you never miss Salah." },
    { q: "Does Noor show prayer countdown?", a: "Yes, Noor displays a live countdown timer to the next prayer, helping you prepare for Salah on time." },
  ],
  "/prayer-guide": [
    { q: "Does Noor have a step-by-step prayer guide?", a: "Yes, Noor provides a complete Namaz tutorial with illustrations covering Wudu, Takbir, Qiyam, Ruku, Sujud, and Tashahhud." },
    { q: "Can beginners learn Salah on Noor?", a: "Absolutely. The prayer guide is designed for beginners with clear Bengali and English instructions for every step of Salah." },
  ],
  "/tasbih": [
    { q: "What is the Digital Tasbih on Noor?", a: "Noor's digital Tasbih is a beautiful counter for dhikr — count SubhanAllah, Alhamdulillah, and Allahu Akbar with haptic feedback." },
    { q: "Does the Tasbih counter save my progress?", a: "Yes, the Tasbih counter tracks your total count and maintains your dhikr history." },
  ],
  "/qibla": [
    { q: "How does the Qibla Finder work on Noor?", a: "Noor uses your device compass and GPS location to calculate the exact direction to the Kaaba in Makkah from your current position." },
    { q: "Is the Qibla direction accurate on Noor?", a: "Yes, Noor calculates the precise bearing from your coordinates to the Kaaba using spherical trigonometry for maximum accuracy." },
  ],
  "/99-names": [
    { q: "Can I learn the 99 Names of Allah on Noor?", a: "Yes, Noor presents all 99 beautiful names (Asma ul Husna) of Allah with Arabic text, Bengali meaning, and transliteration." },
    { q: "Does Noor explain the meaning of each name?", a: "Yes, each of the 99 names includes its meaning in Bengali and English along with the original Arabic script." },
  ],
  "/baby-names": [
    { q: "Can I find Muslim baby names on Noor?", a: "Yes, Noor has over 1,000 beautiful Islamic baby names for boys and girls with Arabic script, Bengali pronunciation, and meanings in multiple languages." },
    { q: "Can I search names by letter or gender?", a: "Yes, you can filter names by first letter, gender (boy/girl), and search by meaning or name in Bengali, English, Arabic, Hindi, and Urdu." },
    { q: "Does Noor have Arabic baby names with meanings?", a: "Yes, every name on Noor includes the original Arabic script along with meanings in Bengali, English, and other languages." },
    { q: "Can I find modern Muslim baby names on Noor?", a: "Yes, Noor includes both traditional and modern Muslim baby names for boys and girls, curated from authentic Islamic sources." },
  ],
  "/calendar": [
    { q: "Does Noor have an Islamic calendar?", a: "Yes, Noor provides a Hijri calendar with key Islamic dates including Ramadan, Eid ul-Fitr, Eid ul-Adha, Laylat al-Qadr, and more." },
    { q: "Can I see upcoming Islamic events on Noor?", a: "Yes, the Islamic calendar highlights important dates and events throughout the year so you never miss a significant occasion." },
  ],
};

function buildFaqJsonLd(pathname: string) {
  const faqs = PAGE_FAQS[pathname];
  if (!faqs) return null;
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
}

function buildHomepageJsonLd(
  branding: ReturnType<typeof useGlobalConfig>["branding"],
  seo: ReturnType<typeof useGlobalConfig>["seo"],
  legal: ReturnType<typeof useGlobalConfig>["legal"],
) {
  const origin = "https://noorapp.in";
  const schemas: object[] = [];

  // 1️⃣ Organization schema
  const org: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Noor",
    url: origin,
    logo: `${origin}/logo.png`,
    description: "Noor — Free Islamic app for Quran, Hadith, Dua, Prayer Times & Islamic learning.",
  };
  if (legal.contactEmail) org.email = legal.contactEmail;
  const sameAs: string[] = [];
  if (legal.facebookUrl) sameAs.push(legal.facebookUrl);
  if (legal.whatsappUrl) sameAs.push(legal.whatsappUrl);
  if (legal.playStoreUrl) sameAs.push(legal.playStoreUrl);
  if (legal.appStoreUrl) sameAs.push(legal.appStoreUrl);
  if (sameAs.length) org.sameAs = sameAs;
  schemas.push(org);

  // 2️⃣ WebSite schema with SearchAction
  schemas.push({
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Noor Islamic App",
    url: origin,
    potentialAction: {
      "@type": "SearchAction",
      target: `${origin}/search?q={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  });

  // 3️⃣ MobileApplication schema
  schemas.push({
    "@context": "https://schema.org",
    "@type": "MobileApplication",
    name: "Noor Islamic App",
    operatingSystem: "Android",
    applicationCategory: "LifestyleApplication",
    applicationSubCategory: "Islamic App",
    url: origin,
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "INR",
    },
  });

  return schemas;
}

function cacheBustUrl(url: string, version?: string) {
  if (!url) return url;
  const v = version || String(Date.now());
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}v=${v}`;
}

export function SeoHead() {
  const { pathname } = useLocation();
  const { branding, seo: globalSeo, legal } = useGlobalConfig();

  const isAdmin = isAdminRoutePath(pathname);
  const pageSeoQuery = usePageSeo(pathname, !isAdmin);
  const pageSeo = pageSeoQuery.data;

  // Avoid indexing admin panel
  if (isAdmin) {
    return (
      <Helmet>
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>
    );
  }

  // Bilingual defaults for the current route (fallback when no admin/db value)
  const bilingualDefaults = getPageSeoDefaults(pathname, branding.appName);

  const title = normalizeTitle(
    pageSeo?.title ?? bilingualDefaults?.title ?? globalSeo.title ?? branding.appName,
  );
  const description = normalizeDescription(
    pageSeo?.description ?? bilingualDefaults?.description ?? globalSeo.description,
  );

  const SITE_ORIGIN = "https://noorapp.in";
  // Normalize: remove trailing slash (except root "/")
  const normalizedPath = pathname === "/" ? "/" : pathname.replace(/\/+$/, "");
  // Canonical consolidation: /names → /baby-names
  const canonicalPath = normalizedPath === "/names" ? "/baby-names" : normalizedPath;
  // Use a database override only when it stays on the selected canonical host.
  // This prevents stale www, preview, or homepage values from splitting canonical signals.
  const rawDbCanonical = pageSeo?.canonical_url?.trim();
  const isCanonicalHost = rawDbCanonical === SITE_ORIGIN || rawDbCanonical?.startsWith(`${SITE_ORIGIN}/`);
  const isHomepageCanonical = rawDbCanonical === SITE_ORIGIN || rawDbCanonical === `${SITE_ORIGIN}/`;
  const shouldUseDbCanonical = Boolean(
    rawDbCanonical && isCanonicalHost && (!isHomepageCanonical || normalizedPath === "/"),
  );

  const canonical = sanitizeCanonical(
    shouldUseDbCanonical ? rawDbCanonical! : `${SITE_ORIGIN}${canonicalPath}`,
  );

  const robots = pageSeo?.robots ?? "index,follow";

  // Page-specific OG images
  const OG_IMAGES: Record<string, string> = {
    "/": "/og-image.png",
    "/quran": "/og-quran.png",
    "/prayer-times": "/og-prayer-times.png",
    "/dua": "/og-dua.png",
    "/quiz": "/og-quiz.png",
    "/hadith": "/og-bukhari.png",
    "/hadith/bukhari": "/og-bukhari.png",
    "/hadith/sahih-bukhari": "/og-bukhari.png",
    "/hadith/sahih-bukhari/bangla": "/og-bukhari.png",
    "/hadith/sahih-bukhari/english": "/og-bukhari.png",
    "/hadith/sahih-bukhari/urdu": "/og-bukhari.png",
    "/tasbih": "/og-tasbih.png",
    "/qibla": "/og-qibla.png",
    "/99-names": "/og-99-names.png",
    "/baby-names": "/og-baby-names.png",
    "/names": "/og-baby-names.png",
    "/calendar": "/og-calendar.png",
    "/prayer-guide": "/og-prayer-guide.png",
  };
  // For hadith chapter pages, use bukhari OG image
  let ogImage = `${SITE_ORIGIN}/og-image.png`;
  const ogImagePath = OG_IMAGES[normalizedPath] || OG_IMAGES[pathname];
  
  if (ogImagePath) {
    ogImage = `${SITE_ORIGIN}${ogImagePath}`;
  } else if (normalizedPath.startsWith("/hadith/sahih-bukhari")) {
    ogImage = `${SITE_ORIGIN}/og-bukhari.png`;
  } else if (normalizedPath.startsWith("/dua/")) {
    // For specific dua pages, use DB-backed OG image
    const dbOgUrl = pageSeo?.og_image_url;
    
    if (dbOgUrl && !dbOgUrl.includes("yourwebsite.com")) {
      ogImage = dbOgUrl;
    } else {
      // Fallback to generic dua OG image
      ogImage = `${SITE_ORIGIN}/og-dua.png`;
    }
  } else if (normalizedPath.startsWith("/stories/")) {
    // For specific story pages, use DB-backed OG image
    const dbOgUrl = pageSeo?.og_image_url;
    if (dbOgUrl && !dbOgUrl.includes("yourwebsite.com")) {
      ogImage = dbOgUrl;
    } else {
      ogImage = `${SITE_ORIGIN}/og-stories-default.jpg`;
    }
  } else {
    ogImage = `${SITE_ORIGIN}/og-image.png`;
  }

  // Use page-specific JSON-LD if set, otherwise inject Organization+WebSite on homepage
  const isHomepage = pathname === "/";
  const jsonLd = pageSeo?.json_ld ?? null;

  // CollectionPage JSON-LD for /baby-names
  const isBabyNamesPage = normalizedPath === "/baby-names";
  const collectionLdString = isBabyNamesPage && !jsonLd
    ? JSON.stringify({
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        name: "Muslim Baby Names",
        description: "Browse Islamic baby names for boys and girls with meanings.",
        url: `${SITE_ORIGIN}/baby-names`,
        mainEntity: {
          "@type": "ItemList",
          name: "Islamic Baby Names Collection",
          numberOfItems: "1000+",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Muhammad (مُحَمَّد) — Praised, commendable" },
            { "@type": "ListItem", position: 2, name: "Fatima (فَاطِمَة) — One who abstains" },
            { "@type": "ListItem", position: 3, name: "Ahmad (أَحْمَد) — Most praiseworthy" },
            { "@type": "ListItem", position: 4, name: "Aisha (عَائِشَة) — Living, prosperous" },
            { "@type": "ListItem", position: 5, name: "Yusuf (يُوسُف) — God increases" },
          ],
        },
      })
    : null;

  // Article JSON-LD for hadith language/chapter pages
  const isHadithArticlePage = normalizedPath.match(/^\/hadith\/sahih-bukhari\/(bangla|english|urdu)(\/chapter-\d+)?$/);
  const articleLdString = !jsonLd && isHadithArticlePage
    ? JSON.stringify({
        "@context": "https://schema.org",
        "@type": "Article",
        headline: title,
        author: { "@type": "Person", name: "Imam Muhammad ibn Ismail al-Bukhari" },
        publisher: { "@type": "Organization", name: "Noor App", url: SITE_ORIGIN },
        url: canonical,
        image: ogImage,
        description,
      })
    : null;

  const jsonLdString = jsonLd
    ? JSON.stringify(jsonLd)
    : isHomepage
      ? JSON.stringify(buildHomepageJsonLd(branding, globalSeo, legal))
      : null;

  // BreadcrumbList for all non-homepage routes
  const breadcrumbLd = !isHomepage ? buildBreadcrumbJsonLd(pathname) : null;
  const breadcrumbString = breadcrumbLd ? JSON.stringify(breadcrumbLd) : null;

  // FAQPage for key pages
  const faqLd = buildFaqJsonLd(pathname);
  const faqString = faqLd ? JSON.stringify(faqLd) : null;

  // Dynamic favicon from branding settings
  const lv = branding.logoVersion;
  const favVariants = branding.faviconVariants;
  const faviconHref = branding.faviconUrl || branding.iconUrl || branding.logoUrl;

  return (
    <Helmet>
      {title ? <title>{title}</title> : null}
      {description ? <meta name="description" content={description} /> : null}

      {canonical ? <link rel="canonical" href={canonical} /> : null}
      {robots ? <meta name="robots" content={robots} /> : null}

      {/* hreflang for hadith language variants */}
      {isHadithArticlePage ? (
        <>
          <link rel="alternate" hrefLang="bn" href={`${SITE_ORIGIN}/hadith/sahih-bukhari/bangla${isHadithArticlePage[2] || ""}`} />
          <link rel="alternate" hrefLang="en" href={`${SITE_ORIGIN}/hadith/sahih-bukhari/english${isHadithArticlePage[2] || ""}`} />
          <link rel="alternate" hrefLang="ur" href={`${SITE_ORIGIN}/hadith/sahih-bukhari/urdu${isHadithArticlePage[2] || ""}`} />
          <link rel="alternate" hrefLang="x-default" href={`${SITE_ORIGIN}/hadith/sahih-bukhari/english${isHadithArticlePage[2] || ""}`} />
        </>
      ) : null}

      {/* Dynamic favicons */}
      {favVariants?.png16 ? <link rel="icon" sizes="16x16" type="image/png" href={cacheBustUrl(favVariants.png16, lv)} /> : null}
      {favVariants?.png32 ? <link rel="icon" sizes="32x32" type="image/png" href={cacheBustUrl(favVariants.png32, lv)} /> : null}
      {faviconHref ? <link rel="icon" href={cacheBustUrl(favVariants?.png32 || faviconHref, lv)} /> : null}
      {faviconHref ? <link rel="shortcut icon" href={cacheBustUrl(favVariants?.png32 || faviconHref, lv)} /> : null}
      {favVariants?.png180 || faviconHref ? <link rel="apple-touch-icon" sizes="180x180" href={cacheBustUrl(favVariants?.png180 || faviconHref!, lv)} /> : null}

      {/* OG tags */}
      {title ? <meta property="og:title" content={title} /> : null}
      {description ? <meta property="og:description" content={description} /> : null}
      <meta property="og:image" content={ogImage} />
      <meta property="og:url" content={canonical} />
      <meta property="og:type" content={isHadithArticlePage ? "article" : "website"} />

      {/* Twitter Card */}
      <meta name="twitter:card" content="summary_large_image" />
      {title ? <meta name="twitter:title" content={title} /> : null}
      {description ? <meta name="twitter:description" content={description} /> : null}
      <meta name="twitter:image" content={ogImage} />

      {jsonLdString ? (
        <script type="application/ld+json">{jsonLdString}</script>
      ) : null}
      {articleLdString ? (
        <script type="application/ld+json">{articleLdString}</script>
      ) : null}
      {collectionLdString ? (
        <script type="application/ld+json">{collectionLdString}</script>
      ) : null}
      {breadcrumbString ? (
        <script type="application/ld+json">{breadcrumbString}</script>
      ) : null}
      {faqString ? (
        <script type="application/ld+json">{faqString}</script>
      ) : null}
    </Helmet>
  );
}
