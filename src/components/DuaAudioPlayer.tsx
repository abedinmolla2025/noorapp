import { useState, useRef, useEffect } from "react";
import { Play, Pause, RotateCcw, Volume2, VolumeX } from "lucide-react";
import { motion } from "framer-motion";

interface DuaAudioPlayerProps {
  arabicText: string;
  duaId: string | number;
  audioUrl?: string;
}

const DuaAudioPlayer = ({ arabicText, duaId, audioUrl }: DuaAudioPlayerProps) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [progress, setProgress] = useState(0);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);


  useEffect(() => {
    return () => {
      if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  useEffect(() => {
    // Reset when dua changes
    setIsPlaying(false);
    setProgress(0);
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
  }, [duaId]);

  const handlePlay = () => {
    if (!window.speechSynthesis) {
      console.error("Speech synthesis not supported");
      return;
    }

    if (isPlaying) {
      window.speechSynthesis.cancel();
      setIsPlaying(false);
      setProgress(0);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      return;
    }

    const utterance = new SpeechSynthesisUtterance(arabicText);
    utterance.lang = "ar-SA";
    utterance.rate = 0.8;
    utterance.pitch = 1;
    utterance.volume = isMuted ? 0 : 1;

    // Find Arabic voice if available
    const voices = window.speechSynthesis.getVoices();
    const arabicVoice = voices.find(voice => 
      voice.lang.startsWith("ar") || voice.name.includes("Arabic")
    );
    if (arabicVoice) {
      utterance.voice = arabicVoice;
    }

    utterance.onstart = () => {
      setIsPlaying(true);
      // Simulate progress
      const duration = arabicText.length * 100; // rough estimate
      const startTime = Date.now();
      intervalRef.current = setInterval(() => {
        const elapsed = Date.now() - startTime;
        const newProgress = Math.min((elapsed / duration) * 100, 100);
        setProgress(newProgress);
      }, 100);
    };

    utterance.onend = () => {
      setIsPlaying(false);
      setProgress(100);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      setTimeout(() => setProgress(0), 500);
    };

    utterance.onerror = () => {
      setIsPlaying(false);
      setProgress(0);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };

    utteranceRef.current = utterance;
    window.speechSynthesis.speak(utterance);
  };

  const handleRestart = () => {
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    setProgress(0);
    setIsPlaying(false);
    setTimeout(() => handlePlay(), 100);
  };

  const toggleMute = () => {
    setIsMuted(!isMuted);
    if (utteranceRef.current) {
      utteranceRef.current.volume = isMuted ? 1 : 0;
    }
  };

  if (audioUrl) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="bg-white/5 rounded-2xl p-4 border border-white/10"
      >
        <div className="flex items-center justify-center gap-2 mb-3 text-[hsl(45,93%,58%)]">
          <Volume2 className="w-4 h-4" />
          <p className="text-xs font-medium">উচ্চারণ শুনুন</p>
        </div>
        <audio className="w-full" controls preload="metadata" src={audioUrl} aria-label="Dua pronunciation audio" />
        <p className="text-xs text-white/40 text-center mt-3">স্টুডিও অডিও শুনতে প্লে বাটনে ক্লিক করুন</p>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
      className="bg-white/5 rounded-2xl p-4 border border-white/10"
    >
      <div className="flex items-center justify-center gap-2 mb-3 text-[hsl(45,93%,58%)]">
        <Volume2 className="w-4 h-4" />
        <p className="text-xs font-medium">উচ্চারণ শুনুন</p>
      </div>

      {/* Progress Bar */}
      <div className="w-full h-1.5 bg-white/10 rounded-full mb-4 overflow-hidden">
        <motion.div
          className="h-full bg-gradient-to-r from-[hsl(45,93%,58%)] to-[hsl(45,93%,48%)] rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.1 }}
        />
      </div>

      <div className="flex items-center justify-center gap-4">
        {/* Restart Button */}
        <button
          onClick={handleRestart}
          className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
          aria-label="Restart"
        >
          <RotateCcw className="w-4 h-4 text-white/70" />
        </button>

        {/* Play/Pause Button */}
        <button
          onClick={handlePlay}
          className="p-4 rounded-full bg-gradient-to-br from-[hsl(45,93%,58%)] to-[hsl(45,93%,48%)] hover:from-[hsl(45,93%,63%)] hover:to-[hsl(45,93%,53%)] transition-all shadow-lg shadow-[hsl(45,93%,58%)]/30"
          aria-label={isPlaying ? "Pause" : "Play"}
        >
          {isPlaying ? (
            <Pause className="w-6 h-6 text-[hsl(158,64%,15%)]" />
          ) : (
            <Play className="w-6 h-6 text-[hsl(158,64%,15%)] ml-0.5" />
          )}
        </button>

        {/* Mute Button */}
        <button
          onClick={toggleMute}
          className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
          aria-label={isMuted ? "Unmute" : "Mute"}
        >
          {isMuted ? (
            <VolumeX className="w-4 h-4 text-white/50" />
          ) : (
            <Volume2 className="w-4 h-4 text-[hsl(45,93%,58%)]" />
          )}
        </button>
      </div>

      <p className="text-xs text-white/40 text-center mt-3">
        {isPlaying ? "চলছে..." : "আরবি উচ্চারণ শুনতে প্লে বাটনে ক্লিক করুন"}
      </p>
    </motion.div>
  );
};

export default DuaAudioPlayer;
