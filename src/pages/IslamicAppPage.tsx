import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import BottomNavigation from "@/components/BottomNavigation";

export default function IslamicAppPage() {
  return (
    <div className="min-h-screen bg-background pb-28">
      <Helmet>
        <title>Noor Islamic App – Quran, Hadith, Dua & Prayer Times</title>
        <meta
          name="description"
          content="Learn about Noor, a free Islamic learning app with Quran, Hadith, daily duas, prayer times, Qibla direction and Islamic quiz tools."
        />
        <link rel="canonical" href="https://noorapp.in/islamic-app" />
        <meta name="robots" content="index,follow" />
        <meta property="og:title" content="Noor Islamic App – Quran, Hadith, Dua & Prayer Times" />
        <meta
          property="og:description"
          content="Noor is the best free Islamic app for Bengali Muslims. Download now for Quran, Hadith, Dua, Prayer Times, Qibla & Islamic quiz."
        />
        <meta property="og:url" content="https://noorapp.in/islamic-app" />
        <meta property="og:type" content="website" />
        <meta property="og:image" content="https://noorapp.in/og-image.png" />
        <script type="application/ld+json">{JSON.stringify({
          "@context": "https://schema.org",
          "@type": "SoftwareApplication",
          "name": "Noor – Islamic App",
          "operatingSystem": "Android",
          "applicationCategory": "LifestyleApplication",
          "description": "Free Islamic app for Muslims – Quran, Hadith, Prayer Times, Dua, Qibla, Islamic Calendar, Quiz & more.",
          "url": "https://noorapp.in",
          "offers": { "@type": "Offer", "price": "0", "priceCurrency": "INR" },
        })}</script>
      </Helmet>

      {/* Hero */}
      <div className="bg-gradient-to-br from-primary to-primary/80 px-5 pt-14 pb-10 text-center text-primary-foreground">
        <h1 className="text-2xl font-bold leading-snug mb-3">
          Noor – The Best Free Islamic App
        </h1>
        <p className="text-sm opacity-90 max-w-md mx-auto leading-relaxed">
          Your complete Muslim companion for Quran, Hadith, Prayer Times, Dua, Qibla, Islamic Calendar and more — 100% free.
        </p>
      </div>

      {/* Main Content */}
      <div className="mx-auto max-w-2xl px-5 py-8 space-y-8 text-[13px] leading-relaxed text-muted-foreground">

        <section>
          <h2 className="text-[16px] font-bold text-foreground mb-3">
            What is Noor – Islamic App?
          </h2>
          <p>
            <strong>Noor</strong> (নূর) is a comprehensive <strong>Islamic app</strong> designed
            specifically for Bengali-speaking Muslims in India and Bangladesh. The word "Noor" means
            "light" in Arabic — and our mission is to bring the light of Islamic knowledge directly
            into your daily life through a beautiful, easy-to-use mobile application.
          </p>
          <p className="mt-3">
            Whether you are a student of Islamic knowledge, a practising Muslim looking for quick
            duas, or a parent searching for a meaningful <Link to="/baby-names" className="text-primary font-medium hover:underline">Islamic baby name</Link> — Noor has everything you need in a single,
            completely free app. No subscriptions. No paywalls. Pure Islamic content, always free.
          </p>
        </section>

        <section>
          <h2 className="text-[16px] font-bold text-foreground mb-3">
            📖 Quran App in Bengali – Read & Listen
          </h2>
          <p>
            Noor's <Link to="/quran" className="text-primary font-medium hover:underline">Quran reader</Link> gives you access to the complete Holy Quran with Arabic text, Bengali translation (বাংলা অনুবাদ), and high-quality audio recitation from world-renowned qaris. You can read Surah by Surah, track your daily reading progress, and listen to beautiful Quran recitation while commuting or relaxing at home.
          </p>
          <p className="mt-3">
            Our Quran app in Bengali is one of the most requested features by Muslims in Bangladesh and West Bengal. We have ensured the translations are accurate, the UI is clean, and the reading experience is distraction-free. <strong>পবিত্র কুরআন পড়ুন ও শুনুন — বাংলা অনুবাদ সহ।</strong>
          </p>
        </section>

        <section>
          <h2 className="text-[16px] font-bold text-foreground mb-3">
            📚 Hadith App – Authentic Collections Free
          </h2>
          <p>
            Noor provides a free <Link to="/hadith" className="text-primary font-medium hover:underline">Hadith library</Link> for browsing and study. Browse authenticated narrations from the six major hadith collections:
          </p>
          <ul className="mt-3 ml-4 list-disc space-y-2">
            <li>
              <Link to="/hadith/sahih-bukhari" className="text-primary font-medium hover:underline">Sahih Bukhari</Link> — The most authentic hadith collection, compiled by Imam Bukhari (রহ.)
            </li>
            <li>
              <Link to="/hadith" className="text-primary font-medium hover:underline">Sahih Muslim</Link> — Second most authoritative collection, meticulously authenticated
            </li>
            <li>
              <Link to="/hadith/tirmidhi" className="text-primary font-medium hover:underline">Jami at-Tirmidhi</Link> — Covers fiqh, seerah and virtues with unique hadith grading
            </li>
            <li>
              <Link to="/hadith/abu-dawud" className="text-primary font-medium hover:underline">Sunan Abu Dawud</Link> — The definitive jurisprudence-focused hadith collection
            </li>
          </ul>
          <p className="mt-3">
            Every hadith is presented with its Arabic text, Bengali meaning, and reference details. <strong>বিনামূল্যে হাদিস পড়ুন বাংলায়।</strong>
          </p>
        </section>

        <section>
          <h2 className="text-[16px] font-bold text-foreground mb-3">
            🕌 Islamic Prayer Time App – Accurate Salah Times
          </h2>
          <p>
            Never miss a prayer again. Noor's <Link to="/prayer-times" className="text-primary font-medium hover:underline">prayer time app</Link> calculates accurate Fajr, Dhuhr, Asr, Maghrib, and Isha times based on your GPS location. Features include:
          </p>
          <ul className="mt-3 ml-4 list-disc space-y-1">
            <li>Live countdown to the next prayer</li>
            <li>Beautiful Athan alert with authentic call to prayer audio</li>
            <li>Customizable calculation methods (ISNA, Karachi, MWL, etc.)</li>
            <li>Support for all cities in India and Bangladesh</li>
          </ul>
          <p className="mt-3">
            <strong>সঠিক নামাজের সময়সূচী — ফজর থেকে এশা পর্যন্ত।</strong> Our prayer time app is designed to help users check their daily prayer schedule.
          </p>
        </section>

        <section>
          <h2 className="text-[16px] font-bold text-foreground mb-3">
            🤲 Dua App – Daily Supplications for Every Occasion
          </h2>
          <p>
            Noor's <Link to="/dua" className="text-primary font-medium hover:underline">Dua collection</Link> covers every aspect of a Muslim's daily life. Morning and evening adhkar, duas for eating, sleeping, entering and leaving the home, travelling, and much more. Every dua includes:
          </p>
          <ul className="mt-3 ml-4 list-disc space-y-1">
            <li>Original Arabic text with proper calligraphy</li>
            <li>Pronunciation guide (transliteration)</li>
            <li>Bengali and English meaning</li>
            <li>Source (Quran or Hadith reference)</li>
          </ul>
          <p className="mt-3">
            <strong>প্রতিটি মুহূর্তের জন্য সঠিক দোয়া — আরবি, বাংলা অনুবাদ সহ।</strong>
          </p>
        </section>

        <section>
          <h2 className="text-[16px] font-bold text-foreground mb-3">
            🧠 Islamic Quiz App – Test Your Knowledge Daily
          </h2>
          <p>
            Our daily <Link to="/quiz" className="text-primary font-medium hover:underline">Islamic quiz</Link> helps you strengthen your knowledge of the Quran, Hadith, Islamic history, and Fiqh. Answer five new questions every day, build daily streaks, earn achievement badges, and compete with yourself. <strong>প্রতিদিন ৫টি প্রশ্নে ইসলামিক জ্ঞান বাড়ান।</strong>
          </p>
        </section>

        <section>
          <h2 className="text-[16px] font-bold text-foreground mb-3">
            🗓️ More Islamic Tools – All in One App
          </h2>
          <ul className="ml-4 list-disc space-y-2">
            <li>
              <Link to="/calendar" className="text-primary font-medium hover:underline">Islamic Calendar</Link> — Hijri calendar with Ramadan countdown and key Islamic dates
            </li>
            <li>
              <Link to="/99-names" className="text-primary font-medium hover:underline">99 Names of Allah</Link> (Asma ul Husna) — Arabic, meaning, transliteration and benefits
            </li>
            <li>
              <Link to="/baby-names" className="text-primary font-medium hover:underline">Islamic Baby Names</Link> — Thousands of meaningful names for boys and girls
            </li>
            <li>
              <Link to="/qibla" className="text-primary font-medium hover:underline">Qibla Finder</Link> — Compass-based Qibla direction from any location
            </li>
            <li>
              <Link to="/tasbih" className="text-primary font-medium hover:underline">Digital Tasbih</Link> — Count your dhikr with haptic feedback
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-[16px] font-bold text-foreground mb-3">
            🌍 Islamic App for Bengali Readers in India & Bangladesh
          </h2>
          <p>
            Noor was built with Bengali-speaking Muslims in mind, especially readers in Bangladesh and West Bengal, India. The goal is to provide a clear <strong>Islamic app in Bengali</strong> that is easy to use and respectful of Islamic scholarship.
          </p>
          <p className="mt-3">
            Our app supports both Bangla and English interfaces, making it accessible to Muslims across
            generations. Whether you are a grandparent looking for morning adhkar or a college student
            who wants to learn about Islamic history through the daily quiz — Noor serves everyone.
          </p>
          <p className="mt-3 text-[12px] text-muted-foreground/60">
            Noor Islamic App — Free Muslim app for Quran, Hadith, Prayer Times, Dua, Islamic Calendar, Quiz, 99 Names of Allah, Baby Names & Qibla Finder. Available for Android. বাংলায় সেরা ইসলামিক অ্যাপ।
          </p>
        </section>
      </div>

      <BottomNavigation />
    </div>
  );
}
