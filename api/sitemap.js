const ORIGIN = "https://noorapp.in";

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
  "/calendar", "/quiz", "/stories", "/about", "/contact", "/sources", "/data-sources",
  "/privacy-policy", "/terms", "/download", "/islamic-app",
];

// All story slugs extracted from the database/assets
const STORY_SLUGS = [
  "abdullah-ibn-abbas-knowledge-islam", "abu-bakr-siddiq-companion-cave-islam",
  "abu-dharr-al-ghifari-truth-islam", "abu-hurairah-father-of-kittens",
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
  "prophet-ismail-story-islam", "prophet-lut-story",
  "prophet-lut-story-islam", "prophet-muhammad-conquest-makkah-mercy",
  "prophet-muhammad-crying-palm-tree", "prophet-muhammad-early-life",
  "prophet-muhammad-farewell-sermon", "prophet-muhammad-first-revelation",
  "prophet-muhammad-journey-taif", "prophet-muhammad-mercy",
  "prophet-muhammad-miracle-food-trench", "prophet-muhammad-miracles",
  "prophet-muhammad-night-hijrah-ali", "prophet-muhammad-patience",
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
  "second-two-abu-bakr-islam", "shab-e-barat-night-of-forgiveness",
  "test-story-manus", "transformation-direction-divine-sovereignty-islam",
  "triumph-truth-repentance-ka-islam", "umar-accepting-islam-story",
  "umar-ibn-khattab-story-islam", "umm-sulaym-wisdom-faith-islam",
  "well-rumah-eternal-charity-islam", "yawm-al-arafah-day-of-forgiveness"
];

export default function handler(req, res) {
  const routes = [...BASE_ROUTES];
  
  // Add stories
  STORY_SLUGS.forEach(slug => routes.push(`/stories/${slug}`));
  
  // Add Quran surahs
  for (let i = 1; i <= 114; i++) routes.push(`/quran/${i}`);
  
  // Add Hadith chapters
  for (const lang of ["bangla", "english", "urdu"]) {
    for (let i = 1; i <= 97; i++) routes.push(`/hadith/sahih-bukhari/${lang}/chapter-${i}`);
  }

  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${routes.map((route) => `  <url><loc>${xmlEscape(`${ORIGIN}${route}`)}</loc><changefreq>weekly</changefreq><priority>${route === "/" ? "1.0" : "0.8"}</priority></url>`).join("\n")}\n</urlset>`;
  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400");
  return res.status(200).send(body);
}
