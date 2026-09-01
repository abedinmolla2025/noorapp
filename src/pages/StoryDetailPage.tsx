import { useEffect, useRef, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link, useNavigate, useParams, useLocation } from "react-router-dom";
import {
  ArrowLeft,
  BookOpen,
  ChevronRight,
  Clock,
  Languages,
  Quote,
  Share2,
  Sparkles,
  RotateCcw,
  RotateCw,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import BottomNavigation from "@/components/BottomNavigation";
import FooterSection from "@/components/FooterSection";
import {
  categoryLabel,
  estimateReadingMinutes,
  nextStory,
  plainExcerpt,
  relatedStories,
  splitStoryContent,
  useStories,
  type Story,
} from "@/lib/stories";
import { toast } from "@/hooks/use-toast";
import ogStoriesDefault from "@/assets/stories/og-stories-default.jpg";
import heroAdam from "@/assets/stories/hero-adam.jpg";
import heroNuh from "@/assets/stories/hero-nuh.jpg";
import heroIbrahim from "@/assets/stories/hero-ibrahim.jpg";
import heroMusa from "@/assets/stories/hero-musa.jpg";
import heroYusuf from "@/assets/stories/hero-yusuf.jpg";

const SITE = "https://noorapp.in";

const STORY_OG_IMAGES: Record<string, string> = {
  "prophet-adam-story-islam": heroAdam,
  "prophet-nuh-story-islam": heroNuh,
  "prophet-ibrahim-story-islam": heroIbrahim,
  "prophet-musa-story-islam": heroMusa,
  "prophet-yusuf-story-islam": heroYusuf,
};

function absoluteUrl(path: string): string {
  if (!path) return `${SITE}${ogStoriesDefault}`;
  if (/^https?:\/\//i.test(path)) return path;
  return `${SITE}${path.startsWith("/") ? "" : "/"}${path}`;
}

function cacheBustUrl(url: string, version: string): string {
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}v=${encodeURIComponent(version)}`;
}

export default function StoryDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const { stories, loading } = useStories();
  const navigate = useNavigate();
  const [lang, setLang] = useState<"en" | "bn">("bn");

  const story = stories.find((s) => s.slug === slug);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  }, [slug, story]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [audioError, setAudioError] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const location = useLocation();
  const isTrailerMode = new URLSearchParams(location.search).get("trailer") === "true" || location.pathname.endsWith("/trailer");

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    audio.pause();
    audio.currentTime = 0;
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setAudioError(false);

    if (story?.audio_url) {
      audio.src = story.audio_url;
      audio.load();
    } else {
      audio.removeAttribute("src");
      audio.load();
    }

    return () => {
      audio.pause();
    };
  }, [story?.audio_url]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio || !story?.audio_url) return;
    if (audio.paused) {
      audio.play().catch(() => setAudioError(true));
    } else {
      audio.pause();
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = Number(e.target.value);
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(time)) return;
    audio.currentTime = time;
    setCurrentTime(time);
  };

  const seekOffset = (seconds: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = Math.max(0, Math.min(audio.duration || 0, audio.currentTime + seconds));
    setCurrentTime(audio.currentTime);
  };

  const formatTime = (seconds: number) => {
    if (!seconds || !Number.isFinite(seconds)) return "0:00";
    const totalSeconds = Math.floor(seconds);
    const minutes = Math.floor(totalSeconds / 60);
    const remainder = totalSeconds % 60;
    return `${minutes}:${remainder.toString().padStart(2, "0")}`;
  };

  if (!loading && !story) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4 text-center">
        <h1 className="text-2xl font-semibold">Story not found</h1>
        <p className="text-muted-foreground mt-2">The story you’re looking for doesn’t exist.</p>
        <Button asChild className="mt-6"><Link to="/stories">Browse all stories</Link></Button>
      </div>
    );
  }

  if (!story) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading…</div>;
  }

  // Validate slug match to catch data inconsistencies
  if (story.slug !== slug) {
    console.error(`[StoryDetailPage] Slug mismatch: URL parameter is "${slug}" but story slug is "${story.slug}"`);
  }

  // Define variables here to avoid hoisting issues in Trailer Mode
  const storyTitle = story.title_bn || story.title_en;
  const url = `${SITE}/stories/${story.slug}`;
  const ogImagePath = story.og_image_url || STORY_OG_IMAGES[story.slug] || ogStoriesDefault;
  const ogImageBase = absoluteUrl(ogImagePath);
  const ogImage = story.updated_at ? cacheBustUrl(ogImageBase, story.updated_at) : ogImageBase;

  const handleAudioShare = async () => {
    if (!story.audio_url) {
      toast({ title: "অডিও এখনো নেই", description: "এই গল্পের সম্পূর্ণ অডিও শিগগিরই যোগ করা হবে।" });
      return;
    }
    const shareText = `🎧 ${storyTitle}\n\nএই সম্পূর্ণ ইসলামিক গল্পের অডিও শুনুন ও শেয়ার করুন।\nগল্পের পেজ: ${url}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: `🎧 ${storyTitle}`, text: shareText, url: story.audio_url });
      } else {
        await navigator.clipboard.writeText(story.audio_url);
        toast({ title: "পূর্ণ অডিও লিংক কপি হয়েছে", description: "এখন সরাসরি অডিওটি শেয়ার করতে পারবেন।" });
      }
    } catch (err) {
      if ((err as DOMException)?.name !== "AbortError") {
        await navigator.clipboard.writeText(story.audio_url);
        toast({ title: "পূর্ণ অডিও লিংক কপি হয়েছে", description: "এখন সরাসরি অডিওটি শেয়ার করতে পারবেন।" });
      }
    }
  };

  // Full Audio landing route (legacy /trailer URLs now share the complete Story audio)
  if (isTrailerMode) {
    return (
      <div className="min-h-screen bg-[#0a1a1a] flex flex-col items-center justify-center p-4">
        <Helmet>
          <title>🎧 {storyTitle} — Full Audio | Noor</title>
          <meta name="description" content="এই ইসলামিক গল্পটির সম্পূর্ণ অডিও শুনুন ও শেয়ার করুন।" />
          <meta property="og:title" content={`🎧 ${storyTitle} (Full Audio)`} />
          <meta property="og:description" content="এই ইসলামিক গল্পটির সম্পূর্ণ অডিও শুনুন ও শেয়ার করুন।" />
          <meta property="og:image" content={ogImage} />
          <meta property="og:image:secure_url" content={ogImage} />
          <meta property="og:image:width" content="1200" />
          <meta property="og:image:height" content="630" />
          <meta property="og:type" content="article" />
          <meta property="og:url" content={url} />
          {story.audio_url && (
            <>
              <meta property="og:audio" content={story.audio_url} />
              <meta property="og:audio:type" content="audio/mpeg" />
            </>
          )}
          <meta name="twitter:card" content="summary_large_image" />
          <meta name="twitter:title" content={`🎧 ${storyTitle} (Full Audio)`} />
          <meta name="twitter:description" content="এই ইসলামিক গল্পটির সম্পূর্ণ অডিও শুনুন ও শেয়ার করুন।" />
          <meta name="twitter:image" content={ogImage} />
        </Helmet>
        
        <div className="w-full max-w-2xl space-y-8">
          <div className="text-center space-y-4">
            <Link to="/" className="inline-block mb-8">
              <h2 className="text-3xl font-black text-emerald-500 tracking-tighter italic">NOOR</h2>
            </Link>
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-500/20 border border-emerald-500/30 text-emerald-300">
              <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-500 animate-ping"></span>
              <span className="text-[11px] uppercase tracking-[0.25em] font-black">Playing Full Story Audio</span>
            </div>
          </div>

          <div className="relative rounded-[2.5rem] overflow-hidden shadow-[0_30px_60px_-15px_rgba(0,0,0,0.8)] border border-emerald-500/30 bg-emerald-950/20 backdrop-blur-3xl p-6 sm:p-10 text-center space-y-8">
            <div className="relative mx-auto w-48 h-48 sm:w-64 sm:h-64 rounded-3xl overflow-hidden border-2 border-white/10 shadow-2xl">
              <img src={ogImage} alt="Thumbnail" className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
                <div className="w-20 h-20 rounded-full bg-emerald-500/80 flex items-center justify-center animate-pulse">
                  <BookOpen className="h-10 w-10 text-white" />
                </div>
              </div>
            </div>

            <h1 className="text-2xl sm:text-4xl font-black text-white leading-tight">
              {storyTitle}
            </h1>

            {story.audio_url ? (
              <div className="space-y-6">
                <div className="relative group/full-audio-player p-4 rounded-3xl bg-white/5 border border-white/10 backdrop-blur-sm">
                  <audio
                    controls
                    autoPlay
                    className="w-full h-12 rounded-full accent-emerald-500"
                    src={story.audio_url}
                  >
                    Your browser does not support the audio element.
                  </audio>
                </div>
                <Button size="lg" onClick={handleAudioShare} className="w-full bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl py-6 text-lg font-bold gap-2">
                  <Share2 className="h-5 w-5" /> সম্পূর্ণ অডিও শেয়ার করুন
                </Button>
              </div>
            ) : (
              <p className="text-red-400">Full audio not available.</p>
            )}

            <Button asChild size="lg" className="w-full bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl py-8 text-xl font-bold">
              <Link to={url}>সম্পূর্ণ গল্পটি পড়ুন ও শুনুন</Link>
            </Button>
          </div>
          
          <p className="text-center text-white/20 text-xs tracking-widest uppercase">
            © 2026 NoorApp Islamic Companion
          </p>
        </div>
      </div>
    );
  }

  const readingMin = estimateReadingMinutes(story.content_en);
  const blocks = splitStoryContent(lang === "bn" ? story.content_bn : story.content_en);
  const related = relatedStories(stories, story);
  const next = nextStory(stories, story);
  const quranRefs = parseQuranReferences(story.reference);
  const morals = parseMorals(lang === "bn" ? story.moral_bn : story.moral_en);


  const breadcrumbs = [
    { name: "Home", url: `${SITE}/` },
    { name: "Stories", url: `${SITE}/stories` },
    { name: categoryLabel(story.category), url: `${SITE}/stories/category/${story.category}` },
    { name: lang === "bn" ? story.title_bn : story.title_en, url },
  ];

  const articleSchema = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: story.title_en,
    description: story.seo.meta_description,
    inLanguage: ["en", "bn"],
    author: { "@type": "Organization", name: "NoorApp Editorial Team" },
    publisher: {
      "@type": "Organization",
      name: "NoorApp",
      url: SITE,
      logo: { "@type": "ImageObject", url: `${SITE}/logo.png` },
    },
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    articleSection: categoryLabel(story.category),
    keywords: Array.isArray(story.seo.keywords) ? story.seo.keywords.join(", ") : story.seo.keywords,
    isBasedOn: story.source_name,
    citation: story.reference,
    image: { "@type": "ImageObject", url: ogImage, width: 1200, height: 630 },
    datePublished: "2024-01-01",
    dateModified: new Date().toISOString().slice(0, 10),
  };

  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: breadcrumbs.map((b, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: b.name,
      item: b.url,
    })),
  };

  return (
    <div className="min-h-screen bg-background pb-24">
      <Helmet>
        <title>{isTrailerMode ? `🎬 Trailer: ${storyTitle}` : story.seo.title}</title>
        <meta name="description" content={story.seo.meta_description} />
        {story.seo.keywords && (
          <meta
            name="keywords"
            content={Array.isArray(story.seo.keywords) ? story.seo.keywords.join(", ") : story.seo.keywords}
          />
        )}
        <link rel="canonical" href={story.seo.canonical_url || url} />
        <meta property="og:type" content={isTrailerMode ? "video.other" : "article"} />
        <meta property="og:site_name" content="NoorApp" />
        <meta property="og:locale" content="bn_BD" />
        <meta property="og:locale:alternate" content="en_US" />
        <meta property="og:title" content={isTrailerMode ? `🎬 ${storyTitle} (Audio Trailer)` : (story.seo.open_graph?.title || story.seo.title)} />
        <meta property="og:description" content={isTrailerMode ? "এই হৃদয়স্পর্শী ইসলামিক গল্পটির একটি চমৎকার অডিও ট্রেলার শুনুন।" : (story.seo.open_graph?.description || story.seo.meta_description)} />
        <meta property="og:url" content={isTrailerMode ? trailerUrl : (story?.seo?.canonical_url || url)} />
        <meta property="og:image" content={ogImage} />
        <meta property="og:image:secure_url" content={ogImage} />
        <meta property="og:image:type" content={/\.png(?:\?|$)/i.test(ogImage) ? "image/png" : /\.webp(?:\?|$)/i.test(ogImage) ? "image/webp" : "image/jpeg"} />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:image:alt" content={story.title_en} />
        {isTrailerMode && story.audio_trailer_url && (
          <meta property="og:video" content={story.audio_trailer_url} />
        )}
        <meta property="article:section" content={categoryLabel(story.category)} />
        <meta property="article:author" content="NoorApp Editorial Team" />
        {Array.isArray(story.seo.keywords) &&
          story.seo.keywords.slice(0, 6).map((k) => (
            <meta key={k} property="article:tag" content={k} />
          ))}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:site" content="@noorapp" />
        <meta name="twitter:title" content={isTrailerMode ? `🎬 ${storyTitle} (Trailer)` : (story.seo.open_graph?.title || story.seo.title)} />
        <meta name="twitter:description" content={isTrailerMode ? "এই হৃদয়স্পর্শী ইসলামিক গল্পটির একটি চমৎকার অডিও ট্রেলার শুনুন।" : (story.seo.open_graph?.description || story.seo.meta_description)} />
        <meta name="twitter:image" content={ogImage} />
        <meta name="twitter:image:alt" content={story.title_en} />
        <meta name="pinterest:description" content={story.seo.open_graph?.description || story.seo.meta_description} />
        <meta name="pinterest:media" content={ogImage} />
        <meta name="thumbnail" content={ogImage} />
        <meta itemProp="image" content={ogImage} />
        <meta itemProp="name" content={story.seo.open_graph?.title || story.seo.title} />
        <meta itemProp="description" content={story.seo.open_graph?.description || story.seo.meta_description} />
        <link rel="alternate" hrefLang="en" href={url} />
        <link rel="alternate" hrefLang="bn" href={url} />
        <link rel="alternate" hrefLang="x-default" href={url} />
        <script type="application/ld+json">{JSON.stringify(articleSchema)}</script>
        <script type="application/ld+json">{JSON.stringify(breadcrumbSchema)}</script>
      </Helmet>

      {/* Header */}
      <header className="bg-gradient-to-br from-emerald-700 to-emerald-900 text-white">
        <div className="container mx-auto px-4 py-8">
          <nav aria-label="Breadcrumb" className="text-sm text-emerald-100/80 mb-3 flex flex-wrap items-center gap-1">
            <Link to="/" className="hover:text-white">Home</Link>
            <ChevronRight className="h-3 w-3" />
            <Link to="/stories" className="hover:text-white">Stories</Link>
            <ChevronRight className="h-3 w-3" />
            <Link to={`/stories/category/${story.category}`} className="hover:text-white">
              {categoryLabel(story.category)}
            </Link>
          </nav>
          <Badge variant="secondary" className="mb-3">{categoryLabel(story.category)}</Badge>
          <h1 className="text-2xl md:text-4xl font-bold leading-tight">
            {lang === "bn" ? story.title_bn : story.title_en}
          </h1>
          <div className="mt-4 flex flex-wrap items-center gap-4 text-sm text-emerald-50/90">
            <span className="flex items-center gap-1"><Clock className="h-4 w-4" /> {readingMin} min read</span>
            {story.source_name && (
              <span className="flex items-center gap-1"><BookOpen className="h-4 w-4" /> {story.source_name}</span>
            )}
            <span className="flex items-center gap-1">By NoorApp Editorial Team</span>
          </div>
          <div className="mt-6 flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={() => navigate(-1)}>
              <ArrowLeft className="h-4 w-4 mr-1" /> Back
            </Button>
            {story.content_bn && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setLang((prev) => (prev === "en" ? "bn" : "en"));
                }}
                className="font-[Noto_Sans_Bengali]"
              >
                <Languages className="h-4 w-4 mr-1" /> {lang === "en" ? "বাংলায় পড়ুন" : "Read in English"}
              </Button>
            )}

          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8 grid lg:grid-cols-[1fr_320px] gap-8">
        {/* Main */}
        <article className="space-y-8">
          {/* Story Image & Audio Player Combined */}
          <div className="relative group rounded-2xl overflow-hidden shadow-2xl border border-border bg-muted/30">
            <img 
              src={ogImage} 
              alt={story.title_en} 
              className={`w-full aspect-video object-cover transition-all duration-700 ${story.audio_url ? 'group-hover:scale-105 group-hover:brightness-[0.3] brightness-[0.8]' : ''}`}
            />
            
            {story.audio_url && (
              <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-white opacity-0 group-hover:opacity-100 transition-all duration-500 transform translate-y-4 group-hover:translate-y-0">
                <div className="mb-4 text-center">
                  <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-600/90 mb-4 animate-bounce">
                    <BookOpen className="h-8 w-8" />
                  </div>
                  <h3 className="text-2xl font-bold mb-2">এই গল্পটি শুনুন</h3>
                  <p className="text-sm text-emerald-50/90 max-w-md">পেশাদার কণ্ঠশিল্পীর কণ্ঠে এই হৃদয়স্পর্শী গল্পটি উপভোগ করুন।</p>
                </div>
              </div>
            )}
            
            {!story.audio_url && (
              <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-black/80 to-transparent">
                <h3 className="text-xl font-bold text-white">{lang === "bn" ? story.title_bn : story.title_en}</h3>
              </div>
            )}
          </div>

          {/* Premium Mockup Integrated Audio Player */}
          {story.audio_url && (
            <div className="relative -mt-24 mx-2 sm:mx-8 z-20">
              <div className="relative rounded-[2.5rem] overflow-hidden shadow-[0_30px_60px_-15px_rgba(0,0,0,0.5)] border border-emerald-500/30 bg-[#0a1a1a]/80 backdrop-blur-3xl transition-all duration-500 hover:border-emerald-400/50 group/player">
                {/* Emerald Glow */}
                <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/20 blur-[100px] rounded-full -mr-32 -mt-32"></div>
                
                <div className="relative z-10 p-6 sm:p-10">
                  <div className="flex flex-col lg:flex-row items-center gap-6 lg:gap-10">
                    {/* Left: Thumbnail (Maximized in Layout) */}
                    <div className="relative flex-shrink-0 w-full lg:w-auto flex justify-center lg:block">
                      <div className="absolute -inset-2 bg-emerald-500/20 rounded-3xl blur-xl"></div>
                      <div className="relative w-full aspect-video lg:w-80 lg:h-52 rounded-3xl overflow-hidden border-2 border-white/10 shadow-2xl">
                        <img src={ogImage} alt="Thumbnail" className="w-full h-full object-cover transition-transform duration-1000 group-hover/player:scale-105" />
                      </div>
                    </div>

                    {/* Middle & Right Combined for better space utilization */}
                    <div className="flex-1 flex flex-col sm:flex-row items-center gap-6 w-full">
                      <div className="flex-1 text-center sm:text-left space-y-4 w-full">
                        <h4 className="text-xl sm:text-3xl font-black text-white leading-tight tracking-tight line-clamp-2">
                          {lang === "bn" ? story.title_bn : story.title_en}
                        </h4>
                        
                        {/* Waveform Visualization (More compact) */}
                        <div className="flex items-end justify-center sm:justify-start gap-1 h-8 w-full max-w-xs mx-auto sm:mx-0 opacity-60">
                          {[...Array(20)].map((_, i) => (
                            <div 
                              key={i} 
                              className={`flex-1 bg-emerald-400 rounded-full transition-all duration-300 ${isPlaying ? 'animate-pulse' : ''}`} 
                              style={{ 
                                height: isPlaying ? `${30 + Math.random() * 70}%` : '30%',
                                animationDelay: `${i * 0.05}s`
                              }}
                            ></div>
                          ))}
                        </div>

                        {/* Progress Bar */}
                        <div className="space-y-1.5">
                          <div className="relative group/slider h-6 flex items-center">
                            <input
                              type="range"
                              min="0"
                              max={duration || 100}
                              value={currentTime}
                              onChange={handleSeek}
                              className="w-full h-1 bg-white/10 rounded-full appearance-none cursor-pointer accent-emerald-500 focus:outline-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-lg [&::-webkit-slider-thumb]:opacity-0 group-hover/slider:[&::-webkit-slider-thumb]:opacity-100 transition-all"
                            />
                            <div 
                              className="absolute left-0 top-1/2 -translate-y-1/2 h-1 bg-emerald-500 rounded-full pointer-events-none" 
                              style={{ width: `${(currentTime / (duration || 1)) * 100}%` }}
                            ></div>
                          </div>
                          <div className="flex justify-between text-[10px] font-black text-emerald-400/60 tracking-widest">
                            <span>{formatTime(currentTime)}</span>
                            <span>{formatTime(duration)}</span>
                          </div>
                        </div>
                      </div>

                      {/* Right: Controls (Rewind, Play, Forward) - Increased Gaps */}
                      <div className="flex-shrink-0 flex items-center gap-6 sm:gap-10">
                        <button 
                          onClick={() => seekOffset(-10)}
                          className="p-2 text-emerald-100/60 hover:text-emerald-400 transition-colors"
                          title="Rewind 10s"
                        >
                          <RotateCcw className="h-6 w-6 sm:h-8 sm:w-8" />
                        </button>

                        <button 
                          onClick={togglePlay}
                          className="group/btn relative w-16 h-16 sm:w-20 sm:h-20 flex items-center justify-center rounded-full bg-emerald-500 shadow-lg transition-all duration-300 hover:scale-105 hover:bg-emerald-400 active:scale-95"
                        >
                          <div className="absolute inset-0 rounded-full bg-emerald-500 animate-ping opacity-10"></div>
                          {isPlaying ? (
                            <div className="flex gap-1.5">
                              <div className="w-1.5 h-6 sm:w-2 sm:h-8 bg-white rounded-full"></div>
                              <div className="w-1.5 h-6 sm:w-2 sm:h-8 bg-white rounded-full"></div>
                            </div>
                          ) : (
                            <div className="ml-1 w-0 h-0 border-t-[10px] border-t-transparent border-l-[18px] border-l-white border-b-[10px] border-b-transparent sm:border-t-[12px] sm:border-l-[22px] sm:border-b-[12px]"></div>
                          )}
                        </button>

                        <button 
                          onClick={() => seekOffset(10)}
                          className="p-2 text-emerald-100/60 hover:text-emerald-400 transition-colors"
                          title="Forward 10s"
                        >
                          <RotateCw className="h-6 w-6 sm:h-8 sm:w-8" />
                        </button>
                      </div>
                    </div>
                  </div>

                  <audio
                    ref={audioRef}
                    preload="metadata"
                    className="hidden"
                    onLoadedMetadata={(event) => {
                      setDuration(event.currentTarget.duration);
                      setAudioError(false);
                    }}
                    onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
                    onPlay={() => setIsPlaying(true)}
                    onPause={() => setIsPlaying(false)}
                    onEnded={() => {
                      setIsPlaying(false);
                      setCurrentTime(0);
                    }}
                    onError={() => {
                      setIsPlaying(false);
                      setAudioError(true);
                    }}
                  />
                  {audioError && (
                    <p className="mt-4 text-center text-xs text-red-300">
                      অডিওটি চালানো যাচ্ছে না। URL, public access এবং CORS সেটিংস পরীক্ষা করুন।
                    </p>
                  )}
                </div>
              </div>

              {/* Metadata Badges from Mockup - Interactive Version */}
              <div className="mt-8 flex flex-wrap justify-center gap-3">
                <Link 
                  to={`/stories/category/${story.category}`}
                  className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-[#0a1a1a]/40 border border-emerald-500/20 backdrop-blur-md text-emerald-100/80 text-sm font-bold transition-all hover:bg-emerald-500/30 hover:border-emerald-500/40 hover:scale-105 active:scale-95"
                >
                  <BookOpen className="h-4 w-4 text-emerald-400" />
                  {categoryLabel(story.category)}
                </Link>
                
                <div className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-[#0a1a1a]/40 border border-emerald-500/20 backdrop-blur-md text-emerald-100/80 text-sm font-bold transition-all hover:bg-emerald-500/10 cursor-default">
                  <Clock className="h-4 w-4 text-emerald-400" />
                  {readingMin} মিনিট
                </div>
                
                <button 
                  onClick={() => toast({ title: "Author Profile", description: `${story.author || "Abu Hasan"} এর সব গল্প শীঘ্রই আসছে!` })}
                  className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-[#0a1a1a]/40 border border-emerald-500/20 backdrop-blur-md text-emerald-100/80 text-sm font-bold transition-all hover:bg-emerald-500/30 hover:border-emerald-500/40 hover:scale-105 active:scale-95"
                >
                  <Sparkles className="h-4 w-4 text-emerald-400" />
                  {story.author || "আবু হাসান"}
                </button>
                
                <button 
                  onClick={() => toast({ title: "Rating", description: "আপনার মূল্যবান মতামত ও রেটিং আমাদের উৎসাহিত করে!" })}
                  className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-[#0a1a1a]/40 border border-emerald-500/20 backdrop-blur-md text-emerald-100/80 text-sm font-bold transition-all hover:bg-emerald-500/30 hover:border-emerald-500/40 hover:scale-105 active:scale-95"
                >
                  <span className="text-emerald-400 font-black text-lg">★</span>
                  4.9
                </button>
              </div>
            </div>
          )}

          {/* Full Story Audio Share */}
          <div className="rounded-2xl border border-emerald-200/70 bg-emerald-50/70 dark:border-emerald-900/60 dark:bg-emerald-950/30 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-semibold text-emerald-900 dark:text-emerald-100 flex items-center gap-2">
                  <Share2 className="h-4 w-4" /> সম্পূর্ণ গল্পের অডিও শেয়ার করুন
                </p>
                <p className="text-xs text-muted-foreground mt-1">বাটনে চাপলে সরাসরি পুরো audio link share বা copy হবে।</p>
              </div>
              <Button onClick={handleAudioShare} className="gap-2 bg-emerald-700 hover:bg-emerald-800 text-white shrink-0">
                <Share2 className="h-4 w-4" /> Full Audio Share
              </Button>
            </div>
          </div>

          {/* Body */}
          <div className={`space-y-4 leading-relaxed ${lang === "bn" ? "font-[Noto_Sans_Bengali]" : "prose prose-emerald max-w-none dark:prose-invert"}`}>
            {blocks.map((b, i) =>
              b.type === "h2" ? (
                <h2 key={i} className="text-xl md:text-2xl font-semibold mt-8 mb-3 text-emerald-800 dark:text-emerald-400 border-l-4 border-emerald-500 pl-3">
                  {b.text}
                </h2>
              ) : (
                <p key={i} className="mb-4 text-foreground/90 text-lg">
                  {b.text}
                </p>
              ),
            )}
            
            {lang === "bn" && story.moral_bn && (
              <div className="mt-8 p-6 bg-emerald-50 dark:bg-emerald-950/30 rounded-xl border-l-4 border-emerald-600 shadow-sm">
                <h3 className="text-xl font-bold text-emerald-800 dark:text-emerald-400 mb-3 flex items-center gap-2">
                  <Sparkles className="h-5 w-5" /> এই গল্পের শিক্ষা:
                </h3>
                <p className="text-lg text-emerald-900 dark:text-emerald-100 italic">
                  {story.moral_bn}
                </p>
              </div>
            )}
          </div>

          {/* Editorial source note: no claim is added beyond the record's supplied source fields. */}
          {(story.source_name || story.source_detail || story.reference) && (
            <Card className="border-amber-200 bg-amber-50/40 dark:bg-amber-950/10">
              <CardHeader>
                <CardTitle className="text-base">উৎস ও সম্পাদনা নোট</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm leading-relaxed">
                {story.source_name && <p><span className="font-semibold">উৎস:</span> {story.source_name}</p>}
                {story.source_detail && <p><span className="font-semibold">উৎসের বিবরণ:</span> {story.source_detail}</p>}
                {story.reference && <p><span className="font-semibold">রেফারেন্স:</span> {story.reference}</p>}
                <p className="text-muted-foreground">পাঠকরা মূল উৎসের রেফারেন্সের সঙ্গে বর্ণনাটি মিলিয়ে পড়তে পারেন। গল্পের শিক্ষা অংশটি আলাদা করে চিহ্নিত করা হয়েছে, যাতে বর্ণনা ও সম্পাদকীয় প্রতিফলন গুলিয়ে না যায়।</p>
              </CardContent>
            </Card>
          )}

          {/* Quran References */}
          {quranRefs.length > 0 && (
            <Card className="border-emerald-200 bg-emerald-50/40 dark:bg-emerald-950/10">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Quote className="h-4 w-4" /> Quran References
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="list-disc pl-5 space-y-1 text-sm">
                  {quranRefs.map((r) => <li key={r}>{r}</li>)}
                </ul>
              </CardContent>
            </Card>
          )}

          {/* Cross-content navigation keeps story pages connected without inventing a story-specific claim. */}
          <section className="pt-6">
            <h2 className="text-xl font-bold mb-4">আরও পড়ুন</h2>
            <div className="grid gap-3 sm:grid-cols-3 text-sm">
              <Link to={`/stories/category/${story.category}`} className="rounded-xl border p-4 hover:border-emerald-500">এই বিভাগের আরও গল্প</Link>
              <Link to="/hadith" className="rounded-xl border p-4 hover:border-emerald-500">সম্পর্কিত হাদিস খুঁজুন</Link>
              <Link to="/dua" className="rounded-xl border p-4 hover:border-emerald-500">সম্পর্কিত দোয়া খুঁজুন</Link>
            </div>
          </section>

          {/* Related Stories */}
          {related.length > 0 && (
            <section className="pt-8">
              <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-emerald-600" /> আরও পড়ুন
              </h2>
              <div className="grid gap-4 sm:grid-cols-2">
                {related.map((s) => (
                  <Link key={s.slug} to={`/stories/${s.slug}`}>
                    <Card className="h-full hover:shadow-md transition-shadow overflow-hidden group">
                      <div className="aspect-video overflow-hidden">
                        <img 
                          src={s.og_image_url || ogStoriesDefault} 
                          alt={s.title_en} 
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                        />
                      </div>
                      <CardHeader className="p-4">
                        <CardTitle className="text-base group-hover:text-emerald-700">
                          {lang === "bn" ? s.title_bn : s.title_en}
                        </CardTitle>
                      </CardHeader>
                    </Card>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </article>

        {/* Sidebar */}
        <aside className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">About this Story</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div>
                <p className="text-muted-foreground mb-1">Source</p>
                <p className="font-medium">{story.source_name || "Classical Islamic Sources"}</p>
              </div>
              {story.source_detail && (
                <div>
                  <p className="text-muted-foreground mb-1">Details</p>
                  <p>{story.source_detail}</p>
                </div>
              )}
              <div>
                <p className="text-muted-foreground mb-1">Category</p>
                <Link to={`/stories/category/${story.category}`}>
                  <Badge variant="secondary" className="hover:bg-emerald-100">{categoryLabel(story.category)}</Badge>
                </Link>
              </div>
            </CardContent>
          </Card>

          {/* Next Story Card */}
          {next && (
            <Card className="bg-emerald-900 text-white border-none overflow-hidden relative">
              <div className="absolute top-0 right-0 p-3 opacity-20">
                <Sparkles className="h-12 w-12" />
              </div>
              <CardHeader>
                <CardDescription className="text-emerald-200">পরবর্তী গল্প</CardDescription>
                <CardTitle className="text-lg leading-tight">
                  {lang === "bn" ? next.title_bn : next.title_en}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Button asChild variant="secondary" size="sm" className="w-full">
                  <Link to={`/stories/${next.slug}`}>পড়তে থাকুন</Link>
                </Button>
              </CardContent>
            </Card>
          )}
        </aside>
      </div>

      <FooterSection platform="web" onNavigate={(path) => navigate(path)} />
      <BottomNavigation />
    </div>
  );
}

function parseQuranReferences(ref?: string): string[] {
  if (!ref) return [];
  return ref.split(";").map((r) => r.trim()).filter(Boolean);
}

function parseMorals(moral?: string): string[] {
  if (!moral) return [];
  return moral.split("\n").map((m) => m.trim()).filter(Boolean);
}
