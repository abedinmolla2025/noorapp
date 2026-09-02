import { ArrowLeft, BookOpen, Moon, Compass, Clock, Heart, Star, ScrollText, HandHeart, Baby, HelpCircle, Smartphone } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useGlobalConfig } from "@/context/GlobalConfigContext";
import { Helmet } from "react-helmet-async";
import BottomNavigation from "@/components/BottomNavigation";

const AboutPage = () => {
  const navigate = useNavigate();
  const { legal, branding } = useGlobalConfig();

  const appName = branding.appName || "NOOR";
  const devName = legal.developerName || "ABEDIN MOLLA";
  const devNameBn = legal.developerNameBn || "আবিদিন মোল্লা";
  const country = legal.country || "India";
  const countryBn = legal.countryBn || "ভারত";
  const origin = "https://noorapp.in";

  const orgSchema = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Noor",
    url: origin,
    logo: `${origin}/logo.png`,
    description: "Noor — Free Islamic app for Quran, Hadith, Dua, Prayer Times & Islamic learning.",
    founder: {
      "@type": "Person",
      name: devName,
      nationality: country,
    },
  };

  return (
    <>
      <Helmet>
        <title>About Noor — Free Islamic App for Quran, Hadith, Dua & Prayer Times</title>
        <meta name="description" content="Learn about Noor, a free Islamic app offering Quran reading, Hadith collections, daily Duas, accurate Prayer Times, Islamic Quiz, 99 Names of Allah, and more." />
        <link rel="canonical" href={`${origin}/about`} />
        <script type="application/ld+json">{JSON.stringify(orgSchema)}</script>
        <script type="application/ld+json">{JSON.stringify({
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: [
            { "@type": "Question", name: "What is Noor Islamic App?", acceptedAnswer: { "@type": "Answer", text: "Noor is a comprehensive, free Islamic companion app that provides the complete Quran with translations, authentic Hadith collections (Bukhari, Muslim, Tirmidhi, Abu Dawud), daily Duas, accurate GPS-based Prayer Times, an Islamic Quiz, 99 Names of Allah, Baby Names, Qibla Finder, and Hijri Calendar — all in one beautifully designed application." } },
            { "@type": "Question", name: "Is Noor completely free to use?", acceptedAnswer: { "@type": "Answer", text: "Yes, Noor is 100% free. Every feature — including Quran reading, Hadith browsing, Dua collections, Prayer Times, and the Daily Quiz — is available without any premium paywall or subscription. Islamic knowledge should be accessible to everyone." } },
            { "@type": "Question", name: "Who developed Noor?", acceptedAnswer: { "@type": "Answer", text: "Noor was created and is maintained by Abedin Molla from India. As a solo developer and practicing Muslim, he built Noor with the vision of creating the most useful, beautiful, and authentic Islamic app — offered completely free to the global Muslim community." } },
            { "@type": "Question", name: "What Islamic resources are available in Noor?", acceptedAnswer: { "@type": "Answer", text: "Noor offers the complete Quran with Arabic text, English, Urdu and Bengali translations, and audio recitation. It also includes Sahih Bukhari, Sahih Muslim, Jami at-Tirmidhi, and Sunan Abu Dawud Hadith collections, curated Dua collections, a daily Islamic quiz, 99 Names of Allah, Islamic baby names, a prayer guide, Tasbih counter, Qibla compass, and Hijri calendar." } },
            { "@type": "Question", name: "Is the content in Noor authentic?", acceptedAnswer: { "@type": "Answer", text: "Yes. All Islamic content in Noor — including Quran text, Hadith narrations, Duas, and prayer instructions — is sourced from authentic, widely-accepted Islamic scholarly works. The Quran follows the Uthmani script and translations come from established scholars." } },
          ],
        })}</script>
      </Helmet>

      <div className="min-h-screen bg-gradient-to-b from-background via-background to-primary/5 pb-24">
        <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-lg border-b border-border">
          <div className="max-w-3xl mx-auto px-4 py-4 flex items-center gap-4">
            <button
              onClick={() => navigate(-1)}
              className="p-2 rounded-full hover:bg-muted/70 border border-border/60 transition-colors"
            >
              <ArrowLeft size={22} />
            </button>
            <div>
              <h1 className="text-xl font-bold tracking-wide">About {appName}</h1>
              <p className="text-sm text-muted-foreground">আমাদের সম্পর্কে</p>
            </div>
          </div>
        </header>

        <main className="max-w-3xl mx-auto px-4 py-8 space-y-8 text-[15px] leading-relaxed text-foreground">

          {/* What is Noor */}
          <section className="space-y-3">
            <h2 className="text-lg font-bold flex items-center gap-2">
              <Smartphone className="h-5 w-5 text-primary" /> What is {appName}?
            </h2>
            <p className="text-muted-foreground">
              {appName} is a comprehensive, free Islamic companion app designed to serve Muslims across the world — particularly in India and Bangladesh. Whether you are looking to read the <a href="/quran" className="text-primary hover:underline">Holy Quran</a>, study authentic <a href="/hadith" className="text-primary hover:underline">Hadith</a> collections, recite daily <a href="/dua" className="text-primary hover:underline">Duas</a>, find accurate <a href="/prayer-times" className="text-primary hover:underline">Prayer Times</a>, or test your Islamic knowledge with our <a href="/quiz" className="text-primary hover:underline">Daily Quiz</a>, {appName} brings everything together in one beautiful, fast, and reliable application.
            </p>
            <p className="text-muted-foreground">
              Built with modern technology and deep respect for Islamic scholarship, {appName} is not just another religious app — it is an independent digital companion built to make Islamic learning easier. From the moment you open the app to check Fajr time, to the quiet evening when you read a few pages of the Quran before sleep, {appName} is there to support your spiritual journey.
            </p>
          </section>

          {/* Mission */}
          <section className="bg-card/70 border border-border/60 rounded-2xl shadow-soft p-6 space-y-3">
            <h2 className="text-lg font-bold flex items-center gap-2">
              <Heart className="h-5 w-5 text-primary" /> Our Mission
            </h2>
            <p className="text-muted-foreground">
              Our mission is simple yet profound: to make authentic Islamic knowledge freely accessible to every Muslim, regardless of their language, location, or economic background. We believe that access to the Quran, Hadith, and essential Islamic teachings should never be restricted by paywalls, language barriers, or poor design.
            </p>
            <p className="text-muted-foreground">
              {appName} is built on the principle that technology should serve faith. Every feature we develop, every piece of content we curate, and every design decision we make is guided by this principle. We aim to bridge the gap between traditional Islamic scholarship and the digital-first generation — providing tools that are both academically rigorous and delightfully easy to use.
            </p>
          </section>

          {/* Islamic Vision */}
          <section className="space-y-3">
            <h2 className="text-lg font-bold flex items-center gap-2">
              <Moon className="h-5 w-5 text-primary" /> Our Islamic Vision
            </h2>
            <p className="text-muted-foreground">
              In a world where distractions are endless and authentic Islamic resources are scattered across dozens of websites and apps, {appName} was created to be a practical resource that Muslims can use throughout the day. We envision a world where every Muslim — from a teenager in Dhaka to a professional in Mumbai — can open one app and instantly access the Quran, check prayer times, read a Hadith, or learn a new Dua.
            </p>
            <p className="text-muted-foreground">
              We believe Islamic learning should be a lifelong journey, not a chore. That is why {appName} includes features like the <a href="/quiz" className="text-primary hover:underline">Daily Islamic Quiz</a> — turning knowledge acquisition into an engaging, rewarding experience. Our <a href="/99-names" className="text-primary hover:underline">99 Names of Allah</a> section helps users deepen their connection with the Creator, while the <a href="/prayer-guide" className="text-primary hover:underline">Prayer Guide</a> ensures even new Muslims can learn to pray with confidence.
            </p>
          </section>

          {/* Features Overview */}
          <section className="bg-card/70 border border-border/60 rounded-2xl shadow-soft p-6 space-y-4">
            <h2 className="text-lg font-bold">Features Overview</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[
                { icon: BookOpen, title: "Complete Quran", desc: "Arabic text with English, Urdu & Bengali translations and audio recitation.", link: "/quran" },
                { icon: ScrollText, title: "Hadith Collections", desc: "Sahih Bukhari, Muslim, Tirmidhi & Abu Dawud — all free and searchable.", link: "/hadith" },
                { icon: Clock, title: "Prayer Times", desc: "GPS-based accurate prayer times with Athan notification support.", link: "/prayer-times" },
                { icon: HandHeart, title: "Dua Collection", desc: "Curated duas for daily life with Arabic, transliteration & translation.", link: "/dua" },
                { icon: HelpCircle, title: "Daily Quiz", desc: "Test and grow your Islamic knowledge every day with fun quizzes.", link: "/quiz" },
                { icon: Star, title: "99 Names of Allah", desc: "Learn the beautiful names of Allah with meanings and audio.", link: "/99-names" },
                { icon: Baby, title: "Baby Names", desc: "Search thousands of Islamic baby names with meanings and origins.", link: "/baby-names" },
                { icon: Compass, title: "Qibla & Calendar", desc: "Accurate Qibla compass and full Hijri Islamic calendar.", link: "/qibla" },
              ].map(({ icon: Icon, title, desc, link }) => (
                <a key={link} href={link} className="flex items-start gap-3 p-3 rounded-xl hover:bg-muted/40 transition-colors group">
                  <Icon className="h-5 w-5 mt-0.5 text-primary shrink-0" />
                  <div>
                    <p className="font-semibold text-sm group-hover:text-primary transition-colors">{title}</p>
                    <p className="text-muted-foreground text-xs">{desc}</p>
                  </div>
                </a>
              ))}
            </div>
          </section>

          {/* Why Noor is Different */}
          <section className="space-y-3">
            <h2 className="text-lg font-bold">Why {appName} is Different</h2>
            <p className="text-muted-foreground">
              There are many Islamic apps available today, but {appName} stands apart for several important reasons:
            </p>
            <ul className="list-disc list-inside space-y-2 text-muted-foreground pl-2">
              <li><strong className="text-foreground">100% Free, No Premium Walls:</strong> Every single feature in {appName} is completely free. We never lock Quran Surahs, Hadith chapters, or Duas behind a paywall. Islamic knowledge should be free for everyone.</li>
              <li><strong className="text-foreground">Source-aware Content:</strong> Quran, Hadith, dua and story records include available source and reference details. Please check the collection, chapter and edition where provided, and consult a qualified scholar for complex religious questions.</li>
              <li><strong className="text-foreground">Multilingual Support:</strong> {appName} serves a diverse community with support for Arabic, English, Urdu, Bengali, and Hindi — ensuring that language is never a barrier to learning.</li>
              <li><strong className="text-foreground">Beautiful, Modern Design:</strong> Unlike many religious apps that feel outdated, {appName} features a clean, elegant interface with dark mode support, smooth animations, and a design language that feels premium.</li>
              <li><strong className="text-foreground">Offline-First & Fast:</strong> {appName} is built with performance as a priority. Pages load instantly, and core features work even with limited connectivity.</li>
              <li><strong className="text-foreground">Community-Driven:</strong> {appName} is built for the Ummah, by the Ummah. We actively listen to user feedback and continuously improve based on what the community needs.</li>
            </ul>
          </section>

          {/* Founder Section */}
          <section className="bg-card/70 border border-border/60 rounded-2xl shadow-soft p-6 space-y-3">
            <h2 className="text-lg font-bold">Founder & Developer</h2>
            <p className="text-muted-foreground">
              {appName} was created and is maintained by <strong className="text-foreground">{devName}</strong> (<span className="font-bangla">{devNameBn}</span>) from {country} (<span className="font-bangla">{countryBn}</span>). Driven by a deep passion for both technology and Islamic learning, {devName} built {appName} with a singular vision: to create a useful and accessible Islamic learning app — and to offer it completely free to the global Muslim community.
            </p>
            <p className="text-muted-foreground">
              As a solo developer and practicing Muslim, {devName} brings a unique perspective to {appName}'s development — understanding both the technical challenges of building a world-class application and the spiritual needs of the community it serves. Every line of code is written with the intention of serving Allah (SWT) and benefiting the Ummah.
            </p>
          </section>

          {/* Content Sources */}
          <section className="space-y-3">
            <h2 className="text-lg font-bold">Content Authenticity</h2>
            <p className="text-muted-foreground">
              Islamic content in {appName} is presented with available source and reference details, including collection or chapter information where provided. Prayer times use configurable calculation methods and location data; users should verify local timings with their mosque when precision is important. We encourage users to verify critical religious matters with qualified local scholars and Imams.
            </p>
          </section>

          {/* Explore Links */}
          <section className="space-y-3">
            <h2 className="text-lg font-bold">Explore {appName}</h2>
            <p className="text-muted-foreground">
              Start your journey with {appName} today. Here are some of the most popular sections:
            </p>
            <div className="flex flex-wrap gap-2">
              {[
                { label: "Read Quran", href: "/quran" },
                { label: "Hadith Collections", href: "/hadith" },
                { label: "Sahih Bukhari", href: "/hadith/sahih-bukhari" },
                { label: "Daily Duas", href: "/dua" },
                { label: "Prayer Times", href: "/prayer-times" },
                { label: "Islamic Quiz", href: "/quiz" },
                { label: "99 Names of Allah", href: "/99-names" },
                { label: "Baby Names", href: "/baby-names" },
                { label: "Islamic Calendar", href: "/calendar" },
                { label: "Qibla Finder", href: "/qibla" },
                { label: "Prayer Guide", href: "/prayer-guide" },
                { label: "Tasbih Counter", href: "/tasbih" },
                { label: "Contact Us", href: "/contact" },
              ].map((l) => (
                <a
                  key={l.href}
                  href={l.href}
                  className="rounded-full border border-border bg-muted/40 px-3 py-1.5 text-xs font-medium text-foreground hover:bg-primary hover:text-primary-foreground transition-colors"
                >
                  {l.label}
                </a>
              ))}
            </div>
          </section>

        </main>
      </div>

      <BottomNavigation />
    </>
  );
};

export default AboutPage;
