// Deterministic, collision-safe slug derivation for baby-name records.
//
// CANONICAL IMPLEMENTATION — imported by:
//   - src/pages/BabyNameDetailPage.tsx (SPA, via @/lib/babyNameSlug.js)
//   - api/prerender.js  (Googlebot HTML)
//   - api/sitemap.js    (verification-gated sitemap URLs)
//
// Single source of truth: there is deliberately only ONE implementation, so the
// SPA, the prerender, and the sitemap can never disagree on a slug.
//
// DO NOT change this algorithm without a redirect plan: slugs are public,
// indexed URLs. Any change requires mapping old -> new slugs.

export function slugifyBabyName(title) {
  const lowered = String(title || "").trim().toLowerCase();
  // NFKD + strip combining marks (é -> e, etc.)
  const ascii = lowered.normalize("NFKD").replace(/[̀-ͯ]/g, "");
  return ascii
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Assign final slugs for a set of records. Records whose titles normalize to
// the same base slug are ordered by immutable record id (stable forever);
// the first keeps the clean slug, the rest get -2, -3, ... (the site's
// existing -2 variant convention, cf. /dua/surah-al-ikhlas-2).
// Returns Map<recordId, slug>. Records with an empty base slug are skipped.
export function assignBabyNameSlugs(rows) {
  const groups = new Map();
  for (const row of rows || []) {
    const base = slugifyBabyName(row && row.title);
    if (!base) continue;
    if (!groups.has(base)) groups.set(base, []);
    groups.get(base).push(row);
  }
  const out = new Map();
  for (const [base, group] of groups) {
    const ordered = [...group].sort((a, b) =>
      a.id < b.id ? -1 : a.id > b.id ? 1 : 0
    );
    ordered.forEach((row, i) => {
      out.set(row.id, i === 0 ? base : `${base}-${i + 1}`);
    });
  }
  return out;
}

// Validate a raw :slug path segment before any DB work.
export function isValidBabyNameSlugSegment(segment) {
  return typeof segment === "string" && /^[a-z0-9-]{1,80}$/.test(segment);
}
