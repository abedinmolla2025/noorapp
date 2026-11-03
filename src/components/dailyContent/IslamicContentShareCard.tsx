import type { CardPayload } from "@/lib/dailyContent/types";

/**
 * Shareable Islamic content card — square, brand-matched to the Daily Hadith
 * card (emerald gradient, gold accents). Renders ONLY the payload's verbatim
 * fields: no virtue, benefit or grade wording is added here either.
 *
 * The parent holds a ref to the outer node and exports it with the existing
 * `useDomToPng` hook (html-to-image), the same pattern as the name share
 * cards. This component itself never captures, uploads or publishes.
 */
const KIND_HEADING: Record<CardPayload["kind"], string> = {
  quran: "কুরআনের আয়াত",
  hadith: "হাদিস",
  dua: "দোয়া",
};

export function IslamicContentShareCard({ card }: { card: CardPayload }) {
  return (
    <div className="relative aspect-square w-full max-w-[540px] overflow-hidden rounded-[1.5rem] bg-gradient-to-br from-emerald-800 via-teal-800 to-cyan-900 shadow-2xl">
      <div className="absolute inset-0 border border-white/10 rounded-[1.5rem]" />
      <div className="absolute -top-16 -right-16 w-56 h-56 bg-gradient-to-br from-amber-400 to-orange-500 rounded-full blur-[60px] opacity-30" />
      <div className="absolute -bottom-16 -left-16 w-48 h-48 bg-gradient-to-tr from-teal-400 to-cyan-500 rounded-full blur-[50px] opacity-25" />
      <div className="relative z-10 flex h-full flex-col p-6 md:p-8">
        <div className="flex items-center justify-between">
          <span className="text-sm font-bold tracking-wide text-amber-300">
            {KIND_HEADING[card.kind]}
          </span>
          <span className="text-xs font-semibold text-white/60">NoorApp</span>
        </div>

        <div className="mt-5 flex-1 overflow-hidden">
          <p className="text-right font-arabic text-xl md:text-2xl leading-loose text-amber-200" dir="rtl">
            {card.arabic}
          </p>
          <p className="mt-4 text-base md:text-lg font-medium leading-relaxed text-white">
            {card.bengali}
          </p>
        </div>

        <div className="border-t border-white/10 pt-4">
          <p className="text-sm font-bold text-amber-400">{card.title}</p>
          <p className="mt-1 text-xs text-white/60">{card.sourceLine}</p>
          <p className="mt-2 text-[11px] text-white/40">noorapp.in</p>
        </div>
      </div>
    </div>
  );
}
