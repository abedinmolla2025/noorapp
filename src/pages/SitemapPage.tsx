import { Helmet } from "react-helmet-async";
import BottomNavigation from "@/components/BottomNavigation";

const sections = [
  {
    title: "Core",
    links: [
      { label: "Home", href: "/" },
      { label: "Quran", href: "/quran" },
      { label: "Hadith", href: "/hadith" },
      { label: "Dua", href: "/dua" },
      { label: "Daily Quiz", href: "/quiz" },
    ],
  },
  {
    title: "Hadith Collections",
    links: [
      { label: "Sahih Bukhari", href: "/hadith/sahih-bukhari" },
      { label: "Sahih Bukhari (Bangla)", href: "/hadith/sahih-bukhari/bangla" },
      { label: "Sahih Bukhari (English)", href: "/hadith/sahih-bukhari/english" },
      { label: "Sahih Bukhari (Urdu)", href: "/hadith/sahih-bukhari/urdu" },
      { label: "Sahih Muslim", href: "/hadith" },
      { label: "Jami at-Tirmidhi", href: "/hadith/tirmidhi" },
      { label: "Sunan Abu Dawud", href: "/hadith/abu-dawud" },
      // Placeholder collections — links kept for user navigation but these pages are noindex
    ],
  },
  {
    title: "Tools",
    links: [
      { label: "Prayer Times", href: "/prayer-times" },
      { label: "Islamic Calendar", href: "/calendar" },
      { label: "Qibla Finder", href: "/qibla" },
      { label: "Tasbih Counter", href: "/tasbih" },
      { label: "Prayer Guide", href: "/prayer-guide" },
    ],
  },
  {
    title: "Names",
    links: [
      { label: "99 Names of Allah", href: "/99-names" },
      { label: "Baby Names", href: "/baby-names" },
      
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About Us", href: "/about" },
      { label: "Contact Us", href: "/contact" },
      { label: "Islamic App", href: "/islamic-app" },
      { label: "Privacy Policy", href: "/privacy-policy" },
      { label: "Terms & Conditions", href: "/terms" },
    ],
  },
];

export default function SitemapPage() {
  return (
    <>
      <Helmet>
        <title>Sitemap — Noor Islamic App</title>
        <meta name="description" content="Browse all pages on Noor — Quran, Hadith, Dua, Prayer Times, Islamic Quiz, Baby Names and more." />
        <link rel="canonical" href="https://noorapp.in/sitemap" />
        <meta name="robots" content="noindex,follow" />
      </Helmet>

      <main className="mx-auto max-w-3xl px-4 pt-8 pb-24">
        <h1 className="text-2xl font-bold text-foreground mb-6">Sitemap</h1>

        <nav aria-label="Sitemap" className="space-y-8">
          {sections.map((section) => (
            <section key={section.title}>
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground/60 mb-3">
                {section.title}
              </h2>
              <ul className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2">
                {section.links.map((link) => (
                  <li key={link.href}>
                    <a
                      href={link.href}
                      className="text-sm text-primary hover:underline"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </nav>
      </main>

      <BottomNavigation />
    </>
  );
}
