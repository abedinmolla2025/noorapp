import { createClient } from "npm:@supabase/supabase-js@2";

const SITE_ORIGIN = "https://noorapp.in";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&#39;")

const storyFillerPatterns = [
  /এটি একটি বিস্তারিত ইসলামিক গল্প।[\s\S]*?আল্লাহর প্রতি বিশ্বাস, ধৈর্য এবং ন্যায়বিচারের গুরুত্ব এখানে আরও স্পষ্ট করা হয়েছে।/g,
  /This is a detailed Islamic story\.[\s\S]*?The importance of faith in Allah, patience, and justice has been made clearer here\./gi,
  /یہ ایک تفصیلی اسلامی کہانی ہے۔[\s\S]*?اللہ پر ایمان، صبر اور انصاف کی اہمیت کو یہاں مزید واضح کیا گیا ہے۔/g,
];

function cleanStoryText(value: unknown): string {
  let text = typeof value === "string" ? value : "";
  for (const pattern of storyFillerPatterns) text = text.replace(pattern, "");
  return text.replace(/\n{3,}/g, "\n\n").trim();
}

function storyMetaDescription(story: any, title: string): string {
  const existing = typeof story.seo?.meta_description === "string" ? story.seo.meta_description.trim() : "";
  if (existing && !/^Can .+ change your heart today\?/i.test(existing) && !/detailed Islamic story|এটি একটি বিস্তারিত ইসলামিক গল্প|یہ ایک تفصیلی اسلامی کہانی/i.test(existing)) return existing;
  const content = cleanStoryText(story.content_en || story.content || "");
  const opening = content.split(/\n{2,}/).map((part: string) => part.trim()).find((part: string) => part.length >= 45 && !/^(beginning|the test|the lesson)$/i.test(part));
  const description = opening || title;
  return description.length > 160 ? `${description.slice(0, 159).replace(/[\s,;:—-]+$/, "")}…` : description;
}

// ─── SEO defaults (mirrors src/lib/seoDefaults.ts) ───
const SEO_DEFAULTS: Record<string, { title: string; description: string }> = {
  "/": {
    title: "Noor — Islamic App for Quran, Hadith, Prayer Times & Dua",
    description: "Noor is a free Islamic app for Muslims in India & Bangladesh. Read Quran with Bengali translation, Hadith, daily duas, prayer times, Qibla & Islamic quiz.",
  },
  "/quran": {
    title: "Quran Reader — পবিত্র কুরআন | NOOR",
    description: "Read the Holy Quran with Arabic text, Bengali translation & audio recitation — সূরা তিলাওয়াত, তাফসীর ও অডিও সহ সম্পূর্ণ কুরআন পাঠ করুন।",
  },
  "/prayer-times": {
    title: "Prayer Times — নামাজের সময়সূচী | NOOR",
    description: "Accurate daily Salah times for your location — ফজর, যোহর, আসর, মাগরিব ও এশার সঠিক সময় জানুন। Athan alerts & countdown timer included.",
  },
  "/dua": {
    title: "Duas & Supplications — দোয়া সমূহ | NOOR",
    description: "Authentic Islamic duas with Arabic, Bengali meaning & audio — দৈনন্দিন মাসনূন দোয়া, কুরআনের দোয়া ও হাদিসের দোয়া সংকলন।",
  },
  "/quiz": {
    title: "Daily Islamic Quiz — ইসলামিক কুইজ | NOOR",
    description: "Test & improve your Islamic knowledge daily — প্রতিদিন ৫টি কুইজে অংশ নিন, স্কোর অর্জন করুন, streak বজায় রাখুন ও নতুন কিছু শিখুন।",
  },
  "/hadith": {
    title: "Authentic Hadith Collections – Noor App",
    description: "Browse authentic Hadith collections — Sahih Bukhari, Sahih Muslim, Jami at-Tirmidhi & Sunan Abu Dawud with Arabic text and translations.",
  },
  "/hadith/sahih-bukhari": {
    title: "Sahih al-Bukhari Hadith Collection – Noor App",
    description: "Read Sahih al-Bukhari in Bangla, English, or Urdu with Arabic text, chapter navigation and collection references.",
  },
  "/hadith/sahih-bukhari/bangla": {
    title: "Sahih Bukhari Bangla – সহীহ বুখারী বাংলা হাদিস | Noor App",
    description: "সহীহ বুখারী শরীফের সম্পূর্ণ হাদিস আরবি ও বাংলা অনুবাদ সহ পড়ুন। Read Sahih Bukhari Bangla with Arabic text & translation on Noor App.",
  },
  "/hadith/sahih-bukhari/english": {
    title: "Sahih Bukhari English – Authentic Hadith Collection | Noor App",
    description: "Read Sahih Bukhari in English with Arabic text, translation, chapter navigation and collection references on Noor App.",
  },
  "/hadith/sahih-bukhari/urdu": {
    title: "Sahih Bukhari Urdu – صحیح بخاری اردو حدیث | Noor App",
    description: "صحیح بخاری کی مکمل احادیث عربی متن اور اردو ترجمہ کے ساتھ پڑھیں۔ Read Sahih Bukhari Urdu hadith with Arabic text on Noor App.",
  },
  "/hadith/muslim": {
    title: "Sahih Muslim — সহীহ মুসলিম হাদিস | Noor",
    description: "Read Sahih Muslim Hadith with Arabic text, Bengali translation, chapter navigation and collection references on Noor App.",
  },
  "/hadith/tirmidhi": {
    title: "Jami at-Tirmidhi — জামে তিরমিযী হাদিস | Noor",
    description: "Explore Jami at-Tirmidhi with Bengali translation — 3,956 hadiths covering fiqh, seerah & virtues with unique hadith grading. জামে তিরমিযী পড়ুন।",
  },
  "/hadith/abu-dawud": {
    title: "Sunan Abu Dawud — সুনানে আবু দাউদ হাদিস | Noor",
    description: "Read Sunan Abu Dawud with Bengali translation — the definitive jurisprudence-focused hadith collection. আবু দাউদ পড়ুন।",
  },
  "/prayer-guide": {
    title: "Prayer Guide — নামাজ শিক্ষা | NOOR",
    description: "Step-by-step Salah tutorial with illustrations — ওযু, নামাজের নিয়ম, সূরা, দোয়া ও তাশাহহুদ সহ সম্পূর্ণ নামাজ শিক্ষা গাইড।",
  },
  "/tasbih": {
    title: "Digital Tasbih — ডিজিটাল তাসবীহ | NOOR",
    description: "Beautiful digital Tasbih counter for dhikr — সুবহানাল্লাহ, আলহামদুলিল্লাহ, আল্লাহু আকবার সহজে গণনা করুন। Haptic feedback supported.",
  },
  "/qibla": {
    title: "Qibla Finder — কিবলার দিক | NOOR",
    description: "Find accurate Qibla direction using compass — আপনার বর্তমান অবস্থান থেকে মক্কার কাবা শরীফের সঠিক দিক নির্ণয় করুন।",
  },
  "/99-names": {
    title: "99 Names of Allah — আল্লাহর ৯৯ নাম | NOOR",
    description: "Learn the 99 beautiful names (Asma ul Husna) of Allah — আল্লাহ তাআলার ৯৯টি গুণবাচক নাম আরবি, অর্থ ও ফযীলত সহ জানুন।",
  },
  "/baby-names": {
    title: "Muslim Baby Names — শিশুর নাম | NOOR",
    description: "Find beautiful Islamic baby names for boys & girls — ছেলে ও মেয়ে শিশুদের জন্য অর্থসহ সুন্দর মুসলিম নাম বাছাই করুন।",
  },
  "/names": {
    title: "Islamic Names — ইসলামিক নামের তালিকা | NOOR",
    description: "Browse thousands of Islamic names with Arabic script & meanings — আরবি, বাংলা উচ্চারণ ও অর্থসহ ইসলামিক নাম খুঁজুন।",
  },
  "/calendar": {
    title: "Islamic Calendar — হিজরি ক্যালেন্ডার | NOOR",
    description: "Hijri calendar with key Islamic dates — রমজান, ঈদুল ফিতর, ঈদুল আযহা, শবে কদর ও অন্যান্য গুরুত্বপূর্ণ ইসলামিক দিবস দেখুন।",
  },
  "/about": {
    title: "About NOOR — আমাদের সম্পর্কে | NOOR",
    description: "Learn about the NOOR app mission & team — ইসলামিক শিক্ষা ও আধুনিক প্রযুক্তি একত্রে আনার আমাদের লক্ষ্য ও উদ্দেশ্য।",
  },
  "/contact": {
    title: "Contact Us — যোগাযোগ | NOOR",
    description: "Get in touch with the NOOR team — প্রশ্ন, পরামর্শ, বাগ রিপোর্ট বা সহযোগিতার জন্য আমাদের সাথে সরাসরি যোগাযোগ করুন।",
  },
  "/privacy-policy": {
    title: "Privacy Policy — গোপনীয়তা নীতি | NOOR",
    description: "NOOR app privacy policy & data protection — আপনার ব্যক্তিগত তথ্যের নিরাপত্তা ও ব্যবহার সম্পর্কে বিস্তারিত জানুন।",
  },
  "/terms": {
    title: "Terms of Service — ব্যবহারের শর্তাবলী | NOOR",
    description: "NOOR app terms & conditions — অ্যাপ ব্যবহারের শর্তাবলী ও ব্যবহারকারীর অধিকার সম্পর্কে বিস্তারিত পড়ুন।",
  },
  "/islamic-app": {
    title: "Islamic App – Quran, Hadith, Dua & Prayer Times",
    description: "Noor brings Quran reading, Hadith, Duas, Prayer Times, Qibla, Islamic calendar and a daily quiz together for Bengali-speaking Muslims.",
  },
  "/download": {
    title: "Download Noor App — Android APK | NOOR",
    description: "Download Noor Islamic App for Android — কুরআন, হাদিস, নামাজের সময়, দোয়া ও ইসলামিক কুইজ সহ সম্পূর্ণ ইসলামিক অ্যাপ ডাউনলোড করুন।",
  },
  "/sitemap": {
    title: "Sitemap — সাইটম্যাপ | NOOR",
    description: "Browse all pages on Noor Islamic App — Quran, Hadith, Dua, Prayer Times, Quiz ও সকল পেজের সম্পূর্ণ তালিকা দেখুন।",
  },
};

function getChapterSeo(lang: string, chapterNum: string) {
  const langLabels: Record<string, { title: string; description: string }> = {
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
  return langLabels[lang] || langLabels.english;
}

function getOgImage(path: string, customImage?: string): string {
  // If we have a valid custom image from DB (absolute URL), use it
  if (customImage && customImage.startsWith("http") && !customImage.includes("yourwebsite.com")) {
    return customImage;
  }
  
  // Fallbacks for specific routes
  if (path.startsWith("/hadith")) return `${SITE_ORIGIN}/og-bukhari.png`;
  if (path.startsWith("/quran")) return `${SITE_ORIGIN}/og-quran.png`;
  if (path.startsWith("/prayer-times")) return `${SITE_ORIGIN}/og-prayer-times.png`;
  if (path.startsWith("/dua/")) return `${SITE_ORIGIN}/og-dua.png`; 
  if (path === "/dua") return `${SITE_ORIGIN}/og-dua.png`;
  if (path.startsWith("/quiz")) return `${SITE_ORIGIN}/og-quiz.png`;
  if (path.startsWith("/tasbih")) return `${SITE_ORIGIN}/og-tasbih.png`;
  if (path.startsWith("/qibla")) return `${SITE_ORIGIN}/og-qibla.png`;
  if (path.startsWith("/99-names")) return `${SITE_ORIGIN}/og-99-names.png`;
  if (path.startsWith("/baby-names") || path.startsWith("/names")) return `${SITE_ORIGIN}/og-baby-names.png`;
  if (path.startsWith("/calendar")) return `${SITE_ORIGIN}/og-calendar.png`;
  if (path.startsWith("/prayer-guide")) return `${SITE_ORIGIN}/og-prayer-guide.png`;
  
  return `${SITE_ORIGIN}/og-image.png`;
}

function resolvePublicOgUrl(value: unknown, supabaseUrl: string): string {
  if (typeof value !== "string") return "";
  const raw = value.trim();
  if (!raw || raw.includes("yourwebsite.com")) return "";
  if (/^https:\/\//i.test(raw)) return raw;

  const clean = raw.replace(/^\/+/, "");
  // Paths under public are site assets, not Storage object keys.
  if (clean.startsWith("assets/") || clean.startsWith("og-")) {
    return `${SITE_ORIGIN}/${clean}`;
  }

  // Determine bucket and storage path
  let bucket = "media";
  let storagePath = clean;

  if (clean.startsWith("og-images/")) {
    bucket = "og-images";
    storagePath = clean.slice("og-images/".length);
  } else if (clean.startsWith("media/")) {
    bucket = "media";
    storagePath = clean.slice("media/".length);
  }

  return `${supabaseUrl}/storage/v1/object/public/${bucket}/${storagePath}`;
}

function isLegacyMissingSlugImage(value: unknown): boolean {
  return typeof value === "string" &&
    /^https:\/\/noorapp\.in\/assets\/og-images\/[^/?]+\.png(?:\?|$)/i.test(value.trim());
}

// Build hreflang alternate links for hadith pages
function buildHreflangTags(path: string): string {
  const chapterMatch = path.match(/^\/hadith\/sahih-bukhari\/(bangla|english|urdu)(\/chapter-\d+)?$/);
  if (!chapterMatch) return "";
  const suffix = chapterMatch[2] || "";
  const langs = [
    { lang: "bn", slug: "bangla" },
    { lang: "en", slug: "english" },
    { lang: "ur", slug: "urdu" },
  ];
  const tags = langs
    .map((l) => `<link rel="alternate" hreflang="${l.lang}" href="${SITE_ORIGIN}/hadith/sahih-bukhari/${l.slug}${suffix}" />`)
    .join("\n    ");
  // Add x-default pointing to English
  return `${tags}\n    <link rel="alternate" hreflang="x-default" href="${SITE_ORIGIN}/hadith/sahih-bukhari/english${suffix}" />`;
}

async function fetchHadithContent(
  supabase: ReturnType<typeof createClient>,
  chapterId: number,
  lang: string,
): Promise<string> {
  // Fetch hadiths for this chapter
  const langColumn = lang === "bangla" ? "bengali" : lang === "urdu" ? "bengali" : lang; // urdu uses same column check
  
  const { data: hadiths, error } = await supabase
    .from("hadiths")
    .select("hadith_number, arabic, bengali, english")
    .eq("chapter_id", chapterId)
    .eq("book_key", "bukhari")
    .order("hadith_number", { ascending: true })
    .limit(50); // First 50 hadiths for prerender

  if (error || !hadiths?.length) {
    return `<p>Loading hadith content for Chapter ${chapterId}...</p>`;
  }

  const translationKey = lang === "bangla" ? "bengali" : lang === "urdu" ? "bengali" : "english";

  return hadiths
    .map((h: any) => {
      const translation = h[translationKey] || h.english || "";
      return `
      <article class="hadith" itemscope itemtype="https://schema.org/Article">
        <h3 itemprop="name">Hadith ${h.hadith_number}</h3>
        <p dir="rtl" lang="ar" class="arabic" itemprop="text">${escapeHtml(h.arabic || "")}</p>
        <p class="translation">${escapeHtml(translation)}</p>
      </article>`;
    })
    .join("\n");
}

// Build chapter list HTML for language root pages
async function fetchChapterList(
  supabase: ReturnType<typeof createClient>,
  lang: string,
): Promise<string> {
  const { data: chapters, error } = await supabase
    .from("hadith_chapters")
    .select("chapter_number, title, title_bn")
    .eq("book_id", "bukhari")
    .order("chapter_number", { ascending: true });

  if (error || !chapters?.length) {
    return "<p>Browse 97 chapters of Sahih Bukhari.</p>";
  }

  const links = chapters
    .map((ch: any) => {
      const displayTitle = lang === "bangla" ? (ch.title_bn || ch.title) : ch.title;
      return `<li><a href="${SITE_ORIGIN}/hadith/sahih-bukhari/${lang}/chapter-${ch.chapter_number}">Chapter ${ch.chapter_number}: ${escapeHtml(displayTitle)}</a></li>`;
    })
    .join("\n");

  return `<nav aria-label="Sahih Bukhari Chapters"><ol>${links}</ol></nav>`;
}

function buildFullHtml(
  path: string,
  title: string,
  description: string,
  ogImage: string,
  bodyContent: string,
  jsonLd?: string,
  extraTags?: string,
  ogType: string = "website",
): string {
  const canonical = `${SITE_ORIGIN}${path}`;
  const hreflangTags = buildHreflangTags(path);

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}" />
    <link rel="canonical" href="${canonical}" />
    <meta name="robots" content="index,follow" />
    ${hreflangTags}
    
    <!-- Open Graph -->
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <meta property="og:image" content="${ogImage}" />
    <meta property="og:image:secure_url" content="${ogImage}" />
    <meta property="og:image:type" content="${ogImage.includes('.webp') ? 'image/webp' : 'image/png'}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="${escapeHtml(title)}" />
    <meta property="og:url" content="${canonical}" />
    <meta property="og:type" content="${ogType}" />
    <meta property="og:site_name" content="Noor Islamic App" />
    ${extraTags || ""}
    
    <!-- Twitter Card -->
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtml(title)}" />
    <meta name="twitter:description" content="${escapeHtml(description)}" />
    <meta name="twitter:image" content="${ogImage}" />
    
    ${jsonLd ? `<script type="application/ld+json">${jsonLd}</script>` : ""}
</head>
<body>
    <header>
        <h1>${escapeHtml(title)}</h1>
        <nav aria-label="Main Navigation">
            <a href="${SITE_ORIGIN}/">Home</a> |
            <a href="${SITE_ORIGIN}/quran">Quran</a> |
            <a href="${SITE_ORIGIN}/hadith">Hadith</a> |
            <a href="${SITE_ORIGIN}/prayer-times">Prayer Times</a> |
            <a href="${SITE_ORIGIN}/dua">Dua</a> |
            <a href="${SITE_ORIGIN}/quiz">Quiz</a>
        </nav>
    </header>
    <main>
        ${bodyContent}
    </main>
    <footer>
        <p>&copy; ${new Date().getFullYear()} Noor Islamic App — <a href="${SITE_ORIGIN}/">noorapp.in</a></p>
        <nav aria-label="Footer">
            <a href="${SITE_ORIGIN}/about">About</a> |
            <a href="${SITE_ORIGIN}/privacy-policy">Privacy</a> |
            <a href="${SITE_ORIGIN}/terms">Terms</a> |
            <a href="${SITE_ORIGIN}/sitemap">Sitemap</a>
        </nav>
    </footer>
</body>
</html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    let path = url.searchParams.get("path") || "/";
    // Normalize: remove trailing slash
    if (path !== "/" && path.endsWith("/")) {
      path = path.replace(/\/+$/, "");
    }
    // Decode URI
    path = decodeURIComponent(path);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    // Determine SEO meta
    let seo = SEO_DEFAULTS[path];
    let bodyContent = "";
    let jsonLd = "";
    let customOgImage = "";

    // Check for specific Dua page pattern
    const duaMatch = path.match(/^\/dua\/([a-zA-Z0-9-]+)$/);

    // Check for chapter page pattern
    const chapterMatch = path.match(
      /^\/hadith\/sahih-bukhari\/(bangla|english|urdu)\/chapter-(\d+)$/,
    );

    // Check for language root pattern
    const langRootMatch = path.match(
      /^\/hadith\/sahih-bukhari\/(bangla|english|urdu)$/,
    );

    // Check for story page pattern (supports both /stories/slug and /stories/slug/trailer)
    const storyMatch = path.match(/^\/stories\/([a-zA-Z0-9-]+)(?:\/trailer)?$/);
    const isTrailerMode = url.searchParams.get("trailer") === "true" || path.endsWith("/trailer");

    if (storyMatch) {
      const slug = storyMatch[1];
      if (slug === "test-story-manus") {
        return new Response("Not Found", { status: 404, headers: { ...corsHeaders, "Content-Type": "text/plain" } });
      }
      try {
        const { data: story } = await supabase
          .from("admin_content")
          .select("*")
          .ilike("content_type", "story")
          .eq("slug", slug)
          .maybeSingle();

        if (story) {
          const title = story.title_bn || story.title;
          const description = isTrailerMode 
            ? "এই হৃদয়স্পর্শী ইসলামিক গল্পটির একটি চমৎকার অডিও ট্রেলার শুনুন।" 
            : storyMetaDescription(story, title);
          
          seo = {
            title: isTrailerMode ? `🎬 Trailer: ${title}` : title,
            description: description,
          };

          const ogImagePath = story.og_image_data?.url || story.og_image_data?.og_image || story.seo?.open_graph?.['og:image'] || story.seo?.og_image || story.image_url || story.og_image_url;
          if (ogImagePath) {
            customOgImage = resolvePublicOgUrl(ogImagePath, supabaseUrl);
          }

          if (isTrailerMode) {
            let extraTags = "";
            if (story.audio_trailer_url) {
              // Ensure absolute URL for audio
              const audioUrl = story.audio_trailer_url.startsWith("http") ? story.audio_trailer_url : `${SITE_ORIGIN}${story.audio_trailer_url}`;
              extraTags += `\n    <meta property="og:audio" content="${audioUrl}" />`;
              extraTags += `\n    <meta property="og:audio:type" content="audio/mpeg" />`;
              extraTags += `\n    <meta property="og:audio:secure_url" content="${audioUrl}" />`;
              // Some platforms use og:video for audio previews
              extraTags += `\n    <meta property="og:video" content="${audioUrl}" />`;
              extraTags += `\n    <meta property="og:video:type" content="video/mp4" />`;
            }
            
            bodyContent = `
              <section>
                <h2>🎬 ${escapeHtml(title)} (Audio Trailer)</h2>
                <p>${escapeHtml(description)}</p>
                <p>Visit <a href="${SITE_ORIGIN}/stories/${slug}">Noor App</a> to read the full story.</p>
              </section>`;
            
            return new Response(
              buildFullHtml(
                path + (isTrailerMode ? "?trailer=true" : ""),
                seo.title,
                seo.description,
                customOgImage || getOgImage(path),
                bodyContent,
                undefined,
                extraTags,
                "video.other"
              ),
              { headers: { ...corsHeaders, "Content-Type": "text/html" } }
            );
          }

          bodyContent = `
            <section>
                <h2>${escapeHtml(title)}</h2>
                ${story.author ? `<p><strong>Author:</strong> ${escapeHtml(story.author)}</p>` : ""}
                ${story.content ? `<div class="content">${escapeHtml(story.content)}</div>` : ""}
                <p>Visit <a href="${SITE_ORIGIN}/stories/${slug}">Noor App</a> to read more authentic Islamic stories.</p>
            </section>`;
        }
      } catch (err) {
        console.error("Error fetching story for prerender:", err);
      }
    } else if (duaMatch) {
      const slug = duaMatch[1];
      try {
        // The database is authoritative because admin uploads and replacements
        // update og_image_url without changing the bundled JSON dataset.
        const { data: dbDua } = await supabase
          .from("admin_content")
          .select("title, content, content_arabic, content_pronunciation, reference, image_url, og_image_data, seo")
          .ilike("content_type", "dua")
          .eq("slug", slug)
          .maybeSingle();

        // Fetch the Duas JSON
        const response = await fetch(`${SITE_ORIGIN}/data/duas.json`);
        const duas = await response.json();
        const dua = duas.find((d: any) => d.slug === slug);
        
          if (dua) {
          const mainCaption = dua.social?.facebook || `${dua.title_bn || dua.title_en}${dua.reference ? ` (${dua.reference})` : ""}। এই দুয়াটি বিস্তারিত পড়ার জন্য নিচের লিঙ্কে ক্লিক করুন।`;
          seo = {
            title: dua.title_bn || dua.title_en,
            description: mainCaption
          };
          
          // Resolve OG image from dua data - CRITICAL: Use exact path from duas.json
          // Prioritize facebook_share.og_image_url from JSON, then database image_url
          const jsonOgImage = dua.facebook_share?.og_image_url || dua.og_image_data?.og_image || dua.og_image;
          const databaseOgImage = isLegacyMissingSlugImage(dbDua?.image_url) ? "" : dbDua?.image_url;
          const seoOgImage = dbDua?.seo?.og_image || dbDua?.seo?.og_image_url;
          
          const ogImagePath = jsonOgImage || databaseOgImage || seoOgImage || dbDua?.og_image_data?.og_image || dbDua?.image_url;
          
          if (ogImagePath && !ogImagePath.includes("yourwebsite.com")) {
            customOgImage = resolvePublicOgUrl(ogImagePath, supabaseUrl);
          } else {
            // Fallback to generic dua OG image
            customOgImage = `${SITE_ORIGIN}/og-dua.png`;
          }
          
          bodyContent = `
            <section>
                <h2>${escapeHtml(dua.title_bn)}</h2>
                <p><strong>Reference:</strong> ${escapeHtml(dua.reference)}</p>
                <p dir="rtl" lang="ar" class="arabic">${escapeHtml(dua.arabic)}</p>
                <p><strong>Pronunciation:</strong> ${escapeHtml(dua.pronunciation.bn)}</p>
                <p><strong>Meaning:</strong> ${escapeHtml(dua.translation_bn)}</p>
                <p>Visit <a href="${SITE_ORIGIN}/dua/${dua.slug}">Noor App</a> to read more authentic duas.</p>
            </section>`;
        } else {
          // Legacy duas that are only in the database (no entry in duas.json)
          const { data: row } = await supabase
            .from("admin_content")
            .select("title, content, content_arabic, content_pronunciation, reference, image_url, og_image_data, seo")
            .ilike("content_type", "dua")
            .eq("slug", slug)
            .maybeSingle();

          if (row) {
            seo = {
              title: row.title,
              description: `${row.title}${row.reference ? ` (${row.reference})` : ""} — আরবি, উচ্চারণ ও বাংলা অর্থসহ পড়ুন Noor App-এ।`,
            };
            
            // Try to get OG image from database
            const dbImageUrl = row.image_url || row?.seo?.og_image || row?.seo?.og_image_url || row.og_image_data?.og_image;
            
            if (dbImageUrl && !dbImageUrl.includes("yourwebsite.com")) {
              customOgImage = resolvePublicOgUrl(dbImageUrl, supabaseUrl);
            } else {
              customOgImage = `${SITE_ORIGIN}/og-dua.png`;
            }

            bodyContent = `
            <section>
                <h2>${escapeHtml(row.title ?? "")}</h2>
                ${row.reference ? `<p><strong>Reference:</strong> ${escapeHtml(row.reference)}</p>` : ""}
                ${row.content_arabic ? `<p dir="rtl" lang="ar" class="arabic">${escapeHtml(row.content_arabic)}</p>` : ""}
                ${row.content_pronunciation ? `<p><strong>Pronunciation:</strong> ${escapeHtml(row.content_pronunciation)}</p>` : ""}
                ${row.content ? `<p><strong>Meaning:</strong> ${escapeHtml(row.content)}</p>` : ""}
                <p>Visit <a href="${SITE_ORIGIN}/dua/${slug}">Noor App</a> to read more authentic duas.</p>
            </section>`;
          }
        }

        // customOgImage is already set above from DB or storage path
        if (!customOgImage || customOgImage.includes("yourwebsite.com")) {
          customOgImage = `${SITE_ORIGIN}/og-dua.png`;
        }
      } catch (err) {
        console.error("Error fetching dua for prerender:", err);
      }
    } else if (chapterMatch) {
      const [, lang, chapterNum] = chapterMatch;
      seo = getChapterSeo(lang, chapterNum);

      // Fetch actual hadith content
      const content = await fetchHadithContent(supabase, parseInt(chapterNum), lang);
      bodyContent = `
        <section>
            <h2>Sahih Bukhari – Chapter ${chapterNum}</h2>
            <p>${escapeHtml(seo.description)}</p>
            ${content}
            <nav aria-label="Chapter Navigation">
                ${parseInt(chapterNum) > 1 ? `<a href="${SITE_ORIGIN}/hadith/sahih-bukhari/${lang}/chapter-${parseInt(chapterNum) - 1}">← Previous Chapter</a>` : ""}
                <a href="${SITE_ORIGIN}/hadith/sahih-bukhari/${lang}">All Chapters</a>
                ${parseInt(chapterNum) < 97 ? `<a href="${SITE_ORIGIN}/hadith/sahih-bukhari/${lang}/chapter-${parseInt(chapterNum) + 1}">Next Chapter →</a>` : ""}
            </nav>
        </section>`;

      // Article JSON-LD
      jsonLd = JSON.stringify({
        "@context": "https://schema.org",
        "@type": "Article",
        headline: seo.title,
        author: { "@type": "Person", name: "Imam Muhammad ibn Ismail al-Bukhari" },
        publisher: { "@type": "Organization", name: "Noor Islamic App", url: SITE_ORIGIN },
        url: `${SITE_ORIGIN}${path}`,
        image: `${SITE_ORIGIN}/og-bukhari.png`,
        description: seo.description,
      });
    } else if (langRootMatch) {
      const lang = langRootMatch[1];
      // Fetch chapter list
      const chapterListHtml = await fetchChapterList(supabase, lang);
      bodyContent = `
        <section>
            <h2>Sahih Bukhari — ${lang.charAt(0).toUpperCase() + lang.slice(1)} Translation</h2>
            <p>${escapeHtml(seo?.description || "Browse all 97 chapters of Sahih Bukhari.")}</p>
            ${chapterListHtml}
        </section>`;
    } else if (path === "/hadith/sahih-bukhari") {
      bodyContent = `
        <section>
            <h2>Sahih al-Bukhari — The Most Authentic Hadith Collection</h2>
            <p>Sahih al-Bukhari is the most authentic collection of Hadith in Sunni Islam, compiled by Imam Muhammad ibn Ismail al-Bukhari (810–870 CE). It is organized by books and chapters; numbering can vary by edition.</p>
            <h3>Read in Your Language</h3>
            <ul>
                <li><a href="${SITE_ORIGIN}/hadith/sahih-bukhari/bangla">Sahih Bukhari Bangla – সহীহ বুখারী বাংলা</a></li>
                <li><a href="${SITE_ORIGIN}/hadith/sahih-bukhari/english">Sahih Bukhari English</a></li>
                <li><a href="${SITE_ORIGIN}/hadith/sahih-bukhari/urdu">Sahih Bukhari Urdu – صحیح بخاری اردو</a></li>
            </ul>
        </section>`;
    } else if (path === "/hadith") {
      bodyContent = `
        <section>
            <h2>Authentic Hadith Collections</h2>
            <p>Browse major Hadith collections with Arabic text and translations.</p>
            <ul>
                <li><a href="${SITE_ORIGIN}/hadith/sahih-bukhari">Sahih al-Bukhari</a></li>
                <li><a href="${SITE_ORIGIN}/hadith/muslim">Sahih Muslim</a></li>
                <li><a href="${SITE_ORIGIN}/hadith/tirmidhi">Jami at-Tirmidhi</a></li>
                <li><a href="${SITE_ORIGIN}/hadith/abu-dawud">Sunan Abu Dawud</a></li>
            </ul>
        </section>`;
    } else if (path === "/baby-names") {
      bodyContent = `
        <section>
            <h2>Muslim Baby Names — ইসলামিক শিশুর নাম | Noor App</h2>
            <p>${escapeHtml(seo?.description || "")}</p>
            <h3>Popular Muslim Boy Names — ছেলেদের ইসলামিক নাম</h3>
            <ul>
                <li><strong>Muhammad (মুহাম্মদ)</strong> — مُحَمَّد — প্রশংসিত, প্রশংসনীয়</li>
                <li><strong>Ahmad (আহমাদ)</strong> — أَحْمَد — সর্বাধিক প্রশংসনীয়</li>
                <li><strong>Ali (আলী)</strong> — عَلِي — উচ্চ, মহান, সম্মানিত</li>
                <li><strong>Omar (ওমর)</strong> — عُمَر — সমৃদ্ধ, দীর্ঘজীবী</li>
                <li><strong>Yusuf (ইউসুফ)</strong> — يُوسُف — আল্লাহ বৃদ্ধি করেন</li>
                <li><strong>Ibrahim (ইব্রাহিম)</strong> — إِبْرَاهِيم — জাতির পিতা</li>
                <li><strong>Hassan (হাসান)</strong> — حَسَن — সুন্দর, চমৎকার</li>
                <li><strong>Hamza (হামযা)</strong> — حَمْزَة — শক্তিশালী, দৃঢ়</li>
                <li><strong>Khalid (খালিদ)</strong> — خَالِد — চিরস্থায়ী, অমর</li>
                <li><strong>Rayyan (রাইয়ান)</strong> — رَيَّان — জান্নাতের দরজা, সতেজ</li>
            </ul>
            <h3>Popular Muslim Girl Names — মেয়েদের ইসলামিক নাম</h3>
            <ul>
                <li><strong>Fatima (ফাতিমা)</strong> — فَاطِمَة — যে বিরত থাকে</li>
                <li><strong>Aisha (আয়েশা)</strong> — عَائِشَة — জীবন্ত, সমৃদ্ধ</li>
                <li><strong>Khadija (খাদিজা)</strong> — خَدِيجَة — অকালজাত শিশু</li>
                <li><strong>Maryam (মারিয়াম)</strong> — مَرْيَم — প্রিয়, কাঙ্ক্ষিত</li>
                <li><strong>Zainab (জয়নব)</strong> — زَيْنَب — সুগন্ধি ফুল</li>
                <li><strong>Layla (লাইলা)</strong> — لَيْلَى — রাত, রাতের সৌন্দর্য</li>
                <li><strong>Amina (আমিনা)</strong> — أَمِينَة — বিশ্বস্ত, নিরাপদ</li>
                <li><strong>Sara (সারা)</strong> — سَارَة — আনন্দ, সুখ</li>
                <li><strong>Noor (নূর)</strong> — نُور — আলো, জ্যোতি</li>
                <li><strong>Hafsa (হাফসা)</strong> — حَفْصَة — সিংহশাবক</li>
            </ul>
            <p>Browse 40+ beautiful Islamic baby names with Arabic script, Bengali meaning & pronunciation on <a href="${SITE_ORIGIN}/baby-names">Noor App</a>.</p>
        </section>`;
    } else if (path === "/names") {
      // /names is a duplicate of /baby-names — 301 redirect
      return new Response(null, {
        status: 301,
        headers: {
          ...corsHeaders,
          "Location": `${SITE_ORIGIN}/baby-names`,
        },
      });
    } else if (path === "/prayer-times") {
      bodyContent = `
        <section>
            <h2>Prayer Times — নামাজের সময়সূচী</h2>
            <p>${escapeHtml(seo?.description || "")}</p>
            <p>Get accurate Salah times based on your location. Noor shows Fajr, Dhuhr, Asr, Maghrib, and Isha prayer times with Athan alerts and countdown timer.</p>
            <h3>Daily Prayer Schedule</h3>
            <ul>
                <li><strong>Fajr (ফজর)</strong> — Dawn prayer before sunrise</li>
                <li><strong>Dhuhr (যোহর)</strong> — Midday prayer after the sun passes zenith</li>
                <li><strong>Asr (আসর)</strong> — Afternoon prayer</li>
                <li><strong>Maghrib (মাগরিব)</strong> — Sunset prayer</li>
                <li><strong>Isha (এশা)</strong> — Night prayer</li>
            </ul>
        </section>`;
    } else if (path === "/dua") {
      bodyContent = `
        <section>
            <h2>Islamic Duas & Supplications — দোয়া সমূহ</h2>
            <p>${escapeHtml(seo?.description || "")}</p>
            <p>Browse authentic Islamic duas from Quran and Hadith with Arabic text, Bengali translation, and audio recitation.</p>
            <h3>Popular Duas</h3>
            <ul>
                <li><strong>দোয়া কুনূত</strong> — বিতর নামাজে পঠিত বিশেষ দোয়া</li>
                <li><strong>আয়াতুল কুরসি</strong> — সর্বশ্রেষ্ঠ আয়াত, সুরক্ষার দোয়া</li>
                <li><strong>সকালের দোয়া</strong> — সকালে পাঠযোগ্য মাসনূন দোয়া</li>
                <li><strong>ইফতারের দোয়া</strong> — রোজা ভাঙার সময়ের দোয়া</li>
                <li><strong>সেহরির দোয়া</strong> — রোজা রাখার নিয়ত</li>
            </ul>
        </section>`;
    } else if (path === "/quran") {
      bodyContent = `
        <section>
            <h2>Quran Reader — পবিত্র কুরআন</h2>
            <p>${escapeHtml(seo?.description || "")}</p>
            <p>Read the Holy Quran online with Arabic text, Bengali translation, and audio recitation. Browse all 114 Surahs with Tafseer.</p>
            <h3>Browse Surahs</h3>
            <ul>
                <li><strong>সূরা আল-ফাতিহা</strong> — The Opening (7 আয়াত)</li>
                <li><strong>সূরা আল-বাকারা</strong> — The Cow (286 আয়াত)</li>
                <li><strong>সূরা আলে ইমরান</strong> — Family of Imran (200 আয়াত)</li>
                <li><strong>সূরা ইয়াসিন</strong> — Ya-Sin (83 আয়াত)</li>
                <li><strong>সূরা আর-রাহমান</strong> — The Most Merciful (78 আয়াত)</li>
                <li><strong>সূরা আল-মুলক</strong> — The Sovereignty (30 আয়াত)</li>
            </ul>
        </section>`;
    } else if (path === "/quiz") {
      bodyContent = `
        <section>
            <h2>Daily Islamic Quiz — ইসলামিক কুইজ</h2>
            <p>${escapeHtml(seo?.description || "")}</p>
            <p>Test your Islamic knowledge daily with multiple-choice questions on Quran, Hadith, Islamic history, and general Islamic teachings.</p>
            <h3>Quiz Features</h3>
            <ul>
                <li>প্রতিদিন ৫টি নতুন প্রশ্ন</li>
                <li>স্কোর ও streak ট্র্যাকিং</li>
                <li>ব্যাজ ও সার্টিফিকেট অর্জন করুন</li>
                <li>কুরআন, হাদিস ও ইসলামিক ইতিহাস থেকে প্রশ্ন</li>
            </ul>
        </section>`;
    } else if (path === "/download") {
      bodyContent = `
        <section>
            <h2>Download Noor App — নূর অ্যাপ ডাউনলোড করুন</h2>
            <p>${escapeHtml(seo?.description || "")}</p>
            <p>Download the Noor Islamic App for Android. Get instant access to Quran, Hadith, Prayer Times, Duas, Qibla, Tasbih, Islamic Quiz and more — all in one beautiful app.</p>
            <h3>App Features</h3>
            <ul>
                <li>পবিত্র কুরআন — আরবি, বাংলা অনুবাদ ও অডিও তিলাওয়াত</li>
                <li>সহীহ হাদিস — বুখারী, মুসলিম, তিরমিযী ও আবু দাউদ</li>
                <li>নামাজের সময়সূচী — আজান অ্যালার্ট সহ</li>
                <li>দৈনিক ইসলামিক কুইজ</li>
                <li>কিবলা ফাইন্ডার ও ডিজিটাল তাসবীহ</li>
            </ul>
        </section>`;
    } else if (path === "/about") {
      bodyContent = `
        <section>
            <h2>About NOOR — আমাদের সম্পর্কে</h2>
            <p>${escapeHtml(seo?.description || "")}</p>
            <p>Noor is a free Islamic app designed for Muslims in India, Bangladesh, and around the world. Our mission is to make authentic Islamic knowledge accessible to everyone through modern technology.</p>
            <p>Noor provides Quran reading with translations, authentic Hadith collections, daily Duas, accurate Prayer Times, Qibla direction, Islamic calendar, and educational quizzes — all completely free.</p>
        </section>`;
    } else if (path === "/contact") {
      bodyContent = `
        <section>
            <h2>Contact Us — যোগাযোগ করুন</h2>
            <p>${escapeHtml(seo?.description || "")}</p>
            <p>Have questions, suggestions, or feedback? We'd love to hear from you. Contact the Noor team for support, bug reports, or collaboration opportunities.</p>
        </section>`;
    } else if (path === "/99-names") {
      bodyContent = `
        <section>
            <h2>99 Names of Allah — আল্লাহর ৯৯ নাম (আসমাউল হুসনা)</h2>
            <p>${escapeHtml(seo?.description || "")}</p>
            <p>Learn the 99 beautiful names of Allah (Asma ul Husna) with Arabic text, Bengali meaning, and transliteration.</p>
            <h3>Some Beautiful Names</h3>
            <ul>
                <li><strong>আর-রাহমান (الرَّحْمَن)</strong> — পরম দয়ালু</li>
                <li><strong>আর-রাহীম (الرَّحِيم)</strong> — অতি দয়ালু</li>
                <li><strong>আল-মালিক (الْمَلِك)</strong> — সর্বময় কর্তা</li>
                <li><strong>আল-কুদ্দূস (الْقُدُّوس)</strong> — পবিত্রতম</li>
                <li><strong>আস-সালাম (السَّلَام)</strong> — শান্তিদাতা</li>
            </ul>
        </section>`;
    } else if (path === "/tasbih") {
      bodyContent = `
        <section>
            <h2>Digital Tasbih — ডিজিটাল তাসবীহ কাউন্টার</h2>
            <p>${escapeHtml(seo?.description || "")}</p>
            <p>Use Noor's beautiful 3D Tasbih counter for dhikr. Count SubhanAllah, Alhamdulillah, Allahu Akbar and other adhkar with haptic feedback and progress tracking.</p>
        </section>`;
    } else if (path === "/qibla") {
      bodyContent = `
        <section>
            <h2>Qibla Finder — কিবলার দিক নির্ণয়</h2>
            <p>${escapeHtml(seo?.description || "")}</p>
            <p>Find the accurate Qibla direction from your current location using your device compass. Point towards the Kaaba in Makkah for Salah with confidence.</p>
        </section>`;
    } else if (path === "/calendar") {
      bodyContent = `
        <section>
            <h2>Islamic Calendar — হিজরি ক্যালেন্ডার</h2>
            <p>${escapeHtml(seo?.description || "")}</p>
            <p>View the Hijri calendar with important Islamic dates including Ramadan, Eid ul-Fitr, Eid ul-Adha, Laylat al-Qadr, and other significant events.</p>
        </section>`;
    } else if (path === "/prayer-guide") {
      bodyContent = `
        <section>
            <h2>Prayer Guide — নামাজ শিক্ষা</h2>
            <p>${escapeHtml(seo?.description || "")}</p>
            <p>Learn how to pray Salah step-by-step with illustrations. Complete guide covering Wudu, Fajr, Dhuhr, Asr, Maghrib, Isha, Jummah, Eid, Janaza, Tahajjud, and Laylatul Qadr prayers.</p>
        </section>`;
    } else if (path === "/islamic-app") {
      bodyContent = `
        <section>
            <h2>Islamic App — Quran, Hadith, Dua & Prayer Times</h2>
            <p>${escapeHtml(seo?.description || "")}</p>
            <p>Noor is a free Islamic learning app for Bengali-speaking Muslims. Read the Quran with Bengali translation, browse Hadith collections, find prayer times for your city, learn Duas, and take daily Islamic quizzes.</p>
        </section>`;
    } else if (path === "/privacy-policy") {
      bodyContent = `
        <section>
            <h2>Privacy Policy — গোপনীয়তা নীতি</h2>
            <p>${escapeHtml(seo?.description || "")}</p>
            <p>Noor respects your privacy. This policy describes how we collect, use, and protect your personal information when you use our Islamic app.</p>
        </section>`;
    } else if (path === "/terms") {
      bodyContent = `
        <section>
            <h2>Terms of Service — ব্যবহারের শর্তাবলী</h2>
            <p>${escapeHtml(seo?.description || "")}</p>
            <p>By using Noor App, you agree to the following terms and conditions governing the use of our Islamic application and services.</p>
        </section>`;
    } else if (path === "/sitemap") {
      bodyContent = `
        <section>
            <h2>Sitemap — সাইটম্যাপ</h2>
            <p>Browse all pages on Noor Islamic App.</p>
            <ul>
                <li><a href="${SITE_ORIGIN}/">Home</a></li>
                <li><a href="${SITE_ORIGIN}/quran">Quran</a></li>
                <li><a href="${SITE_ORIGIN}/hadith">Hadith</a></li>
                <li><a href="${SITE_ORIGIN}/prayer-times">Prayer Times</a></li>
                <li><a href="${SITE_ORIGIN}/dua">Duas</a></li>
                <li><a href="${SITE_ORIGIN}/quiz">Islamic Quiz</a></li>
                <li><a href="${SITE_ORIGIN}/tasbih">Tasbih</a></li>
                <li><a href="${SITE_ORIGIN}/qibla">Qibla</a></li>
                <li><a href="${SITE_ORIGIN}/99-names">99 Names of Allah</a></li>
                <li><a href="${SITE_ORIGIN}/baby-names">Baby Names</a></li>
                <li><a href="${SITE_ORIGIN}/calendar">Islamic Calendar</a></li>
                <li><a href="${SITE_ORIGIN}/prayer-guide">Prayer Guide</a></li>
                <li><a href="${SITE_ORIGIN}/download">Download App</a></li>
                <li><a href="${SITE_ORIGIN}/about">About</a></li>
                <li><a href="${SITE_ORIGIN}/contact">Contact</a></li>
            </ul>
        </section>`;
    } else {
      // Generic page — provide a meaningful body
      bodyContent = `
        <section>
            <h2>${escapeHtml(seo?.title || "Noor Islamic App")}</h2>
            <p>${escapeHtml(seo?.description || "Noor — Free Islamic app for Quran, Hadith, Prayer Times & Dua.")}</p>
            <p>Visit <a href="${SITE_ORIGIN}${path}">this page</a> on Noor App for the full experience.</p>
        </section>`;
    }

        if (!seo) {
      seo = SEO_DEFAULTS["/"];
    }
    const ogImage = getOgImage(path, customOgImage);
    console.log(`Prerender path: ${path}, customOgImage: ${customOgImage}, final ogImage: ${ogImage}`);
    const html = buildFullHtml(path, seo.title, seo.description, ogImage, bodyContent, jsonLd);

    return new Response(html, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "public, max-age=3600, s-maxage=86400",
        "X-Robots-Tag": "index,follow",
      },
    });
  } catch (err) {
    console.error("Prerender error:", err);
    // On error, return valid HTML with content (NEVER redirect — causes GSC "Redirect error")
    const url = new URL(req.url);
    const errorPath = url.searchParams.get("path") || "/";
    const fallbackSeo = SEO_DEFAULTS[errorPath] || SEO_DEFAULTS["/"];
    const fallbackHtml = buildFullHtml(
      errorPath,
      fallbackSeo.title,
      fallbackSeo.description,
      `${SITE_ORIGIN}/og-image.png`,
      `<section>
        <p>${escapeHtml(fallbackSeo.description)}</p>
        <p>Visit <a href="${SITE_ORIGIN}${errorPath}">${SITE_ORIGIN}${errorPath}</a> for the full experience.</p>
      </section>`,
    );
    return new Response(fallbackHtml, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "public, max-age=300",
        "X-Robots-Tag": "index,follow",
      },
    });
  }
});
