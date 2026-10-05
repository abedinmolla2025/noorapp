const ORIGIN = "https://noorapp.in";

import fs from "node:fs";
import path from "node:path";
import { assignBabyNameSlugs, isValidBabyNameSlugSegment } from "../src/lib/babyNameSlug.js";
import { assignAllahNameSlugs, isValidAllahNameSlugSegment } from "../src/lib/allahNameSlug.js";

// 99 Names of Allah detail rollout: verification-gated sitemap.
// Only slugs listed in public/data/allah-name-sitemap-allowlist.json are emitted.
// Missing file => empty list => no Allah-name URLs (fail-safe).
function getAllahNameAllowlist() {
  const candidates = [
    path.join(process.cwd(), "public", "data", "allah-name-sitemap-allowlist.json"),
    path.join(process.cwd(), "dist", "data", "allah-name-sitemap-allowlist.json"),
    path.join("/var/task", "dist", "data", "allah-name-sitemap-allowlist.json"),
  ];
  for (const file of candidates) {
    try {
      if (fs.existsSync(file)) {
        const doc = JSON.parse(fs.readFileSync(file, "utf8"));
        if (Array.isArray(doc)) return doc.filter((s) => isValidAllahNameSlugSegment(s));
      }
    } catch { /* try next candidate */ }
  }
  return [];
}

function getAllahNamesData() {
  const candidates = [
    path.join(process.cwd(), "public", "data", "names-of-allah.json"),
    path.join(process.cwd(), "dist", "data", "names-of-allah.json"),
    path.join("/var/task", "dist", "data", "names-of-allah.json"),
  ];
  for (const file of candidates) {
    try {
      if (fs.existsSync(file)) {
        const doc = JSON.parse(fs.readFileSync(file, "utf8"));
        if (Array.isArray(doc)) return doc;
      }
    } catch { /* try next candidate */ }
  }
  return [];
}

async function getVerifiedAllahNameRoutes() {
  const allowlist = getAllahNameAllowlist();
  const names = getAllahNamesData();
  if (allowlist.length === 0 || names.length === 0) return [];
  const slugMap = assignAllahNameSlugs(names.map((n) => ({ id: n.id, transliteration: n.transliteration })));
  const seen = new Set();
  const routes = [];
  for (const n of names) {
    const slug = slugMap.get(n.id);
    if (slug && allowlist.includes(slug) && !seen.has(slug)) {
      seen.add(slug);
      routes.push(`/99-names/${encodeURIComponent(slug)}`);
    }
  }
  // Safety: never emit more than the allowlist size.
  return routes.filter((r) => allowlist.includes(decodeURIComponent(r.split("/")[2])));
}

// Baby-name detail rollout (2026-10-05): verification-gated sitemap.
// Only slugs listed in public/data/baby-name-sitemap-allowlist.json are emitted.
// Missing file => empty list => no name URLs (fail-safe). This gate is the
// rollout control: the representative batch first, mass rollout only after
// verification passes.
function getBabyNameAllowlist() {
  const candidates = [
    path.join(process.cwd(), "public", "data", "baby-name-sitemap-allowlist.json"),
    path.join(process.cwd(), "dist", "data", "baby-name-sitemap-allowlist.json"),
    path.join("/var/task", "dist", "data", "baby-name-sitemap-allowlist.json"),
  ];
  for (const file of candidates) {
    try {
      if (fs.existsSync(file)) {
        const doc = JSON.parse(fs.readFileSync(file, "utf8"));
        if (Array.isArray(doc)) return doc.filter((s) => isValidBabyNameSlugSegment(s));
      }
    } catch { /* try next candidate */ }
  }
  return [];
}

async function getVerifiedNameRoutes() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "https://llicfiepatzgllmjhzbw.supabase.co";
  const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxsaWNmaWVwYXR6Z2xsbWpoemJ3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg0ODA4MDksImV4cCI6MjA4NDA1NjgwOX0.T7xnXRSM2jx92gVH8Of1dePj609C7WKKflv2I_VZpy0";
  const allowlist = getBabyNameAllowlist();
  if (!supabaseKey || allowlist.length === 0) return [];
  // Paginated: PostgREST clamps limit to 1000 rows.
  const rows = [];
  try {
    for (let offset = 0; ; offset += 1000) {
      const query = new URLSearchParams({
        select: "id,title",
        content_type: "eq.name",
        is_published: "eq.true",
        order: "created_at.asc",
        limit: "1000",
        offset: String(offset),
      });
      const response = await fetch(`${supabaseUrl.replace(/\/$/, "")}/rest/v1/admin_content?${query}`, {
        headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` },
      });
      if (!response.ok) return [];
      const batch = await response.json();
      rows.push(...(batch || []));
      if (!batch || batch.length < 1000) break;
    }
    const slugMap = assignBabyNameSlugs((rows || []).map((r) => ({ id: String(r.id), title: r.title })));
    const idToSlug = new Map([...slugMap.entries()].map(([id, slug]) => [id, slug]));
    const seen = new Set();
    const routes = [];
    for (const row of rows || []) {
      const slug = idToSlug.get(String(row.id));
      if (slug && allowlist.includes(slug) && !seen.has(slug)) {
        seen.add(slug);
        routes.push(`/baby-names/${encodeURIComponent(slug)}`);
      }
    }
    // Safety: never emit more than the allowlist size.
    return routes.filter((r) => allowlist.includes(decodeURIComponent(r.split("/")[2])));
  } catch {
    return [];
  }
}

// Quiz duplicate IDs (2026-09-28 forensic consolidation): these URLs stay live
// but canonicalize to their primary, so they are excluded from the sitemap.
// Source: src/data/quiz-duplicate-canonicals.json (copied to dist/data at build).
// Missing file => empty set => nothing excluded (fail-safe).
function getQuizDuplicateIds() {
  const candidates = [
    path.join(process.cwd(), "public", "data", "quiz-canonicals.json"),
    path.join(process.cwd(), "dist", "data", "quiz-canonicals.json"),
    path.join("/var/task", "dist", "data", "quiz-canonicals.json"),
  ];
  for (const file of candidates) {
    try {
      if (fs.existsSync(file)) {
        const doc = JSON.parse(fs.readFileSync(file, "utf8"));
        if (doc && typeof doc.map === "object" && !Array.isArray(doc.map)) {
          return new Set(Object.keys(doc.map));
        }
      }
    } catch { /* try next candidate */ }
  }
  return new Set();
}

function xmlEscape(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

const BASE_ROUTES = [
  "/", "/quran", "/hadith", "/hadith/sahih-bukhari",
  "/hadith/sahih-bukhari/bangla", "/hadith/sahih-bukhari/english", "/hadith/sahih-bukhari/urdu",
  "/dua", "/prayer-times", "/prayer-guide", "/qibla", "/tasbih", "/99-names", "/baby-names",
  "/calendar", "/quiz", "/stories", "/about", "/contact", "/sources",
  "/privacy-policy", "/terms", "/download", "/islamic-app",
];

// All story slugs extracted from the database/assets
const STORY_SLUGS = [
  "abdullah-ibn-abbas-knowledge-islam", "abu-bakr-siddiq-companion-cave-islam",
  "abu-hurairah-father-of-kittens",
  "abu-ubaidah-ibn-al-islam", "ali-ibn-abi-talib-bravery-islam",
  "ashura-muharram-musa-victory", "battle-badr-preparation-supplication-islam",
  "bilal-ibn-rabah-ra-islam", "bilal-ibn-rabah-steadfast-islam",
  "devotion-trial-jurayj-lesson-islam", "eid-ul-adha-sacrifice-ibrahim",
  "eid-ul-fitr-reward-ramadan", "farewell-pilgrimage-perfection-faith-islam",
  "first-envoy-mus-ab-islam", "ghadir-khumm-declaration-leadership",
  "grand-opening-conquest-makkah-islam", "hijri-new-year-spirit-migration",
  "isra-miraj-night-journey", "khadija-bint-khuwaylid-support-islam",
  "lailatul-qadr-night-of-power", "laylat-al-miraj-divine-journey",
  "legacy-servant-anas-ibn-islam", "manifest-victory-patience-divine-islam",
  "mawlid-al-nabi-birth-mercy", "people-ditch-steadfast-faith-islam",
  "people-of-cave-story-islam", "prophet-adam-story-islam",
  "prophet-ayyub-story-islam", "prophet-dawud-story-islam",
  "prophet-hud-story-islam", "prophet-ibrahim-fire-story-islam",
  "prophet-ibrahim-story-islam", "prophet-isa-birth-story",
  "prophet-isa-miraculous-birth", "prophet-isa-story-islam",
  "prophet-lut-story", "prophet-lut-story-islam",
  "prophet-muhammad-conquest-makkah-mercy",
  "prophet-muhammad-crying-palm-tree",
  "prophet-muhammad-farewell-sermon", "prophet-muhammad-first-revelation",
  "prophet-muhammad-journey-taif",
  "prophet-muhammad-miracle-food-trench",
  "prophet-muhammad-night-hijrah-ali",
  "prophet-muhammad-spider-web-hijrah", "prophet-muhammad-splitting-moon",
  "prophet-muhammad-treaty-hudaybiyyah", "prophet-musa-khidr-story-islam",
  "prophet-musa-pharaoh-story", "prophet-musa-story-islam",
  "prophet-nuh-ark-story-islam", "prophet-nuh-story-islam",
  "prophet-salih-story-islam", "prophet-shuayb-story-islam",
  "prophet-sulayman-ant-story-islam", "prophet-sulayman-story-islam",
  "prophet-yunus-story-islam", "prophet-yunus-whale-story",
  "prophet-yunus-whale-story-detailed", "prophet-yusuf-full-story",
  "prophet-yusuf-story-islam", "prophet-zakariyya-story-islam",
  "radiance-innocence-incident-ifk-islam", "sacrifice-youth-ali-ibn-islam",
  "salman-farsi-story-islam", "scholar-ummah-life-adab-islam",
  "second-two-abu-bakr-islam",   "shab-e-barat-night-of-forgiveness",
  "transformation-direction-divine-sovereignty-islam",
  "triumph-truth-repentance-ka-islam", "umar-accepting-islam-story",
  "umar-ibn-khattab-story-islam",
  "well-rumah-eternal-charity-islam", "yawm-al-arafah-day-of-forgiveness"
];

async function getVerifiedQuizRoutes() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "https://llicfiepatzgllmjhzbw.supabase.co";
  // This is the public anon key already used by the browser app and prerenderer;
  // RLS still limits this request to rows public users may read.
  const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxsaWNmaWVwYXR6Z2xsbWpoemJ3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg0ODA4MDksImV4cCI6MjA4NDA1NjgwOX0.T7xnXRSM2jx92gVH8Of1dePj609C7WKKflv2I_VZpy0";
  if (!supabaseUrl || !supabaseKey) return [];
  const query = new URLSearchParams({
    select: "id",
    is_active: "eq.true",
    verification_status: "in.(verified,verified_primary,verified_secondary)",
    order: "created_at.asc",
    limit: "500",
  });
  try {
    const response = await fetch(`${supabaseUrl.replace(/\/$/, "")}/rest/v1/quiz_questions?${query}`, {
      headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` },
    });
    if (!response.ok) return [];
    const rows = await response.json();
    const duplicateIds = getQuizDuplicateIds();
    return rows
      .filter((row) => row.id && !duplicateIds.has(row.id))
      .map((row) => `/quiz/${encodeURIComponent(row.id)}`);
  } catch {
    return [];
  }
}

async function getPublishedDuaRoutes() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "https://llicfiepatzgllmjhzbw.supabase.co";
  const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxsaWNmaWVwYXR6Z2xsbWpoemJ3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg0ODA4MDksImV4cCI6MjA4NDA1NjgwOX0.T7xnXRSM2jx92gVH8Of1dePj609C7WKKflv2I_VZpy0";
  if (!supabaseUrl || !supabaseKey) return [];

  const query = new URLSearchParams({
    select: "slug",
    content_type: "in.(dua,Dua)",
    is_published: "eq.true",
    status: "eq.published",
    slug: "not.is.null",
    order: "created_at.asc",
    limit: "5000",
  });
  try {
    const response = await fetch(`${supabaseUrl.replace(/\/$/, "")}/rest/v1/admin_content?${query}`, {
      headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` },
    });
    if (!response.ok) return [];
    const rows = await response.json();
    const uuidOnly = /^[0-9a-f]{8}-[0-9a-f-]{27,36}$/iu;
    const validSlug = (value) => {
      const slug = typeof value === "string" ? value.trim() : "";
      return slug && !uuidOnly.test(slug) && /^[\p{L}\p{M}\p{N}][\p{L}\p{M}\p{N}_-]*$/u.test(slug) ? slug : null;
    };
    return rows.flatMap((row) => {
      const slug = validSlug(row?.slug);
      return slug ? [`/dua/${encodeURIComponent(slug)}`] : [];
    });
  } catch {
    return [];
  }
}

export default async function handler(req, res) {
  const routes = [...BASE_ROUTES];

  // Include only published Du'a rows with valid canonical slugs.
  routes.push(...await getPublishedDuaRoutes());
  
  // Add stories
  STORY_SLUGS.forEach(slug => routes.push(`/stories/${slug}`));
  
  // Add Quran surahs
  for (let i = 1; i <= 114; i++) routes.push(`/quran/${i}`);
  
  // Add Hadith chapters
  for (const lang of ["bangla", "english", "urdu"]) {
    for (let i = 1; i <= 97; i++) routes.push(`/hadith/sahih-bukhari/${lang}/chapter-${i}`);
  }

  // Only verified active quiz records are included in the indexable sitemap.
  routes.push(...await getVerifiedQuizRoutes());

  // Baby-name detail pages: verification-gated allowlist only (2026-10-05).
  routes.push(...await getVerifiedNameRoutes());

  // 99 Names of Allah detail pages: verification-gated allowlist only.
  routes.push(...await getVerifiedAllahNameRoutes());

  const seenLocs = new Set();
  const uniqueRoutes = routes.filter((route) => {
    const loc = `${ORIGIN}${route}`;
    if (seenLocs.has(loc)) return false;
    seenLocs.add(loc);
    return true;
  });
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${uniqueRoutes.map((route) => `  <url><loc>${xmlEscape(`${ORIGIN}${route}`)}</loc><changefreq>weekly</changefreq><priority>${route === "/" ? "1.0" : "0.8"}</priority></url>`).join("\n")}\n</urlset>`;
  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  // Keep sitemap responses fresh after URL, canonical, or route updates.
  res.setHeader("Cache-Control", "public, max-age=0, s-maxage=300, stale-while-revalidate=300");
  return res.status(200).send(body);
}
