import { Helmet } from "react-helmet-async";
import { ArrowLeft, Download, ExternalLink, BookOpen, ScrollText, Home, Info, Clock } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useGlobalConfig } from "@/context/GlobalConfigContext";
import BottomNavigation from "@/components/BottomNavigation";
import noorLogo from "@/assets/noor-logo.png";

const DownloadPage = () => {
  const navigate = useNavigate();
  const { branding, system } = useGlobalConfig();
  const logoSrc = branding.logoUrl
    ? `${branding.logoUrl}?v=${branding.logoVersion || ""}`
    : noorLogo;
  const appName = branding.appName || "Noor";
  const apkUrl = system.apkUrl;
  const apkVersion = system.apkVersion || "1.0.0";

  return (
    <>
      <Helmet>
        <title>Download Noor App (APK) — Free Islamic App</title>
        <meta name="description" content="Download the Noor Islamic App APK directly. Read Quran, Hadith, Dua, get Prayer Times and more — all free." />
        <link rel="canonical" href="https://noorapp.in/download" />
        <meta name="robots" content="index,follow" />
      </Helmet>

      <div className="min-h-screen bg-gradient-to-b from-background via-background to-primary/5 pb-24">
        <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-lg border-b border-border">
          <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-4">
            <button
              onClick={() => navigate(-1)}
              className="p-2 rounded-full hover:bg-muted/70 border border-border/60 transition-colors"
            >
              <ArrowLeft size={22} />
            </button>
            <h1 className="text-xl font-bold tracking-wide">Download {appName}</h1>
          </div>
        </header>

        <main className="max-w-lg mx-auto px-4 py-10 flex flex-col items-center text-center space-y-8">
          {/* Logo & Intro */}
          <div className="space-y-4">
            <img
              src={logoSrc}
              alt={`${appName} Logo`}
              className="w-24 h-24 rounded-2xl shadow-lg mx-auto"
            />
            <h2 className="text-2xl font-bold text-foreground">{appName} Islamic App</h2>
            <p className="text-muted-foreground text-sm max-w-sm mx-auto">
              Your complete Islamic companion — Quran, Hadith, Dua, Prayer Times, Quiz & more. All free, all in one app.
            </p>
          </div>

          {/* Version */}
          <div className="bg-card/70 border border-border/60 rounded-xl px-5 py-3 inline-flex items-center gap-3">
            <span className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Version</span>
            <span className="text-sm font-bold text-foreground">{apkVersion}</span>
            <span className="text-[10px] bg-primary/10 text-primary font-semibold px-2 py-0.5 rounded-full">APK</span>
          </div>

          {/* Download Button or Coming Soon */}
          {apkUrl ? (
            <a
              href={apkUrl}
              download
              className="flex items-center justify-center gap-3 w-full max-w-xs rounded-2xl bg-primary py-4 text-base font-bold text-primary-foreground shadow-lg hover:brightness-110 transition-all active:scale-[0.97]"
            >
              <Download className="h-5 w-5" />
              Download {appName} App (APK)
            </a>
          ) : (
            <div className="flex items-center justify-center gap-3 w-full max-w-xs rounded-2xl bg-muted py-4 text-base font-bold text-muted-foreground">
              <Clock className="h-5 w-5" />
              Coming Soon
            </div>
          )}

          {/* Notes */}
          <div className="space-y-3 w-full max-w-sm">
            <div className="flex items-start gap-2 bg-card/70 border border-border/60 rounded-xl p-4 text-left">
              <ExternalLink className="h-4 w-4 mt-0.5 text-primary shrink-0" />
              <p className="text-xs text-muted-foreground">
                <strong className="text-foreground">Play Store version coming soon.</strong> This APK is the official release for early users before the Google Play listing is live.
              </p>
            </div>
            <div className="flex items-start gap-2 bg-card/70 border border-border/60 rounded-xl p-4 text-left">
              <Info className="h-4 w-4 mt-0.5 text-primary shrink-0" />
              <p className="text-xs text-muted-foreground">
                <strong className="text-foreground">Installation tip:</strong> Enable <em>"Install from Unknown Sources"</em> in your Android settings if required. Go to Settings → Security → Unknown Sources.
              </p>
            </div>
          </div>

          {/* Internal Links */}
          <div className="pt-4 space-y-2 w-full max-w-sm">
            <p className="text-xs text-muted-foreground/60 uppercase tracking-wider font-semibold">Explore</p>
            <div className="flex flex-wrap justify-center gap-2">
              {[
                { label: "Home", href: "/", icon: Home },
                { label: "Quran", href: "/quran", icon: BookOpen },
                { label: "Hadith", href: "/hadith", icon: ScrollText },
                { label: "About", href: "/about", icon: Info },
              ].map((l) => (
                <a
                  key={l.href}
                  href={l.href}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-3 py-1.5 text-xs font-medium text-foreground hover:bg-primary hover:text-primary-foreground transition-colors"
                >
                  <l.icon className="h-3.5 w-3.5" />
                  {l.label}
                </a>
              ))}
            </div>
          </div>
        </main>
      </div>

      <BottomNavigation />
    </>
  );
};

export default DownloadPage;
