#!/usr/bin/env node
/**
 * Poster upload script — uploads one rendered PNG to the
 * `daily-content-posters` Storage bucket and returns its public URL
 * + SHA-256 checksum (Stage 3 finalization inputs).
 *
 * Usage:
 *   node scripts/daily-content/poster/upload-poster.mjs \
 *     --file /tmp/poster-2026-11-15-portrait.png \
 *     --object-path 2026-11-15/portrait.png \
 *     --supabase-url https://cazdbxxffvdnsdatjsrx.supabase.co \
 *     --anon-key "$REHEARSAL_ANON_KEY" \
 *     --admin-email "$REHEARSAL_ADMIN_EMAIL" \
 *     --admin-password "$REHEARSAL_ADMIN_PASSWORD"
 *
 * Auth: signs in as the admin user (password grant). The bucket's INSERT
 * policy allows `public.is_admin(auth.uid())`, so the admin JWT can
 * upload; the anon key alone cannot. No service-role key is used or
 * needed. Credentials live only in process env / argv for this run and
 * are never printed (the password is masked by the caller via
 * ::add-mask:: in the workflow).
 *
 * The upload is an upsert to a DETERMINISTIC path
 * (`<kolkata_date>/<format>.png`, or `<kolkata_date>/compare/<layout>-<format>.png`
 * for comparison renders that are never finalized), so re-running replaces
 * the same object — no duplicate assets accumulate. After upload, the script
 * fetches the public URL and verifies HTTP 200 + a matching
 * content-length before reporting success.
 *
 * Bounded retry (Phase 3 — Hold/Quarantine + self-healing): the
 * sign-in + upload + verify chain is retried ONCE (max 2 attempts,
 * 5 s apart) on a transient failure (network blip, storage 5xx,
 * public-URL fetch failure). Invalid login credentials are
 * deterministic and are never retried. The upload is an upsert to a
 * deterministic path, so a retry cannot create a duplicate asset.
 * The result JSON carries `attempts` (1 or 2).
 *
 * Prints a single JSON result line on stdout; exits non-zero on any
 * failure. Never prints credentials.
 */
import fs from "node:fs";
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

function arg(name, fallback = null) {
  const i = process.argv.indexOf(name);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : fallback;
}

const file = arg("--file");
const objectPath = arg("--object-path");
const supabaseUrl = arg("--supabase-url");
const anonKey = arg("--anon-key");
const adminEmail = arg("--admin-email");
const adminPassword = arg("--admin-password");

if (!file || !objectPath || !supabaseUrl || !anonKey || !adminEmail || !adminPassword) {
  console.error("usage: upload-poster.mjs --file <png> --object-path <date/format.png> --supabase-url <url> --anon-key <key> --admin-email <email> --admin-password <password>");
  process.exit(2);
}
if (!/^\d{4}-\d{2}-\d{2}\/(compare\/[abc]-(portrait|square|wide|story)\.png|(portrait|square|wide|story)\.png)$/.test(objectPath)) {
  console.error("object-path must be <YYYY-MM-DD>/<portrait|square|wide|story>.png or <YYYY-MM-DD>/compare/<a|b|c>-<format>.png");
  process.exit(2);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function uploadOnce() {
  const bytes = fs.readFileSync(file);
  if (bytes.length < 20000) throw new Error(`poster_too_small:${bytes.length} bytes`);
  const checksum = crypto.createHash("sha256").update(bytes).digest("hex");

  const supabase = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: session, error: signInError } = await supabase.auth.signInWithPassword({
    email: adminEmail,
    password: adminPassword,
  });
  if (signInError || !session?.session?.access_token) {
    throw new Error(`admin_sign_in_failed:${signInError?.message ?? "no session"}`);
  }
  supabase.auth.setSession(session.session);

  const { error: uploadError } = await supabase.storage
    .from("daily-content-posters")
    .upload(objectPath, bytes, { contentType: "image/png", upsert: true });
  if (uploadError) throw new Error(`storage_upload_failed:${uploadError.message}`);

  const { data: pub } = supabase.storage.from("daily-content-posters").getPublicUrl(objectPath);
  const publicUrl = pub?.publicUrl;
  if (!publicUrl) throw new Error("public_url_missing");

  // Verify the object is publicly fetchable before reporting success.
  const res = await fetch(publicUrl, { method: "GET" });
  if (!res.ok) throw new Error(`public_url_fetch_failed:http_${res.status}`);
  const fetched = Buffer.from(await res.arrayBuffer());
  if (fetched.length !== bytes.length) {
    throw new Error(`public_url_size_mismatch:fetched_${fetched.length}_vs_local_${bytes.length}`);
  }

  return { ok: true, objectPath, publicUrl, checksum, bytes: bytes.length };
}

let lastError = null;
let attempts = 0;
for (let attempt = 1; attempt <= 2; attempt++) {
  attempts = attempt;
  try {
    const result = await uploadOnce();
    console.log(JSON.stringify({ ...result, attempts: attempt }));
    process.exit(0);
  } catch (e) {
    lastError = e;
    const msg = e instanceof Error ? e.message : String(e);
    // Invalid credentials are deterministic — retrying cannot fix them.
    if (msg.startsWith("admin_sign_in_failed:Invalid login credentials")) break;
    if (attempt === 2) break;
    console.error(JSON.stringify({ ok: false, error: msg, attempt, retrying: true }));
    await sleep(5000);
  }
}
console.error(JSON.stringify({ ok: false, error: lastError instanceof Error ? lastError.message : String(lastError), attempts }));
process.exit(1);
