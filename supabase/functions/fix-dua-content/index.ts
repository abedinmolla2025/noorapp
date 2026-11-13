import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
import { httpErrorResponse, requireAdmin } from "../_shared/require-admin.ts";
import { generateToolCall } from "../_shared/ai-adapter.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const PRONUNCIATION_MIN = 100;
const MEANING_MIN = 120;
const MAX_ATTEMPTS = 3;

const SYSTEM_PROMPT = [
  "তুমি একজন ইসলামিক স্কলার এবং বাংলা ভাষার বিশেষজ্ঞ।",
  "প্রতিটি দোয়ার জন্য সম্পূর্ণ বাংলা উচ্চারণ (transliteration) এবং সম্পূর্ণ বাংলা অর্থ লিখবে।",
  "",
  "STRICT RULES (অবশ্যই মানতে হবে):",
  "- কখনোই সংক্ষিপ্ত (short) output দেবে না।",
  "- কখনোই summary দেবে না, সম্পূর্ণ text দেবে।",
  "- truncate / '...' / 'ইত্যাদি' ব্যবহার করবে না।",
  "- আরবি text এর প্রতিটি শব্দ ও বাক্যের জন্য উচ্চারণ ও অনুবাদ থাকতে হবে।",
  "",
  "content_pronunciation (বাংলা উচ্চারণ):",
  "- সম্পূর্ণ দোয়ার বাংলা transliteration।",
  "- Multi-line format, কমপক্ষে ৩–৬ লাইন।",
  "- প্রতিটি লাইন \\n দিয়ে আলাদা।",
  "- কমপক্ষে ১০০ অক্ষর।",
  "- কোনো অংশ বাদ দেওয়া যাবে না।",
  "",
  "content (বাংলা অর্থ):",
  "- সহজ, প্রাঞ্জল বাংলায় সম্পূর্ণ অনুবাদ।",
  "- ৩–৫ লাইনের multi-line paragraph।",
  "- প্রতিটি লাইন \\n দিয়ে আলাদা।",
  "- কমপক্ষে ১২০ অক্ষর।",
  "- শুধু এক বাক্যে দেবে না; পরিপূর্ণ ব্যাখ্যামূলক অনুবাদ দেবে।",
  "",
  "শুধু tool call এর মাধ্যমে structured output দাও, free text নয়।",
].join("\n");

async function generate(args: {
  title: string | null;
  arabic: string | null;
  existingPron: string | null;
  existingMeaning: string | null;
  needPron: boolean;
  needMeaning: boolean;
}) {
  const userText = `দোয়ার নাম: ${args.title || "(নাম নেই)"}\n\nআরবি text:\n${args.arabic || "(নেই)"}\n\nবর্তমান বাংলা উচ্চারণ (অসম্পূর্ণ হতে পারে):\n${args.existingPron || "(নেই)"}\n\nবর্তমান বাংলা অর্থ (অসম্পূর্ণ হতে পারে):\n${args.existingMeaning || "(নেই)"}\n\nসম্পূর্ণ ও পরিচ্ছন্ন বাংলা content_pronunciation এবং content (অর্থ) তৈরি করো।`;

  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  if (args.needPron) {
    properties.content_pronunciation = {
      type: "string",
      description:
        "সম্পূর্ণ বাংলা উচ্চারণ। Multi-line, কমপক্ষে ৩–৬ লাইন (\\n দিয়ে আলাদা), কমপক্ষে ১০০ অক্ষর। কোনো truncation নয়।",
      minLength: 100,
    };
    required.push("content_pronunciation");
  }
  if (args.needMeaning) {
    properties.content = {
      type: "string",
      description:
        "সম্পূর্ণ বাংলা অর্থ। ৩–৫ লাইন multi-line paragraph (\\n দিয়ে আলাদা), কমপক্ষে ১২০ অক্ষর। এক বাক্যে নয়।",
      minLength: 120,
    };
    required.push("content");
  }

  // Phase 3: the Adapter owns the provider call (Gemini free primary,
  // Groq free secondary), retries, timeouts, and error classification.
  // The tool schema is still built dynamically per row (only the
  // incomplete fields are requested; complete fields are never
  // overwritten) — the schema below is byte-for-byte the old one.
  const result = await generateToolCall({
    systemPrompt: SYSTEM_PROMPT,
    userText,
    tool: {
      name: "save_dua_content",
      description: "Save complete Bengali pronunciation and meaning for a dua.",
      parameters: {
        type: "object",
        properties,
        required,
        additionalProperties: false,
      },
    },
  });
  const parsed = result.args;
  const out: { content_pronunciation?: string; content?: string } = {};
  if (args.needPron && typeof parsed.content_pronunciation === "string") {
    out.content_pronunciation = parsed.content_pronunciation.trim();
  }
  if (args.needMeaning && typeof parsed.content === "string") {
    out.content = parsed.content.trim();
  }
  return out;
}

function isIncomplete(pron: string | null, meaning: string | null) {
  const pronLen = (pron ?? "").trim().length;
  const meanLen = (meaning ?? "").trim().length;
  return {
    needPron: pronLen < PRONUNCIATION_MIN,
    needMeaning: meanLen < MEANING_MIN,
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
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

    if (action === "stats") {
      // Fetch all duas (light columns) to count incomplete client-side (lengths)
      const { data, error } = await supabase
        .from("admin_content")
        .select("id, content, content_pronunciation")
        .in("content_type", ["dua", "Dua"]);
      if (error) throw error;
      const total = data?.length ?? 0;
      let pending = 0;
      for (const d of data ?? []) {
        const { needPron, needMeaning } = isIncomplete(d.content_pronunciation, d.content);
        if (needPron || needMeaning) pending++;
      }
      return new Response(
        JSON.stringify({ total, pending }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const batchSize = Math.min(Math.max(Number(body.batchSize) || 10, 1), 20);

    // Pull a candidate window then filter by length to find incomplete ones
    const { data: rows, error } = await supabase
      .from("admin_content")
      .select("id, title, content_arabic, content, content_pronunciation")
      .in("content_type", ["dua", "Dua"]);
    if (error) throw error;

    const incomplete = (rows ?? [])
      .map((d: any) => {
        const { needPron, needMeaning } = isIncomplete(d.content_pronunciation, d.content);
        return { row: d, needPron, needMeaning };
      })
      .filter((x) => x.needPron || x.needMeaning);

    const totalPending = incomplete.length;
    const slice = incomplete.slice(0, batchSize);

    if (slice.length === 0) {
      return new Response(
        JSON.stringify({ processed: 0, failed: 0, pending: 0, done: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let processed = 0;
    let failed = 0;
    const errors: string[] = [];

    const concurrency = 3;
    for (let i = 0; i < slice.length; i += concurrency) {
      const chunk = slice.slice(i, i + concurrency);
      await Promise.all(
          chunk.map(async ({ row, needPron, needMeaning }) => {
          try {
              let stillNeedPron = needPron;
              let stillNeedMeaning = needMeaning;
              const update: Record<string, unknown> = {};
              let lastErr: string | null = null;

              for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
                if (!stillNeedPron && !stillNeedMeaning) break;
                const out = await generate({
                  title: row.title,
                  arabic: row.content_arabic,
                  existingPron: row.content_pronunciation,
                  existingMeaning: row.content,
                  needPron: stillNeedPron,
                  needMeaning: stillNeedMeaning,
                });
                if (
                  stillNeedPron &&
                  out.content_pronunciation &&
                  out.content_pronunciation.length >= PRONUNCIATION_MIN
                ) {
                  update.content_pronunciation = out.content_pronunciation;
                  stillNeedPron = false;
                } else if (stillNeedPron) {
                  lastErr = `pronunciation too short (${out.content_pronunciation?.length ?? 0} chars)`;
                }
                if (stillNeedMeaning && out.content && out.content.length >= MEANING_MIN) {
                  update.content = out.content;
                  stillNeedMeaning = false;
                } else if (stillNeedMeaning) {
                  lastErr = `meaning too short (${out.content?.length ?? 0} chars)`;
                }
              }

              if (Object.keys(update).length === 0) {
                throw new Error(lastErr || "AI returned content too short");
              }
            const { error: upErr } = await supabase
              .from("admin_content")
              .update(update)
              .eq("id", row.id);
            if (upErr) throw upErr;
            processed++;
          } catch (e) {
            failed++;
            errors.push(`${row.id}: ${e instanceof Error ? e.message : String(e)}`);
          }
        }),
      );
    }

    const pending = Math.max(totalPending - processed, 0);
    return new Response(
      JSON.stringify({
        processed,
        failed,
        errors: errors.slice(0, 5),
        pending,
        done: pending === 0,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("fix-dua-content error", e);
    return httpErrorResponse(e, corsHeaders);
  }
});