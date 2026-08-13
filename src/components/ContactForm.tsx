import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Send, CheckCircle2, AlertTriangle, HelpCircle, FileText, Sparkles } from "lucide-react";

const APP_PAGES = [
  { value: "home", label: "Home Page / হোম পেজ" },
  { value: "quran", label: "Quran / আল-কুরআন" },
  { value: "hadith", label: "Hadith / আল-হাদিস" },
  { value: "dua", label: "Dua & Ruqyah / দোয়া ও যিকির" },
  { value: "stories", label: "Islamic Stories / ইসলামিক স্টোরি" },
  { value: "prayer_times", label: "Prayer Times & Qibla / নামাজের সময় ও কিবলা" },
  { value: "tasbih", label: "Digital Tasbih / ডিজিটাল তসবিহ" },
  { value: "admin_panel", label: "Admin Panel / এডমিন প্যানেল" },
  { value: "other", label: "General / Other / অন্যান্য" },
];

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const ISSUE_TYPES = [
  { value: "general_inquiry", label: "General Question / সাধারণ জিজ্ঞাসা" },
  { value: "content_error", label: "Content / Translation Error / তথ্যে ভুল বা সংশোধন" },
  { value: "ui_bug", label: "UI / Display Glitch (White screen / Layout) / ডিসপ্লে বা ইন্টারফেসে সমস্যা" },
  { value: "audio_issue", label: "Audio Story / Recitation Issue / অডিও বা ভয়েস সমস্যা" },
  { value: "loading_slow", label: "Slow Loading / Page Lag / লোডিং ধীরগতি" },
  { value: "feature_request", label: "Feature Suggestion / নতুন ফিচারের পরামর্শ" },
  { value: "other", label: "Other Issue / অন্যান্য সমস্যা" },
];

export const ContactForm: React.FC = () => {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState("");
  const [subject, setSubject] = useState("");
  const [page, setPage] = useState("home");
  const [issueType, setIssueType] = useState("general_inquiry");
  const [message, setMessage] = useState("");
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

      const finalMessage = `[Selected Page: ${selectedPageLabel}]\n[Issue Category: ${selectedIssueLabel}]\n\n${
        message.trim() || "(No detailed message provided by user)"
      }`;

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
    } catch (err: any) {
      console.error("Error submitting support message:", err);
      toast({
        title: "Failed to send message",
        description: err.message || "Please try again later or email us at support@noorapp.in",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="bg-card/80 border border-border/80 rounded-2xl shadow-soft p-6 sm:p-8 text-center space-y-4 backdrop-blur-sm">
        <div className="mx-auto w-14 h-14 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="h-7 w-7" />
        </div>
        <h3 className="text-xl font-semibold text-foreground">Message Sent Successfully!</h3>
        <p className="text-muted-foreground text-sm max-w-md mx-auto">
          Jazakallah Khair for helping us improve NoorApp. Your feedback has been sent to our development and support team.
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setSubmitted(false)}
          className="mt-4 rounded-xl font-medium"
        >
          Send Another Message / আরেকটি বার্তা পাঠান
        </Button>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-card/80 border border-border/80 rounded-2xl shadow-soft p-6 sm:p-8 space-y-6 backdrop-blur-sm"
    >
      <div className="space-y-2 border-b border-border/60 pb-4">
        <div className="flex items-center gap-2 text-primary font-semibold text-sm">
          <Sparkles className="h-4 w-4" />
          <span>Professional Support & Feedback Desk</span>
        </div>
        <h2 className="text-xl font-bold tracking-tight text-foreground">
          নূর অ্যাপ সাপোর্ট ও মতামত ফর্ম
        </h2>
        <p className="text-muted-foreground text-xs sm:text-sm">
          অ্যাপ ব্যবহারে কোনো সমস্যা, এরর, বা কোনো পেজে ত্রুটি পেলে নিচের ফর্মটি ব্যবহার করুন। সব ফিল্ড পূরণ করা বাধ্যতামূলক নয়।
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="contact-name" className="text-xs font-semibold text-foreground/80">
            আপনার নাম (ঐচ্ছিক)
          </Label>
          <Input
            id="contact-name"
            placeholder="যেমন: আব্দুল্লাহ রহমান"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="rounded-xl bg-background/50"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="contact-email" className="text-xs font-semibold text-foreground/80">
            ইমেইল ঠিকানা (প্রতিক্রিয়া পাওয়ার জন্য)
          </Label>
          <Input
            id="contact-email"
            type="email"
            inputMode="email"
            placeholder="যেমন: abdullah@example.com"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (emailError) validateEmail(e.target.value);
            }}
            onBlur={() => validateEmail(email)}
            aria-invalid={Boolean(emailError)}
            aria-describedby={emailError ? "contact-email-error" : undefined}
            className={`rounded-xl bg-background/50 ${emailError ? "border-destructive focus-visible:ring-destructive" : ""}`}
          />
          {emailError ? (
            <p id="contact-email-error" className="text-xs font-medium text-destructive" role="alert">
              {emailError}
            </p>
          ) : (
            <p className="text-[11px] text-muted-foreground">
              Optional, but required if you want a direct reply.
            </p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold text-foreground/80 flex items-center gap-1.5">
            <FileText className="h-3.5 w-3.5 text-primary" />
            কোন পেজে সমস্যা হচ্ছে? (পেজ নির্বাচন করুন)
          </Label>
          <Select value={page} onValueChange={setPage}>
            <SelectTrigger className="rounded-xl bg-background/50">
              <SelectValue placeholder="পেজ নির্বাচন করুন" />
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              {APP_PAGES.map((p) => (
                <SelectItem key={p.value} value={p.value}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs font-semibold text-foreground/80 flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
            সমস্যার ধরন / ক্যাটাগরি
          </Label>
          <Select value={issueType} onValueChange={setIssueType}>
            <SelectTrigger className="rounded-xl bg-background/50">
              <SelectValue placeholder="সমস্যার ধরন নির্বাচন করুন" />
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              {ISSUE_TYPES.map((i) => (
                <SelectItem key={i.value} value={i.value}>
                  {i.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="contact-subject" className="text-xs font-semibold text-foreground/80">
          বিষয় / সংক্ষিপ্ত শিরোনাম (ঐচ্ছিক)
        </Label>
        <Input
          id="contact-subject"
          placeholder="যেমন: সূরা বাকারার অনুবাদে টাইপো বা স্ক্রিন সাদা হয়ে যাওয়া"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          className="rounded-xl bg-background/50"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="contact-message" className="text-xs font-semibold text-foreground/80 flex items-center gap-1.5">
          <HelpCircle className="h-3.5 w-3.5 text-primary" />
          বিস্তারিত বর্ণনা বা পরামর্শ (আপনার মতামত)
        </Label>
        <Textarea
          id="contact-message"
          placeholder="সমস্যাটি কখন হয় বা কীভাবে পুনরুৎপাদন করা যায় তার বিস্তারিত লিখুন..."
          rows={4}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className="rounded-xl bg-background/50 resize-none"
        />
      </div>

      <Button
        type="submit"
        className="w-full gap-2 rounded-xl py-6 font-semibold shadow-md transition-all hover:shadow-lg"
        disabled={submitting}
      >
        {submitting ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            পাঠানো হচ্ছে...
          </>
        ) : (
          <>
            <Send className="h-4 w-4" />
            সাপোর্ট টিমকে পাঠান / Submit Support Ticket
          </>
        )}
      </Button>

      <p className="text-center text-[11px] text-muted-foreground pt-1">
        আপনার পাঠানো তথ্য সম্পূর্ণ গোপনীয় রাখা হয় এবং এডমিন প্যানেল থেকে সরাসরি যাচাই করা হয়।
      </p>
    </form>
  );
};
