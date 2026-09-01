import fs from "fs";
import path from "path";

const ORIGIN = "https://noorapp.in";
const CACHE = "public, s-maxage=86400, stale-while-revalidate=3600, max-age=60";

const esc = (value = "") => String(value)
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&#039;");

function template() {
  const candidates = [
    path.join(process.cwd(), "dist", "app.html"),
    path.join("/var/task", "dist", "app.html"),
  ];
  for (const file of candidates) {
    try {
      if (fs.existsSync(file)) return fs.readFileSync(file, "utf8");
    } catch (error) {
      console.error("[SSR] template read failed", error);
    }
  }
  return "<!doctype html><html lang=\"en\"><head><meta charset=\"UTF-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>Noor</title><meta name=\"description\" content=\"\"><link rel=\"canonical\" href=\"https://noorapp.in/\"><meta property=\"og:title\" content=\"Noor\"><meta property=\"og:description\" content=\"\"><meta property=\"og:url\" content=\"https://noorapp.in/\"><meta name=\"twitter:title\" content=\"Noor\"><meta name=\"twitter:description\" content=\"\"></head><body><div id=\"root\"></div></body></html>";
}

function structuredData({ title, description, canonical }) {
  const graph = [
    {
      "@type": "WebSite",
      "@id": `${ORIGIN}/#website`,
      "url": ORIGIN,
      "name": "Noor Islamic App",
      "description": description,
      "inLanguage": ["en", "bn"],
      "publisher": { "@id": `${ORIGIN}/#organization` }
    },
    {
      "@type": "Organization",
      "@id": `${ORIGIN}/#organization`,
      "url": ORIGIN,
      "name": "Noor Islamic App",
      "description": "Free Quran, Hadith, Dua, prayer times and Islamic learning tools."
    }
  ];
  return `<script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@graph": graph }).replace(/</g, "\\u003c")}</script>`;
}

function inject(html, { title, description, canonical, body }) {
  const tags = [
    [structuredData({ title, description, canonical }), /<script\s+type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/i],
    [`<title>${esc(title)}</title>`, /<title[^>]*>[\s\S]*?<\/title>/i],
    [`<meta name=\"description\" content=\"${esc(description)}\" />`, /<meta\s+name=["']description["'][^>]*>/i],
    [`<link rel=\"canonical\" href=\"${esc(canonical)}\" />`, /<link\s+rel=["']canonical["'][^>]*>/i],
    [`<meta property=\"og:title\" content=\"${esc(title)}\" />`, /<meta\s+property=["']og:title["'][^>]*>/i],
    [`<meta property=\"og:description\" content=\"${esc(description)}\" />`, /<meta\s+property=["']og:description["'][^>]*>/i],
    [`<meta property=\"og:url\" content=\"${esc(canonical)}\" />`, /<meta\s+property=["']og:url["'][^>]*>/i],
    [`<meta name=\"twitter:title\" content=\"${esc(title)}\" />`, /<meta\s+name=["']twitter:title["'][^>]*>/i],
    [`<meta name=\"twitter:description\" content=\"${esc(description)}\" />`, /<meta\s+name=["']twitter:description["'][^>]*>/i],
  ];
  for (const [replacement, pattern] of tags) {
    html = pattern.test(html) ? html.replace(pattern, replacement) : html.replace("</head>", `${replacement}</head>`);
  }
  return html.replace(/<div\s+id=["']root["'][^>]*>[\s\S]*?<\/div>/i, `<div id=\"root\">${body}</div>`);
}

const page = (heading, intro, extra = "") => `<main class=\"min-h-screen bg-background p-6\"><article class=\"max-w-3xl mx-auto\"><h1 class=\"text-3xl font-bold mb-4\">${esc(heading)}</h1><p class=\"text-muted-foreground mb-6\">${esc(intro)}</p>${extra}</article></main>`;

const routePages = {
  "/": ["NOOR - Prayer Times, Quran & More", "Your Islamic Companion", page("NOOR", "Your Islamic Companion", "<nav><a href=\"/quran\">Quran</a> · <a href=\"/hadith\">Hadith</a> · <a href=\"/dua\">Dua</a> · <a href=\"/stories\">Stories</a></nav>")],
  "/hadith": ["Authentic Hadith in Bengali | Noor", "Explore authentic Hadith collections and Sahih Bukhari resources in Bengali on Noor.", page("Authentic Hadith in Bengali", "Explore authentic Hadith collections and Sahih Bukhari resources in Bengali on Noor.", "<a href=\"/hadith/sahih-bukhari\">Read Sahih Al-Bukhari</a>")],
  "/dua": ["Daily Dua in Bengali | Noor", "Read daily duas with Bengali meaning, Arabic text and practical guidance on Noor.", page("Daily Dua in Bengali", "Read daily duas with Bengali meaning, Arabic text and practical guidance on Noor.")],
  "/stories": ["Islamic Stories in Bengali | Noor", "Read meaningful Islamic and Quranic stories in Bengali with sources and lessons on Noor.", page("Islamic Stories in Bengali", "Read meaningful Islamic and Quranic stories in Bengali with sources and lessons on Noor.")],
  "/about": ["About Noor Islamic App | Noor", "Learn about Noor, its mission and free Islamic learning tools.", page("About Noor Islamic App", "Noor provides free Quran, Hadith, Dua, prayer and Islamic learning tools.")],
  "/privacy": ["Privacy Policy | Noor", "Read Noor's privacy policy and data practices.", page("Privacy Policy", "How Noor handles data and protects your privacy.")],
  "/privacy-policy": ["Privacy Policy | Noor", "Read Noor's privacy policy and data practices.", page("Privacy Policy", "How Noor handles data and protects your privacy.")],
  "/terms": ["Terms & Conditions | Noor", "Read the terms, acceptable-use guidelines and content limitations for using Noor Islamic app.", page("Terms & Conditions", "Terms and acceptable-use guidelines for Noor.")],
  "/contact": ["Contact Us | Noor", "Contact Noor support.", page("Contact Us", "We typically respond within 24-48 hours.", "<p>Email: <a href=\"mailto:support@noorapp.in\">support@noorapp.in</a></p>")],
  "/hadith/sahih-bukhari": ["Sahih Al-Bukhari | Noor", "Read Sahih Al-Bukhari in Bengali, English and Urdu.", page("Sahih Al-Bukhari", "Choose Bengali, English or Urdu to begin reading.")],
};

async function quranIndex() {
  let surahs = [];
  try {
    const response = await fetch("https://api.alquran.cloud/v1/surah", { signal: AbortSignal.timeout(8000) });
    const json = await response.json();
    if (json.code === 200 && Array.isArray(json.data)) surahs = json.data;
  } catch (error) {
    console.error("[SSR] Quran index fetch failed", error);
  }
  if (!surahs.length) surahs = Array.from({ length: 114 }, (_, i) => ({ number: i + 1, englishName: `Surah ${i + 1}`, name: "", numberOfAyahs: "" }));
  const links = surahs.map(s => `<li><a href=\"/quran/${s.number}\"><strong>${s.number}. ${esc(s.englishName)}</strong> <span dir=\"rtl\">${esc(s.name)}</span> ${s.numberOfAyahs ? `(${s.numberOfAyahs} ayahs)` : ""}</a></li>`).join("");
  return page("The Holy Quran", "Read all 114 Surahs with Arabic text and Bengali translation.", `<ol>${links}</ol>`);
}

async function surahPage(number) {
  const response = await fetch(`https://api.alquran.cloud/v1/surah/${number}/editions/quran-uthmani,bn.bengali`, { signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw new Error(`Quran API ${response.status}`);
  const json = await response.json();
  const editions = json.data;
  if (!Array.isArray(editions) || editions.length < 2) throw new Error("Invalid Quran response");
  const arabic = editions.find(e => e.edition?.language === "ar") || editions[0];
  const bengali = editions.find(e => e.edition?.language === "bn") || editions[1];
  const name = arabic.englishName;
  const arabicName = arabic.name;
  const ayahs = arabic.ayahs.map((ayah, index) => `<section><p dir=\"rtl\" lang=\"ar\">${esc(ayah.text)} ﴿${ayah.numberInSurah}﴾</p><p lang=\"bn\">${esc(bengali.ayahs[index]?.text || "")}</p></section>`).join("");
  return { title: `Surah ${name} (${arabicName}) - Read Online | Noor`, description: `Read Surah ${name} with Arabic text and Bengali translation on Noor.`, body: page(name, `${arabicName} · ${arabic.numberOfAyahs} ayahs`, ayahs) };
}

export default async function handler(req, res) {
  let route = Array.isArray(req.query?.path) ? req.query.path[0] : req.query?.path;
  if (!route) route = new URL(req.url || "/", ORIGIN).searchParams.get("path") || "/";
  try { route = decodeURIComponent(route); } catch {}
  if (!route.startsWith("/")) route = `/${route}`;
  route = route.replace(/\/{2,}/g, "/").replace(/\/$/, "") || "/";

  let title = "Noor - Islamic App";
  let description = "Read Quran, Hadith, Dua and authentic Islamic resources on Noor.";
  let body = page("Noor", description);

  try {
    if (route === "/quran") {
      title = "Noor - Islamic App for Quran, Hadith, Prayer Times & Dua";
      description = "Read the Holy Quran with Arabic text and Bengali translation on Noor.";
      body = await quranIndex();
    } else if (/^\/quran\/(?:[1-9]|[1-9]\d|1[01]\d|114)$/.test(route)) {
      ({ title, description, body } = await surahPage(Number(route.split("/")[2])));
    } else if (routePages[route]) {
      [title, description, body] = routePages[route];
    }

    const html = inject(template(), { title, description, canonical: `${ORIGIN}${route === "/" ? "/" : route}`, body });
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", CACHE);
    res.setHeader("X-Noor-SSR", "v2");
    return res.status(200).send(html);
  } catch (error) {
    console.error("[SSR] route render failed", route, error);
    const html = inject(template(), { title, description, canonical: `${ORIGIN}${route}`, body });
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=60");
    res.setHeader("X-Noor-SSR", "v2-fallback");
    return res.status(200).send(html);
  }
}
