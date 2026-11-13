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

const SYSTEM_PROMPT = [
  "তুমি একজন ইসলামিক স্কলার এবং বাংলা SEO কন্টেন্ট লেখক।",
  "প্রতিটি হাদিসের জন্য সহজ, প্রাঞ্জল বাংলায় ব্যাখ্যা ও শিক্ষা লিখবে।",
  "explanation_bn: ১২০–১৮০ শব্দ, সহজ বাংলা, জটিল আরবি পরিভাষা এড়িয়ে চলো। অর্থ ও বাস্তব শিক্ষা ব্যাখ্যা করো।",
  "স্বাভাবিকভাবে অন্তত একবার এই phrase গুলোর কোনো একটি ব্যবহার করো: \"এই হাদীস থেকে শিক্ষা\", \"ইসলামে শিক্ষা\", \"আমরা শিখি\"।",
  "lessons_bn: ৩–৫টি ছোট bullet point, প্রতিটি ৮–১৫ শব্দ।",
  "প্রতিটি হাদিসের জন্য কন্টেন্ট unique হতে হবে।",
  "শুধু tool call এর মাধ্যমে structured output দাও, free text নয়।",
].join("\n");

async function generateForHadith(arabic: string, bengali: string | null): Promise<{ explanation_bn: string; lessons_bn: string[] }> {
  const userText = `আরবি:\n${arabic}\n\nবাংলা অনুবাদ:\n${bengali || "(অনুবাদ নেই, আরবি থেকে অর্থ বের করো)"}\n\nএই হাদিসের জন্য বাংলা explanation_bn ও lessons_bn তৈরি করো।`;

  // Phase 3: the Adapter owns the provider call (Gemini free primary,
  // Groq free secondary), retries, timeouts, and error classification.
  // The tool schema, response validation, and write guards are unchanged.
  const result = await generateToolCall({
    systemPrompt: SYSTEM_PROMPT,
    userText,
    tool: {
      name: "save_hadith_seo",
      description: "Save the Bengali SEO explanation and lessons.",
      parameters: {
        type: "object",
        properties: {
          explanation_bn: { type: "string" },
          lessons_bn: {
            type: "array",
            items: { type: "string" },
            minItems: 3,
            maxItems: 5,
          },
        },
        required: ["explanation_bn", "lessons_bn"],
        additionalProperties: false,
      },
    },
  });
  const args = result.args;
  if (!args.explanation_bn || !Array.isArray(args.lessons_bn)) {
    throw new Error("invalid tool args");
  }
  return {
    explanation_bn: String(args.explanation_bn).trim(),
    lessons_bn: (args.lessons_bn as unknown[])
      .map((s) => String(s).trim())
      .filter(Boolean),
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
      const { count: total } = await supabase
        .from("hadiths")
        .select("*", { count: "exact", head: true });
      const { count: pending } = await supabase
        .from("hadiths")
        .select("*", { count: "exact", head: true })
        .or("explanation_bn.is.null,lessons_bn.is.null");
      return new Response(
        JSON.stringify({ total: total ?? 0, pending: pending ?? 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const batchSize = Math.min(Math.max(Number(body.batchSize) || 10, 1), 20);

    const { data: rows, error } = await supabase
      .from("hadiths")
      .select("id, arabic, bengali, explanation_bn, lessons_bn")
      .or("explanation_bn.is.null,lessons_bn.is.null")
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
        slice.map(async (h: any) => {
          try {
            const out = await generateForHadith(h.arabic, h.bengali);
            const update: Record<string, unknown> = {};
            if (!h.explanation_bn) update.explanation_bn = out.explanation_bn;
            if (!h.lessons_bn || h.lessons_bn.length === 0)
              update.lessons_bn = out.lessons_bn;
            if (Object.keys(update).length === 0) return;
            const { error: upErr } = await supabase
              .from("hadiths")
              .update(update)
              .eq("id", h.id);
            if (upErr) throw upErr;
            processed++;
          } catch (e) {
            failed++;
            errors.push(`${h.id}: ${e instanceof Error ? e.message : String(e)}`);
          }
        }),
      );
    }

    const { count: pending } = await supabase
      .from("hadiths")
      .select("*", { count: "exact", head: true })
      .or("explanation_bn.is.null,lessons_bn.is.null");

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
    console.error("generate-hadith-seo error", e);
    return httpErrorResponse(e, corsHeaders);
  }
});
