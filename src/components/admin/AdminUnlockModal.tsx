import React, { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Loader2, Shield } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getDeviceFingerprint } from "@/lib/adminSecurity";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUnlocked?: () => void;
};

export const AdminUnlockModal = ({ open, onOpenChange, onUnlocked }: Props) => {
  const [passcode, setPasscode] = useState("");
  const [useFingerprint, setUseFingerprint] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [mode, setMode] = useState<"unlock" | "reset">("unlock");
  const [resetStep, setResetStep] = useState<"request" | "verify">("request");
  const [resetCode, setResetCode] = useState("");
  const [resetNewPasscode, setResetNewPasscode] = useState("");
  const [resetConfirmPasscode, setResetConfirmPasscode] = useState("");
  const [resetSentTo, setResetSentTo] = useState<string | null>(null);

  const canSubmit = useMemo(() => passcode.trim().length >= 6 && passcode.length <= 128, [passcode]);

  const canResetSubmit = useMemo(() => {
    const codeOk = /^\d{6}$/.test(resetCode.trim());
    const nextOk = resetNewPasscode.trim().length >= 6 && resetNewPasscode.length <= 128;
    const confirmOk = resetNewPasscode.length > 0 && resetNewPasscode === resetConfirmPasscode;
    return codeOk && nextOk && confirmOk;
  }, [resetCode, resetNewPasscode, resetConfirmPasscode]);

  useEffect(() => {
    if (!open) {
      setError(null);
      setSubmitting(false);
      setPasscode("");
      setUseFingerprint(true);
      setMode("unlock");
      setResetStep("request");
      setResetCode("");
      setResetNewPasscode("");
      setResetConfirmPasscode("");
      setResetSentTo(null);
    }
  }, [open]);

  const invokeWithRetry = async (body: Record<string, unknown>, maxRetries = 3) => {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const { data, error: fnError } = await supabase.functions.invoke("admin-security", { body });
        // If we got an HTML error page (Cloudflare 522/525), treat as transient
        if (fnError) {
          const msg = fnError.message || String(fnError);
          if ((msg.includes("522") || msg.includes("525") || msg.includes("timed out") || msg.includes("SSL handshake") || msg.includes("Failed to fetch") || msg.includes("non-2xx")) && attempt < maxRetries) {
            await new Promise(r => setTimeout(r, 1500 * (attempt + 1)));
            continue;
          }
          throw fnError;
        }
        return data;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if ((msg.includes("Failed to fetch") || msg.includes("NetworkError") || msg.includes("non-2xx") || msg.includes("522") || msg.includes("525") || msg.includes("timed out")) && attempt < maxRetries) {
          await new Promise(r => setTimeout(r, 1500 * (attempt + 1)));
          continue;
        }
        throw e;
      }
    }
    throw new Error("Server temporarily unavailable. Please try again in a moment.");
  };

  const handleUnlock = async () => {
    setError(null);

    if (!canSubmit) {
      setError("Passcode must be at least 6 characters.");
      return;
    }

    setSubmitting(true);
    try {
      const fingerprint = useFingerprint ? await getDeviceFingerprint() : null;

      const data = await invokeWithRetry({
        action: "unlock",
        passcode,
        device_fingerprint: fingerprint,
      });

      if (!data?.ok) {
        if (data?.error === "setup_required") {
          setError("Admin security was just initialized. Please use 'Forgot passcode?' to set up your passcode.");
          return;
        }
        if (data?.reason === "fingerprint_required") {
          setError("Device fingerprint is required. Please enable the toggle and try again.");
        } else if (data?.locked_until) {
          setError(`Locked out until ${new Date(data.locked_until).toLocaleTimeString()}.`);
        } else {
          setError("Invalid passcode.");
        }
        return;
      }

      // Hidden admin sign-in (no user-facing login system)
      const adminEmail = String(data.admin_email ?? "");
      if (!adminEmail) throw new Error("Missing admin_email from backend");

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: adminEmail,
        password: passcode,
      });
      if (signInError) {
        // avoid leaking details
        setError("Unlock succeeded but sign-in failed. Please try again.");
        return;
      }

      // CRITICAL: Wait for session to fully establish before setting unlock state
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData?.session) {
        setError("Session failed to establish. Please try again.");
        return;
      }

      // Fingerprint is sent for audit logging only, no longer used for device binding
      // No need to store fingerprint locally
      localStorage.setItem("noor_admin_unlocked", "1");
      localStorage.setItem("noor_admin_last_activity", String(Date.now()));

      onOpenChange(false);
      onUnlocked?.();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg || "Failed to unlock.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleRequestResetCode = async () => {
    setError(null);
    setSubmitting(true);
    try {
      const fingerprint = useFingerprint ? await getDeviceFingerprint() : null;
      const data = await invokeWithRetry({
        action: "request_reset_code",
        device_fingerprint: fingerprint,
      });

      if (!data?.ok) {
        const err = String(data?.error ?? "");
        if (err === "email_send_failed") {
          const details = data?.details ? String(data.details) : "";
          setError(details ? `Failed to send code: ${details}` : "Failed to send code.");
          return;
        }
        setError(err === "too_many_requests" ? "Too many requests. Please wait and try again." : "Failed to send code.");
        return;
      }

      setResetSentTo(data?.to ? String(data.to) : null);
      setResetStep("verify");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg || "Failed to send code.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleResetPasscode = async () => {
    setError(null);
    if (!canResetSubmit) {
      setError("Please enter the 6-digit code and a valid new passcode.");
      return;
    }

    setSubmitting(true);
    try {
      const data = await invokeWithRetry({
        action: "reset_passcode_with_code",
        code: resetCode.trim(),
        new_passcode: resetNewPasscode,
      });

      if (!data?.ok) {
        const err = String(data?.error ?? "");
        const msg =
          err === "invalid_code"
            ? "Code must be exactly 6 digits."
            : err === "invalid_or_expired_code"
              ? "Code is invalid or expired. Please request a new code."
              : err === "passcode_reused"
                ? "You recently used this passcode. Choose a different one."
                : err === "weak_passcode"
                  ? "New passcode must be at least 6 characters (max 128)."
                  : "Reset failed.";
        setError(msg);
        return;
      }

      // Return to unlock view (user still needs to unlock with the new passcode)
      setMode("unlock");
      setResetStep("request");
      setResetCode("");
      setResetNewPasscode("");
      setResetConfirmPasscode("");
      setPasscode("");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg || "Reset failed.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            {mode === "unlock" ? "Admin Unlock" : "Reset passcode"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {mode === "unlock" ? (
            <div className="space-y-2">
              <Label htmlFor="admin-passcode">Admin passcode</Label>
              <Input
                id="admin-passcode"
                type="password"
                autoComplete="one-time-code"
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                placeholder="Enter passcode"
              />
            </div>
          ) : (
            <div className="space-y-3">
              {resetStep === "request" ? (
                <p className="text-sm text-muted-foreground">
                  We’ll send a 6-digit verification code to the configured admin email.
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Enter the 6-digit code and your new passcode.
                  {resetSentTo ? (
                    <span className="block text-xs text-muted-foreground">Sent to: {resetSentTo} (check Spam/Promotions)</span>
                  ) : null}
                </p>
              )}

              {resetStep === "verify" ? (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="reset-code">6-digit code</Label>
                    <Input
                      id="reset-code"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      value={resetCode}
                      onChange={(e) => setResetCode(e.target.value)}
                      placeholder="123456"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="reset-new">New passcode</Label>
                    <Input
                      id="reset-new"
                      type="password"
                      autoComplete="new-password"
                      value={resetNewPasscode}
                      onChange={(e) => setResetNewPasscode(e.target.value)}
                      placeholder="Enter new passcode"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="reset-confirm">Confirm new passcode</Label>
                    <Input
                      id="reset-confirm"
                      type="password"
                      autoComplete="new-password"
                      value={resetConfirmPasscode}
                      onChange={(e) => setResetConfirmPasscode(e.target.value)}
                      placeholder="Confirm new passcode"
                    />
                  </div>
                </>
              ) : null}
            </div>
          )}

          <div className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
            <div className="min-w-0">
              <p className="text-sm font-medium">Device fingerprint</p>
              <p className="text-xs text-muted-foreground">Bind admin unlock to this device (optional)</p>
            </div>
            <Switch checked={useFingerprint} onCheckedChange={setUseFingerprint} />
          </div>

          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}

          {mode === "unlock" ? (
            <>
              <Button className="w-full" onClick={handleUnlock} disabled={!canSubmit || submitting}>
                {submitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Unlocking...
                  </>
                ) : (
                  "Unlock Admin"
                )}
              </Button>

              <Button
                variant="ghost"
                className="w-full"
                onClick={() => {
                  setError(null);
                  setMode("reset");
                  setResetStep("request");
                }}
                disabled={submitting}
              >
                Forgot passcode?
              </Button>
            </>
          ) : (
            <>
              {resetStep === "request" ? (
                <Button className="w-full" onClick={handleRequestResetCode} disabled={submitting}>
                  {submitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    "Send 6-digit code"
                  )}
                </Button>
              ) : (
                <Button className="w-full" onClick={handleResetPasscode} disabled={!canResetSubmit || submitting}>
                  {submitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Resetting...
                    </>
                  ) : (
                    "Reset passcode"
                  )}
                </Button>
              )}

              <Button
                variant="ghost"
                className="w-full"
                onClick={() => {
                  setError(null);
                  setMode("unlock");
                  setResetStep("request");
                  setResetCode("");
                  setResetNewPasscode("");
                  setResetConfirmPasscode("");
                }}
                disabled={submitting}
              >
                Back to unlock
              </Button>
            </>
          )}

          <p className="text-[11px] text-muted-foreground">
            Admin access requires a configured passcode. If you do not know it, use the secure reset flow or contact the site owner.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
};
