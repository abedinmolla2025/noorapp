// Deterministic, collision-safe slug derivation for the 99 Names of Allah.
//
// CANONICAL IMPLEMENTATION — imported by:
//   - src/pages/AllahNameDetailPage.tsx (SPA, via @/lib/allahNameSlug.js)
//   - api/prerender.js  (Googlebot HTML)
//   - api/sitemap.js    (verification-gated sitemap URLs)
//
// Single source of truth: there is deliberately only ONE implementation, so the
// SPA, the prerender, and the sitemap can never disagree on a slug.
//
// Slugs derive from the record's `transliteration` field and are anchored to the
// immutable numeric `id` (1-99) for collision resolution.
//
// DO NOT change this algorithm without a redirect plan: slugs are public,
// indexed URLs. Any change requires mapping old -> new slugs.

export function slugifyAllahName(transliteration) {
  const lowered = String(transliteration || "").trim().toLowerCase();
  // NFKD + strip combining marks
  const ascii = lowered.normalize("NFKD").replace(/[̀-ͯ]/g, "");
  return ascii
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Assign final slugs for a set of records. Records whose transliterations
// normalize to the same base slug are ordered by immutable numeric id
// (stable forever); the first keeps the clean slug, the rest get -2, -3, ...
// (the site's existing -2 variant convention).
// Returns Map<recordId, slug>. Records with an empty base slug are skipped.
export function assignAllahNameSlugs(rows) {
  const groups = new Map();
  for (const row of rows || []) {
    const base = slugifyAllahName(row && row.transliteration);
    if (!base) continue;
    if (!groups.has(base)) groups.set(base, []);
    groups.get(base).push(row);
  }
  const out = new Map();
  for (const [base, group] of groups) {
    const ordered = [...group].sort((a, b) => a.id - b.id);
    ordered.forEach((row, i) => {
      out.set(row.id, i === 0 ? base : `${base}-${i + 1}`);
    });
  }
  return out;
}

// Validate a raw :slug path segment before any data work.
export function isValidAllahNameSlugSegment(segment) {
  return typeof segment === "string" && /^[a-z0-9-]{1,80}$/.test(segment);
}
