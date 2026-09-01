import { Helmet } from "react-helmet-async";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ChevronRight, Clock, Play } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import BottomNavigation from "@/components/BottomNavigation";
import FooterSection from "@/components/FooterSection";
import {
  STORY_CATEGORIES,
  categoryLabel,
  estimateReadingMinutes,
  storyMetaDescription,
  useStories,
  type Story,
} from "@/lib/stories";

const SITE = "https://noorapp.in";

export default function StoryCategoryPage() {
  const { category } = useParams<{ category: string }>();
  const { stories, loading } = useStories();
  const navigate = useNavigate();

  const cat = category || "";
  const meta = STORY_CATEGORIES[cat];
  const items = stories.filter((s) => s.category === cat);
  const url = `${SITE}/stories/category/${cat}`;
  const label = categoryLabel(cat);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: `${label} — Islamic Stories`,
    url,
    description: meta?.description || `Authentic Islamic stories in the ${label} category.`,
    hasPart: items.map((s) => ({
      "@type": "Article",
      headline: s.title_en,
      url: `${SITE}/stories/${s.slug}`,
    })),
  };

  return (
    <div className="min-h-screen bg-background pb-24">
      <Helmet>
        <title>{label} — Islamic Stories | NoorApp</title>
        <meta name="description" content={meta?.description || `Read authentic ${label.toLowerCase()} on NoorApp.`} />
        <link rel="canonical" href={url} />
        <meta property="og:title" content={`${label} — Islamic Stories`} />
        <meta property="og:description" content={meta?.description || ""} />
        <meta property="og:url" content={url} />
        <meta property="og:type" content="website" />
        <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>
      </Helmet>

      <header className="bg-gradient-to-br from-emerald-700 to-emerald-900 text-white">
        <div className="container mx-auto px-4 py-12">
          <nav aria-label="Breadcrumb" className="text-sm text-emerald-100/80 mb-3 flex items-center gap-1">
            <Link to="/" className="hover:text-white transition-colors">Home</Link>
            <ChevronRight className="h-3 w-3" />
            <Link to="/stories" className="hover:text-white transition-colors">Stories</Link>
            <ChevronRight className="h-3 w-3" />
            <span className="text-white font-medium">{label}</span>
          </nav>
          <h1 className="text-3xl md:text-5xl font-bold tracking-tight">{label}</h1>
          {meta?.description && <p className="mt-4 text-emerald-50/90 max-w-2xl text-lg leading-relaxed">{meta.description}</p>}
          <div className="mt-6 flex items-center gap-2">
            <Badge variant="secondary" className="bg-white/20 hover:bg-white/30 text-white border-none backdrop-blur-sm px-3 py-1">
              {items.length}টি গল্প
            </Badge>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-12">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <div className="h-10 w-10 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin" />
            <p className="text-muted-foreground animate-pulse">গল্পগুলো লোড হচ্ছে…</p>
          </div>
        ) : items.length === 0 ? (
          <Card className="border-dashed border-2 bg-muted/30">
            <CardContent className="py-20 text-center space-y-4">
              <p className="text-xl font-medium text-muted-foreground">এই ক্যাটাগরিতে কোনো গল্প পাওয়া যায়নি।</p>
              <Button asChild variant="outline"><Link to="/stories">সব গল্প দেখুন</Link></Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {items.map((s) => (
              <StoryListCard key={s.slug} story={s} />
            ))}
          </div>
        )}
      </main>

      <FooterSection platform="web" onNavigate={(path) => navigate(path)} />
      <BottomNavigation />
    </div>
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
