import type { DailyHadithPick, DeliveryStatus, PushPayload } from "./types.js";

/**
 * Web Push payload rules — mirrors the existing scheduler-dispatch clamps:
 * titles count wide code points as 2, max 60 units, max 1 emoji; bodies the
 * same at 120 units. A clamped string is never padded back out.
 */
/**
 * Same emoji pattern as the production scheduler-dispatch clamp (kept
 * identical on purpose so push titles/bodies clamp exactly the same way).
 * The joined sequences are intentional: they count one emoji with its
 * variation selector / joiner as a single emoji.
 */
const EMOJI_RE =
  // eslint-disable-next-line no-misleading-character-class
  /[\u{1F300}-\u{1FAFF}\u2600-\u27BF\u2B50\u2764\u262A\u2190-\u21AA][\uFE0F\u200D\u20E3\u0301-\u036F]*/gu;

function emojiCount(s: string): number {
  return s.match(EMOJI_RE)?.length ?? 0;
}

function widthUnits(s: string): number {
  let n = 0;
  for (const ch of s) n += ch.codePointAt(0)! > 0xffff ? 2 : 1;
  return n;
}

export function clampPushText(text: string, maxUnits: number): string {
  let out = text;
  while (widthUnits(out) > maxUnits || emojiCount(out) > 1) {
    out = out.replace(/[\s.!?,;-]+$/, "");
    if (out.length <= 3) return out;
    out = out.slice(0, -2);
  }
  return out;
}

export const DEFAULT_ICON = "https://www.noorapp.in/notification-icon.png";
export const DEFAULT_BADGE = "https://www.noorapp.in/badge-icon.png";

/**
 * Build the daily notification. The Daily Hadith is the notification; when
 * share cards exist, the body says how many (a counted fact, not a claim).
 */
export function buildDailyPush(
  pick: DailyHadithPick,
  kolkataDate: string,
  cardCount: number,
  imageUrl: string | null = null,
): PushPayload {
  const bengali = (pick.record.bengali ?? "").trim();
  const title = clampPushText(`📿 আজকের হাদিস — ${pick.sourceLine}`, 60);
  const cardMention = cardCount > 0 ? ` + আজকের ${cardCount}টি ইসলামিক কার্ড দেখুন।` : "";
  const body = clampPushText(
    `Assalamu Alaikum! ${bengali}${cardMention}`,
    120,
  );
  return {
    title,
    body,
    deepLink: pick.canonicalLink,
    icon: DEFAULT_ICON,
    badge: DEFAULT_BADGE,
    imageUrl,
    capKeyPrefix: `daily:${kolkataDate}`,
  };
}

/** Per-device daily-cap key: at most one daily notification per device/day. */
export function dailyCapKey(kolkataDate: string, deviceId: string): string {
  return `daily:${kolkataDate}:${deviceId}`;
}

/**
 * Classify a push failure the way the existing senders do:
 *  - 404/410/401/403: subscription is dead => disable the token, no retry.
 *  - 429 / 5xx / network: transient => retryable (bounded attempts).
 *  - other 4xx: failed, no retry.
 */
export function classifyPushFailure(
  status: number | null,
): DeliveryStatus {
  if (status === 404 || status === 410 || status === 401 || status === 403)
    return "disabled";
  if (status === null || status === 429 || status >= 500) return "retryable";
  return "failed";
}

/** Backoff in minutes after failures 1, 2 and 3 (before retries 2, 3, 4). */
export const PUSH_RETRY_BACKOFF_MINUTES = [5, 15, 45];
/** Total send attempts allowed: 1 initial + 3 retries. */
export const PUSH_MAX_ATTEMPTS = 4;

/** Delay before the next attempt, given failures so far (null = terminal). */
export function delayAfterFailures(failures: number): number | null {
  if (failures <= 0) return PUSH_RETRY_BACKOFF_MINUTES[0];
  if (failures <= PUSH_RETRY_BACKOFF_MINUTES.length) {
    return PUSH_RETRY_BACKOFF_MINUTES[failures - 1];
  }
  return null;
}
