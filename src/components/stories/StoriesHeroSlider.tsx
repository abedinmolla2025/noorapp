import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight, BookOpen, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Sparkles } from "lucide-react";
import { useStories } from "@/lib/stories";
import ogStoriesDefault from "@/assets/stories/og-stories-default.jpg";

export type HeroSlide = {
  slug: string;
  title: string;
  description: string;
  image: string;
  alt: string;
};

const AUTOPLAY_MS = 6000;

export default function StoriesHeroSlider() {
  const { stories, loading, retry } = useStories();
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const touchStartX = useRef<number | null>(null);

  // Prepare top 10 stories for the slider
  const slides = useMemo(() => {
    if (!stories || stories.length === 0) return [];
    
    // Sort by ID or creation date (descending) to get the most important ones, 
    // and take the first 10. We also filter for stories that have an image.
    return stories
      .slice(0, 10)
      .map((s) => ({
        slug: s.slug,
        title: s.title_bn || s.title_en,
        description: s.seo?.meta_description || "",
        image: s.og_image_url || ogStoriesDefault,
        alt: s.title_en || "",
      }));
  }, [stories]);

  const go = useCallback(
    (next: number) => {
      if (slides.length === 0) return;
      setIndex(((next % slides.length) + slides.length) % slides.length);
    },
    [slides.length],
  );
  
  const prev = useCallback(() => go(index - 1), [go, index]);
  const next = useCallback(() => go(index + 1), [go, index]);

  useEffect(() => {
    if (paused || slides.length === 0) return;
    const t = setInterval(() => setIndex((i) => (i + 1) % slides.length), AUTOPLAY_MS);
    return () => clearInterval(t);
  }, [paused, slides.length]);

  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current == null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(dx) > 40) (dx < 0 ? next : prev)();
    touchStartX.current = null;
  };

  if (loading) {
    return (
      <div className="relative w-full aspect-[3/4] sm:aspect-[16/10] md:aspect-[21/9] max-h-[620px] rounded-2xl bg-emerald-950/5 overflow-hidden border border-emerald-900/10">
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 z-20">
          <div className="relative">
            <Loader2 className="w-12 h-12 text-emerald-600 animate-spin" />
            <Sparkles className="absolute -top-1 -right-1 w-5 h-5 text-emerald-500 animate-pulse" />
          </div>
          <p className="text-emerald-800/60 animate-pulse font-medium tracking-widest text-xs uppercase">Preparing Feature Slider...</p>
        </div>
        
        {/* Skeleton content layout */}
        <div className="absolute inset-x-0 bottom-0 p-8 md:p-12 space-y-4 animate-pulse">
          <Skeleton className="h-4 w-24 bg-emerald-900/10 rounded" />
          <Skeleton className="h-12 w-2/3 bg-emerald-900/10 rounded-xl" />
          <Skeleton className="h-20 w-1/2 bg-emerald-900/5 rounded-lg" />
          <Skeleton className="h-12 w-32 bg-emerald-900/20 rounded-full" />
        </div>
        
        {/* Shimmer overlay */}
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-emerald-600/5 to-transparent -translate-x-full animate-[shimmer_3s_infinite] pointer-events-none" />
      </div>
    );
  }

  // Settled but empty: the stories fetch failed (useStories resolves a
  // failure to []) or the published set is empty. Never render the pulsing
  // "Preparing Feature Slider..." placeholder as final content — it used to
  // stay forever in exactly this state. Show a compact fallback with a retry
  // instead. Retry clears the shared stories cache, so the hub grid (same
  // source) recovers together with the hero.
  if (slides.length === 0) {
    return (
      <div className="relative w-full rounded-2xl border border-emerald-900/10 bg-emerald-950/5 p-8 text-center">
        <p className="font-medium text-emerald-900">No featured stories available right now.</p>
        <p className="mt-1 text-sm text-emerald-800/70">Check your connection and try again, or browse all stories.</p>
        <div className="mt-4 flex items-center justify-center gap-3">
          <Button onClick={retry}>Try again</Button>
          <Link to="/stories" className="text-sm font-medium text-emerald-700 underline underline-offset-4">Browse all stories</Link>
        </div>
      </div>
    );
  }

  return (
    <section
      aria-label="Featured Islamic stories"
      className="relative w-full overflow-hidden rounded-2xl shadow-xl bg-emerald-950 aspect-[3/4] sm:aspect-[16/10] md:aspect-[21/9] max-h-[620px]"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {slides.map((s, i) => {
        const active = i === index;
        return (
          <article
            key={s.slug}
            aria-hidden={!active}
            className={
              "absolute inset-0 transition-opacity duration-1000 ease-in-out " +
              (active ? "opacity-100 z-10" : "opacity-0 z-0 pointer-events-none")
            }
          >
            <img
              src={s.image}
              alt={s.alt}
              width={1600}
              height={900}
              loading={i === 0 ? "eager" : "lazy"}
              decoding="async"
              className="absolute inset-0 h-full w-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 p-5 md:p-12">
              <div className="max-w-2xl rounded-2xl border border-white/10 bg-black/20 backdrop-blur-md p-6 md:p-8 text-white shadow-2xl">
                <span className="inline-flex items-center gap-2 text-[10px] md:text-xs uppercase tracking-[0.2em] text-emerald-300 font-bold mb-3">
                  <BookOpen className="h-4 w-4" /> বিশেষ ফিচার
                </span>
                <h2 className="text-2xl md:text-4xl lg:text-5xl font-bold leading-tight font-[Noto_Sans_Bengali] mb-4">
                  {s.title}
                </h2>
                <p className="text-sm md:text-lg text-white/80 line-clamp-2 md:line-clamp-3 mb-6 font-medium leading-relaxed">
                  {s.description}
                </p>
                <Button asChild size="lg" className="bg-emerald-600 hover:bg-emerald-500 text-white rounded-full px-8 shadow-lg hover:shadow-emerald-900/20 transition-all">
                  <Link to={`/stories/${s.slug}`} aria-label={`Read story: ${s.title}`}>
                    গল্পটি পড়ুন
                  </Link>
                </Button>
              </div>
            </div>
          </article>
        );
      })}

      {/* Arrows */}
      <button
        type="button"
        aria-label="Previous slide"
        onClick={prev}
        className="hidden sm:flex absolute left-5 top-1/2 -translate-y-1/2 z-20 h-12 w-12 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white backdrop-blur-md transition-all border border-white/10"
      >
        <ChevronLeft className="h-6 w-6" />
      </button>
      <button
        type="button"
        aria-label="Next slide"
        onClick={next}
        className="hidden sm:flex absolute right-5 top-1/2 -translate-y-1/2 z-20 h-12 w-12 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white backdrop-blur-md transition-all border border-white/10"
      >
        <ChevronRight className="h-6 w-6" />
      </button>

      {/* Indicators */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 flex gap-2.5">
        {slides.map((s, i) => (
          <button
            key={s.slug}
            type="button"
            aria-label={`Go to slide ${i + 1}`}
            aria-current={i === index}
            onClick={() => go(i)}
            className={
              "h-1.5 rounded-full transition-all duration-500 " +
              (i === index ? "w-10 bg-emerald-500" : "w-2 bg-white/30 hover:bg-white/50")
            }
          />
        ))}
      </div>
    </section>
  );
}
