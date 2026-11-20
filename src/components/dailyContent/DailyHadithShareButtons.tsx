import { useState } from "react";
import { Download, Facebook, Link2, MessageCircle, Share2 } from "lucide-react";
import { toast } from "sonner";
import { kolkataDateString } from "@/lib/dailyContent/selection";
import {
  copyText,
  dailyFacebookShareUrl,
  dailyPosterFileName,
  dailyShareCaption,
  dailyShareUrl,
  dailyWhatsappShareUrl,
  downloadPoster,
  getNativeShareSupport,
  isFinalizedPosterUrl,
  shareDailyPoster,
} from "@/lib/dailyContent/dailyShare";
import type { PublishedDailyHadith } from "@/components/DailyHadith";

/**
 * Phase 8 — share actions for the published daily card. Every action
 * shares the SAME finalized poster asset (the publication row's
 * `poster_url`): the native share sends the poster FILE, WhatsApp /
 * Facebook share the homepage link whose og:image IS the poster
 * (api/prerender.js), and Download serves the finalized file itself —
 * never a client-side re-render.
 *
 * Rendered only for a published record with a finalized poster URL.
 * Without a poster there is no asset to share, so the row renders
 * nothing (the card stays text-only). Every action reports what
 * happened — no silent no-ops, no dead buttons.
 */
export function DailyHadithShareButtons({ record }: { record: PublishedDailyHadith }) {
  const [busy, setBusy] = useState<"native" | "download" | "copy" | null>(null);
  // Native-share capability is probed once on mount (same probe as
  // NameSharePreviewModal). "none" hides the native button — the
  // WhatsApp / Facebook / download / copy actions still work.
  const [nativeSupport] = useState(() => getNativeShareSupport());

  const posterUrl = record.posterUrl ?? null;
  if (!isFinalizedPosterUrl(posterUrl)) return null;

  const kolkataDate = kolkataDateString(new Date());
  const caption = dailyShareCaption({ bengali: record.bengali, source: record.source });
  const shareUrl = dailyShareUrl();
  const whatsappUrl = dailyWhatsappShareUrl(caption);
  const facebookUrl = dailyFacebookShareUrl(shareUrl, caption);
  const fileName = dailyPosterFileName(kolkataDate, posterUrl);

  const onNativeShare = async () => {
    if (busy) return;
    setBusy("native");
    try {
      const res = await shareDailyPoster({
        bengali: record.bengali,
        source: record.source,
        canonicalLink: record.canonicalLink,
        posterUrl,
        kolkataDate,
      });
      if (res.method === "native-file") {
        toast.success("ছবিসহ শেয়ার করা হয়েছে");
      } else if (res.method === "native-text") {
        toast.success("শেয়ার করা হয়েছে", {
          description: "এই ব্রাউজারে ছবিসহ শেয়ার হয় না — লেখা ও লিংক শেয়ার হয়েছে।",
        });
      } else if (res.method === "unsupported") {
        toast.info("এই ব্রাউজারে সরাসরি শেয়ার হয় না", {
          description: "ডাউনলোড করে গ্যালারি থেকে শেয়ার করুন।",
        });
      } else if (res.method === "failed") {
        toast.error("শেয়ার করা যায়নি", { description: res.detail });
      }
      // "cancelled" (user closed the sheet): no toast — not an error.
    } finally {
      setBusy(null);
    }
  };

  const onDownload = async () => {
    if (busy) return;
    setBusy("download");
    try {
      const res = await downloadPoster(posterUrl, fileName);
      if (res.method === "downloaded") {
        toast.success("পোস্টার ডাউনলোড হয়েছে");
      } else if (res.method === "opened") {
        toast.success("পোস্টার নতুন ট্যাবে খোলা হয়েছে", {
          description: "সেখান থেকে ছবিটি সংরক্ষণ করুন।",
        });
      } else {
        toast.error("ডাউনলোড করা যায়নি", { description: res.detail });
      }
    } finally {
      setBusy(null);
    }
  };

  const onCopyLink = async () => {
    if (busy) return;
    setBusy("copy");
    try {
      const ok = await copyText(shareUrl);
      if (ok) {
        toast.success("লিংক কপি হয়েছে");
      } else {
        toast.error("কপি করা যায়নি", {
          description: "লিংকটি হাতে কপি করুন: " + shareUrl,
        });
      }
    } finally {
      setBusy(null);
    }
  };

  const buttonClass =
    "flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-semibold transition-all duration-300 bg-white/10 text-white hover:bg-white/15 border border-white/10 hover:border-white/20 disabled:opacity-50";

  return (
    <div className="mt-5 pt-4 border-t border-white/10" aria-label="শেয়ার করুন">
      <p className="text-sm text-white/60 mb-3">শেয়ার করুন</p>
      <div className="flex flex-wrap gap-2">
        {nativeSupport !== "none" && (
          <button
            type="button"
            onClick={onNativeShare}
            disabled={busy !== null}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-semibold transition-all duration-300 bg-amber-400/15 text-white hover:bg-amber-400/25 border border-amber-400/30 hover:border-amber-400/50 disabled:opacity-50"
          >
            <Share2 size={16} className="text-amber-400" />
            <span>{busy === "native" ? "শেয়ার হচ্ছে…" : "ছবিসহ শেয়ার"}</span>
          </button>
        )}
        <a
          href={whatsappUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={buttonClass}
          aria-label="WhatsApp-এ শেয়ার করুন"
        >
          <MessageCircle size={16} className="text-emerald-400" />
          <span>WhatsApp</span>
        </a>
        <a
          href={facebookUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={buttonClass}
          aria-label="Facebook-এ শেয়ার করুন"
        >
          <Facebook size={16} className="text-sky-400" />
          <span>Facebook</span>
        </a>
        <button type="button" onClick={onDownload} disabled={busy !== null} className={buttonClass}>
          <Download size={16} className="text-amber-400" />
          <span>{busy === "download" ? "ডাউনলোড হচ্ছে…" : "ডাউনলোড"}</span>
        </button>
        <button type="button" onClick={onCopyLink} disabled={busy !== null} className={buttonClass}>
          <Link2 size={16} className="text-amber-400" />
          <span>{busy === "copy" ? "কপি হচ্ছে…" : "লিংক কপি"}</span>
        </button>
      </div>
    </div>
  );
}
