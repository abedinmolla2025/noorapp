import { useEffect, useState } from "react";
import DailyHadith, { type PublishedDailyHadith } from "@/components/DailyHadith";
import { supabase } from "@/integrations/supabase/client";
import { kolkataDateString } from "@/lib/dailyContent/selection";

/**
 * Homepage wiring for the Daily Content automation (launch step: render
 * this instead of bare <DailyHadith /> in Index.tsx).
 *
 * Reads today's published row from `daily_content_publications` (public
 * read is allowed ONLY for status='published' rows — see the migration),
 * then loads the hadith text from the public `hadiths` table by ref.
 * ANY failure — no publication, no row, fetch error — falls back to the
 * original rotation. The homepage can never break because of this.
 */
export function DailyHadithContainer() {
  const [published, setPublished] = useState<PublishedDailyHadith | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const today = kolkataDateString(new Date());
        const { data: pub } = await supabase
          // New table: not yet in the generated Database types (same
          // `as any` pattern the codebase uses for device_push_tokens).
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .from("daily_content_publications" as any)
          .select("hadith_ref, hadith_source_line")
          .eq("kolkata_date", today)
          .eq("status", "published")
          .maybeSingle();
        const ref = (pub as { hadith_ref?: string | null } | null)?.hadith_ref;
        if (!ref || !ref.startsWith("hadith:")) return;
        const id = ref.slice("hadith:".length);
        const { data: h } = await supabase
          .from("hadiths")
          .select("arabic, bengali, book_key, chapter_id, hadith_number")
          .eq("id", id)
          .maybeSingle();
        const row = h as {
          arabic?: string;
          bengali?: string | null;
          book_key?: string;
          chapter_id?: number;
          hadith_number?: number;
        } | null;
        if (!row?.arabic || !row?.bengali) return;
        const book = row.book_key === "bukhari" ? "Sahih al-Bukhari" : (row.book_key ?? "");
        if (!cancelled) {
          setPublished({
            bengali: row.bengali,
            arabic: row.arabic,
            source: `${book}, Hadith ${row.hadith_number}`,
            chapter: `Chapter ${row.chapter_id}`,
            canonicalLink: row.book_key === "bukhari" ? "/hadith/sahih-bukhari/bangla" : "/hadith",
          });
        }
      } catch {
        // Fall through to the rotation — never break the homepage.
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return <DailyHadith published={published} />;
}
