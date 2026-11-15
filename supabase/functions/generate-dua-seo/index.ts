import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
import { httpErrorResponse, requireAdmin } from "../_shared/require-admin.ts";
import { generateToolCall } from "../_shared/ai-adapter.ts";
import { BENGALI_EDITORIAL_RULES } from "../_shared/bengali-editorial.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const STORY_SYSTEM_PROMPT = [
  "তুমি একজন ইসলামিক স্কলার এবং বাংলা SEO কন্টেন্ট লেখক।",
  "প্রতিটি ইসলামিক গল্পের জন্য সহজ, প্রাঞ্জল বাংলায় ব্যাখ্যা ও শিক্ষা লিখবে।",
  "explanation_bn: ১০০–১৫০ শব্দ; গল্পের প্রেক্ষাপট, ঘটনা ও নৈতিক বার্তা ব্যাখ্যা করো।",
  "কোনো ফজিলত, সওয়াব, উপকার বা পরকালীন ফলাফলের দাবি তৈরি করবে না — benefits/virtue/reward ধরনের কোনো কন্টেন্ট দেবে না।",
  "এই নিষেধ চারটি ভাষার ব্যাখ্যাতেই সমানভাবে প্রযোজ্য (explanation_bn/en/hi/ur)। English ব্যাখ্যায় virtue, reward, forgiven, forgiveness of sins, paradise, hellfire, guaranteed reward — এই ধরনের কোনো শব্দ বা ধারণা থাকবে না। শুধু গল্পের অর্থ, প্রেক্ষাপট ও নৈতিক শিক্ষা লেখো; কোনো ফলাফল, প্রতিদান বা পরকালীন লাভের প্রতিশ্রুতি দেবে না।",
  "কোনো বানোয়াট বর্ণনা বা দুর্বল রেওয়ায়াত যোগ করবে না।",
  "প্রতিটি গল্পের জন্য কন্টেন্ট unique হতে হবে।",
  "একই কন্টেন্টের English (en), Hindi (hi) এবং Urdu (ur) অনুবাদও দাও — explanation_en/hi/ur (১০০–১৫০ words)।",
  "শুধু tool call এর মাধ্যমে structured output দাও, free text নয়।",
  BENGALI_EDITORIAL_RULES,
].join("\n");

const SYSTEM_PROMPT = [
  "তুমি একজন ইসলামিক স্কলার এবং বাংলা SEO কন্টেন্ট লেখক।",
  "প্রতিটি দোয়ার জন্য সহজ, প্রাঞ্জল বাংলায় ব্যাখ্যা ও শিক্ষা লিখবে।",
  "explanation_bn: ১০০–১৫০ শব্দ, সহজ বাংলা; দোয়ার অর্থ, প্রেক্ষাপট ও বাস্তব শিক্ষা ব্যাখ্যা করো।",
  "স্বাভাবিকভাবে অন্তত একবার এই phrase গুলোর কোনো একটি ব্যবহার করো: \"আমরা শিখি\", \"ইসলামে শিক্ষা\"।",
  "কোনো ফজিলত, সওয়াব, উপকার বা পরকালীন ফলাফলের দাবি তৈরি করবে না — benefits/virtue/reward ধরনের কোনো কন্টেন্ট দেবে না।",
  "এই নিষেধ চারটি ভাষার ব্যাখ্যাতেই সমানভাবে প্রযোজ্য (explanation_bn/en/hi/ur)। English ব্যাখ্যায় virtue, reward, forgiven, forgiveness of sins, paradise, hellfire, guaranteed reward — এই ধরনের কোনো শব্দ বা ধারণা থাকবে না। শুধু দোয়ার অর্থ, প্রেক্ষাপট ও বাস্তব শিক্ষা লেখো; কোনো ফলাফল, প্রতিদান বা পরকালীন লাভের প্রতিশ্রুতি দেবে না।",
  "প্রতিটি দোয়ার জন্য কন্টেন্ট unique হতে হবে।",
  "একই কন্টেন্টের English (en), Hindi (hi) এবং Urdu (ur) অনুবাদও দাও — explanation_en/hi/ur (১০০–১৫০ words)। অনুবাদ অর্থ-বিশ্বস্ত ও স্বাভাবিক হতে হবে।",
  "শুধু tool call এর মাধ্যমে structured output দাও, free text নয়।",
  BENGALI_EDITORIAL_RULES,
].join("\n");

// --- NODE_TESTABLE_BEGIN ---
// Phase 2 / G-1 (2026-11-10): server-side virtue-language blocklist.
// The P0 remediation left generate-dua-seo suppression PROMPT-ONLY:
// benefits_* were still generated AND written straight to live
// admin_content rows. G-1 (2026-11-10) closed the write path:
// benefits_* are NEVER written to live rows (the update object
// below contains no benefits_* key at all). Full suppression
// (2026-11-12, Option A): benefits_* are no longer requested at all
// — not in the prompt, not in the tool schema, not in the return type
// — so the model never generates them. The two layers below remain:
//   (1) benefits_* are NEVER written to live rows;
//   (2) every explanation_* field is scanned for virtue/reward-claim
//       language BEFORE any write; a hit rejects the whole row
//       (failed++, error "virtue_language_blocked", zero writes).
// The list is deliberately NARROW (explicit virtue/reward claims:
// fazilat/sawab and their spellings, forgiveness/paradise/hell and
// reward language) to avoid false positives on ordinary religious
// vocabulary ("রহমত", "আল্লাহ", "দোয়া" are NOT blocked). It covers
// Bengali + English + common transliterations; Hindi/Urdu coverage is
// limited to shared transliterations (fazilat/sawab/thawab) — a
// Devanagari/Arabic-script virtue term the model emits in
// explanation_hi/ur is NOT caught. That is a documented limitation,
// not a guarantee. The list does NOT judge authenticity or grade
// content; it only blocks the claim language from reaching live rows.
// Pre-existing live benefits_* values are NOT touched by this
// candidate (they need the G-10 pending-row purge decision).
export const VIRTUE_BLOCKLIST: string[] = [
  // Bengali virtue/reward claims
  "ফজিলত", "ফযিলত", "ফজীলত",
  "সওয়াব", "সাওয়াব", "ছওয়াব",
  "গুনাহ মাফ", "পাপ মাফ", "গুনাহ মাফ হবে", "পাপ মোচন",
  "জান্নাত", "জাহান্নাম",
  "নেকি", "নেকী",
  // English virtue/reward claims
  "virtue", "virtues",
  "reward", "rewards", "rewarded",
  "will be forgiven", "sins forgiven", "sins are forgiven",
  "forgiven", "forgiveness of sins",
  "paradise", "hellfire",
  "expiat",
  "guaranteed reward",
  // Common transliterations (appear in en/hi/ur output)
  "fazilat", "fazilah", "fazeelat",
  "sawab", "sawaab", "thawab",
];
export type GeneratedSeoOutput = {
  explanation_bn?: unknown;
  explanation_en?: unknown;
  explanation_hi?: unknown;
  explanation_ur?: unknown;
};
/** Case-insensitive substring scan of one text value. */
export function containsVirtueLanguage(text: unknown): boolean {
  if (typeof text !== "string" || !text) return false;
  const hay = text.toLowerCase();
  return VIRTUE_BLOCKLIST.some((term) => hay.includes(term.toLowerCase()));
}
/** Scans all four explanation_* fields. Returns the blocked fields (empty = clean). */
export function validateGeneratedOutput(out: GeneratedSeoOutput): { ok: boolean; blockedFields: string[] } {
  const blockedFields: string[] = [];
  for (const f of ["explanation_bn", "explanation_en", "explanation_hi", "explanation_ur"] as const) {
    if (containsVirtueLanguage(out[f])) blockedFields.push(f);
  }
  return { ok: blockedFields.length === 0, blockedFields };
}
// --- NODE_TESTABLE_END ---

async function generateForDua(args: {
  title: string | null;
  arabic: string | null;
  bengali: string | null;
  category: string | null;
  kind?: "dua" | "story";
}): Promise<{ explanation_bn: string; explanation_en: string; explanation_hi: string; explanation_ur: string }> {
  const isStory = args.kind === "story";
  const userText = isStory
    ? `গল্পের নাম: ${args.title || "(নাম নেই)"}\nবিভাগ: ${args.category || "সাধারণ"}\n\nগল্পের বাংলা টেক্সট:\n${(args.bengali || "(টেক্সট নেই)").slice(0, 4000)}\n\nএই গল্পের জন্য explanation (ব্যাখ্যা) তৈরি করো।`
    : `দোয়ার নাম: ${args.title || "(নাম নেই)"}\nবিভাগ: ${args.category || "সাধারণ"}\n\nআরবি:\n${args.arabic || "(আরবি নেই)"}\n\nবাংলা অর্থ:\n${args.bengali || "(অনুবাদ নেই, আরবি থেকে বের করো)"}\n\nএই দোয়ার জন্য বাংলা explanation_bn তৈরি করো।`;

  // Phase 3: the Adapter owns the provider call (Gemini free primary,
  // Groq free secondary), retries, timeouts, and error classification.
  // The tool schema, the virtue gate below, and the write guards are
  // unchanged — benefits_* are still never requested or written.
  const result = await generateToolCall({
    systemPrompt: isStory ? STORY_SYSTEM_PROMPT : SYSTEM_PROMPT,
    userText,
    tool: {
      name: "save_dua_seo",
      description: "Save the multilingual SEO explanation for a dua (Bengali + English + Hindi + Urdu). No virtue, reward, forgiveness, paradise, or guaranteed-outcome claim in ANY language — describe only meaning, context, and practical lesson.",
      parameters: {
        type: "object",
        properties: {
          explanation_bn: { type: "string", description: "Bengali explanation, 100-150 words. No virtue/reward claim (ফজিলত/সওয়াব)." },
          explanation_en: { type: "string", description: "English explanation, 100-150 words. No virtue, reward, forgiven, forgiveness of sins, paradise, hellfire, or guaranteed reward — describe only meaning, context, and practical lesson." },
          explanation_hi: { type: "string", description: "Hindi explanation, 100-150 words. No virtue/reward claim." },
          explanation_ur: { type: "string", description: "Urdu explanation, 100-150 words. No virtue/reward claim." },
        },
        required: [
          "explanation_bn",
          "explanation_en",
          "explanation_hi",
          "explanation_ur",
        ],
        additionalProperties: false,
      },
    },
  });
  const parsed = result.args;
  if (!parsed.explanation_bn) {
    throw new Error("invalid tool args");
  }
  return {
    explanation_bn: String(parsed.explanation_bn).trim(),
    explanation_en: parsed.explanation_en ? String(parsed.explanation_en).trim() : "",
    explanation_hi: parsed.explanation_hi ? String(parsed.explanation_hi).trim() : "",
    explanation_ur: parsed.explanation_ur ? String(parsed.explanation_ur).trim() : "",
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // P0 remediation: stats and process require an authenticated admin.
    // The service-role client is only created AFTER this check.
    await requireAdmin(req);

    const body = await req.json().catch(() => ({}));
    const action = body.action || "process";
    const kind: "dua" | "story" = body.contentType === "story" ? "story" : "dua";
    const typeFilter = kind === "story" ? ["story", "Story"] : ["dua", "Dua"];
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

    if (action === "stats") {
      // G-1: "pending" now means a missing explanation_* only.
      // benefits_* are never written by this function, so they must
      // not keep a row pending forever.
      const { count: total } = await supabase
        .from("admin_content")
        .select("*", { count: "exact", head: true })
        .in("content_type", typeFilter);
      const { count: pending } = await supabase
        .from("admin_content")
        .select("*", { count: "exact", head: true })
        .in("content_type", typeFilter)
        .or(
          "explanation_bn.is.null,explanation_en.is.null,explanation_hi.is.null,explanation_ur.is.null",
        );
      return new Response(
        JSON.stringify({ total: total ?? 0, pending: pending ?? 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const batchSize = Math.min(Math.max(Number(body.batchSize) || 10, 1), 20);

    const { data: rows, error } = await supabase
      .from("admin_content")
      .select(
        "id, title, category, content_arabic, content, explanation_bn, explanation_en, explanation_hi, explanation_ur",
      )
      .in("content_type", typeFilter)
      .or(
        "explanation_bn.is.null,explanation_en.is.null,explanation_hi.is.null,explanation_ur.is.null",
      )
      .limit(batchSize);

    if (error) throw error;
    if (!rows || rows.length === 0) {
      return new Response(
        JSON.stringify({ processed: 0, failed: 0, pending: 0, done: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let processed = 0;
    let failed = 0;
    const errors: string[] = [];

    const concurrency = 3;
    for (let i = 0; i < rows.length; i += concurrency) {
      const slice = rows.slice(i, i + concurrency);
      await Promise.all(
        slice.map(async (d: any) => {
          try {
            const out = await generateForDua({
              title: d.title,
              arabic: d.content_arabic,
              bengali: d.content,
              category: d.category,
              kind,
            });
            // G-1: server-side virtue gate BEFORE any live write. A hit
            // rejects the whole row: zero writes, counted as failed.
            const gate = validateGeneratedOutput(out);
            if (!gate.ok) {
              throw new Error(
                `virtue_language_blocked (${gate.blockedFields.join(", ")})`,
              );
            }
            // G-1 + full suppression (2026-11-12, Option A): benefits_*
            // are no longer requested (not in the prompt, schema, or
            // return type) and are NEVER written to live rows. Only
            // explanation_* may be written, and only after passing the
            // gate above.
            const update: Record<string, unknown> = {};
            if (!d.explanation_bn) update.explanation_bn = out.explanation_bn;
            if (!d.explanation_en && out.explanation_en)
              update.explanation_en = out.explanation_en;
            if (!d.explanation_hi && out.explanation_hi)
              update.explanation_hi = out.explanation_hi;
            if (!d.explanation_ur && out.explanation_ur)
              update.explanation_ur = out.explanation_ur;
            if (Object.keys(update).length === 0) return;
            const { error: upErr } = await supabase
              .from("admin_content")
              .update(update)
              .eq("id", d.id);
            if (upErr) throw upErr;
            processed++;
          } catch (e) {
            failed++;
            errors.push(`${d.id}: ${e instanceof Error ? e.message : String(e)}`);
          }
        }),
      );
    }

    const { count: pending } = await supabase
      .from("admin_content")
      .select("*", { count: "exact", head: true })
      .in("content_type", typeFilter)
      .or(
        "explanation_bn.is.null,explanation_en.is.null,explanation_hi.is.null,explanation_ur.is.null",
      );

    return new Response(
      JSON.stringify({
        processed,
        failed,
        errors: errors.slice(0, 5),
        pending: pending ?? 0,
        done: (pending ?? 0) === 0,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("generate-dua-seo error", e);
    return httpErrorResponse(e, corsHeaders);
  }
});