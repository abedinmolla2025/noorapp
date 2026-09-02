import { useParams, useNavigate, Link } from "react-router-dom";
import { ArrowLeft, ScrollText } from "lucide-react";
import { motion } from "framer-motion";
import BottomNavigation from "@/components/BottomNavigation";
import { Helmet } from "react-helmet-async";

type BookMeta = {
  title: string;
  titleBn: string;
  metaTitle: string;
  metaDescription: string;
  intro: React.ReactNode;
};

const otherBooks = [
  { id: "bukhari", label: "Sahih Bukhari", path: "/hadith/bukhari" },
  { id: "muslim", label: "Sahih Muslim", path: "/hadith/muslim" },
  { id: "tirmidhi", label: "Jami at-Tirmidhi", path: "/hadith/tirmidhi" },
  { id: "abu-dawud", label: "Sunan Abu Dawud", path: "/hadith/abu-dawud" },
];

const bookMeta: Record<string, BookMeta> = {
  muslim: {
    title: "Sahih Muslim",
    titleBn: "সহীহ মুসলিম",
    metaTitle: "Sahih Muslim — সহীহ মুসলিম হাদিস | Noor",
    metaDescription:
      "Read Sahih Muslim Hadith collection with Arabic text and Bengali translation. Browse the collection by book and chapter on Noor App. সহীহ মুসলিম পড়ুন।",
    intro: (
      <div className="space-y-4 text-[13px] leading-relaxed text-muted-foreground">
        <h2 className="text-[15px] font-bold text-foreground">
          About Sahih Muslim — সহীহ মুসলিম সম্পর্কে
        </h2>
        <p>
          <strong>Sahih Muslim</strong> (সহীহ মুসলিম) is one of the six major hadith collections
          (<em>Kutub al-Sittah</em>) in Sunni Islam and is universally regarded as the second most
          authentic book of hadith after Sahih Bukhari. It was compiled by the great Islamic scholar{" "}
          <strong>Imam Muslim ibn al-Hajjaj</strong> (ইমাম মুসলিম ইবনুল হাজ্জাজ রহ.), born in
          202 AH / 815 CE in Nishapur, in the Khorasan region of Persia (modern-day Iran). From a
          young age, Imam Muslim showed extraordinary dedication to the science of hadith, travelling
          extensively to Iraq, the Hejaz, Syria, and Egypt to learn from the greatest hadith scholars
          of his era, including Imam Bukhari himself.
        </p>
        <p>
          Imam Muslim spent years in meticulous collection, authentication, and compilation of this
          monumental work. Historical sources describe his careful method of evaluating reports and
          narrator chains before including them. Edition-level totals and numbering can vary, so this
          site presents the available text with its book and chapter references. Every hadith in Sahih
          Muslim contains
          an unbroken, fully connected chain of narrators (<em>isnad muttasil</em>), with each
          narrator rigorously verified for trustworthiness (<em>thiqah</em>) and accuracy of
          memory (<em>dabt</em>).
        </p>

        <h2 className="text-[14px] font-semibold text-foreground">
          Unique Methodology — অনন্য পদ্ধতি
        </h2>
        <p>
          One of Sahih Muslim's most celebrated characteristics is its{" "}
          <strong>superior organisation and structure</strong>. Unlike some other hadith collections,
          Imam Muslim arranged similar narrations together under each topic, presenting all the chains
          and variants of a single hadith in one place. This approach makes it significantly easier
          for scholars and students to compare narrations and study the full scope of a subject.
          ইমাম মুসলিম (রহ.) একই বিষয়ের সকল রিওয়ায়েত একসাথে সাজিয়েছেন, যা গবেষকদের জন্য অত্যন্ত
          সুবিধাজনক।
        </p>
        <p>
          The collection is also celebrated for its extraordinary <em>Muqaddimah</em>{" "}
          (Introduction), which is itself a masterwork of hadith methodology (<em>mustalah
          al-hadith</em>). In the Muqaddimah, Imam Muslim articulates the principles of hadith
          criticism, the standards of narrator evaluation, and the definition of authenticity in
          precise, technical language. Scholars from Ibn Hajar al-Asqalani to Imam al-Nawawi have
          written extensive commentaries on this work.
        </p>

        <h2 className="text-[14px] font-semibold text-foreground">
          Importance in Islamic Scholarship — ইসলামিক শাস্ত্রে গুরুত্ব
        </h2>
        <p>
          Sahih Muslim covers all essential aspects of Islamic life: acts of worship (
          <em>ibadat</em>), business transactions (<em>muamalat</em>), virtuous conduct (
          <em>akhlaq</em>), family law (<em>munakahaat</em>), and matters of creed (<em>aqidah</em>
          ). The collection is particularly strong in its narrations about the life and Sunnah of
          Prophet Muhammad ﷺ, including his prayers, fasts, pilgrimage, and interaction with
          companions. মুসলিম উম্মাহর কাছে সহীহ মুসলিম ইসলামিক আইন ও জীবনযাপনের অন্যতম প্রধান
          রেফারেন্স গ্রন্থ হিসেবে স্বীকৃত।
        </p>
        <p>
          Imam al-Nawawi's famous commentary, <em>Al-Minhaj Sharh Sahih Muslim ibn al-Hajjaj</em>,
          remains one of the most widely read explanations of any hadith collection in Islamic
          history. Scholars across generations — from medieval Baghdad to contemporary Makkah and
          Madinah — continue to study, teach, and derive legal rulings from Sahih Muslim. It is a
          required text in Islamic universities from Al-Azhar in Cairo to Darul Uloom Deoband in
          India and Madinah University in Saudi Arabia. সহীহ মুসলিমের উপর শতাধিক ব্যাখ্যাগ্রন্থ
          (শরহ) রচিত হয়েছে।
        </p>
        <p>
          On the Noor app, you can browse the complete Sahih Muslim collection, search by keyword or
          chapter, and read each hadith with its Arabic text, full narrator chain, and Bengali
          translation. Our goal is to make this timeless treasury of prophetic wisdom accessible to
          every Bengali-speaking Muslim. <strong>সহীহ মুসলিম পড়ুন — বাংলা অনুবাদ সহ — সম্পূর্ণ বিনামূল্যে।</strong>
        </p>

        <h2 className="text-[14px] font-semibold text-foreground">
          Explore Other Hadith Collections
        </h2>
        <ul className="ml-4 list-disc space-y-1">
          {otherBooks
            .filter((b) => b.id !== "muslim")
            .map((b) => (
              <li key={b.id}>
                <Link to={b.path} className="text-primary font-medium hover:underline">
                  {b.label}
                </Link>
              </li>
            ))}
        </ul>
      </div>
    ),
  },
  tirmidhi: {
    title: "Jami at-Tirmidhi",
    titleBn: "জামে তিরমিযী",
    metaTitle: "Jami at-Tirmidhi — জামে তিরমিযী হাদিস | Noor",
    metaDescription:
      "Explore Jami at-Tirmidhi with Bengali translation. Imam Tirmidhi's essential hadith collection covering fiqh, seerah & virtues with unique hadith grading. তিরমিযী পড়ুন।",
    intro: (
      <div className="space-y-4 text-[13px] leading-relaxed text-muted-foreground">
        <h2 className="text-[15px] font-bold text-foreground">
          About Jami at-Tirmidhi — জামে তিরমিযী সম্পর্কে
        </h2>
        <p>
          <strong>Jami at-Tirmidhi</strong> (জামে তিরমিযী) is one of the six canonical hadith
          collections of Sunni Islam (<em>Kutub al-Sittah</em>). It was compiled by the celebrated
          scholar <strong>Imam Abu Isa Muhammad ibn Isa at-Tirmidhi</strong> (ইমাম আবু ঈসা মুহাম্মাদ
          ইবন ঈসা তিরমিযী রহ.), born in 209 AH / 824 CE in Tirmidh, a city on the banks of the Amu
          Darya river in present-day Uzbekistan. Imam Tirmidhi was a devoted student of Imam Bukhari
          and also sat with Imam Muslim, Imam Abu Dawud, and other giant scholars of the golden age
          of hadith scholarship.
        </p>
        <p>
          His collection contains approximately <strong>3,956 hadiths</strong> organised into 46
          chapters (<em>abwab</em>) covering every dimension of Islamic life: jurisprudence (
          <em>fiqh</em>), virtuous conduct (<em>adab</em>), character (<em>akhlaq</em>), the
          Prophet's biography (<em>seerah</em>), the merits of companions (<em>manaqib</em>),
          Quranic commentary (<em>tafsir</em>), and eschatology (<em>fitan wa ashrat al-saa</em>).
          The collection covers a broad range of topics and is presented here as a study aid; chapter
          and hadith counts can vary by edition. ইমাম তিরমিযীর সংকলন ইসলামের বিভিন্ন বিষয়কে স্পর্শ করে।
        </p>

        <h2 className="text-[14px] font-semibold text-foreground">
          Pioneering Hadith Grading — যুগান্তকারী হাদিস মূল্যায়ন পদ্ধতি
        </h2>
        <p>
          The most distinctive and historically significant feature of Jami at-Tirmidhi is Imam
          Tirmidhi's practice of <strong>grading each hadith</strong> immediately after narrating it.
          He was among the first hadith scholars to systematically classify every hadith he included
          as <em>Sahih</em> (authentic), <em>Hasan</em> (good), <em>Da'if</em> (weak), or{" "}
          <em>Gharib</em> (rare/strange). This methodical grading was revolutionary in the science of
          hadith (<em>'Ilm al-Hadith</em>) and laid the foundational framework for all subsequent
          hadith classification work. তিরমিযীর এই পদ্ধতি হাদিস শাস্ত্রে বিপ্লব এনেছিল এবং পরবর্তী
          সকল মুহাদ্দিসের কাজকে প্রভাবিত করেছিল।
        </p>
        <p>
          Imam Tirmidhi also uniquely records the <strong>legal opinions of major scholars</strong>{" "}
          alongside hadiths — including Imam Malik, Imam Shafi'i, Imam Ahmad ibn Hanbal, and Imam
          Abu Hanifa — making the collection an invaluable reference for Islamic jurisprudence across
          all four major schools of Islamic law (<em>madhabs</em>). This makes it particularly useful
          for students of comparative fiqh (<em>fiqh muqaran</em>).
        </p>

        <h2 className="text-[14px] font-semibold text-foreground">
          Shama'il Muhammadiyyah — শামায়েলে মুহাম্মাদিয়া
        </h2>
        <p>
          Imam Tirmidhi also authored the separate but deeply connected work,{" "}
          <em>Al-Shama'il al-Muhammadiyyah</em> — a dedicated collection of 399 hadiths describing
          the physical appearance, noble character, habits, clothing, food, worship, and personal
          life of Prophet Muhammad ﷺ in extraordinary detail. This unique text has been memorised,
          studied, and cherished by Muslims for over a thousand years. Many scholars consider reading
          it a means of deepening one's love for the Prophet ﷺ. রাসুলুল্লাহ ﷺ এর সুন্নত ও জীবন
          সম্পর্কে শামায়েলে মুহাম্মাদিয়া একটি অপ্রতিদ্বন্দ্বী গ্রন্থ।
        </p>
        <p>
          Jami at-Tirmidhi is a mandatory text in the curriculum of major Islamic seminaries
          worldwide, including Darul Uloom Deoband, Al-Azhar, and Madinah University. Its accessible
          style, systematic grading, and coverage of scholarly opinions make it ideal for both
          beginners and advanced students of Islamic sciences. ইমাম তিরমিযীর জামে তিরমিযী আজও
          ইসলামিক মাদ্রাসাগুলোতে পাঠ্যসূচির অন্তর্ভুক্ত একটি অপরিহার্য গ্রন্থ।
        </p>

        <h2 className="text-[14px] font-semibold text-foreground">
          Explore Other Hadith Collections
        </h2>
        <ul className="ml-4 list-disc space-y-1">
          {otherBooks
            .filter((b) => b.id !== "tirmidhi")
            .map((b) => (
              <li key={b.id}>
                <Link to={b.path} className="text-primary font-medium hover:underline">
                  {b.label}
                </Link>
              </li>
            ))}
        </ul>
      </div>
    ),
  },
  "abu-dawud": {
    title: "Sunan Abu Dawud",
    titleBn: "সুনানে আবু দাউদ",
    metaTitle: "Sunan Abu Dawud — সুনানে আবু দাউদ হাদিস | Noor",
    metaDescription:
      "Read Sunan Abu Dawud with Bengali translation. Imam Abu Dawud's comprehensive jurisprudence-focused hadith collection — selected from 500,000 hadiths. আবু দাউদ পড়ুন বাংলায়।",
    intro: (
      <div className="space-y-4 text-[13px] leading-relaxed text-muted-foreground">
        <h2 className="text-[15px] font-bold text-foreground">
          About Sunan Abu Dawud — সুনানে আবু দাউদ সম্পর্কে
        </h2>
        <p>
          <strong>Sunan Abu Dawud</strong> (সুনানে আবু দাউদ) is one of the six canonical hadith
          collections (<em>Kutub al-Sittah</em>) and is particularly renowned as the most
          comprehensive reference for Islamic jurisprudence (<em>fiqh al-hadith</em>). It was
          compiled by <strong>Imam Abu Dawud Sulayman ibn al-Ash'ath al-Azdi as-Sijistani</strong>{" "}
          (ইমাম আবু দাউদ সুলায়মান ইবনুল আশ'আছ রহ.), born in 202 AH / 817 CE in Sijistan (modern-day
          eastern Iran and southwestern Afghanistan). From childhood, Imam Abu Dawud demonstrated
          a fierce passion for hadith, beginning his travels in search of knowledge at just eighteen
          years old.
        </p>
        <p>
          He studied under some of the greatest Islamic scholars in history, including{" "}
          <strong>Imam Ahmad ibn Hanbal</strong>, <strong>Imam Yahya ibn Ma'in</strong>, and{" "}
          <strong>Imam Ali ibn al-Madini</strong> — the towering figures of hadith criticism in the
          third Islamic century. After decades of study and travel across Iraq, Khorasan, Syria,
          Egypt, and the Hejaz, Imam Abu Dawud is said to have examined{" "}
          a very large body of narrations, ultimately selecting reports for inclusion in his Sunan
          based on their legal relevance and level of authenticity. The exact totals can vary by
          historical source and counting method. He
          personally presented his completed manuscript to Imam Ahmad ibn Hanbal, who reviewed it and
          praised it highly. ইমাম আহমদ ইবন হাম্বল (রহ.) এই গ্রন্থকে অত্যন্ত প্রশংসা করেছিলেন।
        </p>

        <h2 className="text-[14px] font-semibold text-foreground">
          Focus on Islamic Law — ইসলামী আইনশাস্ত্রে অবদান
        </h2>
        <p>
          Unlike some other hadith collections that cover a wide range of topics, Sunan Abu Dawud is
          organised primarily around <strong>legal topics</strong> — making it the go-to reference
          for Islamic law. The collection covers purification (<em>taharah</em>), prayer (<em>salah</em>
          ), fasting (<em>sawm</em>), pilgrimage (<em>hajj</em>), zakat, business transactions,
          marriage and divorce, inheritance, criminal law (<em>hudud</em>), oaths, hunting, and many
          other areas essential to Islamic jurisprudence (<em>fiqh</em>). চার মাজহাবের ফকিহগণ এই
          গ্রন্থকে ফিক্হী মাসায়েলের প্রামাণিক উৎস হিসেবে ব্যবহার করেন।
        </p>
        <p>
          Imam Abu Dawud also added his own comments alongside many hadiths — noting their legal
          implications, degrees of reliability, alternative narrations, and whether a hadith is
          confirmed or has anomalies in its chain. This self-commentary makes Sunan Abu Dawud a
          uniquely self-contained manual of Islamic jurisprudence, suitable for legal scholars who
          want both the hadith and the scholarly analysis in one volume. সুনানে আবু দাউদের বিশেষত্ব
          হলো প্রতিটি হাদিসের সাথে ইমাম আবু দাউদের নিজস্ব মন্তব্য সংযুক্ত থাকা।
        </p>

        <h2 className="text-[14px] font-semibold text-foreground">
          Legacy & Global Influence — বিশ্বব্যাপী প্রভাব ও ঐতিহ্য
        </h2>
        <p>
          Sunan Abu Dawud is studied in Islamic institutions from Al-Azhar in Egypt to Darul Uloom
          Deoband in India, from Madinah University in Saudi Arabia to prestigious seminaries in
          Bangladesh and Malaysia. Scholars across all four major schools of Islamic law — Hanafi,
          Maliki, Shafi'i, and Hanbali — draw upon Sunan Abu Dawud for legal rulings and fatawa.
        </p>
        <p>
          The work has attracted numerous commentaries (<em>shuruh</em>) over the centuries. Among
          the most celebrated is <em>Awn al-Ma'bud</em> by Shams al-Haq Azimabadi and the
          incomplete but deeply insightful <em>Badhl al-Majhud</em> by Shaykh Khalil Ahmad
          Saharanpuri. More recently, scholars continue to produce new translations and annotations
          to make this treasure accessible to modern Muslim readers worldwide. বাংলাদেশ ও ভারতের
          মাদ্রাসাগুলোতে সুনানে আবু দাউদ একটি অপরিহার্য পাঠ্যগ্রন্থ।
        </p>
        <p>
          On Noor, you can read Sunan Abu Dawud with clear Arabic text and Bengali translation,
          browse by chapter, and search across thousands of narrations. <strong>সুনানে আবু দাউদ পড়ুন — বাংলা অনুবাদ সহ — সম্পূর্ণ বিনামূল্যে।</strong>
        </p>

        <h2 className="text-[14px] font-semibold text-foreground">
          Explore Other Hadith Collections
        </h2>
        <ul className="ml-4 list-disc space-y-1">
          {otherBooks
            .filter((b) => b.id !== "abu-dawud")
            .map((b) => (
              <li key={b.id}>
                <Link to={b.path} className="text-primary font-medium hover:underline">
                  {b.label}
                </Link>
              </li>
            ))}
        </ul>
      </div>
    ),
  },
};

export default function HadithBookPlaceholder() {
  const { bookId } = useParams<{ bookId: string }>();
  const navigate = useNavigate();
  const meta = bookMeta[bookId ?? ""] ?? {
    title: bookId ?? "",
    titleBn: "",
    metaTitle: undefined,
    metaDescription: undefined,
    intro: null,
  };

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: "https://noorapp.in/" },
      { "@type": "ListItem", position: 2, name: "Hadith", item: "https://noorapp.in/hadith" },
      { "@type": "ListItem", position: 3, name: meta.title, item: `https://noorapp.in/hadith/${bookId}` },
    ],
  };

  return (
    <div className="min-h-screen bg-background pb-24">
      {meta.metaTitle && (
        <Helmet>
          <title>{meta.metaTitle}</title>
          {meta.metaDescription && (
            <meta name="description" content={meta.metaDescription} />
          )}
          <meta property="og:title" content={meta.metaTitle} />
          {meta.metaDescription && (
            <meta property="og:description" content={meta.metaDescription} />
          )}
          <meta property="og:url" content={`https://noorapp.in/hadith/${bookId}`} />
          <meta property="og:image" content="https://noorapp.in/og-bukhari.png" />
          <link rel="canonical" href={`https://noorapp.in/hadith/${bookId}`} />
          <link rel="alternate" hrefLang="bn" href={`https://noorapp.in/hadith/${bookId}`} />
          <link rel="alternate" hrefLang="en" href={`https://noorapp.in/hadith/${bookId}`} />
          <link rel="alternate" hrefLang="x-default" href={`https://noorapp.in/hadith/${bookId}`} />
          {/* Only index Sahih Bukhari (fully implemented). Placeholder pages get noindex. */}
          {bookId === "bukhari" ? (
            <meta name="robots" content="index,follow" />
          ) : (
            <meta name="robots" content="noindex,follow" />
          )}
          <script type="application/ld+json">{JSON.stringify(breadcrumbJsonLd)}</script>
        </Helmet>
      )}

      <div className="bg-gradient-to-b from-primary/10 to-background px-4 pt-12 pb-6 text-center relative">
        <button
          onClick={() => navigate("/hadith")}
          className="absolute left-4 top-12 p-2 rounded-full hover:bg-muted"
          aria-label="Back to Hadith"
        >
          <ArrowLeft className="h-5 w-5 text-foreground" />
        </button>
        <ScrollText className="mx-auto mb-3 h-10 w-10 text-primary" />
        <h1 className="text-2xl font-bold text-foreground">{meta.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{meta.titleBn}</p>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mx-auto max-w-2xl px-4 mt-8"
      >
        {/* SEO-rich intro content */}
        {meta.intro && (
          <div className="rounded-2xl border border-border bg-card px-5 py-5">
            {meta.intro}
          </div>
        )}

        {/* Fallback for unknown books */}
        {!meta.intro && (
          <div className="text-center text-sm text-muted-foreground py-12">
            <p>This collection is being prepared. Check back soon. ইনশাআল্লাহ।</p>
            <Link to="/hadith" className="mt-4 inline-block text-primary font-medium hover:underline">
              ← Back to all Hadith collections
            </Link>
          </div>
        )}
      </motion.div>

      <BottomNavigation />
    </div>
  );
}
