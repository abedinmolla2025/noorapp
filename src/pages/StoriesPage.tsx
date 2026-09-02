import { useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { BookOpen, Search, Sparkles, ChevronRight, Flame, Clock, LayoutGrid, Play, Loader2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import BottomNavigation from "@/components/BottomNavigation";
import FooterSection from "@/components/FooterSection";
import StoriesHeroSlider from "@/components/stories/StoriesHeroSlider";
import {
  STORY_CATEGORIES,
  categoryLabel,
  estimateReadingMinutes,
  plainExcerpt,
  storyMetaDescription,
  useStories,
  type Story,
} from "@/lib/stories";

const PAGE_SIZE = 9;
const SITE = "https://noorapp.in";

const StorySkeleton = () => (
  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-pulse">
    {[1, 2, 3].map((i) => (
      <div key={i} className="relative bg-card rounded-2xl border border-border shadow-sm overflow-hidden flex flex-col h-full">
        <Skeleton className="aspect-[16/9] w-full bg-muted" />
        <div className="p-5 flex-1 space-y-4">
          <Skeleton className="h-6 w-3/4 bg-muted rounded" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-full bg-muted/60 rounded" />
            <Skeleton className="h-4 w-5/6 bg-muted/60 rounded" />
          </div>
          <div className="pt-4 flex justify-between items-center border-t border-border/50">
            <Skeleton className="h-3 w-20 bg-muted/40 rounded" />
            <Skeleton className="h-4 w-16 bg-muted/40 rounded" />
          </div>
        </div>
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full animate-[shimmer_2s_infinite]" />
      </div>
    ))}
  </div>
);

export default function StoriesPage() {
  const { stories, loading } = useStories();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const q = (params.get("q") || "").trim();
  const activeCat = params.get("category") || "all";
  const page = Math.max(1, parseInt(params.get("page") || "1", 10) || 1);
  const [searchInput, setSearchInput] = useState(q);

  const categoryCounts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const s of stories) {
      if (s.category) map[s.category] = (map[s.category] || 0) + 1;
    }
    return map;
  }, [stories]);

  const filtered = useMemo(() => {
    return stories.filter((s) => {
      if (activeCat !== "all" && s.category !== activeCat) return false;
      if (q) {
        const hay = `${s.title_en || ""} ${s.title_bn || ""} ${s.seo?.meta_description || ""}`.toLowerCase();
        if (!hay.includes(q.toLowerCase())) return false;
      }
      return true;
    });
  }, [stories, activeCat, q]);

  const featured = stories[0];
  const featuredGrid = stories.slice(0, 6);
  const latestStories = stories.slice(0, 6);
  const mostRead = [...stories]
    .sort((a, b) => (b.content_en?.length ?? 0) - (a.content_en?.length ?? 0))
    .slice(0, 6);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const showLandingSections = activeCat === "all" && !q && safePage === 1;
  const pageItems = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const updateParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (!value) next.delete(key);
    else next.set(key, value);
    if (key !== "page") next.delete("page");
    setParams(next, { replace: true });
  };

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "Islamic Stories — Prophets, Sahaba & History",
    url: `${SITE}/stories`,
    description:
      "Authentic Islamic stories of the Prophets, the Sahaba, and key events in Islamic history — read in Bengali and English on NoorApp.",
    hasPart: stories.slice(0, 25).map((s) => ({
      "@type": "Article",
      headline: s.title_en,
      url: `${SITE}/stories/${s.slug}`,
    })),
  };

  return (
    <div className="min-h-screen bg-background pb-24">
      <Helmet>
        <title>Islamic Stories — Prophets, Sahaba & History | NoorApp</title>
        <meta
          name="description"
          content="Read authentic Islamic stories: Prophets (peace be upon them), the Sahaba, and key events of Islamic history — in Bengali and English."
        />
        <link rel="canonical" href={`${SITE}/stories`} />
        <meta property="og:title" content="Islamic Stories — Prophets, Sahaba & History" />
        <meta
          property="og:description"
          content="Authentic Islamic stories of the Prophets, the Sahaba and Islamic history, in Bengali and English."
        />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={`${SITE}/stories`} />
        <meta name="twitter:card" content="summary_large_image" />
        <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>
      </Helmet>

      {/* Hero */}
      <section className="bg-gradient-to-br from-emerald-700 to-emerald-900 text-white">
        <div className="container mx-auto px-4 py-10 md:py-14">
          <nav aria-label="Breadcrumb" className="text-sm text-emerald-100/80 mb-3">
            <Link to="/" className="hover:text-white">Home</Link>
            <span className="mx-2">/</span>
            <span className="text-white">Stories</span>
          </nav>
          <h1 className="text-3xl md:text-4xl font-bold flex items-center gap-3">
            <BookOpen className="h-8 w-8" /> Islamic Stories
          </h1>
          <p className="mt-3 max-w-2xl text-emerald-50/90">
            Authentic stories of the Prophets (peace be upon them), the noble Sahaba, and pivotal events from
            Islamic history — sourced from the Quran, Sahih Hadith and classical works such as <em>Stories of
            the Prophets</em> by Ibn Kathir.
          </p>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              updateParam("q", searchInput || null);
            }}
            className="mt-6 flex gap-2 max-w-xl"
            role="search"
          >
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search stories..."
                aria-label="Search Islamic stories"
                className="pl-9 bg-white text-foreground"
              />
            </div>
            <Button type="submit" variant="secondary">Search</Button>
          </form>
        </div>
      </section>

      <div className="container mx-auto px-4 py-8 space-y-10">
        {/* Premium Hero Slider */}
        {showLandingSections && (
          <section aria-labelledby="hero-slider-heading">
            <h2 id="hero-slider-heading" className="sr-only">Featured Prophet Stories</h2>
            <StoriesHeroSlider />
          </section>
        )}

        {/* Featured Stories Grid */}
        {showLandingSections && featuredGrid.length > 0 && (
          <section aria-labelledby="featured-grid-heading">
            <div className="flex items-baseline justify-between mb-3">
              <h2 id="featured-grid-heading" className="text-xl font-semibold flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-emerald-600" /> Featured Stories
              </h2>
              <Link to="/stories/category/prophets" className="text-sm text-emerald-700 hover:underline">
                See all prophets →
              </Link>
            </div>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {featuredGrid.map((s) => (
                <StoryListCard key={s.slug} story={s} />
              ))}
            </div>
          </section>
        )}

        {/* Categories */}
        <section aria-labelledby="cats-heading">
          <h2 id="cats-heading" className="text-xl font-semibold mb-3 flex items-center gap-2">
            <LayoutGrid className="h-5 w-5 text-emerald-600" /> Browse by Category
          </h2>
          <div className="flex flex-wrap gap-2">
            <CategoryChip active={activeCat === "all"} onClick={() => updateParam("category", null)}>
              All ({stories.length})
            </CategoryChip>
            {Object.keys(STORY_CATEGORIES).map((key) => {
              const count = categoryCounts[key] || 0;
              if (!count) return null;
              return (
                <CategoryChip
                  key={key}
                  active={activeCat === key}
                  onClick={() => updateParam("category", key)}
                >
                  {categoryLabel(key)} ({count})
                </CategoryChip>
              );
            })}
          </div>
        </section>

        {/* Most Read */}
        {showLandingSections && mostRead.length > 0 && (
          <section aria-labelledby="most-read-heading">
            <div className="flex items-baseline justify-between mb-3">
              <h2 id="most-read-heading" className="text-xl font-semibold flex items-center gap-2">
                <Flame className="h-5 w-5 text-orange-500" /> Most Read Stories
              </h2>
            </div>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {mostRead.map((s) => (
                <StoryListCard key={s.slug} story={s} />
              ))}
            </div>
          </section>
        )}

        {/* Listing */}
        <section aria-labelledby="list-heading">
          <div className="flex items-baseline justify-between mb-3">
            <h2 id="list-heading" className="text-xl font-semibold flex items-center gap-2">
              {!q && activeCat === "all" && <Clock className="h-5 w-5 text-emerald-600" />}
              {q ? `Results for “${q}”` : activeCat === "all" ? "Latest Stories" : categoryLabel(activeCat)}
            </h2>
            <span className="text-sm text-muted-foreground">{filtered.length} stories</span>
          </div>

          {loading ? (
            <div className="space-y-8">
              <div className="flex flex-col items-center justify-center py-10 gap-3">
                <div className="relative">
                  <Loader2 className="w-10 h-10 text-emerald-600 animate-spin" />
                  <Sparkles className="absolute -top-1 -right-1 w-4 h-4 text-emerald-500 animate-pulse" />
                </div>
                <p className="text-muted-foreground animate-pulse font-medium tracking-wide">Preparing Stories...</p>
              </div>
              <StorySkeleton />
            </div>
          ) : pageItems.length === 0 ? (
            <Card><CardContent className="py-10 text-center text-muted-foreground">No stories found.</CardContent></Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {pageItems.map((s) => (
                <StoryListCard key={s.slug} story={s} />
              ))}
            </div>
          )}

          {totalPages > 1 && (
            <Pagination className="mt-8">
              <PaginationContent>
                {safePage > 1 && (
                  <PaginationItem>
                    <PaginationPrevious
                      href="#"
                      onClick={(e) => { e.preventDefault(); updateParam("page", String(safePage - 1)); }}
                    />
                  </PaginationItem>
                )}
                {Array.from({ length: totalPages }).map((_, i) => (
                  <PaginationItem key={i}>
                    <PaginationLink
                      href="#"
                      isActive={safePage === i + 1}
                      onClick={(e) => { e.preventDefault(); updateParam("page", String(i + 1)); }}
                    >
                      {i + 1}
                    </PaginationLink>
                  </PaginationItem>
                ))}
                {safePage < totalPages && (
                  <PaginationItem>
                    <PaginationNext
                      href="#"
                      onClick={(e) => { e.preventDefault(); updateParam("page", String(safePage + 1)); }}
                    />
                  </PaginationItem>
                )}
              </PaginationContent>
            </Pagination>
          )}
        </section>

        <section aria-labelledby="story-reading-guide" className="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-5">
          <h2 id="story-reading-guide" className="text-xl font-semibold text-emerald-950">ইসলামিক গল্প পড়ার সময় কী লক্ষ্য করবেন</h2>
          <p className="mt-3 text-sm leading-7 text-emerald-900/80">
            Noor-এর গল্পগুলো কুরআন, হাদিস ও ইসলামী ইতিহাসভিত্তিক শিক্ষামূলক পাঠ হিসেবে সাজানো। প্রতিটি গল্প পড়ার সময় ঘটনাটির মূল চরিত্র, নির্ভরযোগ্য উৎস এবং শিক্ষা আলাদা করে লক্ষ্য করুন—যেমন ধৈর্য, সত্যবাদিতা, তাওয়াক্কুল, ক্ষমা বা ন্যায়বিচার। গল্পের সংক্ষিপ্ত card-এর বদলে সম্পূর্ণ story page খুললে প্রেক্ষাপট, source note এবং audio narration একসঙ্গে পাওয়া যায়।
          </p>
          <p className="mt-3 text-sm leading-7 text-emerald-900/80">
            কোনো ঘটনা বা বর্ণনার ঐতিহাসিক বিশদ নিয়ে মতভেদ থাকলে সেটিকে চূড়ান্ত ধর্মীয় ফতোয়া হিসেবে ব্যবহার করবেন না। source note পরীক্ষা করুন এবং প্রয়োজন হলে যোগ্য আলেম বা নির্ভরযোগ্য তাফসির/সীরাত গ্রন্থের সঙ্গে মিলিয়ে নিন। ভুল তথ্য চোখে পড়লে <a href="/sources" className="font-semibold text-emerald-800 underline-offset-2 hover:underline">উৎস ও সংশোধন পেজে</a> জানান।
          </p>
        </section>
      </div>

      <FooterSection platform="web" onNavigate={(path) => navigate(path)} />
      <BottomNavigation />
    </div>
  );
}

function CategoryChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "rounded-full border px-3 py-1.5 text-sm transition " +
        (active
          ? "bg-emerald-600 text-white border-emerald-600"
          : "bg-background hover:bg-muted border-border")
      }
    >
      {children}
    </button>
  );
}

function StoryListCard({ story }: { story: Story }) {
  const thumbnail = story.og_image_url || "/assets/stories/og-stories-default.jpg";
  
  return (
    <Card className="group h-full flex flex-col border-none bg-card hover:bg-emerald-50/30 dark:hover:bg-emerald-950/10 shadow-sm hover:shadow-xl transition-all duration-300 overflow-hidden rounded-2xl ring-1 ring-border hover:ring-emerald-200 dark:hover:ring-emerald-800">
      <div className="relative aspect-[16/9] w-full overflow-hidden">
        <Link to={`/stories/${story.slug}`}>
          <div className="absolute inset-0 bg-black/10 group-hover:bg-black/20 transition-colors z-10" />
          
          {/* Play Button Overlay */}
          <div className="absolute inset-0 flex items-center justify-center z-20 opacity-90 group-hover:opacity-100 transition-opacity">
            <div className="bg-white/20 backdrop-blur-sm rounded-full p-3 ring-4 ring-white/30 group-hover:scale-110 transition-transform duration-300">
              <Play className="h-8 w-8 text-white fill-white" />
            </div>
          </div>

          <img 
            src={thumbnail} 
            alt={story.title_bn || story.title_en}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
            loading="lazy"
          />
          <div className="absolute top-3 left-3 z-20">
            <Badge className="bg-white/90 dark:bg-black/80 text-emerald-700 dark:text-emerald-400 backdrop-blur-sm border-none shadow-sm font-medium">
              {categoryLabel(story.category)}
            </Badge>
          </div>
        </Link>
      </div>
      
      <CardHeader className="flex-1 pt-5 px-5 space-y-3">
        <CardTitle className="text-xl font-bold leading-tight text-foreground group-hover:text-emerald-700 dark:group-hover:text-emerald-400 transition-colors line-clamp-2 font-[Noto_Sans_Bengali]">
          <Link to={`/stories/${story.slug}`}>
            {story.title_bn || story.title_en}
          </Link>
        </CardTitle>
        <CardDescription className="text-sm text-muted-foreground line-clamp-2 leading-relaxed">
          {storyMetaDescription(story, 140)}
        </CardDescription>
      </CardHeader>
      
      <CardContent className="pt-0 pb-5 px-5 flex items-center justify-between border-t border-emerald-50 dark:border-emerald-900/30 mt-4 pt-4">
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <Clock className="h-3.5 w-3.5 text-emerald-600" />
          <span>{estimateReadingMinutes(story.content_bn || story.content_en)} মিনিট পাঠ</span>
        </div>
        <Link 
          to={`/stories/${story.slug}`} 
          className="inline-flex items-center gap-1 text-sm font-bold text-emerald-700 dark:text-emerald-400 hover:gap-2 transition-all"
        >
          পড়ুন <ChevronRight className="h-4 w-4" />
        </Link>
      </CardContent>
    </Card>
  );
}