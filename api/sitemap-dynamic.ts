const ORIGIN = "https://noorapp.in";

type ResponseLike = {
  setHeader: (name: string, value: string) => void;
  status: (code: number) => { send: (body: string) => unknown };
};

function xmlEscape(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// Stable, public, canonical routes.
const BASE_ROUTES = [
  "/",
  "/quran",
  "/hadith",
  "/hadith/sahih-bukhari",
  "/hadith/sahih-bukhari/bangla",
  "/hadith/sahih-bukhari/english",
  "/hadith/sahih-bukhari/urdu",
  "/dua",
  "/prayer-times",
  "/prayer-guide",
  "/qibla",
  "/tasbih",
  "/99-names",
  "/baby-names",
  "/calendar",
  "/quiz",
  "/stories",
  "/stories/prophet-musa-story-islam",
  "/stories/prophet-nuh-story-islam",
  "/stories/prophet-yusuf-story-islam",
  "/stories/prophet-ibrahim-story-islam",
  "/stories/prophet-muhammad-story-islam",
  "/about",
  "/contact",
  "/sources",
  "/privacy-policy",
  "/terms",
  "/download",
  "/islamic-app",
];

export default function handler(_req: unknown, res: ResponseLike) {
  const routes = [...BASE_ROUTES];
  
  // Add Sahih Bukhari chapters (1-97) for Bangla and English to improve crawl depth
  for (let i = 1; i <= 97; i++) {
    routes.push(`/hadith/sahih-bukhari/bangla/chapter-${i}`);
    routes.push(`/hadith/sahih-bukhari/english/chapter-${i}`);
  }

  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${routes
    .map((path) => `  <url><loc>${xmlEscape(`${ORIGIN}${path}`)}</loc></url>`)
    .join("\n")}\n</urlset>\n`;

  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.setHeader(
    "Cache-Control",
    "public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400",
  );
  return res.status(200).send(body);
}

export { BASE_ROUTES as PUBLIC_ROUTES };
