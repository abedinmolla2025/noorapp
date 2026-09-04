import type { KeyboardEvent, MouseEvent } from "react";

interface StoryWaveformProps {
  levels: number[];
  progress: number;
  isPlaying: boolean;
  onSeek?: (progress: number) => void;
}

export default function StoryWaveform({ levels, progress, isPlaying, onSeek }: StoryWaveformProps) {
  const safeProgress = Math.min(1, Math.max(0, progress));
  const activeBars = Math.round(safeProgress * levels.length);

  const seekFromPointer = (event: MouseEvent<HTMLDivElement>) => {
    if (!onSeek) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    if (!bounds.width) return;
    onSeek((event.clientX - bounds.left) / bounds.width);
  };

  const seekFromKeyboard = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!onSeek) return;
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const delta = event.key === "ArrowRight" ? 0.02 : -0.02;
    onSeek(Math.min(1, Math.max(0, safeProgress + delta)));
  };

  return (
    <div
      className="relative flex h-14 w-full items-center gap-[3px] overflow-hidden rounded-2xl border border-white/10 bg-black/20 px-3 py-2 shadow-inner shadow-black/20"
      role={onSeek ? "slider" : "img"}
      tabIndex={onSeek ? 0 : undefined}
      aria-label="ভয়েস waveform"
      aria-valuemin={onSeek ? 0 : undefined}
      aria-valuemax={onSeek ? 100 : undefined}
      aria-valuenow={onSeek ? Math.round(safeProgress * 100) : undefined}
      onClick={seekFromPointer}
      onKeyDown={seekFromKeyboard}
    >
      <div
        className="pointer-events-none absolute inset-y-0 left-0 bg-emerald-400/10 transition-[width] duration-150"
        style={{ width: `${safeProgress * 100}%` }}
        aria-hidden="true"
      />
      {levels.map((level, index) => {
        const isActive = index < activeBars;
        return (
          <span
            key={index}
            className={`relative z-10 flex-1 rounded-full transition-[height,background-color,opacity] duration-100 ${
              isActive ? "bg-emerald-300 opacity-100 shadow-[0_0_8px_rgba(110,231,183,0.45)]" : "bg-emerald-500/35 opacity-80"
            } ${isPlaying ? "" : "opacity-70"}`}
            style={{ height: `${Math.max(10, Math.min(100, level))}%` }}
            aria-hidden="true"
          />
        );
      })}
    </div>
  );
}
