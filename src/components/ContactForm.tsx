import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Send, CheckCircle2 } from "lucide-react";

export const ContactForm: React.FC = () => {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !message.trim()) {
      toast({
        title: "Required fields missing",
        description: "Please fill in your name, email, and message.",
        variant: "destructive",
      });
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await supabase.from("contact_messages").insert({
        name: name.trim(),
        email: email.trim(),
        subject: subject.trim() || "General Inquiry",
        message: message.trim(),
        status: "unread",
      });

      if (error) throw error;

      setSubmitted(true);
      toast({
        title: "Message Sent Successfully!",
        description: "Jazakallah Khair. We have received your message and will respond within 24-48 hours.",
      });

      setName("");
      setEmail("");
      setSubject("");
      setMessage("");
    } catch (err: any) {
      console.error("Error submitting contact message:", err);
      toast({
        title: "Failed to send message",
        description: err.message || "Please try again later or email us directly.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="bg-card/70 border border-border/60 rounded-2xl shadow-soft p-6 text-center space-y-4">
        <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary">
          <CheckCircle2 className="h-6 w-6" />
        </div>
        <h3 className="text-lg font-semibold">Message Received!</h3>
        <p className="text-muted-foreground text-xs sm:text-sm">
          Thank you for reaching out. We appreciate your feedback and will get back to you soon.
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setSubmitted(false)}
          className="mt-2"
        >
          Send Another Message
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="bg-card/70 border border-border/60 rounded-2xl shadow-soft p-5 space-y-4">
      <h2 className="text-lg font-semibold">Send Us a Message / আমাদের মেসেজ পাঠান</h2>
      <p className="text-muted-foreground text-xs sm:text-sm">
        Fill out the form below and we will get back to you via email within 24–48 hours.
      </p>

      <div className="space-y-3">
        <div>
          <Label htmlFor="contact-name" className="text-xs font-medium">Your Name / আপনার নাম *</Label>
          <Input
            id="contact-name"
            placeholder="e.g. Abdullah Rahman"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1"
            required
          />
        </div>

        <div>
          <Label htmlFor="contact-email" className="text-xs font-medium">Email Address / ইমেইল ঠিকানা *</Label>
          <Input
            id="contact-email"
            type="email"
            placeholder="e.g. abdullah@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1"
            required
          />
        </div>

        <div>
          <Label htmlFor="contact-subject" className="text-xs font-medium">Subject / বিষয়</Label>
          <Input
            id="contact-subject"
            placeholder="e.g. Content error report / Feature request"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="mt-1"
          />
        </div>

        <div>
          <Label htmlFor="contact-message" className="text-xs font-medium">Message / আপনার বার্তা *</Label>
          <Textarea
            id="contact-message"
            placeholder="Write your feedback, question, or bug report here..."
            rows={4}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className="mt-1 resize-none"
            required
          />
        </div>
      </div>

      <Button type="submit" className="w-full gap-2" disabled={submitting}>
        {submitting ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Sending...
          </>
        ) : (
          <>
            <Send className="h-4 w-4" />
            Send Message / মেসেজ পাঠান
          </>
        )}
      </Button>
    </form>
  );
};
