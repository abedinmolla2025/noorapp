// send-contact-email — HARDENED candidate (Phase 2, 2026-11-10).
//
// This function is ORPHANED: the live contact form posts to the Vercel
// route api/send-contact-email.ts, not to this Edge Function, and no
// other caller exists in the repo. The remove-vs-harden decision stays
// the OWNER's — this file is a HARDENED CANDIDATE ONLY, prepared so
// the owner can choose "harden" without further engineering. It is
// NOT deployed and must not be deployed until that decision is made.
//
// Hardening (M-08 controls, ported from the Vercel route standard):
//   - 64 KB body cap (Content-Length pre-check + raw-text byte check -> 413).
//   - Per-field length limits (name 100, email 254, subject 200,
//     message 5000) -> 400. Message is required.
//   - SINGLE fixed recipient: support@noorapp.in. SINGLE fixed sender:
//     "NoorApp Support <support@noorapp.in>". There is NO
//     RESEND_FROM_EMAIL env override and NO fallback-sender second send
//     (the original function retried with onboarding@resend.dev — that
//     double-send path is removed). Exactly ONE Resend call per request.
//   - No confirmation email to the sender (the Vercel route sends one;
//     this edge sends only to the support inbox, keeping the recipient
//     set to exactly one fixed address).
//   - reply_to is set ONLY when the sender address passes strict
//     validation; otherwise it is omitted (never echoed unchecked).
//   - All user input is HTML-escaped before being placed in the email.
//   - Fail-closed RESEND_API_KEY: missing key -> 500, zero sends.
//   - In-memory per-sender rate limit: 5 requests / 60 s per sender
//     email (anonymous senders share one bucket) -> 429 + Retry-After.
//     LIMITATION: the bucket is per Edge Function isolate, not
//     distributed — a determined abuser can exceed it across isolates.
//     Full abuse protection (CAPTCHA / WAF / shared store) is out of
//     scope here, exactly as in the Vercel route's M-08 note.
//   - The Resend response body is NOT relayed to the caller (only the
//     message id is returned); upstream errors map to a generic 500.
//   - No secret value is ever logged or returned.
//
// What this does NOT do: it does not add authentication (the contact
// form is public by design), does not add CAPTCHA, and does not change
// the Vercel route (which remains the live path).

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPPORT_EMAIL = "support@noorapp.in";
const SUPPORT_FROM = "NoorApp Support <support@noorapp.in>";

// --- NODE_TESTABLE_BEGIN ---
// Extracted verbatim by send-contact-email.test.mjs.
const MAX_PAYLOAD_BYTES = 65536;
const FIELD_LIMITS: Record<string, number> = {
  name: 100,
  email: 254,
  subject: 200,
  message: 5000,
};
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 5;
export type ContactValidation =
  | { ok: true; name: string; email: string; subject: string; message: string; replyEmailValid: boolean }
  | { ok: false; status: number; error: string };

/** Pure payload validation (no env, no network). `byteLength` is the raw body size in bytes. */
export function validateContactPayload(body: unknown, byteLength: number): ContactValidation {
  if (byteLength > MAX_PAYLOAD_BYTES) {
    return { ok: false, status: 413, error: "Request payload is too large" };
  }
  const record = (body ?? {}) as Record<string, unknown>;
  for (const [field, limit] of Object.entries(FIELD_LIMITS)) {
    const value = record[field];
    if (value !== undefined && value !== null && String(value).length > limit) {
      return { ok: false, status: 400, error: `${field} is too long (max ${limit} characters)` };
    }
  }
  const message = String(record.message ?? "");
  if (!message.trim()) {
    return { ok: false, status: 400, error: "Message is required" };
  }
  const email = String(record.email ?? "").trim();
  return {
    ok: true,
    name: String(record.name ?? "Anonymous Visitor").trim() || "Anonymous Visitor",
    email,
    subject: String(record.subject ?? "General Inquiry").trim() || "General Inquiry",
    message,
    replyEmailValid: email !== "" && EMAIL_PATTERN.test(email),
  };
}

/** Pure rate-limit decision over a per-key list of epoch-ms hits. Returns the pruned list + whether to allow. */
export function checkRateLimit(
  hits: number[],
  nowMs: number,
): { allowed: boolean; hits: number[]; retryAfterSeconds: number } {
  const kept = hits.filter((t) => nowMs - t < RATE_LIMIT_WINDOW_MS);
  if (kept.length >= RATE_LIMIT_MAX) {
    const oldest = Math.min(...kept);
    const retryAfterSeconds = Math.max(1, Math.ceil((RATE_LIMIT_WINDOW_MS - (nowMs - oldest)) / 1000));
    return { allowed: false, hits: kept, retryAfterSeconds };
  }
  return { allowed: true, hits: [...kept, nowMs], retryAfterSeconds: 0 };
}
// --- NODE_TESTABLE_END ---

const escapeHtml = (value: unknown) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

// Per-isolate, in-memory only (see header note). Keyed by sender email.
const rateBuckets = new Map<string, number[]>();

function jsonResponse(payload: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", ...extra },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ ok: false, error: "Method not allowed" }, 405);
  }

  try {
    const contentLength = Number(req.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > MAX_PAYLOAD_BYTES) {
      return jsonResponse({ ok: false, error: "Request payload is too large" }, 413);
    }
    const rawText = await req.text();
    if (new TextEncoder().encode(rawText).length > MAX_PAYLOAD_BYTES) {
      return jsonResponse({ ok: false, error: "Request payload is too large" }, 413);
    }
    let parsed: unknown = {};
    try {
      parsed = rawText ? JSON.parse(rawText) : {};
    } catch {
      return jsonResponse({ ok: false, error: "Invalid JSON" }, 400);
    }

    const validation = validateContactPayload(parsed, new TextEncoder().encode(rawText).length);
    if (!validation.ok) {
      return jsonResponse({ ok: false, error: validation.error }, validation.status);
    }

    // Rate limit BEFORE any send (per-sender bucket; anonymous share one).
    const bucketKey = validation.email || "anonymous";
    const nowMs = Date.now();
    const rl = checkRateLimit(rateBuckets.get(bucketKey) ?? [], nowMs);
    if (!rl.allowed) {
      return jsonResponse(
        { ok: false, error: "Too many requests" },
        429,
        { "Retry-After": String(rl.retryAfterSeconds) },
      );
    }
    rateBuckets.set(bucketKey, rl.hits);

    const resendApiKey = (Deno.env.get("RESEND_API_KEY") ?? "").trim();
    if (!resendApiKey) {
      return jsonResponse({ ok: false, error: "Server configuration error" }, 500);
    }

    const ticketReference = `NOOR-${new Date().toISOString().replace(/\D/g, "").slice(0, 14)}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
    const safeName = escapeHtml(validation.name);
    const safeEmail = escapeHtml(validation.email || "Not provided");
    const safeSubject = escapeHtml(validation.subject);
    const safeMessage = escapeHtml(validation.message);
    const safeTicketReference = escapeHtml(ticketReference);

    const htmlContent = `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#333;max-width:600px;margin:0 auto;padding:20px;border:1px solid #e2e8f0;border-radius:8px">
        <h2 style="color:#047857;border-bottom:2px solid #047857;padding-bottom:8px">New Contact Form Message - NoorApp</h2>
        <p><strong>Reference:</strong> ${safeTicketReference}</p>
        <p><strong>Name:</strong> ${safeName}</p>
        <p><strong>Email:</strong> ${safeEmail}</p>
        <p><strong>Subject:</strong> ${safeSubject}</p>
        <div style="margin-top:16px;padding:16px;background:#f8fafc;border-left:4px solid #047857;border-radius:4px">
          <p style="margin:0;white-space:pre-wrap">${safeMessage}</p>
        </div>
        <p style="margin-top:24px;font-size:12px;color:#64748b">This message was sent from the NoorApp contact form. Reply directly to contact the sender.</p>
      </div>
    `;

    // EXACTLY ONE Resend call: fixed sender, fixed single recipient.
    // No fallback sender, no second (confirmation) send.
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: SUPPORT_FROM,
        to: [SUPPORT_EMAIL],
        ...(validation.replyEmailValid ? { reply_to: validation.email } : {}),
        subject: `[Contact Us] ${validation.subject} · ${ticketReference}`,
        html: htmlContent,
      }),
    });
    const data = await response.json().catch(() => ({} as { id?: string }));
    if (!response.ok) {
      // No retry with a fallback sender — a failed send stays failed.
      return jsonResponse({ ok: false, error: "email_delivery_failed" }, 500);
    }

    return jsonResponse({ ok: true, id: (data as { id?: string }).id ?? null, ticketReference }, 200);
  } catch (error) {
    // Never log or return secret values or upstream bodies.
    console.error("Error sending contact email");
    void error;
    return jsonResponse({ ok: false, error: "email_delivery_failed" }, 500);
  }
});
