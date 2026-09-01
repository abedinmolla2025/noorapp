import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";

const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "Is Noor a free Islamic app?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes, Noor is completely free. There are no subscriptions, no paywalls, and no hidden charges. All features — including Quran reading, Hadith collections, prayer times, Dua, Islamic quiz, and more — are available at no cost to every Muslim.",
      },
    },
    {
      "@type": "Question",
      name: "Does Noor provide Quran with Bengali translation?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes. Noor's Quran reader includes the complete Holy Quran with Arabic text, Bengali (Bangla) translation, transliteration, and high-quality audio recitation. Users can read Surah by Surah and listen to renowned reciters.",
      },
    },
    {
      "@type": "Question",
      name: "Can I read Sahih Bukhari on Noor?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes. Noor includes the complete Sahih Bukhari hadith collection with Arabic text and Bengali translation. You can also browse Sahih Muslim, Jami at-Tirmidhi, and Sunan Abu Dawud from the Hadith section.",
      },
    },
    {
      "@type": "Question",
      name: "Does Noor show accurate prayer times in India and Bangladesh?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes. Noor calculates accurate Fajr, Dhuhr, Asr, Maghrib, and Isha prayer times based on your GPS location, supporting all major cities in India and Bangladesh. It also includes Athan alerts and a live countdown to the next prayer.",
      },
    },
  ],
};

const siteNavJsonLd = {
  "@context": "https://schema.org",
  "@type": "ItemList",
  name: "Noor App Navigation",
  itemListElement: [
    { "@type": "SiteNavigationElement", position: 1, name: "Home", url: "https://noorapp.in/" },
    { "@type": "SiteNavigationElement", position: 2, name: "Quran", url: "https://noorapp.in/quran" },
    { "@type": "SiteNavigationElement", position: 3, name: "Hadith", url: "https://noorapp.in/hadith" },
    { "@type": "SiteNavigationElement", position: 4, name: "Dua", url: "https://noorapp.in/dua" },
    { "@type": "SiteNavigationElement", position: 5, name: "Quiz", url: "https://noorapp.in/quiz" },
    { "@type": "SiteNavigationElement", position: 6, name: "Prayer Times", url: "https://noorapp.in/prayer-times" },
    { "@type": "SiteNavigationElement", position: 7, name: "Islamic Calendar", url: "https://noorapp.in/calendar" },
    { "@type": "SiteNavigationElement", position: 8, name: "99 Names of Allah", url: "https://noorapp.in/99-names" },
    { "@type": "SiteNavigationElement", position: 9, name: "Baby Names", url: "https://noorapp.in/baby-names" },
  ],
};

export default function SeoIntroSection() {
  return (
    <>
      <Helmet>
        <script type="application/ld+json">{JSON.stringify(faqJsonLd)}</script>
        <script type="application/ld+json">{JSON.stringify(siteNavJsonLd)}</script>
      </Helmet>

      <section
        aria-label="About Noor Islamic App"
        className="mt-2 rounded-2xl border border-border bg-card px-5 py-6 text-[13px] leading-relaxed text-muted-foreground"
      >
        {/* H1 */}
        <h1 className="mb-3 text-[17px] font-bold text-foreground">
          Noor – Free Islamic App for Quran, Hadith, Prayer Times &amp; Dua
        </h1>
        <p className="mb-4">
          <strong>Noor</strong> is a free Islamic app built for Muslims in India, Bangladesh, and
          around the world. Whether you need accurate{" "}
          <Link to="/prayer-times" className="font-medium text-primary underline-offset-2 hover:underline">
            prayer times
          </Link>
          , want to read the{" "}
          <Link to="/quran" className="font-medium text-primary underline-offset-2 hover:underline">
            Holy Quran
          </Link>{" "}
          with Bengali translation, explore authentic{" "}
          <Link to="/hadith" className="font-medium text-primary underline-offset-2 hover:underline">
            Hadith collections
          </Link>
          , or find the right{" "}
          <Link to="/dua" className="font-medium text-primary underline-offset-2 hover:underline">
            dua
          </Link>{" "}
          for any moment — Noor brings it all together in one clean, beautifully designed app.
          আমাদের লক্ষ্য প্রতিটি মুসলিমের ইবাদতকে সহজ, সুন্দর ও অর্থবহ করা।
        </p>

        {/* Quran */}
        <h2 className="mb-2 mt-5 text-[14px] font-semibold text-foreground">
          📖 Quran App with Bengali Translation — কুরআন বাংলা অনুবাদ সহ
        </h2>
        <p className="mb-3">
          Noor's{" "}
          <Link to="/quran" className="font-medium text-primary underline-offset-2 hover:underline">
            Quran reader
          </Link>{" "}
          provides the complete Holy Quran with crystal-clear Arabic text, accurate Bengali
          translation (বাংলা অনুবাদ), and word-by-word transliteration. Whether you are a beginner
          learning to read Arabic or a hafiz looking to revise, Noor's Quran app adapts to your
          needs. You can read Surah by Surah, search by keyword, and bookmark your favourite ayahs
          for easy reference. High-quality audio recitation from globally respected reciters is also
          available — making Noor one of the best free Quran apps for Bengali-speaking Muslims.{" "}
          <strong>পবিত্র কুরআন পড়ুন ও শুনুন — বাংলা অনুবাদ সহ।</strong>
        </p>

        {/* Hadith */}
        <h2 className="mb-2 mt-5 text-[14px] font-semibold text-foreground">
          📚 Hadith App — Authentic Collections Free
        </h2>
        <p className="mb-3">
          Noor offers a curated selection of free{" "}
          <Link to="/hadith" className="font-medium text-primary underline-offset-2 hover:underline">
            Hadith apps
          </Link>{" "}
          available for Bengali Muslims. Browse authenticated narrations from the six major hadith
          collections, including{" "}
          <Link to="/hadith/sahih-bukhari" className="font-medium text-primary underline-offset-2 hover:underline">
            Sahih Bukhari
          </Link>{" "}
          — the most authenticated hadith collection in Islam — and{" "}
          <Link to="/hadith" className="font-medium text-primary underline-offset-2 hover:underline">
            Sahih Muslim
          </Link>
          , compiled by Imam Muslim after examining over 300,000 narrations. Every hadith is
          presented with its original Arabic text, full narrator chain, and accurate Bengali meaning.
          ইসলামের সবচেয়ে বিশ্বস্ত হাদিস গ্রন্থ থেকে হাদিস পড়ুন — সম্পূর্ণ বিনামূল্যে।
        </p>

        {/* Prayer Times */}
        <h2 className="mb-2 mt-5 text-[14px] font-semibold text-foreground">
          🕌 Prayer Time App — Accurate Salah Times for India &amp; Bangladesh
        </h2>
        <p className="mb-3">
          Never miss a prayer with Noor's precise{" "}
          <Link to="/prayer-times" className="font-medium text-primary underline-offset-2 hover:underline">
            prayer times
          </Link>{" "}
          feature. Using your GPS location, the app calculates exact Fajr, Dhuhr, Asr, Maghrib, and
          Isha times for every city in India and Bangladesh. A live countdown timer shows exactly how
          much time remains until the next Salah. Noor also supports authentic Athan alerts with
          beautiful call-to-prayer audio, so you are always reminded even when the screen is off.
          সঠিক নামাজের সময়সূচী — ফজর থেকে এশা পর্যন্ত — সারা ভারত ও বাংলাদেশে।
        </p>

        {/* Dua */}
        <h2 className="mb-2 mt-5 text-[14px] font-semibold text-foreground">
          🤲 Dua App — Daily Supplications for Every Moment
        </h2>
        <p className="mb-3">
          Noor's{" "}
          <Link to="/dua" className="font-medium text-primary underline-offset-2 hover:underline">
            Dua collection
          </Link>{" "}
          covers every aspect of a Muslim's day — morning and evening adhkar, duas for eating,
          sleeping, entering the home, travelling, seeking forgiveness, and much more. Every dua
          includes the original Arabic text, a pronunciation guide (transliteration), and a clear
          Bengali meaning sourced from the Quran and authentic Hadith. প্রতিটি মুহূর্তের জন্য সঠিক
          দোয়া — আরবি ও বাংলা অনুবাদ সহ।
        </p>

        {/* Quiz */}
        <h2 className="mb-2 mt-5 text-[14px] font-semibold text-foreground">
          🧠 Islamic Quiz — Test &amp; Grow Your Knowledge Daily
        </h2>
        <p className="mb-3">
          Strengthen your Islamic knowledge with our{" "}
          <Link to="/quiz" className="font-medium text-primary underline-offset-2 hover:underline">
            daily Islamic quiz
          </Link>
          . Answer five new questions every day covering Quran, Hadith, Fiqh, Islamic history, and
          the lives of the Prophets. Build daily streaks, earn achievement badges, and track your
          progress over time. The quiz is carefully curated and updated regularly to keep every
          session fresh and educational. প্রতিদিন পাঁচটি প্রশ্নে অংশ নিন ও ইসলামিক জ্ঞান বাড়ান।
        </p>

        {/* More Features */}
        <h2 className="mb-2 mt-5 text-[14px] font-semibold text-foreground">
          🗓️ More Islamic Tools — All in One App
        </h2>
        <ul className="mb-4 ml-4 list-disc space-y-2">
          <li>
            <Link to="/calendar" className="font-medium text-primary underline-offset-2 hover:underline">
              Islamic Calendar
            </Link>{" "}
            — Hijri dates, Ramadan countdown, and all key Islamic events throughout the year.
          </li>
          <li>
            <Link to="/99-names" className="font-medium text-primary underline-offset-2 hover:underline">
              99 Names of Allah
            </Link>{" "}
            (Asma ul Husna) — Arabic, Bengali meaning, transliteration, and spiritual benefits.
          </li>
          <li>
            <Link to="/baby-names" className="font-medium text-primary underline-offset-2 hover:underline">
              Islamic Baby Names
            </Link>{" "}
            — Thousands of meaningful Muslim names for boys and girls with Arabic origin and meaning.
          </li>
          <li>
            <Link to="/qibla" className="font-medium text-primary underline-offset-2 hover:underline">
              Qibla Finder
            </Link>{" "}
            — Compass-based Qibla direction from any location on Earth.
          </li>
          <li>
            <Link to="/tasbih" className="font-medium text-primary underline-offset-2 hover:underline">
              Digital Tasbih
            </Link>{" "}
            — Count your dhikr with haptic feedback and customisable targets.
          </li>
        </ul>

        <section className="mt-6 rounded-xl border border-primary/20 bg-primary/5 px-4 py-4">
          <h2 className="mb-2 text-[15px] font-bold text-foreground">Content sources and editorial care</h2>
          <p className="text-[12px] leading-relaxed text-muted-foreground">
            Noor is a digital learning tool, not a substitute for a qualified scholar. We identify
            the source of Quran, Hadith, dua and story content where the record provides it, and we
            welcome corrections from readers. Read our editorial source notes and report an error
            from the dedicated sources page.
          </p>
          <Link
            to="/sources"
            className="mt-2 inline-block text-[12px] font-semibold text-primary underline-offset-2 hover:underline"
          >
            View sources and editorial process →
          </Link>
        </section>

        {/* FAQ Section */}
        <h2 className="mb-3 mt-6 text-[15px] font-bold text-foreground">
          Frequently Asked Questions
        </h2>

        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-background/50 px-4 py-3">
            <h3 className="text-[13px] font-semibold text-foreground mb-1">
              Is Noor a free Islamic app?
            </h3>
            <p className="text-[12px] text-muted-foreground">
              Yes, Noor is completely free — no subscriptions, no paywalls, and no hidden charges.
              All features including Quran, Hadith, prayer times, Dua, and the Islamic quiz are
              available at zero cost to every Muslim.
            </p>
          </div>

          <div className="rounded-xl border border-border bg-background/50 px-4 py-3">
            <h3 className="text-[13px] font-semibold text-foreground mb-1">
              Does Noor provide Quran with Bengali translation?
            </h3>
            <p className="text-[12px] text-muted-foreground">
              Yes. Noor's{" "}
              <Link to="/quran" className="font-medium text-primary hover:underline">
                Quran reader
              </Link>{" "}
              includes the complete Holy Quran with Arabic text, Bengali (Bangla) translation,
              transliteration, and high-quality audio recitation from renowned reciters.
            </p>
          </div>

          <div className="rounded-xl border border-border bg-background/50 px-4 py-3">
            <h3 className="text-[13px] font-semibold text-foreground mb-1">
              Can I read Sahih Bukhari on Noor?
            </h3>
            <p className="text-[12px] text-muted-foreground">
              Yes. Noor includes{" "}
              <Link to="/hadith/sahih-bukhari" className="font-medium text-primary hover:underline">
                Sahih Bukhari
              </Link>{" "}
              with Arabic text and Bengali translation. You can also read{" "}
              <Link to="/hadith" className="font-medium text-primary hover:underline">
                Sahih Muslim
              </Link>
              , Jami at-Tirmidhi, and Sunan Abu Dawud from the Hadith section.
            </p>
          </div>

          <div className="rounded-xl border border-border bg-background/50 px-4 py-3">
            <h3 className="text-[13px] font-semibold text-foreground mb-1">
              Does Noor show accurate prayer times in India &amp; Bangladesh?
            </h3>
            <p className="text-[12px] text-muted-foreground">
              Yes. Noor calculates accurate{" "}
              <Link to="/prayer-times" className="font-medium text-primary hover:underline">
                prayer times
              </Link>{" "}
              based on your GPS location, supporting all major cities in India and Bangladesh. Athan
              alerts and a live countdown to the next prayer are included.
            </p>
          </div>
        </div>

        <p className="mt-5 text-[12px] text-muted-foreground/60">
          Noor — ইসলামিক অ্যাপ | Free Islamic app for Quran, Hadith, Dua, Prayer Times & more.
          Available for Android. নামাজের সময়, কুরআন, হাদিস, দোয়া ও ইসলামিক কুইজ — সব এক অ্যাপে।
        </p>
      </section>
    </>
  );
}
