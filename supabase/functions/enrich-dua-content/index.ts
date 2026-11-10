import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
import {
  httpErrorResponse,
  requireAdmin,
  requireSecret,
} from "../_shared/require-admin.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Enrichment pipeline for Duas — generates when_to_recite_*, virtue text,
// hadith_reference (with strict validation against our hadiths table),
// related_duas (validated against admin_content), and a small FAQ block.
// Writes to metadata.enrichment_pending; admin must approve before it merges.

const SYSTEM_PROMPT = [
  "You are an Islamic scholar and multilingual content editor for a Dua reference website.",
  "For each Dua you enrich, produce contextual metadata in 4 languages: Bengali (bn), English (en), Hindi (hi), Urdu (ur).",
  "when_to_recite_*: 60-100 words each language — WHEN and WHY a Muslim recites this dua (occasion, situation, timing). Plain, factual, no invented rulings.",
  "virtue_bn/en/hi/ur: 40-70 words each — the spiritual virtue (fadilah) in general accepted terms. Do NOT quote a specific hadith unless you cite an exact book+number that actually exists.",
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
  virtue_bn: string;
  virtue_en: string;
  virtue_hi: string;
  virtue_ur: string;
  faq: Array<{ q: string; a: string }>;
  hadith_reference: string | null;
  quran_reference: string | null;
  related_dua_titles: string[];
};

async function callAi(userText: string, attempt = 0): Promise<EnrichedPayload> {
  // Fail closed: the Lovable key is a secret and must never be hardcoded.
  const lovableApiKey = requireSecret("LOVABLE_API_KEY");
  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${lovableApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userText },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "save_dua_enrichment",
            description: "Save enriched contextual metadata for a dua.",
            parameters: {
              type: "object",
              properties: {
                when_to_recite_bn: { type: "string" },
                when_to_recite_en: { type: "string" },
                when_to_recite_hi: { type: "string" },
                when_to_recite_ur: { type: "string" },
                virtue_bn: { type: "string" },
                virtue_en: { type: "string" },
                virtue_hi: { type: "string" },
                virtue_ur: { type: "string" },
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
                "virtue_bn",
                "virtue_en",
                "virtue_hi",
                "virtue_ur",
                "faq",
                "hadith_reference",
                "quran_reference",
                "related_dua_titles",
              ],
              additionalProperties: false,
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "save_dua_enrichment" } },
    }),
  });

  if (resp.status === 429 && attempt < 2) {
    await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
    return callAi(userText, attempt + 1);
  }
  if (!resp.ok) {
    const t = await resp.text();
    if (resp.status === 429) throw new Error("RATE_LIMIT");
    if (resp.status === 402) throw new Error("CREDITS_EXHAUSTED");
    throw new Error(`AI_ERROR ${resp.status} ${t.slice(0, 200)}`);
  }
  const data = await resp.json();
  const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
  if (!toolCall) throw new Error("NO_TOOL_CALL");
  return JSON.parse(toolCall.function.arguments) as EnrichedPayload;
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

      const toArray = (val: any) => {
        if (!val) return null;
        if (Array.isArray(val)) return val;
        if (typeof val !== "string") return [String(val)];
        // Split by newlines, bullets, or numbers
        return val
          .split(/\n+/)
          .map(s => s.replace(/^[\s•\-\d\.\)\>]+/, "").trim())
          .filter(s => s.length > 0);
      };

      const merged = { ...(row.metadata as any), enrichment_status: "approved" };
      delete merged.enrichment_pending;
      const patch: Record<string, unknown> = {
        metadata: merged,
        when_to_recite_bn: pending.when_to_recite_bn,
        when_to_recite_en: pending.when_to_recite_en,
        when_to_recite_hi: pending.when_to_recite_hi,
        when_to_recite_ur: pending.when_to_recite_ur,
        benefits_bn: toArray(pending.virtue_bn),
        benefits_en: toArray(pending.virtue_en),
        benefits_hi: toArray(pending.virtue_hi),
        benefits_ur: toArray(pending.virtue_ur),
        virtue: pending.virtue_bn,
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
      .not("metadata", "cs", { enrichment_status: "pending_review" })
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
          virtue_bn: raw.virtue_bn,
          virtue_en: raw.virtue_en,
          virtue_hi: raw.virtue_hi,
          virtue_ur: raw.virtue_ur,
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
        if (String(e?.message).includes("RATE_LIMIT") || String(e?.message).includes("CREDITS_EXHAUSTED")) {
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