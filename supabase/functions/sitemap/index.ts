import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const escapeXml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type SlugRow = { slug: string | null; updated_at: string | null };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    // 1. Fetch SEO pages
    const { data: seoPages, error: seoErr } = await supabase
      .from("seo_pages")
      .select("path, updated_at, robots, changefreq, priority")
      .order("path", { ascending: true });

    if (seoErr) {
      console.error("Error fetching seo_pages:", seoErr);
      return new Response("Error fetching sitemap data", {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "text/plain" },
      });
    }

    // 2. Fetch published content pages
    const { data: contentPages, error: contentErr } = await supabase
      .from("admin_content")
      .select("id, content_type, title, updated_at")
      .eq("is_published", true)
      .eq("status", "published");

    if (contentErr) {
      console.error("Error fetching admin_content:", contentErr);
    }

    // 2b. Fetch published Duas with slugs — emit /dua/:slug
    const { data: duaSlugRows } = await supabase
      .from("admin_content")
      .select("slug, updated_at")
      .in("content_type", ["dua", "Dua"])
      .eq("is_published", true)
      .eq("status", "published")
      .not("slug", "is", null);

    // 2c. Fetch hadith rows with slugs — emit /hadith/h/:slug
    const { data: hadithSlugRows } = await supabase
      .from("hadiths")
      .select("slug, updated_at")
      .not("slug", "is", null)
      .limit(50000);

    // Filter out noindex pages
    const indexablePages = (seoPages || []).filter((p) => {
      const robots = (p.robots || "").toLowerCase();
      return !robots.includes("noindex");
    });

    // Use noorapp.in as the primary domain
    const SITE_ORIGIN = "https://noorapp.in";
    const url = new URL(req.url);
    const origin = SITE_ORIGIN;

    // Build URLs from seo_pages
    const seoUrls = indexablePages.map((p) => {
      const lastmod = p.updated_at
        ? new Date(p.updated_at).toISOString().split("T")[0]
        : new Date().toISOString().split("T")[0];
      return `  <url>
    <loc>${escapeXml(`${origin}${p.path}`)}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${p.changefreq || "weekly"}</changefreq>
    <priority>${p.priority ?? 0.8}</priority>
  </url>`;
    });

    // Build URLs from published content (if not already in seo_pages)
    const existingPaths = new Set(indexablePages.map((p) => p.path));
    const contentUrls = (contentPages || [])
      .filter((c) => {
        const contentPath = `/${c.content_type}/${c.id}`;
        return c.content_type?.toLowerCase() !== "dua" && !existingPaths.has(contentPath);
      })
      .map((c) => {
        const lastmod = c.updated_at
          ? new Date(c.updated_at).toISOString().split("T")[0]
          : new Date().toISOString().split("T")[0];
        return `  <url>
    <loc>${escapeXml(`${origin}/${c.content_type}/${c.id}`)}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.6</priority>
  </url>`;
      });

    const today0 = new Date().toISOString().split("T")[0];

    const duaSlugUrls = (duaSlugRows || []).map((r: SlugRow) => {
      const lastmod = r.updated_at ? new Date(r.updated_at).toISOString().split("T")[0] : today0;
      return `  <url>
    <loc>${escapeXml(`${origin}/dua/${r.slug}`)}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.75</priority>
  </url>`;
    });
    const hadithSlugUrls = (hadithSlugRows || []).map((r: SlugRow) => {
      const lastmod = r.updated_at ? new Date(r.updated_at).toISOString().split("T")[0] : today0;
      return `  <url>
    <loc>${escapeXml(`${origin}/hadith/h/${r.slug}`)}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>`;
    });

    // Add hadith language routes (static, always present)
    const hadithLangs = ["bangla", "english", "urdu"];
    const today = new Date().toISOString().split("T")[0];
    const hadithLangUrls = hadithLangs
      .filter((l) => !existingPaths.has(`/hadith/sahih-bukhari/${l}`))
      .map((l) => `  <url>
    <loc>${origin}/hadith/sahih-bukhari/${l}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.85</priority>
  </url>`);

    // Add Islamic Stories URLs — fetched from /stories.json (bundled in /public)
    const storyUrls: string[] = [];
    try {
      const storiesRes = await fetch(`${origin}/stories.json`, {
        headers: { accept: "application/json" },
      });
      if (storiesRes.ok) {
        const stories = (await storiesRes.json()) as Array<{ slug: string; category: string }>;
        const categories = new Set<string>();
        if (!existingPaths.has("/stories")) {
          storyUrls.push(`  <url>
    <loc>${origin}/stories</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.9</priority>
  </url>`);
        }
        for (const s of stories) {
          if (s.category) categories.add(s.category);
          storyUrls.push(`  <url>
    <loc>${origin}/stories/${escapeXml(s.slug)}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.75</priority>
  </url>`);
        }
        for (const c of categories) {
          storyUrls.push(`  <url>
    <loc>${origin}/stories/category/${escapeXml(c)}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>`);
        }
      }
    } catch (e) {
      console.error("Stories sitemap fetch failed:", e);
    }

    const allUrlEntries = [
      ...seoUrls,
      ...hadithLangUrls,
      ...storyUrls,
      ...duaSlugUrls,
      ...hadithSlugUrls,
      ...contentUrls,
    ];
    const seenLocs = new Set<string>();
    const allUrls = allUrlEntries
      .filter((entry) => {
        const loc = entry.match(/<loc>([^<]+)<\/loc>/)?.[1];
        if (!loc || seenLocs.has(loc)) return false;
        seenLocs.add(loc);
        return true;
      })
      .join("\n");

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${allUrls}
</urlset>`;

    return new Response(xml, {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "public, max-age=3600, s-maxage=3600",
      },
    });
  } catch (err) {
    console.error("Sitemap generation error:", err);
    return new Response("Internal server error", {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "text/plain" },
    });
  }
});
