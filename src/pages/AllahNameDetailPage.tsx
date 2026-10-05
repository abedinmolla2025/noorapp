import { useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Loader2 } from "lucide-react";
import { assignAllahNameSlugs, isValidAllahNameSlugSegment } from "@/lib/allahNameSlug.js";
import allowlistedSlugs from "@/data/allah-name-sitemap-allowlist.json";

interface AllahNameRecord {
  id: number;
  arabic: string;
  transliteration: string;
  meaning: string;
  bengaliMeaning: string;
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

async function fetchAllahNames(): Promise<AllahNameRecord[]> {
  const res = await fetch("/data/names-of-allah.json");
  if (!res.ok) throw new Error(`names-of-allah.json: HTTP ${res.status}`);
  const data = (await res.json()) as AllahNameRecord[];
  if (!Array.isArray(data)) throw new Error("names-of-allah.json: expected array");
  return data;
}

export default function AllahNameDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const slugParam = (slug || "").trim();

  const namesQuery = useQuery({
    queryKey: ["allah-name-detail-records"],
    queryFn: fetchAllahNames,
    staleTime: 1000 * 60 * 60,
  });

  const { record, prev, next } = useMemo(() => {
    const rows = namesQuery.data ?? [];
    const empty = { record: null as AllahNameRecord | null, prev: null as AllahNameRecord | null, next: null as AllahNameRecord | null };
    if (!isValidAllahNameSlugSegment(slugParam)) return empty;
    if (!(allowlistedSlugs as string[]).includes(slugParam)) return empty;
    const slugMap = assignAllahNameSlugs(rows.map((r) => ({ id: r.id, transliteration: r.transliteration })));
    const found = rows.find((r) => slugMap.get(r.id) === slugParam) ?? null;
    if (!found) return empty;
    const ordered = [...rows].sort((a, b) => a.id - b.id);
    const idx = ordered.findIndex((r) => r.id === found.id);
    const slugOf = (r: AllahNameRecord | null) => (r ? slugMap.get(r.id) ?? null : null);
    const prevRec = idx > 0 ? ordered[idx - 1] : null;
    const nextRec = idx < ordered.length - 1 ? ordered[idx + 1] : null;
    return {
      record: found,
      prev: prevRec ? { ...prevRec, _slug: slugOf(prevRec) } as AllahNameRecord & { _slug: string | null } : null,
      next: nextRec ? { ...nextRec, _slug: slugOf(nextRec) } as AllahNameRecord & { _slug: string | null } : null,
    };
  }, [namesQuery.data, slugParam]);

  const canonical = `${SITE_ORIGIN}/99-names/${encodeURIComponent(slugParam)}`;

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
        <Link to="/99-names" className="px-4 py-2 rounded-full bg-primary text-primary-foreground font-medium">
          সব নাম দেখুন
        </Link>
      </div>
    );
  }

  const title = `${record.transliteration} (${record.arabic}) — Meaning in English & Bengali | Noor`;
  const description = truncate160(
    `Allah's name ${record.transliteration} (${record.arabic}) means "${record.meaning}" in English and "${record.bengaliMeaning}" in Bengali.`
  );
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "DefinedTerm",
    name: record.transliteration,
    description: record.meaning,
    inDefinedTermSet: {
      "@type": "DefinedTermSet",
      name: "99 Names of Allah",
      url: `${SITE_ORIGIN}/99-names`,
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
          <Link to="/99-names" className="hover:underline">99 Names of Allah</Link>
          <span aria-hidden="true">›</span>
          <span>{record.transliteration}</span>
        </nav>

        <Link to="/99-names" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
          <ArrowLeft size={14} /> All 99 names
        </Link>

        <article className="mt-4 rounded-2xl border border-border bg-card p-6 shadow-sm">
          <p className="text-sm font-semibold text-primary">Name {record.id} of 99</p>
          <h1 className="mt-2 text-3xl font-bold">
            {record.transliteration}{" "}
            <span lang="ar" dir="rtl" className="font-arabic">({record.arabic})</span>
          </h1>

          <div className="mt-6 grid gap-4">
            <section className="rounded-xl border border-border p-4">
              <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Meaning — English</h2>
              <p lang="en" className="mt-2 text-lg leading-relaxed">{record.meaning}</p>
            </section>
            <section className="rounded-xl border border-border p-4">
              <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">অর্থ — বাংলা</h2>
              <p lang="bn" className="mt-2 text-lg leading-relaxed font-bangla">{record.bengaliMeaning}</p>
            </section>
            <section className="rounded-xl border border-border p-4">
              <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Details</h2>
              <dl className="mt-2 grid grid-cols-2 gap-2 text-sm">
                <div><dt className="text-muted-foreground">Transliteration</dt><dd className="font-medium">{record.transliteration}</dd></div>
                <div><dt className="text-muted-foreground">Position</dt><dd className="font-medium">{record.id} of 99</dd></div>
              </dl>
            </section>
          </div>

          <nav aria-label="More names" className="mt-6 flex items-center justify-between gap-3 rounded-2xl border border-border bg-muted/40 p-4">
            {prev && (prev as any)._slug ? (
              <Link to={`/99-names/${(prev as any)._slug}`} className="text-sm text-primary hover:underline">
                ← {(prev as AllahNameRecord).transliteration}
              </Link>
            ) : <span />}
            {next && (next as any)._slug ? (
              <Link to={`/99-names/${(next as any)._slug}`} className="text-sm text-primary hover:underline">
                {(next as AllahNameRecord).transliteration} →
              </Link>
            ) : <span />}
          </nav>

          <p className="mt-6 border-t border-border pt-4 text-xs text-muted-foreground">
            Meanings are provided for educational purposes.
          </p>
        </article>
      </main>
    </div>
  );
}
