import {
  Home,
  BookOpen,
  Clock,
  Calendar,
  ScrollText,
  PlayCircle,
  Info,
  Mail,
  ShieldCheck,
  FileText,
  LayoutGrid,
  HandHeart,
  Star,
  Baby,
  HelpCircle,
  Navigation,
  BookMarked,
} from "lucide-react";
import { useMemo } from "react";

export type FooterLinksSettings = {
  playStoreUrl?: string;
  appStoreUrl?: string;
  websiteUrl?: string;
  contactEmail?: string;
  facebookUrl?: string;
  whatsappUrl?: string;
  footerText?: string;
  developerLine?: string;
};

const coreLinks = [
  { label: "Home", path: "/", icon: Home },
  { label: "Quran", path: "/quran", icon: BookOpen },
  { label: "Hadith", path: "/hadith", icon: ScrollText },
  { label: "Dua", path: "/dua", icon: HandHeart },
  { label: "Islamic Quiz", path: "/quiz", icon: HelpCircle },
];

const toolLinks = [
  { label: "Prayer Times", path: "/prayer-times", icon: Clock },
  { label: "Islamic Calendar", path: "/calendar", icon: Calendar },
  { label: "99 Names of Allah", path: "/99-names", icon: Star },
  { label: "Baby Names", path: "/baby-names", icon: Baby },
  { label: "Qibla Finder", path: "/qibla", icon: Navigation },
];

const companyLinks = [
  { label: "About Us", path: "/about", icon: Info },
  { label: "Contact Us", path: "/contact", icon: Mail },
  { label: "Privacy Policy", path: "/privacy-policy", icon: ShieldCheck },
  { label: "Terms", path: "/terms", icon: FileText },
  { label: "Data Sources", path: "/sources", icon: BookMarked },
  { label: "Sitemap", path: "/sitemap", icon: LayoutGrid },
];

export default function FooterSection({
  settings,
  onNavigate,
  platform,
}: {
  settings?: FooterLinksSettings;
  onNavigate: (path: string) => void;
  platform: "web" | "app";
}) {
  const playStoreUrl = useMemo(
    () => (settings?.playStoreUrl ?? "").trim() || undefined,
    [settings?.playStoreUrl]
  );
  const websiteUrl = useMemo(
    () => (settings?.websiteUrl ?? "").trim() || window.location.origin,
    [settings?.websiteUrl]
  );

  const renderLink = (link: { label: string; path: string; icon: React.ElementType; external?: boolean }) => {
    const Icon = link.icon;
    const cls =
      "inline-flex items-center gap-2 text-[13px] leading-none text-muted-foreground transition-all duration-150 hover:text-primary hover:scale-[1.02] active:scale-[0.98]";

    if (link.external) {
      return (
        <li key={link.path}>
          <a href={link.path} target="_blank" rel="noreferrer" className={cls}>
            <Icon className="h-[15px] w-[15px] shrink-0" />
            {link.label}
          </a>
        </li>
      );
    }

    // Use real <a> tags for crawlability — SPA navigation via onClick
    return (
      <li key={link.path}>
        <a
          href={link.path}
          onClick={(e) => { e.preventDefault(); onNavigate(link.path); }}
          className={cls}
        >
          <Icon className="h-[15px] w-[15px] shrink-0" />
          {link.label}
        </a>
      </li>
    );
  };

  return (
    <footer className="mt-8 border-t border-border bg-card pt-8 pb-6">
      <div className="mx-auto max-w-screen-xl px-6">
        {/* Three-column grid */}
        <div className="grid grid-cols-3 gap-x-4 gap-y-2">
          {/* Column 1 – Core */}
          <div>
            <h3 className="mb-4 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
              Core
            </h3>
            <ul className="flex flex-col gap-3">
              {coreLinks.map(renderLink)}
            </ul>
          </div>

          {/* Column 2 – Tools */}
          <div>
            <h3 className="mb-4 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
              Tools
            </h3>
            <ul className="flex flex-col gap-3">
              {toolLinks.map(renderLink)}
            </ul>
          </div>

          {/* Column 3 – Company */}
          <div>
            <h3 className="mb-4 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
              Company
            </h3>
            <ul className="flex flex-col gap-3">
              {companyLinks.map(renderLink)}
            </ul>
          </div>
        </div>

        {/* Trust paragraph */}
        <p className="mt-6 text-[11px] leading-relaxed text-muted-foreground/50 text-center">
          Noor is a trusted Islamic app serving Muslims in India and Bangladesh — offering free Quran reading, authentic Hadith collections, accurate prayer times, daily duas, and more in one beautiful, ad-friendly app.
        </p>

        {/* CTA Button */}
        <div className="mt-4">
          {platform === "app" ? (
            <a
              href={websiteUrl}
              target="_blank"
              rel="noreferrer"
              className="block w-full rounded-xl bg-primary py-3 text-center text-[14px] font-semibold text-primary-foreground shadow-soft transition-all hover:brightness-105"
            >
              Visit our website
            </a>
          ) : (
            <a
              href={playStoreUrl ?? "#"}
              target="_blank"
              rel="noreferrer"
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-[14px] font-semibold text-primary-foreground shadow-soft transition-all hover:brightness-105"
            >
              <PlayCircle className="h-[18px] w-[18px]" />
              Get it on Google Play
            </a>
          )}
        </div>

        {/* Copyright */}
        <div className="mt-6 text-center text-[12px] leading-relaxed text-muted-foreground/50">
          © {new Date().getFullYear()} Noor App. All rights reserved.
          <br />
          Developed by Abedin Molla
        </div>
      </div>
    </footer>
  );
}
