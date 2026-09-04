import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

const BAR_COUNT = 48;
const MIN_LEVEL = 10;
const MAX_LEVEL = 100;

const INITIAL_LEVELS = Array.from({ length: BAR_COUNT }, (_, index) => {
  const wave = Math.sin(index * 0.72) * 18 + Math.sin(index * 0.19) * 12;
  return Math.max(18, Math.min(78, Math.round(42 + wave)));
});

type AudioContextWindow = Window & typeof globalThis & {
  webkitAudioContext?: typeof AudioContext;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Reads the playing audio element through Web Audio's analyser node.
 * The caller must invoke `prepare` from a user gesture before calling audio.play().
 */
export function useVoiceWaveform(
  audioRef: RefObject<HTMLAudioElement | null>,
  isPlaying: boolean,
) {
  const [levels, setLevels] = useState<number[]>(INITIAL_LEVELS);
  const contextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  const prepare = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || typeof window === "undefined") return false;

    try {
      if (!contextRef.current) {
        const AudioContextConstructor =
          window.AudioContext || (window as AudioContextWindow).webkitAudioContext;
        if (!AudioContextConstructor) return false;

        const context = new AudioContextConstructor();
        const source = context.createMediaElementSource(audio);
        const analyser = context.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.78;
        source.connect(analyser);
        analyser.connect(context.destination);

        contextRef.current = context;
        sourceRef.current = source;
        analyserRef.current = analyser;
      }

      if (contextRef.current.state === "suspended") {
        void contextRef.current.resume();
      }
      return true;
    } catch {
      // A browser can reject analysis for a source without CORS permission.
      // Playback remains usable; the visualizer simply keeps its last safe shape.
      return false;
    }
  }, [audioRef]);

  useEffect(() => {
    if (!isPlaying || !analyserRef.current) {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      return;
    }

    const analyser = analyserRef.current;
    const frequencyData = new Uint8Array(analyser.frequencyBinCount);

    const renderFrame = () => {
      analyser.getByteFrequencyData(frequencyData);
      const nextLevels = Array.from({ length: BAR_COUNT }, (_, index) => {
        const start = Math.floor((index * frequencyData.length) / BAR_COUNT);
        const end = Math.max(start + 1, Math.floor(((index + 1) * frequencyData.length) / BAR_COUNT));
        let total = 0;
        for (let cursor = start; cursor < end; cursor += 1) total += frequencyData[cursor];
        const average = total / (end - start);
        return clamp(Math.round(MIN_LEVEL + (average / 255) * 90), MIN_LEVEL, MAX_LEVEL);
      });
      setLevels(nextLevels);
      animationFrameRef.current = requestAnimationFrame(renderFrame);
    };

    renderFrame();
    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [isPlaying]);

  useEffect(() => {
    return () => {
      if (animationFrameRef.current !== null) cancelAnimationFrame(animationFrameRef.current);
      sourceRef.current?.disconnect();
      analyserRef.current?.disconnect();
      if (contextRef.current && contextRef.current.state !== "closed") void contextRef.current.close();
    };
  }, []);

  return { levels, prepare };
}
