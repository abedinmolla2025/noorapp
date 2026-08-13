import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Mail, MailOpen, Trash2, CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAdmin } from "@/contexts/AdminContext";

interface ContactMessage {
  id: string;
  name: string;
  email: string;
  subject: string | null;
  message: string;
  status: "unread" | "read" | string;
  created_at: string;
}

export default function AdminMessages() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { isAdmin } = useAdmin();

  const { data: messages = [], isLoading, isError, error } = useQuery<ContactMessage[]>({
    queryKey: ["admin-contact-messages"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contact_messages")
        .select("id, name, email, subject, message, status, created_at")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data ?? []) as ContactMessage[];
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "read" | "unread" }) => {
      const { error } = await supabase
        .from("contact_messages")
        .update({ status })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-contact-messages"] });
    },
    onError: (mutationError: Error) => {
      toast({
        title: "Could not update message",
        description: mutationError.message,
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("contact_messages").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-contact-messages"] });
      toast({ title: "Message deleted" });
    },
    onError: (mutationError: Error) => {
      toast({
        title: "Could not delete message",
        description: mutationError.message,
        variant: "destructive",
      });
    },
  });

  if (!isAdmin) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          Admin access is required to view contact messages.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Contact Messages</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Review feedback, questions, and content reports submitted through the Contact page.
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Mail className="h-5 w-5 text-primary" />
                Inbox
              </CardTitle>
              <CardDescription>
                {messages.length} message{messages.length === 1 ? "" : "s"} total
              </CardDescription>
            </div>
            <Badge variant="outline">
              {messages.filter((message) => message.status !== "read").length} unread
            </Badge>
          </div>
        </CardHeader>

        <CardContent>
          {isLoading ? (
            <div className="py-10 text-center text-sm text-muted-foreground">Loading messages...</div>
          ) : isError ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
              Could not load messages. {error instanceof Error ? error.message : "Please try again."}
            </div>
          ) : messages.length === 0 ? (
            <div className="py-10 text-center">
              <MailOpen className="mx-auto h-8 w-8 text-muted-foreground/50" />
              <p className="mt-3 text-sm text-muted-foreground">No contact messages yet.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {messages.map((message) => {
                const unread = message.status !== "read";
                return (
                  <article
                    key={message.id}
                    className={`rounded-xl border p-4 transition-colors ${unread ? "border-primary/30 bg-primary/5" : "border-border/60 bg-background/50"}`}
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-semibold">{message.subject || "General Inquiry"}</h3>
                          {unread && <Badge className="text-[10px]">Unread</Badge>}
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          <a href={`mailto:${message.email}`} className="text-primary hover:underline">
                            {message.name} &lt;{message.email}&gt;
                          </a>
                          <span className="mx-1">•</span>
                          {new Date(message.created_at).toLocaleString()}
                        </p>
                      </div>

                      <div className="flex shrink-0 gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 gap-1 text-xs"
                          onClick={() =>
                            updateStatusMutation.mutate({
                              id: message.id,
                              status: unread ? "read" : "unread",
                            })
                          }
                          disabled={updateStatusMutation.isPending}
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          {unread ? "Mark read" : "Mark unread"}
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          aria-label="Delete message"
                          onClick={() => {
                            if (window.confirm("Delete this contact message?")) {
                              deleteMutation.mutate(message.id);
                            }
                          }}
                          disabled={deleteMutation.isPending}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                    <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
                      {message.message}
                    </p>
                  </article>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

