import { useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Loader2 } from "lucide-react";
import { assignBabyNameSlugs, isValidBabyNameSlugSegment } from "@/lib/babyNameSlug.js";
import allowlistedSlugs from "@/data/baby-name-sitemap-allowlist.json";

interface BabyNameRecord {
  id: string;
  title: string;
  title_arabic: string;
  content: string;
  content_en: string;
  content_arabic: string;
  category: string;
}

const SITE_ORIGIN = "https://noorapp.in";

function truncate160(s: string): string {
  // Mirrors shortenMetaText() in api/prerender.js exactly (word-boundary clip,
  // no ellipsis) so SPA and prerender emit byte-identical descriptions.
  const text = String(s || "").trim().replace(/\s+/g, " ");
  if (text.length <= 160) return text;
  const clipped = text.slice(0, 161);
  const boundary = clipped.lastIndexOf(" ");
  return (boundary > 25 ? clipped.slice(0, boundary) : clipped.slice(0, 160))
    .replace(/[\s,;:—–\-|]+$/u, "")
    .trim();
}

async function fetchPublishedNames(): Promise<BabyNameRecord[]> {
  // Paginated: PostgREST clamps limit to 1000 rows.
  const all: BabyNameRecord[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await (supabase as any)
      .from("admin_content")
      .select("id,title,title_arabic,content,content_en,content_arabic,category")
      .eq("content_type", "name")
      .eq("is_published", true)
      .order("created_at", { ascending: true })
      .range(offset, offset + 999);
    if (error) throw error;
    all.push(...((data ?? []) as BabyNameRecord[]));
    if (!data || data.length < 1000) break;
  }
  return all;
}

export default function BabyNameDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const slugParam = (slug || "").trim();

  const namesQuery = useQuery({
    queryKey: ["baby-name-detail-records"],
    queryFn: fetchPublishedNames,
    staleTime: 1000 * 60 * 10,
  });

  const { record, related } = useMemo(() => {
    const rows = namesQuery.data ?? [];
    if (!isValidBabyNameSlugSegment(slugParam)) return { record: null as BabyNameRecord | null, related: [] as BabyNameRecord[] };
    if (!(allowlistedSlugs as string[]).includes(slugParam)) return { record: null, related: [] };
    const slugMap = assignBabyNameSlugs(rows.map((r) => ({ id: String(r.id), title: r.title })));
    const found = rows.find((r) => slugMap.get(String(r.id)) === slugParam) ?? null;
    if (!found) return { record: null, related: [] };
    // Related: same category, allowlisted only (gated phase: never link to non-existent pages).
    const allowed = new Set(allowlistedSlugs as string[]);
    const rel = rows
      .filter(
        (r) =>
          String(r.id) !== String(found.id) &&
          (r.category || "").trim().toLowerCase() === (found.category || "").trim().toLowerCase() &&
          allowed.has(slugMap.get(String(r.id)) || "")
      )
      .sort((a, b) => (a.title || "").localeCompare(b.title || ""))
      .slice(0, 6)
      .map((r) => ({ ...r, _slug: slugMap.get(String(r.id)) as string }));
    return { record: found, related: rel };
  }, [namesQuery.data, slugParam]);

  const canonical = `${SITE_ORIGIN}/baby-names/${encodeURIComponent(slugParam)}`;

  if (namesQuery.isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Helmet><meta name="robots" content="noindex" /></Helmet>
        <Loader2 className="animate-spin" />
      </div>
    );
  }

  if (namesQuery.isError || !record) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
        <Helmet>
          <meta name="robots" content="noindex" />
          <title>নাম খুঁজে পাওয়া যায়নি | Noor</title>
        </Helmet>
        <p className="text-lg mb-4">এই নামটি খুঁজে পাওয়া যায়নি।</p>
        <Link to="/baby-names" className="px-4 py-2 rounded-full bg-primary text-primary-foreground font-medium">
          সব নাম দেখুন
        </Link>
      </div>
    );
  }

  const genderLabel = (record.category || "").trim().toLowerCase() === "girl" ? "Girl" : "Boy";
  const title = `${record.title} (${record.title_arabic}) — Meaning in Bengali & English | Noor`;
  const description = truncate160(
    `The name ${record.title} (${record.title_arabic}) means "${record.content_en}" in English and "${record.content}" in Bengali. ${genderLabel} Islamic baby name.`
  );
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "DefinedTerm",
    name: record.title,
    description: record.content_en,
    inDefinedTermSet: {
      "@type": "DefinedTermSet",
      name: "Islamic Baby Names",
      url: `${SITE_ORIGIN}/baby-names`,
    },
  };

  return (
    <div className="min-h-screen">
      <Helmet>
        <title>{title}</title>
        <meta name="description" content={description} />
        <link rel="canonical" href={canonical} />
        <meta name="robots" content="index,follow" />
        <meta property="og:type" content="article" />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        <meta property="og:url" content={canonical} />
        <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>
      </Helmet>

      <main className="mx-auto max-w-3xl px-4 py-8">
        <nav aria-label="Breadcrumb" className="mb-4 flex items-center gap-1 text-xs text-muted-foreground">
          <Link to="/" className="hover:underline">Home</Link>
          <span aria-hidden="true">›</span>
          <Link to="/baby-names" className="hover:underline">Baby Names</Link>
          <span aria-hidden="true">›</span>
          <span>{record.title}</span>
        </nav>

        <Link to="/baby-names" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
          <ArrowLeft size={14} /> All names
        </Link>

        <article className="mt-4 rounded-2xl border border-border bg-card p-6 shadow-sm">
          <p className="text-sm font-semibold text-primary">{genderLabel} name</p>
          <h1 className="mt-2 text-3xl font-bold">
            {record.title}{" "}
            <span lang="ar" dir="rtl" className="font-arabic">({record.title_arabic})</span>
          </h1>

          <div className="mt-6 grid gap-4">
            <section className="rounded-xl border border-border p-4">
              <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Meaning — English</h2>
              <p lang="en" className="mt-2 text-lg leading-relaxed">{record.content_en}</p>
            </section>
            <section className="rounded-xl border border-border p-4">
              <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">অর্থ — বাংলা</h2>
              <p lang="bn" className="mt-2 text-lg leading-relaxed font-bangla">{record.content}</p>
            </section>
            {record.content_arabic && record.content_arabic.trim() ? (
              <section className="rounded-xl border border-border p-4">
                <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">المعنى — العربية</h2>
                <p lang="ar" dir="rtl" className="mt-2 text-lg leading-relaxed font-arabic">{record.content_arabic}</p>
              </section>
            ) : null}
            <section className="rounded-xl border border-border p-4">
              <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Details</h2>
              <dl className="mt-2 grid grid-cols-2 gap-2 text-sm">
                <div><dt className="text-muted-foreground">Gender</dt><dd className="font-medium">{genderLabel}</dd></div>
                <div><dt className="text-muted-foreground">Category</dt><dd className="font-medium">{record.category}</dd></div>
              </dl>
            </section>
          </div>

          {related.length > 0 ? (
            <nav aria-label="Related names" className="mt-6 rounded-2xl border border-border bg-muted/40 p-5">
              <h2 className="font-bold">More {genderLabel.toLowerCase()} names</h2>
              <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                {related.map((r: any) => (
                  <li key={r.id}>
                    <Link to={`/baby-names/${r._slug}`} className="text-sm text-primary hover:underline">
                      {r.title} <span lang="ar" className="text-muted-foreground">({r.title_arabic})</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ) : null}

          <p className="mt-6 border-t border-border pt-4 text-xs text-muted-foreground">
            Name meanings are provided for educational purposes. Families should verify spelling with
            trusted references before making a final choice.{" "}
            <Link to="/sources" className="underline">Editorial sources and methodology</Link>
          </p>
        </article>
      </main>
    </div>
  );
}
