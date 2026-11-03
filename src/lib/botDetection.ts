/**
 * isBotUA — pure, dependency-free bot/automation detector for user-agent strings.
 *
 * Client-side filter for NoorApp page_visits analytics (F-BOT-1).
 * TypeScript port of the tested logic in
 * goals/noorapp-in-adsense-review-audit-fixes/hidden_files/bot-filter-tests/isBotUA.mjs
 * (35 cases PASS). The two implementations must stay in sync: same crawler list,
 * same token-boundary generic matching, same automation markers.
 *
 * Design (two tiers, both return bot=true):
 *   Tier 1 "known-crawler" — distinctive crawler names (substring match, low
 *   false-positive risk) + generic tokens matched ONLY on token boundaries
 *   (so "MyBottomApp" or "BothWaysApp" do NOT match on the "bot" substring).
 *   Tier 2 "automation" — heuristic markers for scripted/headless clients
 *   (curl, wget, python-requests, headless Chrome, puppeteer, ...). These are
 *   strong signals in a browser-analytics context, but they are heuristics: a
 *   human can in principle send such a UA, and a modern headless browser that
 *   spoofs a normal UA will NOT be caught here (see isHeadlessSignal).
 *
 * Deliberately NOT flagged:
 *   - In-app browsers (FBAN/FBAV/Instagram): real humans. Analytics != ads.
 *   - Normal browsers (Chrome/Firefox/Safari/Edge/Samsung Internet, incl.
 *     mobile) and WebView-based apps that send a browser UA.
 *
 * Historical rows are NOT deleted by this filter (exclusion-first: only new
 * inserts are skipped). Deleting old rows needs a separate owner authorization.
 */

export type BotTier = "known-crawler" | "automation" | "human";

export interface BotCheckResult {
  bot: boolean;
  tier: BotTier;
  reason: string;
}

const KNOWN_CRAWLERS: string[] = [
  "googlebot", "adsbot-google", "mediapartners-google", "feedfetcher",
  "google-read-aloud", "storebot-google", "googlebot-image", "googlebot-video",
  "bingbot", "msnbot", "duckduckbot", "baiduspider", "yandexbot",
  "yandeximages", "yandexvideo", "slurp", "sogou", "exabot",
  "facebot", "facebookexternalhit", "twitterbot", "applebot",
  "applebot-extended", "ia_archiver", "ahrefsbot", "semrushbot",
  "dotbot", "mj12bot", "petalbot", "bytespider", "ccbot",
  "gptbot", "chatgpt-user", "oai-searchbot", "anthropic-ai",
  "claudebot", "cohere-ai", "meta-externalagent", "perplexitybot",
  "tiktok-spider", "linkedinbot", "embedly", "quora link preview",
];

// Generic tokens: matched on TOKEN boundaries, not raw substrings and not
// plain \b regex (which misses camelCase components like "MyCrawler").
// Tokenizer splits on non-alphanumerics AND on lower->Upper transitions,
// so "MyCrawler" -> ["My","Crawler"] (matches "crawler") while
// "MyBottomApp" -> ["My","Bottom","App"] ("bottom" != "bot") and
// "BothWaysApp" -> ["Both","Ways","App"] ("both" != "bot") do not match.
const GENERIC_BOT_TOKEN_SET = new Set([
  "bot", "crawler", "crawl", "spider", "scraper", "archiver", "fetcher",
]);

function tokenizeUA(ua: string): string[] {
  return ua
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((t) => t.toLowerCase());
}

// Automation markers: distinctive substrings. Heuristic tier — see header.
const AUTOMATION_MARKERS: string[] = [
  "headless", "phantomjs", "puppeteer", "playwright", "selenium",
  "webdriver", "lighthouse", "curl", "wget", "python-requests",
  "python-urllib", "scrapy", "go-http-client", "httpx", "libwww-perl",
  "okhttp", "java/",
];

export function isBotUA(ua: string): BotCheckResult {
  const raw = typeof ua === "string" ? ua : "";
  if (raw.trim() === "") {
    return { bot: true, tier: "automation", reason: "empty-ua" };
  }
  const lower = raw.toLowerCase();
  for (const name of KNOWN_CRAWLERS) {
    if (lower.includes(name)) {
      return { bot: true, tier: "known-crawler", reason: `known-crawler:${name}` };
    }
  }
  if (tokenizeUA(raw).some((t) => GENERIC_BOT_TOKEN_SET.has(t))) {
    return { bot: true, tier: "known-crawler", reason: "generic-bot-token" };
  }
  for (const marker of AUTOMATION_MARKERS) {
    if (lower.includes(marker)) {
      return { bot: true, tier: "automation", reason: `automation:${marker}` };
    }
  }
  return { bot: false, tier: "human", reason: "no-match" };
}

/**
 * Optional second signal (NOT derivable from a UA string alone):
 * navigator.webdriver === true means the browser is driven by automation
 * (Selenium/Puppeteer/Playwright). Proposed as an additional client-side
 * check in the hook, not as part of UA matching. It can be spoofed and it
 * also fires for legitimate automated tests, so it belongs in the automation
 * tier, never in "certain bot".
 */
export function isHeadlessSignal(signals: { webdriver?: unknown } | null | undefined): boolean {
  return signals != null && signals.webdriver === true;
}
