import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { Image as ImageIcon } from "lucide-react";

type Branding = {
  appName?: string;
  tagline?: string;
  logoUrl?: string;
  iconUrl?: string;
  faviconUrl?: string;
  logoVersion?: string;
};

type Seo = {
  title?: string;
  description?: string;
  shareImageUrl?: string;
};

type Notifications = {
  defaultIconUrl?: string;
  defaultBadgeUrl?: string;
};

function normalizeTitle(title?: string) {
  if (!title) return "";
  return title.length > 60 ? title.slice(0, 57) + "…" : title;
}

function normalizeDescription(description?: string) {
  if (!description) return "";
  return description.length > 160 ? description.slice(0, 157) + "…" : description;
}

export function BrandingSeoLivePreview(props: { branding: Branding; seo: Seo; notifications?: Notifications }) {
  const { branding, seo, notifications } = props;

  const title = normalizeTitle(seo.title || branding.appName || "");
  const description = normalizeDescription(seo.description || branding.tagline || "");

  const v = branding.logoVersion || "";
  const logoUrl = branding.logoUrl ? `${branding.logoUrl}${branding.logoUrl.includes("?") ? "&" : "?"}v=${v}` : null;
  const appIconUrl = branding.iconUrl ? `${branding.iconUrl}${branding.iconUrl.includes("?") ? "&" : "?"}v=${v}` : null;
  const faviconUrl = branding.faviconUrl ? `${branding.faviconUrl}${branding.faviconUrl.includes("?") ? "&" : "?"}v=${v}` : null;
  const shareImageUrl = seo.shareImageUrl ? `${seo.shareImageUrl}${seo.shareImageUrl.includes("?") ? "&" : "?"}v=${v}` : null;
  const nIconUrl = notifications?.defaultIconUrl ? `${notifications.defaultIconUrl}${notifications.defaultIconUrl.includes("?") ? "&" : "?"}v=${v}` : null;
  const nBadgeUrl = notifications?.defaultBadgeUrl ? `${notifications.defaultBadgeUrl}${notifications.defaultBadgeUrl.includes("?") ? "&" : "?"}v=${v}` : null;

  const siteHost = typeof window !== "undefined" ? window.location.host : "noorapp.in";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Live Preview</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Header / App branding</p>
          <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4">
            <div className="flex items-center justify-between">
              <div className="flex flex-col gap-1">
                <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Logo (Header)</p>
                {logoUrl ? (
                    <div className="h-10 w-32 rounded bg-transparent flex items-center justify-center p-1 border border-border">
                    <img
                      src={logoUrl}
                      alt="Logo preview"
                      className="max-h-full max-w-full object-contain"
                      loading="lazy"
                    />
                  </div>
                ) : (
                  <div className="h-10 w-32 rounded border border-dashed border-border bg-muted flex items-center justify-center">
                    <ImageIcon className="h-4 w-4 text-muted-foreground/40" />
                  </div>
                )}
              </div>

              <div className="flex gap-3">
                <div className="flex flex-col gap-1 items-end">
                  <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Icon</p>
                  {appIconUrl ? (
                    <img
                      src={appIconUrl}
                      alt="App icon preview"
                      className="h-10 w-10 rounded-lg border border-border object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="h-10 w-10 rounded-lg border border-dashed border-border bg-muted flex items-center justify-center">
                      <ImageIcon className="h-4 w-4 text-muted-foreground/40" />
                    </div>
                  )}
                </div>

                <div className="flex flex-col gap-1 items-end">
                  <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Favicon</p>
                  {faviconUrl ? (
                    <img
                      src={faviconUrl}
                      alt="Favicon preview"
                      className="h-10 w-10 rounded-lg border border-border object-cover bg-white"
                      loading="lazy"
                    />
                  ) : (
                    <div className="h-10 w-10 rounded-lg border border-dashed border-border bg-muted flex items-center justify-center">
                      <ImageIcon className="h-4 w-4 text-muted-foreground/40" />
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="border-t border-border pt-3">
              <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider mb-1">App Identity</p>
              <p className="truncate text-sm font-semibold">{branding.appName || "App name"}</p>
              <p className="truncate text-xs text-muted-foreground">{branding.tagline || "Tagline"}</p>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-4">
            <p className="text-xs font-medium text-muted-foreground">Social share (OG) preview</p>
            <p className="text-[10px] text-muted-foreground">{siteHost}</p>
          </div>

          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <AspectRatio ratio={16 / 9}>
              {shareImageUrl ? (
                <img
                  src={shareImageUrl}
                  alt="OG image preview"
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="h-full w-full bg-muted flex items-center justify-center">
                  <ImageIcon className="h-8 w-8 text-muted-foreground/40" />
                </div>
              )}
            </AspectRatio>

            <div className="space-y-1 px-4 py-3">
              <p className="line-clamp-2 text-sm font-semibold">{title || "Title"}</p>
              <p className="line-clamp-2 text-xs text-muted-foreground">{description || "Description"}</p>
            </div>
          </div>
        </div>
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Push Notifications preview</p>
          <div className="flex gap-4 rounded-xl border border-border bg-card p-4">
            <div className="flex flex-col gap-1">
              <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Icon</p>
              {nIconUrl ? (
                <img
                  src={nIconUrl}
                  alt="Notification icon"
                  className="h-10 w-10 rounded-lg border border-border object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="h-10 w-10 rounded-lg border border-dashed border-border bg-muted flex items-center justify-center">
                  <ImageIcon className="h-4 w-4 text-muted-foreground/40" />
                </div>
              )}
            </div>
            <div className="flex flex-col gap-1">
              <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Badge</p>
              {nBadgeUrl ? (
                <img
                  src={nBadgeUrl}
                  alt="Notification badge"
                  className="h-10 w-10 rounded-lg border border-border object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="h-10 w-10 rounded-lg border border-dashed border-border bg-muted flex items-center justify-center">
                  <ImageIcon className="h-4 w-4 text-muted-foreground/40" />
                </div>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
