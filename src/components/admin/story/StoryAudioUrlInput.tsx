import { AlertCircle, Check, Copy, ExternalLink } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface StoryAudioUrlInputProps {
  value: string;
  onChange: (value: string) => void;
}

function isValidAudioUrl(value: string): boolean {
  if (!value.trim()) return false;
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

export function StoryAudioUrlInput({ value, onChange }: StoryAudioUrlInputProps) {
  const [copied, setCopied] = useState(false);
  const trimmedValue = value.trim();
  const valid = isValidAudioUrl(trimmedValue);

  const handleCopy = async () => {
    if (!trimmedValue) return;
    await navigator.clipboard.writeText(trimmedValue);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor="story-audio-url">Story Audio URL (direct MP3)</Label>
        {trimmedValue && (
          <div className="flex items-center gap-2">
            {valid && (
              <a
                href={trimmedValue}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <ExternalLink className="h-3 w-3" /> Open
              </a>
            )}
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={handleCopy}
              className="h-7 gap-1 rounded-full px-2 text-xs"
            >
              {copied ? (
                <>
                  <Check className="h-3 w-3" /> Copied
                </>
              ) : (
                <>
                  <Copy className="h-3 w-3" /> Copy
                </>
              )}
            </Button>
          </div>
        )}
      </div>

      <Input
        id="story-audio-url"
        type="url"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="https://cdn.example.com/noorapp/story-01.mp3"
        className="font-mono text-xs"
        inputMode="url"
        autoComplete="off"
      />

      <div className="rounded-lg bg-blue-50 p-3 text-sm dark:bg-blue-950/30">
        <div className="flex gap-2">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-blue-600 dark:text-blue-400" />
          <div className="space-y-1 text-blue-900 dark:text-blue-200">
            <p className="font-medium">Use a public direct audio URL</p>
            <p className="text-xs leading-relaxed">
              Cloudflare R2 বা অন্য hosting থেকে পাওয়া সরাসরি <code>.mp3</code> URL দিন। SoundCloud embed code বা iframe এখানে আর প্রয়োজন নেই। URL-টি public হতে হবে এবং browser-এর জন্য audio streaming ও CORS অনুমোদিত থাকা উচিত।
            </p>
          </div>
        </div>
      </div>

      {trimmedValue && !valid && (
        <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          এই URLটি সঠিক মনে হচ্ছে না। <code>https://</code> বা <code>http://</code> দিয়ে শুরু হওয়া সম্পূর্ণ direct audio URL দিন।
        </p>
      )}

      {valid && (
        <p className="rounded-lg bg-green-50 p-3 text-xs text-green-900 dark:bg-green-950/30 dark:text-green-200">
          ✓ Direct audio URL detected. Save করার পর public story player-এ এটি ব্যবহার হবে।
        </p>
      )}
    </div>
  );
}

export default StoryAudioUrlInput;

export type { StoryAudioUrlInputProps };

// Backwards-compatible alias for any existing imports outside the editor.
export const StoryAudioEmbedInput = StoryAudioUrlInput;
