const ACTIVE_PROMPT_KEY = "noor_active_custom_prompt";

export type CustomPrompt = "cookie" | "notification" | "pwa";

export function claimCustomPrompt(prompt: CustomPrompt): boolean {
  try {
    const active = sessionStorage.getItem(ACTIVE_PROMPT_KEY);
    if (active && active !== prompt) return false;
    sessionStorage.setItem(ACTIVE_PROMPT_KEY, prompt);
    return true;
  } catch {
    return true;
  }
}

export function releaseCustomPrompt(prompt: CustomPrompt) {
  try {
    if (sessionStorage.getItem(ACTIVE_PROMPT_KEY) === prompt) {
      sessionStorage.removeItem(ACTIVE_PROMPT_KEY);
    }
  } catch {
    // Ignore unavailable local storage.
  }
}

export async function requestNotificationPermission(): Promise<NotificationPermission | null> {
  if (!("Notification" in window)) return null;
  if (Notification.permission !== "default") return Notification.permission;
  return Notification.requestPermission();
}
