import { useEffect, useState } from "react";

export type StoryNavRef = { title: string; slug: string };

export type Story = {
  id: number;
  slug: string;
  category: string;
  title_bn: string;
  title_en: string;
  title_ur?: string;
  content_bn: string;
  content_en: string;
  content_ur?: string;
  moral_bn?: string;
  moral_en?: string;
  moral_ur?: string;
  source_name?: string;
  reference?: string;
  source_detail?: string;
  seo: {
    title: string;
    meta_description: string;
    keywords?: string[] | string;
    slug?: string;
    canonical_url?: string;
    open_graph?: Record<string, string>;
  };
  navigation?: {
    next_story?: StoryNavRef;
    related_stories?: StoryNavRef[];
    category_link?: string;
  };
  ads?: unknown;
  updated_at?: string;
  engagement?: { share_caption?: string; cta?: string };
  growth?: {
    read_next?: StoryNavRef;
    related?: StoryNavRef[];
    category?: string;
  };
  tags?: string[];
  author?: string;
  reading_time_minutes?: number;
  is_featured?: boolean;
  image_url?: string;
  og_image_url?: string;
  og_image_data?: { url?: string; image_url?: string };
  audio_url?: string;
  audio_trailer_url?: string;
};

export const STORY_CATEGORIES: Record<string, { label: string; description: string }> = {
  prophets: {
    label: "Stories of the Prophets",
    description: "Lives, struggles and lessons of the Anbiya (peace be upon them).",
  },
  sahaba: {
    label: "Companions of the Prophet",
    description: "Faith and sacrifice of the Sahaba (may Allah be pleased with them).",
  },
  islamic_historical_events: {
    label: "Islamic Historical Events",
    description: "Pivotal moments that shaped Islamic civilization.",
  },
  "islamic-history": {
    label: "Islamic History",
    description: "Stories from Islamic history.",
  },
  inspirational: {
    label: "Inspirational Stories",
    description: "Faith-filled stories that strengthen the heart.",
  },
  kids_friendly: {
    label: "Stories for Kids",
    description: "Easy, engaging Islamic stories for young readers.",
  },
};

export function categoryLabel(slug: string): string {
  return STORY_CATEGORIES[slug]?.label ?? slug.replace(/[_-]/g, " ");
}

export function categorySlug(raw: string): string {
  return raw;
}

const STORY_FILLER_PATTERNS = [
  /এটি একটি বিস্তারিত ইসলামিক গল্প।[\s\S]*?আল্লাহর প্রতি বিশ্বাস, ধৈর্য এবং ন্যায়বিচারের গুরুত্ব এখানে আরও স্পষ্ট করা হয়েছে।/g,
  /This is a detailed Islamic story\.[\s\S]*?The importance of faith in Allah, patience, and justice has been made clearer here\./gi,
  /یہ ایک تفصیلی اسلامی کہانی ہے۔[\s\S]*?اللہ پر ایمان، صبر اور انصاف کی اہمیت کو یہاں مزید واضح کیا گیا ہے۔/g,
];

/** Remove known placeholder/filler blocks from older imported story records. */
export function cleanStoryContent(text: string | null | undefined): string {
  let clean = text || "";
  for (const pattern of STORY_FILLER_PATTERNS) clean = clean.replace(pattern, "");
  return clean.replace(/\n{3,}/g, "\n\n").trim();
}

function isGenericStoryDescription(text: string): boolean {
  const normalized = (text || "").trim().toLowerCase();
  return (
    !normalized ||
    /^can .+ change your heart today\?/i.test(normalized) ||
    normalized.includes("this is a detailed islamic story") ||
    normalized.includes("এটি একটি বিস্তারিত ইসলামিক গল্প") ||
    normalized.includes("یہ ایک تفصیلی اسلامی کہانی")
  );
}

/** Prefer a story-specific opening paragraph when imported SEO copy is templated. */
export function storyMetaDescription(story: Story, max = 160): string {
  const existing = story.seo?.meta_description || "";
  if (!isGenericStoryDescription(existing)) return plainExcerpt(existing, max);

  const paragraphs = cleanStoryContent(story.content_bn || story.content_en || "")
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter((part) => part.length >= 45 && !/^(beginning|the test|the lesson)$/i.test(part));
  const opening = paragraphs[0] || story.title_bn || story.title_en;
  return plainExcerpt(opening, max);
}

function rowToStory(row: any, index: number): Story {
  const meta = row.metadata || {};
  return {
    id: index + 1,
    slug: row.slug,
    category: row.category ?? "",
    title_bn: row.title ?? "",
    title_en: row.title_en ?? "",
    title_ur: row.title_ur ?? undefined,
    content_bn: cleanStoryContent(row.content ?? ""),
    content_en: cleanStoryContent(row.content_en ?? ""),
    content_ur: cleanStoryContent(row.content_ur ?? undefined),
    moral_bn: row.moral_bn ?? meta.moral_bn ?? undefined,
    moral_en: row.moral_en ?? meta.moral_en ?? undefined,
    moral_ur: row.moral_ur ?? meta.moral_ur ?? undefined,
    source_name: row.source_name ?? meta.source_name ?? undefined,
    source_detail: row.source_detail ?? meta.source_detail ?? undefined,
    reference: row.reference ?? undefined,
    seo: (row.seo as Story["seo"]) ?? { title: row.title ?? "", meta_description: "" },
    navigation: row.navigation ?? meta.navigation ?? undefined,
    engagement: row.engagement ?? meta.engagement ?? undefined,
    growth: row.growth ?? meta.growth ?? undefined,
    tags: row.tags ?? meta.tags ?? undefined,
    author: row.author ?? meta.author ?? undefined,
    reading_time_minutes: row.reading_time_minutes ?? meta.reading_time_minutes ?? undefined,
    is_featured: row.is_featured ?? meta.is_featured ?? undefined,
    og_image_url: row.image_url ?? row.og_image_url ?? meta.og_image_url ?? meta.og_image_data?.url ?? meta.og_image_data?.image_url ?? row.seo?.open_graph?.["og:image"] ?? undefined,
    audio_url: row.audio_url ?? undefined,
    audio_trailer_url: row.audio_trailer_url ?? undefined,
    updated_at: row.updated_at ?? undefined,
  };
}

async function loadStoriesFromDb(): Promise<Story[] | null> {
  try {
    const { supabase } = await import("@/integrations/supabase/client");
    const request = supabase
      .from("admin_content")
      .select("*")
      .eq("content_type", "story")
      .eq("status", "published")
      .order("created_at", { ascending: true });
    const timeout = new Promise<never>((_, reject) =>
      window.setTimeout(() => reject(new Error("stories database timeout")), 4500),
    );
    const { data, error } = await Promise.race([request, timeout]);
    if (error || !data?.length) return null;
    // Do not expose the known internal placeholder record as public editorial content.
    return (data as any[])
      .filter((r) => r.slug && r.slug !== "test-story-manus")
      .map(rowToStory);
  } catch {
    return null;
  }
}

let cache: Story[] | null = null;
let pending: Promise<Story[]> | null = null;

export async function loadStories(): Promise<Story[]> {
  if (cache) return cache;
  if (pending) return pending;
  pending = (async () => {
    // 1) Admin-managed stories (database) win when present
    const fromDb = await loadStoriesFromDb();
    if (fromDb?.length) {
      cache = fromDb;
      pending = null;
      return fromDb;
    }
    // 2) Static JSON, 3) bundled copy
    try {
      const res = await fetch("/stories.json", { cache: "force-cache" });
      const data = (await res.json()) as Story[];
      if (Array.isArray(data) && data.length) {
        const normalized = data.filter((story) => story.slug !== "test-story-manus").map((story) => ({
          ...story,
          content_bn: cleanStoryContent(story.content_bn),
          content_en: cleanStoryContent(story.content_en),
          content_ur: cleanStoryContent(story.content_ur),
          og_image_url:
            story.og_image_url ??
            story.og_image_data?.url ??
            story.og_image_data?.image_url ??
            story.image_url ??
            story.seo?.open_graph?.["og:image"],
        }));
        cache = normalized;
        pending = null;
        return normalized;
      }
      throw new Error("empty stories.json");
    } catch {
      const mod = await import("@/data/stories.json");
      const normalized = (mod.default as unknown as Story[]).filter((story) => story.slug !== "test-story-manus").map((story) => ({
        ...story,
        content_bn: cleanStoryContent(story.content_bn),
        content_en: cleanStoryContent(story.content_en),
        content_ur: cleanStoryContent(story.content_ur),
        og_image_url:
          story.og_image_url ??
          story.og_image_data?.url ??
          story.og_image_data?.image_url ??
          story.image_url ??
          story.seo?.open_graph?.["og:image"],
      }));
      cache = normalized;
      pending = null;
      return normalized;
    }
  })();
  return pending;
}

/**
 * Clear the global stories cache. Useful for forcing a refresh of story data.
 * Use with caution as it will cause all story hooks to re-fetch data.
 */
export function clearStoriesCache() {
  cache = null;
  pending = null;
}

export function useStories() {
  const [stories, setStories] = useState<Story[] | null>(cache);
  const [loading, setLoading] = useState(!cache);
  useEffect(() => {
    if (cache) return;
    let active = true;
    loadStories()
      .then((d) => {
        if (!active) return;
        setStories(d);
      })
      .catch(() => {
        if (!active) return;
        setStories([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  return { stories: stories ?? [], loading };
}

export function estimateReadingMinutes(text: string): number {
  const words = (text || "").trim().split(/\s+/).length;
  return Math.max(2, Math.round(words / 200));
}

export function plainExcerpt(text: string, max = 180): string {
  const clean = (text || "").replace(/\s+/g, " ").trim();
  return clean.length > max ? clean.slice(0, max - 1) + "…" : clean;
}

/**
 * Split content that uses bare section headings (e.g. "Beginning", "The Test")
 * separated by blank lines into paragraphs/headings for rendering.
 */
export function splitStoryContent(content: string): Array<{ type: "h2" | "p"; text: string }> {
  const blocks = (content || "")
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean);
  return blocks.map((b) => {
    const isHeading = b.length < 80 && !/[।.!?]$/.test(b) && b.split(/\s+/).length <= 10;
    return { type: isHeading ? ("h2" as const) : ("p" as const), text: b };
  });
}

export function relatedStories(all: Story[], story: Story, limit = 3): Story[] {
  const refs = story.navigation?.related_stories ?? story.growth?.related ?? [];
  const bySlug = new Map(all.map((s) => [s.slug, s]));
  const out: Story[] = [];
  for (const r of refs) {
    const s = bySlug.get(r.slug);
    if (s && s.slug !== story.slug) out.push(s);
    if (out.length >= limit) return out;
  }
  // Fill remaining from same category
  for (const s of all) {
    if (out.length >= limit) break;
    if (s.slug === story.slug) continue;
    if (s.category === story.category && !out.find((o) => o.slug === s.slug)) out.push(s);
  }
  return out;
}

export function nextStory(all: Story[], story: Story): Story | null {
  const ref = story.navigation?.next_story ?? story.growth?.read_next;
  if (ref) {
    const found = all.find((s) => s.slug === ref.slug);
    if (found) return found;
  }
  const idx = all.findIndex((s) => s.slug === story.slug);
  return idx >= 0 && idx < all.length - 1 ? all[idx + 1] : null;
}