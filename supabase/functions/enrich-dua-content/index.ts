import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
import { httpErrorResponse, requireAdmin } from "../_shared/require-admin.ts";
import {
  generateToolCall,
  isProviderLevelError,
} from "../_shared/ai-adapter.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Enrichment pipeline for Duas — generates when_to_recite_*,
// hadith_reference (with strict validation against our hadiths table),
// related_duas (validated against admin_content), and a small FAQ block.
// Virtue/fadilah claims are NOT generated (removed 2026-11-07, P0 remediation):
// unsupported religious claims must never enter the review pipeline.
// Writes to metadata.enrichment_pending; admin must approve before it merges.

const SYSTEM_PROMPT = [
  "You are an Islamic scholar and multilingual content editor for a Dua reference website.",
  "For each Dua you enrich, produce contextual metadata in 4 languages: Bengali (bn), English (en), Hindi (hi), Urdu (ur).",
  "when_to_recite_*: 60-100 words each language — WHEN and WHY a Muslim recites this dua (occasion, situation, timing). Plain, factual, no invented rulings.",
  "Do NOT generate virtue (fadilah), reward (sawab), benefit, or afterlife-outcome claims of any kind. The response must contain no virtue, reward, or benefit wording.",
  "faq: 3 short Q&A pairs (bn language). Each answer 30-60 words. Practical questions a reader would ask.",
  "hadith_reference: OPTIONAL. Only include if you are certain of an EXACT authentic reference from Sahih Bukhari / Sahih Muslim / Jami' at-Tirmidhi / Sunan Abi Dawud / Sunan an-Nasa'i / Sunan Ibn Majah, formatted like 'Sahih Bukhari 6407'. If not certain, return null. NEVER FABRICATE.",
  "quran_reference: OPTIONAL. Only include if you know the exact Surah:Ayah (e.g. '2:286'). If not certain, return null.",
  "related_dua_titles: 3-5 EXACT titles (in Bengali) of thematically related duas — these will be matched against our DB and dropped if not found.",
  "Return ONLY the tool call.",
].join("\n");

type EnrichedPayload = {
  when_to_recite_bn: string;
  when_to_recite_en: string;
  when_to_recite_hi: string;
  when_to_recite_ur: string;
  faq: Array<{ q: string; a: string }>;
  hadith_reference: string | null;
  quran_reference: string | null;
  related_dua_titles: string[];
};

async function callAi(userText: string): Promise<EnrichedPayload> {
  // Phase 3: the Adapter owns the provider call (Gemini free primary,
  // Groq free secondary), retries, timeouts, and error classification.
  // The tool schema and the server-side validation below are unchanged.
  // Virtue/fadilah claims are still never generated (the prompt forbids
  // them) and never merged into live fields (approve path below).
  const result = await generateToolCall({
    systemPrompt: SYSTEM_PROMPT,
    userText,
    tool: {
      name: "save_dua_enrichment",
      description: "Save enriched contextual metadata for a dua.",
      parameters: {
        type: "object",
        properties: {
          when_to_recite_bn: { type: "string" },
          when_to_recite_en: { type: "string" },
          when_to_recite_hi: { type: "string" },
          when_to_recite_ur: { type: "string" },
          faq: {
            type: "array",
            minItems: 3,
            maxItems: 3,
            items: {
              type: "object",
              properties: { q: { type: "string" }, a: { type: "string" } },
              required: ["q", "a"],
              additionalProperties: false,
            },
          },
          hadith_reference: { type: ["string", "null"] },
          quran_reference: { type: ["string", "null"] },
          related_dua_titles: {
            type: "array",
            minItems: 3,
            maxItems: 5,
            items: { type: "string" },
          },
        },
        required: [
          "when_to_recite_bn",
          "when_to_recite_en",
          "when_to_recite_hi",
          "when_to_recite_ur",
          "faq",
          "hadith_reference",
          "quran_reference",
          "related_dua_titles",
        ],
        additionalProperties: false,
      },
    },
  });
  return result.args as EnrichedPayload;
}

function validateQuranRef(ref: string | null): string | null {
  if (!ref) return null;
  const m = ref.trim().match(/^(\d{1,3}):(\d{1,3})$/);
  if (!m) return null;
  const surah = Number(m[1]);
  const ayah = Number(m[2]);
  if (surah < 1 || surah > 114) return null;
  if (ayah < 1 || ayah > 286) return null; // 286 = longest surah
  return `${surah}:${ayah}`;
}

async function validateHadithRef(
  supabase: ReturnType<typeof createClient>,
  ref: string | null,
): Promise<string | null> {
  if (!ref) return null;
  // Parse "Sahih Bukhari 6407", "Muslim 1234", etc.
  const m = ref.trim().match(/^(Sahih Bukhari|Sahih Muslim|Jami' at-Tirmidhi|Sunan Abi Dawud|Sunan an-Nasa'i|Sunan Ibn Majah|Tirmidhi|Abu Dawud|Nasa'i|Ibn Majah|Bukhari|Muslim)\s+(\d{1,5})$/i);
  if (!m) return null;
  const number = Number(m[2]);
  const { data } = await supabase
    .from("hadiths")
    .select("id")
    .eq("hadith_number", number)
    .limit(1);
  if (!data || data.length === 0) return null;
  return ref.trim();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // P0 remediation: every action (stats, list_pending, process, approve, reject)
    // requires an authenticated admin. The service-role client is only
    // created AFTER this check.
    await requireAdmin(req);

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);
    const body = await req.json();
    const action = body.action as "stats" | "process" | "list_pending" | "approve" | "reject";

    if (action === "stats") {
      const { count: total } = await supabase
        .from("admin_content")
        .select("id", { count: "exact", head: true })
        .eq("content_type", "dua");
      const { count: pending } = await supabase
        .from("admin_content")
        .select("id", { count: "exact", head: true })
        .eq("content_type", "dua")
        .is("when_to_recite_bn", null);
      const { count: awaitingReview } = await supabase
        .from("admin_content")
        .select("id", { count: "exact", head: true })
        .eq("content_type", "dua")
        .contains("metadata", { enrichment_status: "pending_review" });
      return Response.json(
        { total: total ?? 0, pending: pending ?? 0, awaitingReview: awaitingReview ?? 0 },
        { headers: corsHeaders },
      );
    }

    if (action === "list_pending") {
      const { data, error } = await supabase
        .from("admin_content")
        .select("id, title, category, metadata")
        .eq("content_type", "dua")
        .contains("metadata", { enrichment_status: "pending_review" })
        .limit(50);
      if (error) throw error;
      return Response.json({ items: data ?? [] }, { headers: corsHeaders });
    }

    if (action === "approve") {
      const id = String(body.id);
      const { data: row, error } = await supabase
        .from("admin_content")
        .select("id, metadata, related_duas, hadith_reference, faq, when_to_recite_bn")
        .eq("id", id)
        .single();
      if (error) throw error;
      const pending = (row?.metadata as any)?.enrichment_pending;
      if (!pending) throw new Error("no pending enrichment");

      const merged = { ...(row.metadata as any), enrichment_status: "approved" };
      delete merged.enrichment_pending;
      // Virtue/fadilah claims are never merged into live fields (P0 remediation):
      // pending rows written before this fix may still carry virtue_* values;
      // they are deliberately not copied here, so they can never reach publication.
      const patch: Record<string, unknown> = {
        metadata: merged,
        when_to_recite_bn: pending.when_to_recite_bn,
        when_to_recite_en: pending.when_to_recite_en,
        when_to_recite_hi: pending.when_to_recite_hi,
        when_to_recite_ur: pending.when_to_recite_ur,
        faq: pending.faq,
      };
      if (pending.hadith_reference) patch.hadith_reference = pending.hadith_reference;
      if (pending.related_dua_ids?.length) patch.related_duas = pending.related_dua_ids;
      const { error: upErr } = await supabase.from("admin_content").update(patch).eq("id", id);
      if (upErr) throw upErr;
      return Response.json({ ok: true }, { headers: corsHeaders });
    }

    if (action === "reject") {
      const id = String(body.id);
      const { data: row } = await supabase.from("admin_content").select("metadata").eq("id", id).single();
      const meta = { ...((row?.metadata as any) ?? {}), enrichment_status: "rejected" };
      delete meta.enrichment_pending;
      await supabase.from("admin_content").update({ metadata: meta }).eq("id", id);
      return Response.json({ ok: true }, { headers: corsHeaders });
    }

    // action === "process"
    const batchSize = Math.min(Math.max(Number(body.batchSize ?? 5), 1), 10);
    const { data: rows, error: rowsErr } = await supabase
      .from("admin_content")
      .select("id, title, title_en, category, content_arabic, content, metadata")
      .eq("content_type", "dua")
      .is("when_to_recite_bn", null)
      // NOTE: the value MUST be a JSON string here. postgrest-js's
      // .not() interpolates the value raw (`not.cs.${value}`) and does
      // NOT JSON-encode objects — an object becomes "[object Object]"
      // and Postgres rejects it with "invalid input syntax for type
      // json" (Phase D run #8). .contains() does JSON.stringify
      // objects, which is why list_pending's .contains() works.
      .not("metadata", "cs", JSON.stringify({ enrichment_status: "pending_review" }))
      .limit(batchSize);
    if (rowsErr) throw rowsErr;

    let processed = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const row of rows ?? []) {
      try {
        const userText = `Dua title (BN): ${row.title || "(none)"}\nCategory: ${row.category || "general"}\nArabic:\n${row.content_arabic || "(none)"}\nBengali meaning:\n${row.content || "(none)"}`;
        const raw = await callAi(userText);

        // Server-side validation
        const hadithRef = await validateHadithRef(supabase, raw.hadith_reference);
        const quranRef = validateQuranRef(raw.quran_reference);

        // Resolve related dua titles → IDs
        const relatedIds: string[] = [];
        if (raw.related_dua_titles?.length) {
          const { data: matches } = await supabase
            .from("admin_content")
            .select("id, title")
            .eq("content_type", "dua")
            .in("title", raw.related_dua_titles)
            .neq("id", row.id)
            .limit(5);
          for (const m of matches ?? []) relatedIds.push(m.id);
        }

        const pending = {
          when_to_recite_bn: raw.when_to_recite_bn,
          when_to_recite_en: raw.when_to_recite_en,
          when_to_recite_hi: raw.when_to_recite_hi,
          when_to_recite_ur: raw.when_to_recite_ur,
          faq: raw.faq,
          hadith_reference: hadithRef,
          quran_reference: quranRef,
          related_dua_ids: relatedIds,
          generated_at: new Date().toISOString(),
        };

        const newMeta = {
          ...((row.metadata as any) ?? {}),
          enrichment_status: "pending_review",
          enrichment_pending: pending,
        };

        const { error: upErr } = await supabase
          .from("admin_content")
          .update({ metadata: newMeta })
          .eq("id", row.id);
        if (upErr) throw upErr;
        processed++;
      } catch (e: any) {
        failed++;
        errors.push(`${row.id}: ${e?.message ?? e}`);
        // Phase 3: a provider-level failure (rate limit, quota, provider
        // down, auth, payment) will hit every remaining row the same way,
        // so stop the batch early. A per-row failure (schema/policy) only
        // fails that row. This replaces the old RATE_LIMIT /
        // CREDITS_EXHAUSTED message check.
        if (isProviderLevelError(e)) {
          break;
        }
      }
    }

    const { count: remaining } = await supabase
      .from("admin_content")
      .select("id", { count: "exact", head: true })
      .eq("content_type", "dua")
      .is("when_to_recite_bn", null);

    return Response.json(
      {
        processed,
        failed,
        errors,
        pending: remaining ?? 0,
        done: (rows?.length ?? 0) < batchSize,
      },
      { headers: corsHeaders },
    );
  } catch (e: any) {
    console.error("enrich-dua-content error", e);
    return httpErrorResponse(e, corsHeaders);
  }
});