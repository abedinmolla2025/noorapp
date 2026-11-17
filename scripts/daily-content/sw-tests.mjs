// Service-worker push tests (Phase 8 — Homepage, Push & Sharing).
//
// The REAL public/sw.js is loaded in a node:vm sandbox with a stubbed
// `self` — no browser, no network, no real notification. Covered:
//   - push with image_url sets `image` on the notification (the
//     finalized poster reaches the device path);
//   - push without image_url shows a text-only notification (no `image`
//     key, never a crash);
//   - push with empty/malformed data falls back to defaults;
//   - notificationclick focuses an open client or opens the deep link.
// Run: node scripts/daily-content/sw-tests.mjs (from the worktree root).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(dir, "../..");

let n = 0;
const t = async (name, fn) => {
  await fn();
  n++;
  console.log(`ok ${n} - ${name}`);
};

const POSTER_URL =
  "https://llicfiepatzgllmjhzbw.supabase.co/storage/v1/object/public/daily-content-posters/2026-11-17/portrait.png";

// ---- sandbox: stubbed `self` capturing every service-worker effect ----
const notifications = [];
const openedWindows = [];
const focusedClients = [];
const navigatedClients = [];
const listeners = {};
const sandboxSelf = {
  skipWaitingCalled: false,
  clientsList: [],
  addEventListener: (type, fn) => {
    listeners[type] = fn;
  },
  skipWaiting: () => {
    sandboxSelf.skipWaitingCalled = true;
  },
  registration: {
    showNotification: async (title, options) => {
      notifications.push({ title, options });
    },
  },
  clients: {
    matchAll: async () => sandboxSelf.clientsList,
    openWindow: async (url) => {
      openedWindows.push(url);
    },
    claim: async () => {},
  },
};
const sandbox = {
  self: sandboxSelf,
  caches: { keys: async () => [], delete: async () => true },
  console,
};
vm.createContext(sandbox);
vm.runInContext(readFileSync(path.join(root, "public/sw.js"), "utf8"), sandbox);

const firePush = async (payload) => {
  const waited = [];
  const event = {
    data: payload === undefined ? undefined : { json: () => payload },
    waitUntil: (p) => {
      waited.push(p);
    },
  };
  listeners.push(event);
  await Promise.all(waited);
};

const fireClick = async (deepLink, clients) => {
  sandboxSelf.clientsList = clients;
  const waited = [];
  const event = {
    notification: { close: () => {}, data: { deepLink } },
    waitUntil: (p) => {
      waited.push(p);
    },
  };
  listeners.notificationclick(event);
  await Promise.all(waited);
};

await t("sw: install calls skipWaiting", async () => {
  listeners.install({});
  assert.equal(sandboxSelf.skipWaitingCalled, true);
});

await t("sw: push with image_url sets image + deep link on the notification", async () => {
  notifications.length = 0;
  await firePush({
    title: "TITLE-TEST",
    body: "BODY-TEST",
    image_url: POSTER_URL,
    deep_link: "/hadith/sahih-bukhari/bangla",
  });
  assert.equal(notifications.length, 1);
  const shown = notifications[0];
  assert.equal(shown.title, "TITLE-TEST");
  assert.equal(shown.options.body, "BODY-TEST");
  assert.equal(shown.options.image, POSTER_URL);
  assert.equal(shown.options.data.deepLink, "/hadith/sahih-bukhari/bangla");
  assert.equal(typeof shown.options.icon, "string");
  assert.equal(typeof shown.options.badge, "string");
});

await t("sw: push without image_url shows a text-only notification (no image key)", async () => {
  notifications.length = 0;
  await firePush({ title: "TITLE-TEST", body: "BODY-TEST", deep_link: "/" });
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].options.body, "BODY-TEST");
  assert.equal("image" in notifications[0].options, false);
});

await t("sw: push with empty data falls back to defaults, never crashes", async () => {
  notifications.length = 0;
  await firePush(undefined);
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].title, "Notification");
  assert.equal(notifications[0].options.body, "");
  assert.equal("image" in notifications[0].options, false);
  assert.equal(notifications[0].options.data.deepLink, "/");
});

await t("sw: notificationclick focuses an open client and navigates it", async () => {
  openedWindows.length = 0;
  navigatedClients.length = 0;
  focusedClients.length = 0;
  await fireClick("/hadith/sahih-bukhari/bangla", [
    {
      focus: () => {
        focusedClients.push(1);
      },
      navigate: async (url) => {
        navigatedClients.push(url);
      },
    },
  ]);
  assert.equal(focusedClients.length, 1);
  assert.deepEqual(navigatedClients, ["/hadith/sahih-bukhari/bangla"]);
  assert.equal(openedWindows.length, 0);
});

await t("sw: notificationclick with no open client opens the deep link", async () => {
  openedWindows.length = 0;
  await fireClick("/hadith/sahih-bukhari/bangla", []);
  assert.deepEqual(openedWindows, ["/hadith/sahih-bukhari/bangla"]);
});

console.log(`sw tests: ${n} passed`);
