/**
 * P2 city prayer-time pages — feature flag and city registry.
 *
 * CITY_PAGES_ENABLED must stay `false` until the owner separately approves
 * enabling city pages. While it is false:
 *  - no city route is registered in the SPA (the path falls through to the
 *    app's NotFound page);
 *  - api/prerender.js answers city paths with 404 + noindex (fail closed);
 *  - no city URL is added to the sitemap.
 *
 * Pilot city: Kolkata (owner decision, 2026-10-22). Do not add more cities
 * without the pilot acceptance gate and owner approval.
 */
export const CITY_PAGES_ENABLED = false;

export interface CityPageDef {
  slug: string;
  nameEn: string;
  nameBn: string;
  region: string;
  country: string;
  latitude: number;
  longitude: number;
  timeZone: string;
}

export const KOLKATA: CityPageDef = {
  slug: "kolkata",
  nameEn: "Kolkata",
  nameBn: "কলকাতা",
  region: "West Bengal",
  country: "India",
  latitude: 22.5744,
  longitude: 88.3629,
  timeZone: "Asia/Kolkata",
};

export const CITY_PAGES: CityPageDef[] = [KOLKATA];

export const getCityPage = (slug: string): CityPageDef | undefined =>
  CITY_PAGES.find((c) => c.slug === slug);
