/**
 * Phase 8 — Homepage, Push & Sharing for Daily Content.
 *
 * Every share action consumes the SAME finalized poster asset (the
 * publication row's `poster_url`, set by `set_poster` after QC pass) —
 * never a client-side re-render and never a different image. The text
 * the caption carries is composed ONLY from the record's own Bengali
 * text + source line + the share link + the NoorApp brand suffix (the
 * same shape as `buildHadithCard`'s caption in cards.ts): no virtue,
 * benefit or grade wording is ever added.
 *
 * Honest platform limits (recorded, not hidden):
 * - wa.me text links CANNOT attach a file. A WhatsApp share is text +
 *   link; the image the recipient sees comes from the shared URL's
 *   og:image — which api/prerender.js sets to today's finalized poster
 *   for the homepage (`/`). Without that server-side og:image, the
 *   preview would be the static default image.
 * - Facebook sharer.php likewise takes a URL + quote; the preview image
 *   is the shared URL's og:image (same prerender path).
 * - Native share with the poster FILE works only where the browser
 *   supports it (`navigator.canShare({ files })`); otherwise the code
 *   falls back to a text share, and when even that is unavailable it
 *   reports "unsupported" — the caller then offers the download button.
 *   No share path is ever a silent no-op: every function returns a
 *   result the UI reports.
 *
 * Pure functions + injectable dependencies only (navigator, fetch,
 * clipboard, anchor click): no DOM access at module scope, so the
 * whole module is unit-testable in node.
 */
import { SITE_ORIGIN } from "./visuals.js";

/** The record a share action needs — the published card's own fields. */
export interface DailyShareRecord {
  bengali: string;
  source: string;
  canonicalLink: string;
  posterUrl?: string | null;
  kolkataDate: string;
}

/** The daily card lives on the homepage — that is the URL a share sends
 *  people to. (The record's canonicalLink is the book page, used by the
 *  card's "আরও পড়ুন" button; the share goes to the card itself.) */
export function dailyShareUrl(): string {
  return `${SITE_ORIGIN}/`;
}

/**
 * Bengali-first share caption: Bengali text, source line, share link,
 * brand suffix. Throws when the Bengali text or the source line is
 * missing — a share must never go out with an empty quote or an
 * unsourced claim.
 */
export function dailyShareCaption(record: Pick<DailyShareRecord, "bengali" | "source">): string {
  const bengali = (record.bengali ?? "").trim();
  const source = (record.source ?? "").trim();
  if (!bengali || !source) {
    throw new Error("daily share needs Bengali text and a source line");
  }
  return `🤲 আজকের হাদিস\n${bengali}\n📖 ${source}\n🔗 ${dailyShareUrl()}\n— NoorApp`;
}

/** WhatsApp share link (same wa.me shape the app already uses).
 *  Text + link only — wa.me cannot attach a file; the image in the
 *  recipient's preview is the shared URL's og:image (see header). */
export function dailyWhatsappShareUrl(caption: string): string {
  return `https://wa.me/?text=${encodeURIComponent(caption)}`;
}

/** Facebook sharer link (same shape as the app's existing sharer).
 *  URL + quote only; the preview image is the shared URL's og:image. */
export function dailyFacebookShareUrl(shareUrl: string, caption: string): string {
  return `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}&quote=${encodeURIComponent(caption)}`;
}

/** The finalized-poster storage path — the only URL shape a share action
 *  will ever treat as "the poster". Anything else is not the asset. */
const POSTER_STORAGE_PATH = "/storage/v1/object/public/daily-content-posters/";

/** True only for an https URL pointing at a PNG in the finalized-poster
 *  bucket on a Supabase host. Guards every share/download path against
 *  sharing an arbitrary or unfinalized URL as if it were the poster.
 *  The host check is ".supabase.co" (not one project ref) so the same
 *  code is correct in production and in rehearsal. */
export function isFinalizedPosterUrl(url: unknown): url is string {
  if (typeof url !== "string") return false;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  return (
    parsed.protocol === "https:" &&
    parsed.host.endsWith(".supabase.co") &&
    parsed.pathname.includes(POSTER_STORAGE_PATH) &&
    parsed.pathname.endsWith(".png")
  );
}

/** "portrait" for .../portrait.png, "square" for .../square.png, portrait
 *  for anything else (the finalized poster_url is the portrait asset). */
export function posterFormatFromUrl(posterUrl: string): "portrait" | "square" {
  return posterUrl.includes("/square.png") ? "square" : "portrait";
}

/** Download filename for the finalized poster: stable, dated, format-
 *  stamped — never the storage stem ("portrait.png") alone. */
export function dailyPosterFileName(kolkataDate: string, posterUrl: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(kolkataDate)) {
    throw new Error("daily poster filename needs a YYYY-MM-DD date");
  }
  return `noorapp-hadith-${kolkataDate}-${posterFormatFromUrl(posterUrl)}.png`;
}

export class PosterFetchError extends Error {
  readonly reason: "http" | "not-image" | "network";
  constructor(reason: "http" | "not-image" | "network", message: string) {
    super(message);
    this.name = "PosterFetchError";
    this.reason = reason;
  }
}

/**
 * Fetch the finalized poster as a File (for native share / download).
 * Throws PosterFetchError — never returns a non-image or an error page
 * disguised as the poster.
 */
export async function fetchPosterFile(
  posterUrl: string,
  fileName: string,
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<File> {
  let res: Response;
  try {
    res = await fetchImpl(posterUrl);
  } catch (e) {
    throw new PosterFetchError(
      "network",
      `poster fetch failed: ${e instanceof Error ? e.message : "network error"}`,
    );
  }
  if (!res.ok) {
    throw new PosterFetchError("http", `poster fetch failed: HTTP ${res.status}`);
  }
  const contentType = res.headers?.get?.("content-type") ?? "";
  if (!contentType.startsWith("image/")) {
    throw new PosterFetchError(
      "not-image",
      `poster fetch failed: content-type ${contentType || "unknown"}`,
    );
  }
  const blob = await res.blob();
  return new File([blob], fileName, { type: blob.type || "image/png" });
}

/** Minimal navigator shape the share code needs (injectable for tests). */
export interface ShareNavigator {
  share?: (data: ShareData) => Promise<void>;
  canShare?: (data: ShareData) => boolean;
  clipboard?: { writeText: (text: string) => Promise<void> };
}

export type NativeShareSupport = "image" | "text" | "none";

function createTinyPngFile(): File {
  // 1x1 transparent PNG (same probe as NameSharePreviewModal).
  const base64 =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO2g2pUAAAAASUVORK5CYII=";
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const blob = new Blob([bytes], { type: "image/png" });
  return new File([blob], "share.png", { type: "image/png" });
}

/**
 * What this browser's native share can do (same probe as
 * NameSharePreviewModal): "image" when files share, "text" when only
 * text/url shares, "none" when there is no Web Share API at all.
 */
export function getNativeShareSupport(nav?: ShareNavigator | null): NativeShareSupport {
  const navigatorLike = nav ?? (globalThis as { navigator?: ShareNavigator }).navigator;
  if (!navigatorLike || typeof navigatorLike.share !== "function") return "none";
  const canShare = navigatorLike.canShare;
  if (typeof canShare !== "function") return "text";
  try {
    if (canShare.call(navigatorLike, { files: [createTinyPngFile()] })) return "image";
    if (
      canShare.call(navigatorLike, {
        title: "NoorApp",
        text: "NoorApp",
        url: dailyShareUrl(),
      })
    ) {
      return "text";
    }
    return "none";
  } catch {
    // Some browsers throw on unsupported shapes — text share may still work.
    return "text";
  }
}

export type DailyShareResult =
  | { method: "native-file" }
  | { method: "native-text" }
  | { method: "unsupported" }
  | { method: "cancelled" }
  | { method: "failed"; detail: string };

function shareErrorResult(e: unknown): DailyShareResult {
  if (e instanceof Error && e.name === "AbortError") return { method: "cancelled" };
  return { method: "failed", detail: e instanceof Error ? e.message : "share failed" };
}

/**
 * Share today's poster through the native share sheet. Preference order:
 * file share (poster + caption) → text share (caption + link) →
 * "unsupported" (the caller offers the download button). A failed file
 * fetch or a canShare rejection degrades to the text share instead of
 * failing outright; a user-cancelled sheet reports "cancelled" (never
 * an error toast). Never throws for a user-facing outcome.
 */
export async function shareDailyPoster(
  record: DailyShareRecord,
  deps: {
    nav?: ShareNavigator | null;
    fetchImpl?: typeof fetch;
  } = {},
): Promise<DailyShareResult> {
  const nav = deps.nav ?? (globalThis as { navigator?: ShareNavigator }).navigator;
  const support = getNativeShareSupport(nav);
  if (support === "none" || !nav || typeof nav.share !== "function") {
    return { method: "unsupported" };
  }
  const caption = dailyShareCaption(record);
  const title = "আজকের হাদিস — NoorApp";
  const url = dailyShareUrl();
  if (support === "text") {
    try {
      await nav.share({ title, text: caption, url });
      return { method: "native-text" };
    } catch (e) {
      return shareErrorResult(e);
    }
  }
  // Image support: the file must be the finalized poster, or no file share.
  if (!isFinalizedPosterUrl(record.posterUrl)) {
    return { method: "failed", detail: "no finalized poster to share" };
  }
  let file: File;
  try {
    file = await fetchPosterFile(
      record.posterUrl,
      dailyPosterFileName(record.kolkataDate, record.posterUrl),
      deps.fetchImpl,
    );
  } catch {
    // The file could not be fetched (offline / CORS): fall back to a
    // text share so the user still shares the hadith.
    try {
      await nav.share({ title, text: caption, url });
      return { method: "native-text" };
    } catch (e) {
      return shareErrorResult(e);
    }
  }
  const data: ShareData = { title, text: caption, files: [file] };
  try {
    if (typeof nav.canShare === "function" && !nav.canShare(data)) {
      // canShare rejects this exact file (often too large): text share.
      await nav.share({ title, text: caption, url });
      return { method: "native-text" };
    }
    await nav.share(data);
    return { method: "native-file" };
  } catch (e) {
    return shareErrorResult(e);
  }
}

export type DownloadResult =
  | { method: "downloaded" }
  | { method: "opened" }
  | { method: "failed"; detail: string };

/**
 * Download the finalized poster file. On a fetch failure (offline /
 * CORS) it opens the poster URL itself in a new tab so the user can
 * still save it — never a dead button.
 */
export async function downloadPoster(
  posterUrl: string,
  fileName: string,
  deps: {
    fetchImpl?: typeof fetch;
    createObjectUrl?: (blob: Blob) => string;
    revokeObjectUrl?: (url: string) => void;
    clickAnchor?: (href: string, fileName: string) => void;
    openWindow?: (url: string) => void;
  } = {},
): Promise<DownloadResult> {
  const fetchImpl = deps.fetchImpl ?? globalThis.fetch;
  try {
    const file = await fetchPosterFile(posterUrl, fileName, fetchImpl);
    const createObjectUrl = deps.createObjectUrl ?? URL.createObjectURL.bind(URL);
    const revokeObjectUrl = deps.revokeObjectUrl ?? URL.revokeObjectURL.bind(URL);
    const objectUrl = createObjectUrl(file);
    try {
      if (deps.clickAnchor) {
        deps.clickAnchor(objectUrl, fileName);
      } else {
        const a = document.createElement("a");
        a.href = objectUrl;
        a.download = fileName;
        a.click();
      }
    } finally {
      revokeObjectUrl(objectUrl);
    }
    return { method: "downloaded" };
  } catch {
    try {
      if (deps.openWindow) {
        deps.openWindow(posterUrl);
      } else {
        window.open(posterUrl, "_blank", "noopener,noreferrer");
      }
      return { method: "opened" };
    } catch (e) {
      return { method: "failed", detail: e instanceof Error ? e.message : "download failed" };
    }
  }
}

/** Copy text to the clipboard; false when unavailable or denied. */
export async function copyText(
  text: string,
  clipboard?: { writeText: (text: string) => Promise<void> } | null,
): Promise<boolean> {
  const cb =
    clipboard ?? (globalThis as { navigator?: ShareNavigator }).navigator?.clipboard;
  if (!cb || typeof cb.writeText !== "function") return false;
  try {
    await cb.writeText(text);
    return true;
  } catch {
    return false;
  }
}
