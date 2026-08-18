import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  HelpCircle,
  Loader2,
  Mail,
  MessageSquare,
  Paperclip,
  Send,
  ShieldCheck,
  UserRound,
  X,
} from "lucide-react";

const APP_PAGES = [
  { value: "home", label: "Home Page" },
  { value: "quran", label: "Quran" },
  { value: "hadith", label: "Hadith" },
  { value: "dua", label: "Dua & Ruqyah" },
  { value: "stories", label: "Islamic Stories" },
  { value: "prayer_times", label: "Prayer Times & Qibla" },
  { value: "tasbih", label: "Digital Tasbih" },
  { value: "admin_panel", label: "Admin Panel" },
  { value: "other", label: "General / Other" },
];

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
const ALLOWED_ATTACHMENT_TYPES = ["image/png", "image/jpeg"] as const;

const ISSUE_TYPES = [
  { value: "general_inquiry", label: "General Question" },
  { value: "content_error", label: "Content / Translation Error" },
  { value: "ui_bug", label: "UI / Display Glitch (White screen / Layout)" },
  { value: "audio_issue", label: "Audio Story / Recitation Issue" },
  { value: "loading_slow", label: "Slow Loading / Page Lag" },
  { value: "feature_request", label: "Feature Suggestion" },
  { value: "other", label: "Other Issue" },
];

const fieldBase =
  "h-14 w-full rounded-xl border border-[#E5E7EB] bg-white text-sm text-slate-900 shadow-sm outline-none transition-all duration-200 placeholder:text-slate-400 hover:border-slate-300 focus-visible:border-[#16A34A] focus-visible:ring-4 focus-visible:ring-[#16A34A]/10 focus-visible:shadow-[0_8px_24px_rgba(22,163,74,0.10)]";

const selectBase =
  "h-14 w-full rounded-xl border border-[#E5E7EB] bg-white pl-11 pr-10 text-sm text-slate-900 shadow-sm outline-none transition-all duration-200 hover:border-slate-300 focus:border-[#16A34A] focus:ring-4 focus:ring-[#16A34A]/10 focus:shadow-[0_8px_24px_rgba(22,163,74,0.10)]";

export const ContactForm = () => {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState("");
  const [subject, setSubject] = useState("");
  const [page, setPage] = useState("home");
  const [issueType, setIssueType] = useState("general_inquiry");
  const [message, setMessage] = useState("");
  const [attachment, setAttachment] = useState<File | null>(null);
  const [attachmentError, setAttachmentError] = useState("");
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const { toast } = useToast();

  const validateEmail = (value: string) => {
    const normalized = value.trim();
    if (!normalized) {
      setEmailError("");
      return true;
    }

    const valid = EMAIL_PATTERN.test(normalized);
    setEmailError(valid ? "" : "Please enter a valid email address.");
    return valid;
  };

  const handleAttachmentChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    if (!file) return;

    if (!ALLOWED_ATTACHMENT_TYPES.includes(file.type as (typeof ALLOWED_ATTACHMENT_TYPES)[number])) {
      setAttachment(null);
      setAttachmentError("Please choose a PNG or JPG image.");
      e.target.value = "";
      return;
    }

    if (file.size > MAX_ATTACHMENT_BYTES) {
      setAttachment(null);
      setAttachmentError("Please choose an image smaller than 5MB.");
      e.target.value = "";
      return;
    }

    setAttachment(file);
    setAttachmentError("");
  };

  const removeAttachment = () => {
    setAttachment(null);
    setAttachmentError("");
    if (attachmentInputRef.current) attachmentInputRef.current.value = "";
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (email.trim() && !validateEmail(email)) {
      toast({
        title: "Invalid email address",
        description: "Please enter a valid email address so we can reply to you.",
        variant: "destructive",
      });
      return;
    }

    // Flexible validation: allow submission if either message or subject or name is provided,
    // but ensure at least some content is submitted.
    if (!message.trim() && !subject.trim() && !name.trim() && !email.trim()) {
      toast({
        title: "Please provide some input",
        description: "Please write a message or fill in at least one field before sending.",
        variant: "destructive",
      });
      return;
    }

    setSubmitting(true);
    try {
      const selectedPageLabel = APP_PAGES.find((p) => p.value === page)?.label || page;
      const selectedIssueLabel = ISSUE_TYPES.find((i) => i.value === issueType)?.label || issueType;

      const finalSubject = subject.trim()
        ? `[${selectedIssueLabel}] ${subject.trim()}`
        : `[Support Inquiry] ${selectedIssueLabel}`;

      let attachmentUrl = "";
      if (attachment) {
        const extension = attachment.type === "image/png" ? "png" : "jpg";
        const attachmentPath = `support/${crypto.randomUUID()}.${extension}`;
        const { error: uploadError } = await supabase.storage
          .from("contact-attachments")
          .upload(attachmentPath, attachment, {
            cacheControl: "3600",
            contentType: attachment.type,
            upsert: false,
          });

        if (uploadError) throw uploadError;
        attachmentUrl = supabase.storage.from("contact-attachments").getPublicUrl(attachmentPath).data.publicUrl;
      }

      const finalMessage = `[Selected Page: ${selectedPageLabel}]\n[Issue Category: ${selectedIssueLabel}]\n\n${
        message.trim() || "(No detailed message provided by user)"
      }${attachmentUrl ? `\n\n[Screenshot attachment: ${attachmentUrl}]` : ""}`;

      const { error } = await supabase.from("contact_messages").insert({
        name: name.trim() || "Anonymous Visitor",
        email: email.trim() || "no-email@noorapp.in",
        subject: finalSubject,
        message: finalMessage,
        status: "unread",
      });

      if (error) throw error;

      // Also send email notification via Vercel API (fire and forget, don't block UI)
      fetch("/api/send-contact-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim() || "Anonymous Visitor",
          email: email.trim(),
          subject: finalSubject,
          message: message.trim() || "(No detailed message provided by user)",
          page: selectedPageLabel,
          issueType: selectedIssueLabel,
          attachmentUrl,
        }),
      }).catch((err) => console.error("Email notification failed:", err));

      setSubmitted(true);
      toast({
        title: "Message Sent Successfully!",
        description: "Jazakallah Khair. We have received your support request and will review it soon.",
      });

      setName("");
      setEmail("");
      setEmailError("");
      setSubject("");
      setPage("home");
      setIssueType("general_inquiry");
      setMessage("");
      removeAttachment();
    } catch (err: unknown) {
      console.error("Error submitting support message:", err);
      const errorMessage = err instanceof Error ? err.message : "Please try again later or email us at support@noorapp.in";
      toast({
        title: "Failed to send message",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <section className="animate-in fade-in slide-in-from-bottom-2 duration-500 rounded-2xl border border-[#E5E7EB] bg-white p-7 text-center shadow-[0_8px_30px_rgba(0,0,0,0.06)] sm:p-10">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#16A34A]/10 text-[#16A34A] ring-8 ring-[#16A34A]/5">
          <CheckCircle2 className="h-8 w-8" strokeWidth={2.2} />
        </div>
        <h3 className="mt-6 text-xl font-bold tracking-tight text-slate-950">Message Sent Successfully!</h3>
        <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-slate-500">
          Jazakallah Khair for helping us improve NoorApp. Your feedback has been sent to our development and support team.
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setSubmitted(false)}
          className="mt-7 h-11 rounded-xl border-slate-200 px-5 font-semibold text-slate-700 transition-all hover:border-[#16A34A]/40 hover:bg-[#16A34A]/5 hover:text-[#15803D]"
        >
          Send Another Message / আরেকটি বার্তা পাঠান
        </Button>
      </section>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="animate-in fade-in slide-in-from-bottom-3 duration-500 rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-[0_8px_30px_rgba(0,0,0,0.06)] sm:p-8"
    >
      <div className="mb-8 flex items-start justify-between gap-4 border-b border-slate-100 pb-6">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#15803D]">Support desk</p>
          <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-950">Send us a message</h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-slate-500">
            Tell us what happened, where it happened, and how we can make NoorApp better. You can submit a ticket without completing every field.
          </p>
        </div>
        <div className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#16A34A]/10 text-[#15803D] sm:flex">
          <MessageSquare className="h-5 w-5" />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <div className="relative">
          <UserRound className="pointer-events-none absolute left-4 top-1/2 z-10 h-[18px] w-[18px] -translate-y-1/2 text-slate-400 transition-colors peer-focus:text-[#16A34A]" />
          <Input
            id="contact-name"
            placeholder="Enter your full name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={`${fieldBase} peer px-11 pt-2`}
          />
            <Label htmlFor="contact-name" className="pointer-events-none absolute left-10 top-0 z-10 -translate-y-1/2 bg-white px-1 text-xs font-semibold text-slate-500 transition-colors peer-focus:text-[#16A34A]">
            Full Name
          </Label>
        </div>

        <div className="relative">
          <Mail className="pointer-events-none absolute left-4 top-1/2 z-10 h-[18px] w-[18px] -translate-y-1/2 text-slate-400 transition-colors" />
          <Input
            id="contact-email"
            type="email"
            inputMode="email"
            placeholder="Enter your email address"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (emailError) validateEmail(e.target.value);
            }}
            onBlur={() => validateEmail(email)}
            aria-invalid={Boolean(emailError)}
            aria-describedby={emailError ? "contact-email-error" : undefined}
            className={`${fieldBase} peer px-11 pt-2 ${emailError ? "border-red-400 focus-visible:border-red-500 focus-visible:ring-red-500/10" : ""}`}
          />
            <Label htmlFor="contact-email" className="pointer-events-none absolute left-10 top-0 z-10 -translate-y-1/2 bg-white px-1 text-xs font-semibold text-slate-500 transition-colors peer-focus:text-[#16A34A]">
            Email Address
          </Label>
          {emailError ? (
            <p id="contact-email-error" className="mt-2 text-xs font-medium text-red-600" role="alert">
              {emailError}
            </p>
          ) : (
            <p className="mt-2 text-[11px] text-slate-400">Optional, but required if you want a direct reply.</p>
          )}
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2">
        <div className="relative">
          <FileText className="pointer-events-none absolute left-4 top-1/2 z-20 h-[18px] w-[18px] -translate-y-1/2 text-slate-400" />
          <Select value={page} onValueChange={setPage}>
            <SelectTrigger className={`${selectBase} peer`} aria-label="Affected Page">
              <SelectValue placeholder="Select the page where the issue occurred" />
            </SelectTrigger>
            <SelectContent className="rounded-xl border-[#E5E7EB] bg-white shadow-[0_8px_30px_rgba(0,0,0,0.10)]">
              {APP_PAGES.map((p) => (
                <SelectItem key={p.value} value={p.value} className="rounded-lg py-3 focus:bg-[#16A34A]/10 focus:text-[#15803D]">
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Label className="pointer-events-none absolute left-10 top-0 z-10 -translate-y-1/2 bg-white px-1 text-xs font-semibold text-slate-500 transition-colors peer-focus:text-[#16A34A]">
            Affected Page
          </Label>
        </div>

        <div className="relative">
          <AlertTriangle className="pointer-events-none absolute left-4 top-1/2 z-20 h-[18px] w-[18px] -translate-y-1/2 text-slate-400" />
          <Select value={issueType} onValueChange={setIssueType}>
            <SelectTrigger className={`${selectBase} peer`} aria-label="Issue Category">
              <SelectValue placeholder="Select an issue category" />
            </SelectTrigger>
            <SelectContent className="rounded-xl border-[#E5E7EB] bg-white shadow-[0_8px_30px_rgba(0,0,0,0.10)]">
              {ISSUE_TYPES.map((i) => (
                <SelectItem key={i.value} value={i.value} className="rounded-lg py-3 focus:bg-[#16A34A]/10 focus:text-[#15803D]">
                  {i.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Label className="pointer-events-none absolute left-10 top-0 z-10 -translate-y-1/2 bg-white px-1 text-xs font-semibold text-slate-500 transition-colors peer-focus:text-[#16A34A]">
            Issue Category
          </Label>
        </div>
      </div>

      <div className="relative mt-6">
        <FileText className="pointer-events-none absolute left-4 top-1/2 z-10 h-[18px] w-[18px] -translate-y-1/2 text-slate-400 transition-colors peer-focus:text-[#16A34A]" />
        <Input
          id="contact-subject"
          placeholder="Briefly describe your issue"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          className={`${fieldBase} peer px-11 pt-2`}
        />
        <Label htmlFor="contact-subject" className="pointer-events-none absolute left-10 top-0 z-10 -translate-y-1/2 bg-white px-1 text-xs font-semibold text-slate-500 transition-colors peer-focus:text-[#16A34A]">
          Subject
        </Label>
      </div>

      <div className="mt-6">
        <div className="mb-2 flex items-center justify-between gap-3">
          <Label htmlFor="contact-message" className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            <HelpCircle className="h-4 w-4 text-[#16A34A]" />
            Description
          </Label>
          <span className="text-xs tabular-nums text-slate-400" aria-live="polite">{message.length}/1000</span>
        </div>
        <div className="relative">
          <MessageSquare className="pointer-events-none absolute left-4 top-4 h-[18px] w-[18px] text-slate-400 transition-colors" />
          <Textarea
            id="contact-message"
            placeholder="Please provide as much detail as possible..."
            rows={5}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className="min-h-[150px] resize-y rounded-xl border-[#E5E7EB] bg-white pl-11 pt-4 text-sm leading-6 shadow-sm transition-all duration-200 placeholder:text-slate-400 hover:border-slate-300 focus-visible:border-[#16A34A] focus-visible:ring-4 focus-visible:ring-[#16A34A]/10 focus-visible:shadow-[0_8px_24px_rgba(22,163,74,0.10)]"
          />
        </div>
      </div>

      <div className={`mt-6 rounded-xl border border-dashed px-4 py-3.5 transition-colors ${attachmentError ? "border-red-300 bg-red-50/60" : "border-slate-200 bg-slate-50/70 hover:border-[#16A34A]/40"}`}>
        <input
          ref={attachmentInputRef}
          id="contact-attachment"
          type="file"
          accept="image/png,image/jpeg"
          onChange={handleAttachmentChange}
          className="sr-only"
        />
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-[#15803D] shadow-sm">
            <Paperclip className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-slate-700">Attach Screenshots <span className="font-normal text-slate-400">(Optional)</span></p>
            <p className="mt-0.5 text-xs text-slate-400">PNG, JPG up to 5MB</p>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => attachmentInputRef.current?.click()}
            className="h-10 shrink-0 gap-2 rounded-xl border-[#16A34A]/15 bg-[#16A34A]/10 px-3 text-xs font-bold text-[#15803D] transition-all hover:border-[#16A34A]/30 hover:bg-[#16A34A]/15"
          >
            <Paperclip className="h-3.5 w-3.5" />
            Choose File
          </Button>
        </div>
        {attachment && (
          <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-[#16A34A]/15 bg-white px-3 py-2 text-xs text-slate-600">
            <span className="min-w-0 truncate">{attachment.name}</span>
            <button type="button" onClick={removeAttachment} className="flex shrink-0 items-center gap-1 font-semibold text-slate-400 transition-colors hover:text-red-600" aria-label="Remove selected screenshot">
              <X className="h-3.5 w-3.5" />
              Remove
            </button>
          </div>
        )}
        {attachmentError && <p className="mt-2 text-xs font-medium text-red-600" role="alert">{attachmentError}</p>}
      </div>

      <Button
        type="submit"
        className="group relative mt-8 h-14 w-full overflow-hidden rounded-[14px] bg-gradient-to-r from-[#16A34A] to-[#15803D] text-sm font-bold text-white shadow-[0_10px_24px_rgba(22,163,74,0.35)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_14px_28px_rgba(22,163,74,0.38)] active:translate-y-0 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-70"
        disabled={submitting}
      >
        <span className="pointer-events-none absolute inset-0 origin-center scale-0 rounded-full bg-white/15 transition-transform duration-500 group-active:scale-[2.4]" />
        <span className="relative flex items-center justify-center gap-2">
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Sending...
            </>
          ) : (
            <>
              <Send className="h-4 w-4" />
              Submit Support Ticket
            </>
          )}
        </span>
      </Button>

      <div className="mt-5 flex items-center justify-center gap-2 text-center text-[11px] text-slate-400">
        <ShieldCheck className="h-3.5 w-3.5 text-[#16A34A]" />
        <span>Your information is safe with us.</span>
      </div>
    </form>
  );
};
