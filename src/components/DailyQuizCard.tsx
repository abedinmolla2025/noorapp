import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useQuizProgress } from "@/hooks/useQuizProgress";
import { useCountdownToMidnight } from "@/hooks/useCountdownToMidnight";
import { useIsMobile } from "@/hooks/use-mobile";
import { Clock } from "lucide-react";

export type DailyQuizOverlayTuning = {
  mobile?: { opacity?: number; widthRem?: number; offsetXRem?: number; offsetYRem?: number };
  desktop?: { opacity?: number; widthRem?: number; offsetXRem?: number; offsetYRem?: number };
};

export type DailyQuizOverlayConfig = {
  enabled?: boolean;
  imageUrl?: string;
  preset?: "old" | "new";
};

type Props = {
  overlayTuning?: DailyQuizOverlayTuning;
  overlayConfig?: DailyQuizOverlayConfig;
  cardClassName?: string;
  cardCss?: string;
};

export const DailyQuizCard = ({ cardClassName, cardCss }: Props) => {
  const navigate = useNavigate();
  const { progress, hasPlayedToday } = useQuizProgress();
  const countdown = useCountdownToMidnight();
  const playedToday = hasPlayedToday();

  const css = typeof cardCss === "string" ? cardCss.trim() : "";
  const scopedCss = css && !css.includes("{") ? `[data-daily-quiz-card]{${css}}` : css;

  return (
    <div
      data-daily-quiz-card
      className={`relative overflow-hidden rounded-2xl shadow-xl ${cardClassName ?? ""}`}
      style={{
        background: "linear-gradient(160deg, hsl(158 64% 18%), hsl(162 55% 14%), hsl(168 50% 10%))",
      }}
    >
      {scopedCss ? <style>{scopedCss}</style> : null}

      {/* Islamic geometric pattern overlay */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          opacity: 0.06,
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M30 0L60 30L30 60L0 30Z' fill='none' stroke='%23ffffff' stroke-width='0.5'/%3E%3Cpath d='M30 10L50 30L30 50L10 30Z' fill='none' stroke='%23ffffff' stroke-width='0.3'/%3E%3C/svg%3E")`,
          backgroundSize: "60px 60px",
        }}
      />

      {/* Radial glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background: "radial-gradient(ellipse at 30% 20%, hsl(158 60% 40% / 0.2), transparent 60%)",
        }}
      />

      <div className="relative z-10 p-5 sm:p-6 space-y-4">
        {/* Status bar pills */}
        <div className="flex items-center justify-center gap-2 flex-wrap">
          {[
            { icon: "🔥", label: `${progress.currentStreak} Day Streak` },
            { icon: "⚡", label: `${progress.totalPoints} XP` },
            { icon: "🏆", label: "Rank #12" },
          ].map((pill) => (
            <span
              key={pill.label}
              className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold text-white/90"
              style={{ background: "hsl(158 40% 30% / 0.5)", backdropFilter: "blur(8px)" }}
            >
              <span>{pill.icon}</span>
              {pill.label}
            </span>
          ))}
        </div>

        {/* Progress bar */}
        <div className="space-y-1">
          <div className="h-1.5 w-full rounded-full overflow-hidden" style={{ background: "hsl(158 30% 20% / 0.6)" }}>
            <div
              className="h-full rounded-full animate-pulse"
              style={{
                width: "60%",
                background: "linear-gradient(90deg, hsl(158 70% 50%), hsl(45 93% 58%))",
              }}
            />
          </div>
          <p className="text-[10px] text-white/50 text-center font-medium tracking-wide">
            Next reward in 2 days
          </p>
        </div>

        {/* Title section */}
        <div className="text-center space-y-2 pt-1">
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/60">
            ⚔️ TODAY'S CHALLENGE
          </span>
          <h3 className="text-2xl sm:text-3xl font-extrabold text-white leading-tight">
            Daily Islamic Quiz
          </h3>
          <p className="text-sm text-white/70 font-medium">
            🎁 Complete today & earn up to 50 XP
          </p>
        </div>

        {/* CTA */}
        {playedToday ? (
          <div className="space-y-3 pt-1">
            <div className="p-3 rounded-xl text-center" style={{ background: "hsl(158 40% 25% / 0.5)" }}>
              <div className="flex items-center justify-center gap-2 mb-1.5">
                <span className="text-xl">✅</span>
                <p className="text-sm font-bold text-white">আজকের কুইজ সম্পূর্ণ!</p>
              </div>
              <div className="flex items-center justify-center gap-1.5">
                <Clock className="w-3 h-3 text-white/60" />
                <p className="text-xs text-white/60">পরবর্তী কুইজ:</p>
                <p className="text-sm font-bold font-mono text-white">{countdown}</p>
              </div>
            </div>
            <Button
              onClick={() => navigate("/quiz")}
              className="w-full rounded-[20px] h-12 text-base font-bold border-0"
              style={{
                background: "hsl(158 40% 25% / 0.4)",
                color: "white",
              }}
            >
              ফলাফল এবং ব্যাজ দেখুন
            </Button>
          </div>
        ) : (
          <Button
            onClick={() => navigate("/quiz")}
            className="w-full rounded-[20px] h-12 text-base font-bold border-0 shadow-lg animate-pulse"
            style={{
              background: "linear-gradient(135deg, hsl(145 70% 45%), hsl(50 95% 55%))",
              color: "hsl(158 60% 10%)",
              boxShadow: "0 4px 20px hsl(145 70% 45% / 0.4)",
            }}
          >
            🚀 START CHALLENGE
          </Button>
        )}

      </div>
    </div>
  );
};
