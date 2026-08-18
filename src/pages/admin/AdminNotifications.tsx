import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useState, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Send, History as HistoryIcon, Zap, Moon, Upload, X, Calendar } from "lucide-react";
import { Link } from "react-router-dom";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { useAdmin } from "@/contexts/AdminContext";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { QuickTemplatesPanel, type TemplateItem } from "@/components/admin/QuickTemplatesPanel";
import StoryPickerPanel, { type StoryPickerItem } from "@/components/admin/StoryPickerPanel";
import SmartVariantsPanel, { type StoryVariant } from "@/components/admin/SmartVariantsPanel";
import storyVariantsMap from "@/data/storyNotificationsVariants";
import { BookOpen } from "lucide-react";

type TargetPlatform = "all" | "android" | "ios" | "web";

const AdminNotifications = () => {
  const { user } = useAdmin();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [deepLink, setDeepLink] = useState("");
  const [iconUrl, setIconUrl] = useState("");
  const [badgeUrl, setBadgeUrl] = useState("");
  const [targetPlatform, setTargetPlatform] = useState<TargetPlatform>("all");
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [selectedStorySlug, setSelectedStorySlug] = useState<string | null>(null);
  const [selectedStoryTitle, setSelectedStoryTitle] = useState<string | null>(null);
  const [selectedVariantIndex, setSelectedVariantIndex] = useState<number | null>(null);
  const [uploadingIcon, setUploadingIcon] = useState(false);
  const [uploadingBadge, setUploadingBadge] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const iconFileRef = useRef<HTMLInputElement>(null);
  const badgeFileRef = useRef<HTMLInputElement>(null);
  const imageFileRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (
    file: File,
    field: "icon" | "badge",
    setUrl: (url: string) => void,
    setUploading: (v: boolean) => void,
  ) => {
    if (!file) return;
    const maxSize = 2 * 1024 * 1024; // 2MB
    if (file.size > maxSize) {
      toast({ title: "File too large", description: "Max 2MB allowed", variant: "destructive" });
      return;
    }
    setUploading(true);
    try {
      const safeName = `notification-${field}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      const { error } = await supabase.storage.from("branding").upload(safeName, file, {
        cacheControl: "3600",
        upsert: true,
      });
      if (error) throw error;
      const { data: urlData } = supabase.storage.from("branding").getPublicUrl(safeName);
      setUrl(urlData.publicUrl);
      toast({ title: `${field === "icon" ? "Icon" : "Badge"} uploaded` });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const createNotificationMutation = useMutation({
    mutationFn: async (data: { title: string; message: string; status: string }) => {
      // 1. Insert into DB
      const { data: inserted, error } = await supabase.from('admin_notifications').insert([{
        title: data.title,
        message: data.message,
        status: data.status,
        target_platform: targetPlatform,
        created_by: user?.id,
        image_url: imageUrl.trim() || null,
        deep_link: deepLink.trim() || null,
        icon_url: iconUrl.trim() || null,
        badge_url: badgeUrl.trim() || null,
      }] as any).select('id').single();
      if (error) throw error;

      // 2. If sending now, call send-push edge function
      if (data.status === "sent" && inserted?.id) {
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData?.session?.access_token;
        if (!token) throw new Error("Not authenticated");

        const res = await supabase.functions.invoke("send-push", {
          body: { notificationId: inserted.id, platform: targetPlatform },
          headers: { Authorization: `Bearer ${token}` },
        });

        if (res.error) {
          throw new Error(res.error.message || "Failed to send push notification");
        }

        return res.data;
      }

      return inserted;
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['admin-notifications'] });
      queryClient.invalidateQueries({ queryKey: ['in-app-notifications'] });

      if (variables.status === "sent") {
        const totals = data?.totals;
        toast({
          title: "Push notification sent!",
          description: totals
            ? `Sent: ${totals.sent}, Failed: ${totals.failed}, Total targets: ${totals.targets}`
            : "Notification queued for delivery",
        });
      } else {
        toast({ title: "Notification saved as draft" });
      }
      setTitle("");
      setMessage("");
      setImageUrl("");
      setDeepLink("");
      setIconUrl("");
      setBadgeUrl("");
      setSelectedTemplate(null);
      setSelectedStorySlug(null);
      setSelectedStoryTitle(null);
      setSelectedVariantIndex(null);
    },
    onError: (error: Error) => {
      toast({ title: "Failed to send notification", description: error.message, variant: "destructive" });
    },
  });

  const handleTemplateSelect = (template: TemplateItem) => {
    setTitle(template.title);
    setMessage(template.body);
    setSelectedTemplate(template.id);
    setSelectedStorySlug(null);
    setSelectedStoryTitle(null);
    setSelectedVariantIndex(null);
    if (template.deep_link) setDeepLink(template.deep_link);
    if (template.image_url) setImageUrl(template.image_url);
  };

  const handleSmartVariantSelect = (variant: StoryVariant) => {
    setTitle(variant.title);
    setMessage(variant.body);
    // Re-highlight the chosen suggestion in the variants panel.
    if (!selectedStorySlug) return;
    const entry = storyVariantsMap[selectedStorySlug];
    if (entry) {
      const idx = (entry.variants as StoryVariant[]).findIndex(
        (v) => v.title === variant.title && v.body === variant.body,
      );
      setSelectedVariantIndex(idx >= 0 ? idx : null);
    }
  };

  const handleStorySelect = (story: StoryPickerItem) => {
    const isDua = story.content_type === "dua";
    setSelectedStorySlug(story.slug);
    setSelectedStoryTitle(story.title || story.title_en || null);
    setSelectedVariantIndex(null);

    // Title: use Bangla title, fall back to English
    const notificationTitle =
      story.title || story.title_en || (isDua ? "New Dua on NOOR" : "New Story on NOOR");

    // Build an attractive message from the content's hook/subtitle/title_en
    const parts = [story.hook, story.subtitle, story.title_en].filter(Boolean);
    const fallback = isDua
      ? "পড়ে দোয়া করুন — NOOR app-এ নতুন দোয়া যোগ হয়েছে।"
      : "Read this inspiring story on NOOR app.";
    const notificationMessage =
      parts.length > 0
        ? parts.join(" • ").slice(0, 500)
        : (story.title_en || fallback).slice(0, 500);

    setTitle(notificationTitle);
    setMessage(notificationMessage);

    // Resolve thumbnail: prefer the stored public og_image_url, fall back to
    // image_url / og file name. Note: dua og images live in media/{folder},
    // story og images live in og-images/{folder}.
    const ogUrl =
      story.og_image_data?.og_image_url ||
      story.og_image_data?.url ||
      story.og_image_data?.og_image ||
      story.og_image_data?.og_image_url ||
      story.image_url ||
      null;
    if (ogUrl && ogUrl.startsWith("http")) {
      setImageUrl(ogUrl);
    } else if (ogUrl) {
      const bucket = isDua ? "media" : "og-images";
      const folder = isDua ? "dua-og" : "stories";
      setImageUrl(`https://llicfiepatzgllmjhzbw.supabase.co/storage/v1/object/public/${bucket}/${folder}/${ogUrl}`);
    }

    // Deep link to the content page
    setDeepLink(`/${isDua ? "dua" : "stories"}/${story.slug}`);

    toast({
      title: isDua ? "Dua selected" : "Story selected",
      description: "Title, message, thumbnail and deep link filled.",
    });
  };

  const handleSend = () => {
    if (!title.trim() || !message.trim()) {
      toast({ title: "Please fill in both title and message", variant: "destructive" });
      return;
    }
    createNotificationMutation.mutate({
      title: title.trim(),
      message: message.trim(),
      status: "sent",
    });
  };

  const handleSaveDraft = () => {
    if (!title.trim() || !message.trim()) {
      toast({ title: "Please fill in both title and message", variant: "destructive" });
      return;
    }
    createNotificationMutation.mutate({
      title: title.trim(),
      message: message.trim(),
      status: "draft",
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Send Notification</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Create and send push notifications to NOOR users
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link to="/admin/notifications/history">
              <HistoryIcon className="h-4 w-4 mr-2" />
              History
            </Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link to="/admin/notifications/diagnostics">
              <Zap className="h-4 w-4 mr-2" />
              Diagnostics
            </Link>
          </Button>
          <Button variant="default" size="sm" className="bg-emerald-600 hover:bg-emerald-700" asChild>
            <Link to="/admin/scheduler">
              <Calendar className="h-4 w-4 mr-2" />
              Scheduler
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Story Picker */}
        <StoryPickerPanel onSelect={handleStorySelect} />

        {/* Templates */}
        <QuickTemplatesPanel
          selectedTemplate={selectedTemplate}
          onSelect={handleTemplateSelect}
        />

        {/* Compose */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Compose Notification</CardTitle>
            <CardDescription>Create your custom notification</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <SmartVariantsPanel
              slug={selectedStorySlug}
              contentTitle={selectedStoryTitle}
              selectedVariant={selectedVariantIndex}
              onSelect={handleSmartVariantSelect}
            />
            <div className="space-y-2">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                placeholder="Notification title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={100}
              />
              <p className="text-xs text-muted-foreground">{title.length}/100 characters</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="message">Message</Label>
              <Textarea
                id="message"
                placeholder="Notification message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={4}
                maxLength={500}
              />
              <p className="text-xs text-muted-foreground">{message.length}/500 characters</p>
            </div>

            <div className="space-y-2">
              <Label>Target Platform</Label>
              <Select value={targetPlatform} onValueChange={(v) => setTargetPlatform(v as TargetPlatform)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Platforms</SelectItem>
                  <SelectItem value="android">Android Only</SelectItem>
                  <SelectItem value="ios">iOS Only</SelectItem>
                  <SelectItem value="web">Web Only</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Rich Image (optional)</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="https://example.com/image.png or upload"
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  className="flex-1"
                />
                <input
                  ref={imageFileRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFileUpload(f, "image" as any, setImageUrl, setUploadingImage);
                    e.target.value = "";
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  disabled={uploadingImage}
                  onClick={() => imageFileRef.current?.click()}
                >
                  <Upload className="h-4 w-4" />
                </Button>
                {imageUrl && (
                  <Button type="button" variant="ghost" size="icon" onClick={() => setImageUrl("")}>
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
              {imageUrl && (
                <img src={imageUrl} alt="Image preview" className="h-20 w-full max-w-xs rounded border object-cover" />
              )}
              <p className="text-xs text-muted-foreground">Large image shown in expanded notification</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="deepLink">Deep Link (optional)</Label>
              <Input
                id="deepLink"
                placeholder="/quran or /dua"
                value={deepLink}
                onChange={(e) => setDeepLink(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">In-app route to open when notification is tapped</p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Notification Icon (optional)</Label>
                <div className="flex gap-2">
                  <Input
                    placeholder="https://... or upload"
                    value={iconUrl}
                    onChange={(e) => setIconUrl(e.target.value)}
                    className="flex-1"
                  />
                  <input
                    ref={iconFileRef}
                    type="file"
                    accept="image/png,image/webp,image/svg+xml"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleFileUpload(f, "icon", setIconUrl, setUploadingIcon);
                      e.target.value = "";
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    disabled={uploadingIcon}
                    onClick={() => iconFileRef.current?.click()}
                  >
                    <Upload className="h-4 w-4" />
                  </Button>
                  {iconUrl && (
                    <Button type="button" variant="ghost" size="icon" onClick={() => setIconUrl("")}>
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                {iconUrl && (
                  <img src={iconUrl} alt="Icon preview" className="h-10 w-10 rounded border object-contain" />
                )}
                <p className="text-xs text-muted-foreground">Custom icon shown in push notification</p>
              </div>
              <div className="space-y-2">
                <Label>Notification Badge (optional)</Label>
                <div className="flex gap-2">
                  <Input
                    placeholder="https://... or upload"
                    value={badgeUrl}
                    onChange={(e) => setBadgeUrl(e.target.value)}
                    className="flex-1"
                  />
                  <input
                    ref={badgeFileRef}
                    type="file"
                    accept="image/png,image/webp,image/svg+xml"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleFileUpload(f, "badge", setBadgeUrl, setUploadingBadge);
                      e.target.value = "";
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    disabled={uploadingBadge}
                    onClick={() => badgeFileRef.current?.click()}
                  >
                    <Upload className="h-4 w-4" />
                  </Button>
                  {badgeUrl && (
                    <Button type="button" variant="ghost" size="icon" onClick={() => setBadgeUrl("")}>
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                {badgeUrl && (
                  <img src={badgeUrl} alt="Badge preview" className="h-10 w-10 rounded border object-contain" />
                )}
                <p className="text-xs text-muted-foreground">Small monochrome badge icon</p>
              </div>
            </div>
            {(title || message) && (
              <div className="rounded-lg border bg-muted/30 p-4">
                <p className="text-xs text-muted-foreground mb-2">Preview</p>
                <div className="bg-background rounded-lg p-3 shadow-sm border">
                  <div className="flex items-start gap-3">
                    {imageUrl ? (
                      <img src={imageUrl} alt="" className="h-10 w-10 rounded-lg object-cover shrink-0" />
                    ) : (
                      <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        <Moon className="h-5 w-5 text-primary" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm truncate">{title || "Title"}</p>
                      <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                        {message || "Message preview will appear here..."}
                      </p>
                    </div>
                    <Badge variant="outline" className="text-[10px]">
                      {targetPlatform === "all" ? "All" : targetPlatform.toUpperCase()}
                    </Badge>
                  </div>
                  {imageUrl && (
                    <img src={imageUrl} alt="Notification image" className="mt-2 w-full rounded-md object-cover max-h-40" />
                  )}
                </div>
              </div>
            )}

            <Alert>
              <AlertDescription className="text-xs">
                Notifications will be sent to all subscribed users on the selected platform(s).
              </AlertDescription>
            </Alert>

            <div className="flex gap-2 pt-2">
              <Button
                variant="outline"
                onClick={handleSaveDraft}
                disabled={createNotificationMutation.isPending}
              >
                Save as Draft
              </Button>
              <Button
                onClick={handleSend}
                disabled={createNotificationMutation.isPending || !title.trim() || !message.trim()}
              >
                <Send className="h-4 w-4 mr-2" />
                {createNotificationMutation.isPending ? "Sending..." : "Send Now"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AdminNotifications;
