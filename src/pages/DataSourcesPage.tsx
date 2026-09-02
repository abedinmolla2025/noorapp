import { Helmet } from "react-helmet-async";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, BookOpen, ScrollText, Star, Landmark } from "lucide-react";
import BottomNavigation from "@/components/BottomNavigation";

/**
 * Authentic Islamic Sources — public page explaining where every piece of
 * Islamic content in Noor originates. Improves E-E-A-T signals for search.
 */
const DataSourcesPage = () => {
  const navigate = useNavigate();
  const editorialReviewDate = "2026-08-09";

  const faqLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: "Are the hadiths in Noor authentic?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Yes. Noor primarily uses Sahih al-Bukhari and Sahih Muslim — the two most rigorously authenticated hadith collections in Sunni Islam — along with the four Sunan (Abu Dawud, Tirmidhi, Nasa'i, Ibn Majah). Grades (Sahih/Hasan/Da'if) follow classical scholarship.",
        },
      },
      {
        "@type": "Question",
        name: "Where do the Qur'anic translations come from?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Bengali translations follow widely-accepted renditions used by mainstream Bangladeshi Islamic publishers. English text is drawn from public-domain translations such as Sahih International and Yusuf Ali.",
        },
      },
      {
        "@type": "Question",
        name: "How is content verified before publishing?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Every dua, hadith and story is checked against its original Arabic source and cross-referenced with classical commentaries. Weak (Da'if) and fabricated (Mawdu') narrations are excluded from primary content and flagged when discussed.",
        },
      },
    ],
  };

  return (
    <div className="min-h-screen bg-background pb-24">
      <Helmet>
        <title>Authentic Islamic Sources | Noor</title>
        <meta
          name="description"
          content="Every dua, hadith, dhikr and story in Noor is sourced from the Qur'an, Sahih Bukhari, Sahih Muslim, the four Sunan and classical Islamic scholarship."
        />
        <link rel="canonical" href="https://noorapp.in/sources" />
        <meta property="og:title" content="Authentic Islamic Sources | Noor" />
        <meta
          property="og:description"
          content="Learn where Noor's Islamic content comes from — Qur'an, Sahih Bukhari, Sahih Muslim, Tafsir Ibn Kathir and classical scholars."
        />
        <meta property="og:url" content="https://noorapp.in/sources" />
        <meta property="og:image" content="https://noorapp.in/og-image.png" />
        <script type="application/ld+json">{JSON.stringify(faqLd)}</script>
      </Helmet>

      <header className="sticky top-0 z-40 bg-background/95 backdrop-blur border-b border-border">
        <div className="flex items-center gap-3 px-4 py-4 max-w-3xl mx-auto">
          <button
            onClick={() => navigate(-1)}
            className="p-2 -ml-2 rounded-full hover:bg-muted"
            aria-label="Back"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-bold">Authentic Islamic Sources</h1>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-5 py-6 space-y-8 leading-relaxed">
        <section>
          <p className="text-muted-foreground">
            Noor is an Islamic learning platform used by Muslims across South
            Asia and around the world. Because trustworthiness is central to
            Islamic knowledge, we believe you deserve to know exactly where our
            content comes from and how it is verified.
          </p>
          <p className="mt-3 text-muted-foreground">
            This page lists every classical source Noor draws from, the scholars
            behind them, and our editorial process.
          </p>
          <div className="mt-4 rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm text-muted-foreground">
            <p><span className="font-semibold text-foreground">Editorial review:</span> {editorialReviewDate}</p>
            <p className="mt-2">Individual hadith, dua and story entries should identify the collection or Qur&apos;an reference, book/chapter or verse where available, translation/edition information, and the date of the latest editorial review. If a source or translation edition is not yet available in the record, it is marked for editorial follow-up rather than presented as independently verified.</p>
          </div>
        </section>

        <section>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-primary" />
            The Qur'an
          </h2>
          <p className="mt-2 text-muted-foreground">
            The Qur'an is the literal word of Allah, revealed to the Prophet
            Muhammad ﷺ over 23 years and preserved unchanged for over 1,400
            years. It is the primary and highest source of Islamic knowledge.
          </p>
          <ul className="mt-3 list-disc list-inside space-y-1 text-muted-foreground">
            <li>Arabic text: Uthmani Mus-haf (Madinah script), consonantal text agreed by consensus.</li>
            <li>Bengali translation: the edition configured for Noor&apos;s public dataset; edition and licensing details are recorded in the editorial source record where available.</li>
            <li>English translation: Sahih International and Yusuf Ali (public domain); the displayed edition is identified in the relevant content record.</li>
            <li>Verse numbering follows the standard Kufan system.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <ScrollText className="w-5 h-5 text-primary" />
            Hadith Collections
          </h2>
          <p className="mt-2 text-muted-foreground">
            Hadith are the sayings, actions and tacit approvals of the Prophet
            Muhammad ﷺ, transmitted through rigorously verified chains of
            narrators. Noor uses the six major Sunni collections (Kutub as-Sittah):
          </p>
          <ul className="mt-3 list-disc list-inside space-y-2 text-muted-foreground">
            <li>
              <span className="font-semibold text-foreground">Sahih al-Bukhari</span> —
              compiled by Imam Muhammad ibn Ismaʿil al-Bukhari (d. 256 AH / 870 CE).
              widely regarded in Sunni scholarship as one of the most rigorously authenticated Hadith collections; exact rankings and numbering should be understood within their scholarly and edition context.
            </li>
            <li>
              <span className="font-semibold text-foreground">Sahih Muslim</span> —
              compiled by Imam Muslim ibn al-Hajjaj (d. 261 AH / 875 CE).
            </li>
            <li>
              <span className="font-semibold text-foreground">Sunan Abu Dawud</span> —
              compiled by Imam Abu Dawud as-Sijistani (d. 275 AH).
            </li>
            <li>
              <span className="font-semibold text-foreground">Jami' at-Tirmidhi</span> —
              compiled by Imam Muhammad at-Tirmidhi (d. 279 AH), known for grading each hadith.
            </li>
            <li>
              <span className="font-semibold text-foreground">Sunan an-Nasa'i</span> —
              compiled by Imam Ahmad an-Nasa'i (d. 303 AH).
            </li>
            <li>
              <span className="font-semibold text-foreground">Sunan Ibn Majah</span> —
              compiled by Imam Ibn Majah (d. 273 AH).
            </li>
          </ul>
          <p className="mt-3 text-muted-foreground">
            Where a hadith is graded (Sahih, Hasan, Daʿif) we follow the
            classical rulings of Imam al-Bukhari, Imam Muslim, Imam at-Tirmidhi
            and later authorities such as Ibn Hajar al-ʿAsqalani and Shaykh
            Muhammad Nasir ad-Din al-Albani.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Star className="w-5 h-5 text-primary" />
            Tafsir & Classical Scholarship
          </h2>
          <p className="mt-2 text-muted-foreground">
            Explanations of Qur'anic verses and background context are drawn
            from widely-accepted tafsir works:
          </p>
          <ul className="mt-3 list-disc list-inside space-y-1 text-muted-foreground">
            <li>Tafsir Ibn Kathir — Ismaʿil ibn Kathir (d. 774 AH)</li>
            <li>Tafsir at-Tabari — Ibn Jarir at-Tabari (d. 310 AH)</li>
            <li>Tafsir al-Qurtubi — Imam al-Qurtubi (d. 671 AH)</li>
            <li>Ma'ariful Qur'an — Mufti Muhammad Shafi (d. 1976 CE)</li>
          </ul>
          <p className="mt-3 text-muted-foreground">
            Seerah (biography of the Prophet ﷺ) content follows Ibn Hisham's
            Seerah, Ibn Kathir's Al-Bidayah wa an-Nihayah, and Shaykh
            Safi-ur-Rahman al-Mubarakpuri's Ar-Raheeq al-Makhtum.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Landmark className="w-5 h-5 text-primary" />
            Prayer Times & Astronomical Data
          </h2>
          <p className="mt-2 text-muted-foreground">
            Prayer time calculations use standard astronomical formulas
            (spherical trigonometry) with the ISNA (Islamic Society of North
            America) angle convention by default. Hijri date conversion follows
            the Umm al-Qura calendar. Geolocation is provided by the browser or
            device GPS.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold">Editorial Process</h2>
          <ul className="mt-2 list-disc list-inside space-y-1 text-muted-foreground">
            <li>Every hadith and dua is cross-referenced with its Arabic original.</li>
            <li>Weak (Daʿif) and fabricated (Mawduʿ) narrations are excluded from primary content.</li>
            <li>Contested rulings default to mainstream Sunni scholarship; local madhab practice is respected.</li>
            <li>Errors are corrected quickly — see the report link below.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-bold">Report an Error</h2>
          <p className="mt-2 text-muted-foreground">
            Found an inaccurate reference or a translation issue? Please{" "}
            <Link to="/contact" className="text-primary hover:underline">
              contact us
            </Link>{" "}
            with the page URL and the correction. We take content accuracy very
            seriously and will review every report promptly.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold">Explore Sourced Content</h2>
          <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
            <Link to="/quran" className="rounded-lg border border-border px-4 py-3 hover:bg-muted">Read Qur'an</Link>
            <Link to="/hadith" className="rounded-lg border border-border px-4 py-3 hover:bg-muted">Hadith Collections</Link>
            <Link to="/dua" className="rounded-lg border border-border px-4 py-3 hover:bg-muted">Daily Duas</Link>
            <Link to="/stories" className="rounded-lg border border-border px-4 py-3 hover:bg-muted">Islamic Stories</Link>
            <Link to="/99-names" className="rounded-lg border border-border px-4 py-3 hover:bg-muted">99 Names of Allah</Link>
            <Link to="/prayer-times" className="rounded-lg border border-border px-4 py-3 hover:bg-muted">Prayer Times</Link>
          </div>
        </section>
      </main>

      <BottomNavigation />
    </div>
  );
};

export default DataSourcesPage;