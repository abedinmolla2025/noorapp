import { supabase } from "@/integrations/supabase/client";

export type ExportedDuaRow = {
  title: string;
  title_arabic?: string;
  title_en?: string;
  title_hi?: string;
  title_ur?: string;

  content_arabic?: string;
  content_bn?: string;
  content_en?: string;
  content_hi?: string;
  content_ur?: string;

  pronunciation?: string;
  pronunciation_en?: string;
  pronunciation_hi?: string;
  pronunciation_ur?: string;

  category?: string;
  slug?: string;
  
  // New rich fields
  source_type?: string;
  reference?: string;
  hadith_reference?: string;
  explanation_bn?: string;
  explanation_en?: string;
  explanation_hi?: string;
  explanation_ur?: string;
  benefits_bn?: string;
  benefits_en?: string;
  benefits_hi?: string;
  benefits_ur?: string;
  when_to_recite_bn?: string;
  when_to_recite_en?: string;
  when_to_recite_hi?: string;
  when_to_recite_ur?: string;
  subtitle?: string;
  authenticity?: string;
  difficulty?: string;
  time_required?: string;
  hook?: string;
  share_text?: string;
  virtue?: string;
  virtue_reference?: string;
  viral_score?: number;
  audio_url?: string;
  emotion?: string[];
  user_intents?: string[];
  recommendation_tags?: string[];
  recommended_moments?: string[];
  semantic_entities?: string[];
  normalized_surah_names?: string[];
  related_duas?: string[];
  hook_variants?: string[];
  social?: any;
  og_image_data?: any;
  seo?: any;
  quran_meta?: any;
  category_hierarchy?: any;
  faq?: any;
  search_aliases?: any;
  image_url?: string;
  
  // Legacy metadata fields (kept for compatibility)
  source?: string;
  extras?: any;
};

const downloadJson = (filename: string, data: unknown) => {
  const content = JSON.stringify(data, null, 2);
  const blob = new Blob([content], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

/**
 * Exports ALL "dua" items from the database to a downloadable JSON file.
 */
export async function exportAllDuasFromDbToJson(opts?: {
  filename?: string;
  pageSize?: number;
}): Promise<{ total: number }> {
  const filename = opts?.filename ?? "duas-all.json";
  const pageSize = Math.max(100, Math.min(opts?.pageSize ?? 1000, 1000));

  const out: Record<string, unknown>[] = [];
  let from = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const to = from + pageSize - 1;
    const { data, error } = await supabase
      .from("admin_content")
      .select("*")
      .eq("content_type", "dua")
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error) throw error;

    const rows = (data ?? []) as any[];

    for (const r of rows) {
      // Keep every column exactly as returned by Supabase, including nulls,
      // nested JSON, metadata, timestamps, IDs and any future schema fields.
      out.push(r as Record<string, unknown>);
    }

    if (rows.length < pageSize) break;
    from += pageSize;
  }

  downloadJson(filename, out);
  return { total: out.length };
}
