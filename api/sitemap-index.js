// Sitemap index for /sitemap-index.xml (M-21).
// Previously the /sitemap-index.xml rewrite pointed at /api/sitemap, which
// returns a <urlset> — semantically wrong for an index URL (and the rule
// was shadowed by the earlier generic /sitemap-(.*).xml rewrite, so it
// never fired). This endpoint returns a real <sitemapindex> listing the
// site's single sitemap. It needs no DB access and no includeFiles.
const ORIGIN = "https://noorapp.in";

export default async function handler(req, res) {
  const body =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    `  <sitemap><loc>${ORIGIN}/sitemap.xml</loc></sitemap>\n` +
    `</sitemapindex>`;
  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=0, s-maxage=300, stale-while-revalidate=300");
  return res.status(200).send(body);
}
