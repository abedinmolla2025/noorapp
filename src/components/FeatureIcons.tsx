import { useMemo, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import { motion, TargetAndTransition } from "framer-motion";

interface FeatureItem {
  emoji: string;
  label: string;
  labelBn: string;
  animation?: TargetAndTransition;
  path: string;
  gradient: string;
}

const features: FeatureItem[] = [
  {
    emoji: "📖",
    label: "Quran",
    labelBn: "কুরআন",
    path: "/quran",
    gradient: "from-emerald-500/30 to-teal-600/40",
  },
  {
    emoji: "🤲",
    label: "Dua",
    labelBn: "দোয়া",
    path: "/dua",
    gradient: "from-amber-500/30 to-orange-600/40",
  },
  {
    emoji: "🕌",
    label: "Prayer",
    labelBn: "নামাজ",
    path: "/prayer-guide",
    gradient: "from-teal-500/30 to-emerald-600/40",
  },
  {
    emoji: "👶",
    label: "Names",
    labelBn: "নাম",
    path: "/baby-names",
    gradient: "from-pink-500/30 to-rose-600/40",
  },
  {
    emoji: "🧭",
    label: "Qibla",
    labelBn: "কিবলা",
    path: "/qibla",
    gradient: "from-blue-500/30 to-cyan-600/40",
  },
  {
    emoji: "📿",
    label: "Tasbih",
    labelBn: "তাসবিহ",
    path: "/tasbih",
    gradient: "from-purple-500/30 to-violet-600/40",
  },
  {
    emoji: "✨",
    label: "99 Names",
    labelBn: "৯৯ নাম",
    path: "/99-names",
    gradient: "from-[hsl(45,93%,58%)]/30 to-amber-600/40",
  },
];

export type FeatureIconsLayout = "scroll" | "grid";

type FeatureIconsProps = {
  layout?: FeatureIconsLayout;
  /** Only used when layout="grid" */
  columns?: number;
};

const FeatureIcons = ({ layout = "scroll", columns }: FeatureIconsProps) => {
  const containerProps = useMemo(() => {
    if (layout === "grid") {
      const cols = Math.max(1, Math.min(Number(columns ?? 2), 6));
      return {
        className: "grid gap-3",
        style: { gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` } as CSSProperties,
      };
    }

    return {
      className: "flex gap-3 overflow-x-auto pb-2 scrollbar-hide",
      style: undefined,
    };
  }, [columns, layout]);

  return (
    <div className={containerProps.className} style={{ ...containerProps.style, transform: 'translateZ(0)', WebkitTransform: 'translateZ(0)' }}>
      {features.map((feature, index) => (
        <Link
          key={feature.label}
          to={feature.path}
          className={
            layout === "grid"
              ? "flex flex-col items-center gap-1.5"
              : "flex-shrink-0 flex flex-col items-center gap-1.5"
          }
        >
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
            whileHover={{ scale: 1.05, y: -2 }}
            whileTap={{ scale: 0.95 }}
            className={`relative group cursor-pointer w-14 h-14 bg-gradient-to-br ${feature.gradient} backdrop-blur-md rounded-2xl border border-white/20 shadow-[0_8px_20px_-4px_rgba(0,0,0,0.3),0_4px_8px_-2px_rgba(0,0,0,0.2),inset_0_1px_1px_rgba(255,255,255,0.15)] hover:shadow-[0_12px_28px_-4px_rgba(0,0,0,0.4),0_6px_12px_-2px_rgba(0,0,0,0.25)] hover:border-[hsl(45,93%,58%)]/40 transition-all duration-300 flex items-center justify-center overflow-hidden`}
          >
            <div className="absolute inset-0 bg-gradient-to-b from-white/10 to-transparent rounded-2xl pointer-events-none" />
            <span className="text-2xl drop-shadow-md relative z-10">
              {feature.emoji}
            </span>
          </motion.div>
          <span className="text-[10px] text-muted-foreground font-medium tracking-wide">
            {feature.label}
          </span>
        </Link>
      ))}
    </div>
  );
};

// FeatureLabels is now integrated into FeatureIcons, keeping export for compatibility
export const FeatureLabels = () => null;

export default FeatureIcons;
