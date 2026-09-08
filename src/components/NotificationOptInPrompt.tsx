import { useEffect, useMemo, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { Bell } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { claimCustomPrompt, releaseCustomPrompt, requestNotificationPermission } from "@/lib/permissionCoordinator";

const PUSH_OPT_IN_KEY = "noor_push_opt_in";
const PUSH_OPT_IN_DISMISSED_UNTIL_KEY = "noor_push_opt_in_dismissed_until";

function getDismissedUntil(): number {
  const raw = localStorage.getItem(PUSH_OPT_IN_DISMISSED_UNTIL_KEY);
  const n = raw ? Number(raw) : 0;
  return Number.isFinite(n) ? n : 0;
}

function setDismissedForDays(days: number) {
  const until = Date.now() + days * 24 * 60 * 60 * 1000;
  localStorage.setItem(PUSH_OPT_IN_DISMISSED_UNTIL_KEY, String(until));
}

/**
 * Onboarding-style prompt that asks the user to enable notifications.
 * We keep it user-initiated (button click) to avoid browser blocks.
 */
export function NotificationOptInPrompt() {
  const [open, setOpen] = useState(false);

  const isSupported = useMemo(() => {
    if (Capacitor.isNativePlatform()) return true;
    return "Notification" in window && "serviceWorker" in navigator && "PushManager" in window;
  }, []);

  useEffect(() => {
    if (!isSupported) return;

    const optedIn = localStorage.getItem(PUSH_OPT_IN_KEY) === "true";
    if (optedIn) return;

    const dismissedUntil = getDismissedUntil();
    if (dismissedUntil && dismissedUntil > Date.now()) return;

    // Small delay so it feels like onboarding, not a pop-up.
    const t = window.setTimeout(() => {
      if (claimCustomPrompt("notification")) setOpen(true);
    }, 1200);
    return () => window.clearTimeout(t);
  }, [isSupported]);

  const enable = async () => {
    // Mark opt-in first so the existing registration hooks can proceed.
    localStorage.setItem(PUSH_OPT_IN_KEY, "true");
    releaseCustomPrompt("notification");
    setOpen(false);

    // Trigger registration immediately.
    // - On Web: request permission here (user click), then hooks will persist the subscription.
    // - On Native: permission prompt will appear via the existing hook.
    if (!Capacitor.isNativePlatform() && "Notification" in window) {
      try {
        await requestNotificationPermission();
      } catch {
        // ignore
      }
    }

    // Re-run hooks in a predictable way.
    window.location.reload();
  };

  const notNow = () => {
    setDismissedForDays(7);
    releaseCustomPrompt("notification");
    setOpen(false);
  };

  if (!isSupported) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Enable notifications?
          </DialogTitle>
          <DialogDescription>
            Turn on notifications for prayer times, quiz reminders, and important updates.
          </DialogDescription>
        </DialogHeader>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button type="button" variant="outline" onClick={notNow}>
            Not now
          </Button>
          <Button type="button" onClick={enable}>
            Enable
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
