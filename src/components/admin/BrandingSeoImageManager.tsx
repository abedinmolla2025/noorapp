import { useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { ImageCropDialog } from "@/components/admin/ImageCropDialog";
import { resizeToPng } from "@/lib/imagePngVariants";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Image as ImageIcon, Upload, X, CheckCircle2 } from "lucide-react";

type PresetKey = "carousel_16_9" | "square_1_1" | "circle_1_1" | "favicon_square" | "favicon_circle" | "logo_flexible";

const PRESETS: Record<
  PresetKey,
  {
    label: string;
    aspect: number;
    exportSize?: { w: number; h: number };
    maskShape?: MaskShape;
  }
> = {
  carousel_16_9: { label: "Carousel 16:9", aspect: 16 / 9, exportSize: { w: 1200, h: 675 } },
  square_1_1: { label: "Square 1:1", aspect: 1, exportSize: { w: 1024, h: 1024 }, maskShape: "square" },
  circle_1_1: { label: "Circle 1:1", aspect: 1, exportSize: { w: 1024, h: 1024 }, maskShape: "circle" },
  favicon_square: { label: "Favicon Square", aspect: 1, exportSize: { w: 256, h: 256 }, maskShape: "square" },
  favicon_circle: { label: "Favicon Circle", aspect: 1, exportSize: { w: 256, h: 256 }, maskShape: "circle" },
  logo_flexible: { label: "Logo Flexible", aspect: 16 / 9 },
};

type Target = "branding" | "seo" | "notifications";

type CropMeta = {
  target: Target;
  field: string;
  title: string;
  preset: PresetKey;
};

type MaskShape = "square" | "circle";

type LogoPreset = {
  key: string;
  label: string;
  description: string;
  logo: string;
  appIcon: string;
  favicon: string;
  pushIcon: string;
};

const SUPABASE_STORAGE_URL = "https://llicfiepatzgllmjhzbw.supabase.co/storage/v1/object/public/branding/logo-presets";

const LOGO_PRESETS: LogoPreset[] = [
  {
    key: "emerald-gold",
    label: "Emerald Gold",
    description: "Premium emerald with gold accents",
    logo: `${SUPABASE_STORAGE_URL}/logo-1-emerald-gold.svg`,
    appIcon: `${SUPABASE_STORAGE_URL}/app-icon-1-emerald-gold.svg`,
    favicon: `${SUPABASE_STORAGE_URL}/favicon-1-emerald-gold.svg`,
    pushIcon: `${SUPABASE_STORAGE_URL}/push-notification-1-emerald-gold.svg`,
  },
  {
    key: "emerald-white",
    label: "Emerald White",
    description: "Clean emerald and white treatment",
    logo: `${SUPABASE_STORAGE_URL}/logo-2-emerald-white.svg`,
    appIcon: `${SUPABASE_STORAGE_URL}/app-icon-2-emerald-white.svg`,
    favicon: `${SUPABASE_STORAGE_URL}/favicon-2-emerald-white.svg`,
    pushIcon: `${SUPABASE_STORAGE_URL}/push-notification-2-emerald-white.svg`,
  },
  {
    key: "navy-gold",
    label: "Navy Gold",
    description: "Deep navy with refined gold details",
    logo: `${SUPABASE_STORAGE_URL}/logo-3-navy-gold.svg`,
    appIcon: `${SUPABASE_STORAGE_URL}/app-icon-3-navy-gold.svg`,
    favicon: `${SUPABASE_STORAGE_URL}/favicon-3-navy-gold.svg`,
    pushIcon: `${SUPABASE_STORAGE_URL}/push-notification-3-navy-gold.svg`,
  },
  {
    key: "ivory-outline",
    label: "Ivory Outline",
    description: "Light ivory outline for dark surfaces",
    logo: `${SUPABASE_STORAGE_URL}/logo-4-ivory-outline.svg`,
    appIcon: `${SUPABASE_STORAGE_URL}/app-icon-4-ivory-outline.svg`,
    favicon: `${SUPABASE_STORAGE_URL}/favicon-4-ivory-outline.svg`,
    pushIcon: `${SUPABASE_STORAGE_URL}/push-notification-4-ivory-outline.svg`,
  },
  {
    key: "monochrome",
    label: "Monochrome",
    description: "Minimal one-color identity",
    logo: `${SUPABASE_STORAGE_URL}/logo-5-monochrome.svg`,
    appIcon: `${SUPABASE_STORAGE_URL}/app-icon-5-monochrome.svg`,
    favicon: `${SUPABASE_STORAGE_URL}/favicon-5-monochrome.svg`,
    pushIcon: `${SUPABASE_STORAGE_URL}/push-notification-5-monochrome.svg`,
  },
];

function extForBlobType(type: string) {
  if (type === "image/webp") return "webp";
  if (type === "image/jpeg") return "jpg";
  return "png";
}

async function uploadCroppedImage(params: {
  file: File;
  target: Target;
  field: string;
}) {
  const { file, target, field } = params;
  const path = `${target}/${field}/${crypto.randomUUID()}-${file.name}`;

  const { data, error } = await supabase.storage.from("branding").upload(path, file, {
    cacheControl: "3600",
    upsert: true,
  });
  if (error) throw error;

  const { data: publicUrlData } = supabase.storage.from("branding").getPublicUrl(data.path);
  return publicUrlData.publicUrl;
}

async function uploadBlobAsPng(params: {
  blob: Blob;
  target: Target;
  field: string;
  name: string;
}) {
  const { blob, target, field, name } = params;
  const file = new File([blob], name, { type: "image/png" });
  return await uploadCroppedImage({ file, target, field });
}

function presetForField(field: string): PresetKey {
  switch (field) {
    case "shareImageUrl":
      return "carousel_16_9";
    case "faviconUrl":
    case "defaultBadgeUrl":
      return "favicon_circle";
    case "logoUrl":
      return "logo_flexible";
    case "iconUrl":
    case "defaultIconUrl":
    default:
      return "circle_1_1";
  }
}

function ImageSlot(props: {
  title: string;
  description?: string;
  valueUrl?: string;
  fallbackUrl?: string;
  version?: string;
  onTrigger: () => void;
  previewShape?: "circle" | "square" | "wide";
}) {
  const { title, description, valueUrl, fallbackUrl, onTrigger, previewShape = "square", version } = props;

  const previewClass =
    previewShape === "circle"
      ? "h-14 w-14 rounded-full"
      : previewShape === "wide"
        ? "h-14 w-40 rounded-lg"
        : "h-14 w-14 rounded-xl";

  const sourceUrl = valueUrl || fallbackUrl || "";
  const finalUrl = sourceUrl ? `${sourceUrl}${sourceUrl.includes("?") ? "&" : "?"}v=${version || "preset"}` : null;

  return (
    <div className="grid gap-3 rounded-xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <p className="text-sm font-semibold">{title}</p>
          {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
        </div>

        {finalUrl ? (
          <img
            src={finalUrl}
            alt={`${title} preview`}
            className={`${previewClass} border border-border object-contain bg-transparent`}
            loading="lazy"
            onError={(event) => {
              if (fallbackUrl && event.currentTarget.src !== fallbackUrl) {
                event.currentTarget.src = `${fallbackUrl}?v=preset-fallback`;
              }
            }}
          />
        ) : (
          <div className={`${previewClass} border border-dashed border-border bg-muted flex items-center justify-center`}>
            <ImageIcon className="h-5 w-5 text-muted-foreground/40" />
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onTrigger}>
          Upload & crop
        </Button>
        {!valueUrl && fallbackUrl ? (
          <span className="text-[10px] text-muted-foreground">Preset preview</span>
        ) : null}
      </div>
    </div>
  );
}

export function BrandingSeoImageManager(props: {
  branding: any;
  setBranding: (updater: any) => void;
  seo: any;
  setSeo: (updater: any) => void;
  notifications?: any;
  setNotifications?: (updater: any) => void;
  /** Persist updated setting immediately (used so changes reflect in the real app without pressing Save). */
  onAutoSaveSetting?: (key: "branding" | "seo" | "notifications", value: any) => void;
}) {
  const { branding, setBranding, seo, setSeo, notifications, setNotifications } = props;
  const { toast } = useToast();

  const [cropOpen, setCropOpen] = useState(false);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [cropMeta, setCropMeta] = useState<CropMeta | null>(null);
  const [saving, setSaving] = useState(false);
  const [presetPickerOpen, setPresetPickerOpen] = useState(false);
  const [activeTriggerMeta, setActiveTriggerMeta] = useState<CropMeta | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const isFaviconFlow = cropMeta?.field === "faviconUrl" || cropMeta?.field === "defaultBadgeUrl";

  const activePreset = useMemo(() => {
    if (!cropMeta) return PRESETS.square_1_1;
    return PRESETS[cropMeta.preset];
  }, [cropMeta]);

  const activeMaskShape = useMemo(() => {
    if (cropMeta?.field === "logoUrl") return "square" as const;
    return activePreset.maskShape ?? "circle";
  }, [activePreset, cropMeta?.field]);

  const wantsAlpha = activeMaskShape === "circle";

  const beginCrop = (meta: CropMeta, file: File | string) => {
    if (cropSrc && cropSrc.startsWith("blob:")) URL.revokeObjectURL(cropSrc);
    setCropMeta(meta);
    if (typeof file === "string") {
      setCropSrc(file);
    } else {
      setCropSrc(URL.createObjectURL(file));
    }
    setCropOpen(true);
    setPresetPickerOpen(false);
  };

  const commitUrl = (target: Target, field: string, url: string) => {
    if (target === "branding") {
      const next = { ...branding, [field]: url };
      if (["logoUrl", "iconUrl", "faviconUrl"].includes(field)) {
        next.logoVersion = String(Date.now());
      }
      setBranding(next);
      props.onAutoSaveSetting?.("branding", next);
    } else if (target === "seo") {
      const next = { ...seo, [field]: url };
      setSeo(next);
      props.onAutoSaveSetting?.("seo", next);
    } else if (target === "notifications" && setNotifications) {
      const next = { ...notifications, [field]: url };
      setNotifications(next);
      props.onAutoSaveSetting?.("notifications", next);
    }
  };

  const handlePresetSelect = (presetUrl: string) => {
    if (!activeTriggerMeta) return;
    beginCrop(activeTriggerMeta, presetUrl);
  };

  const handleUsePreset = (presetUrl: string) => {
    if (!activeTriggerMeta) return;
    commitUrl(activeTriggerMeta.target, activeTriggerMeta.field, presetUrl);
    setPresetPickerOpen(false);
    setActiveTriggerMeta(null);
    toast({ title: "Preset applied", description: "The original SVG is now active." });
  };

  const handleFileUpload = (file: File) => {
    if (!activeTriggerMeta) return;
    beginCrop(activeTriggerMeta, file);
  };

  const openPicker = (meta: CropMeta) => {
    setActiveTriggerMeta(meta);
    setPresetPickerOpen(true);
  };

  return (
    <Card className="col-span-full">
      <CardHeader>
        <CardTitle>Image Manager</CardTitle>
      </CardHeader>
      <CardContent className="space-y-8">
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-4">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <ImageIcon className="h-5 w-5 text-primary" />
              App Branding
            </h3>
            <div className="grid gap-4">
              <ImageSlot
                title="Logo"
                description="Flexible logo (Supports Wide or Circle)."
                valueUrl={branding.logoUrl}
                fallbackUrl={LOGO_PRESETS[0].logo}
                version={branding.logoVersion}
                previewShape="wide"
                onTrigger={() => openPicker({
                  target: "branding",
                  field: "logoUrl",
                  title: "Crop Logo",
                  preset: presetForField("logoUrl"),
                })}
              />
              <ImageSlot
                title="App Icon"
                description="Internal square app icon."
                valueUrl={branding.iconUrl}
                fallbackUrl={LOGO_PRESETS[0].appIcon}
                version={branding.logoVersion}
                previewShape="circle"
                onTrigger={() => openPicker({
                  target: "branding",
                  field: "iconUrl",
                  title: "Crop App Icon",
                  preset: presetForField("iconUrl"),
                })}
              />
              <ImageSlot
                title="Favicon"
                description="Browser tab favicon."
                valueUrl={branding.faviconUrl}
                fallbackUrl={LOGO_PRESETS[0].favicon}
                version={branding.logoVersion}
                previewShape="circle"
                onTrigger={() => openPicker({
                  target: "branding",
                  field: "faviconUrl",
                  title: "Crop Favicon",
                  preset: presetForField("faviconUrl"),
                })}
              />
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <Upload className="h-5 w-5 text-primary" />
              SEO & Social
            </h3>
            <div className="grid gap-4">
              <ImageSlot
                title="Share Image (OG)"
                description="Social sharing preview (16:9)."
                valueUrl={seo.shareImageUrl}
                version={branding.logoVersion}
                previewShape="wide"
                onTrigger={() => openPicker({
                  target: "seo",
                  field: "shareImageUrl",
                  title: "Crop Share Image",
                  preset: presetForField("shareImageUrl"),
                })}
              />
            </div>

            <h3 className="text-lg font-semibold mt-6 flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-primary" />
              Push Notifications
            </h3>
            <div className="grid gap-4">
              <ImageSlot
                title="Notification Icon"
                description="Large push notification icon."
                valueUrl={notifications?.defaultIconUrl}
                fallbackUrl={LOGO_PRESETS[0].pushIcon}
                version={branding.logoVersion}
                previewShape="circle"
                onTrigger={() => openPicker({
                  target: "notifications",
                  field: "defaultIconUrl",
                  title: "Crop Notification Icon",
                  preset: presetForField("defaultIconUrl"),
                })}
              />
              <ImageSlot
                title="Notification Badge"
                description="Status bar monochrome badge."
                valueUrl={notifications?.defaultBadgeUrl}
                fallbackUrl={LOGO_PRESETS[0].favicon}
                version={branding.logoVersion}
                previewShape="circle"
                onTrigger={() => openPicker({
                  target: "notifications",
                  field: "defaultBadgeUrl",
                  title: "Crop Notification Badge",
                  preset: presetForField("defaultBadgeUrl"),
                })}
              />
            </div>
          </div>
        </div>

        <Dialog open={presetPickerOpen} onOpenChange={setPresetPickerOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Select {activeTriggerMeta?.title.replace("Crop ", "")} Source</DialogTitle>
              <DialogDescription>
                Choose from premium presets or upload a custom image.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-6 py-4">
              <div className="grid grid-cols-5 gap-3">
                {LOGO_PRESETS.map((preset) => {
                  let iconUrl = preset.logo;
                  if (activeTriggerMeta?.field === "iconUrl") iconUrl = preset.appIcon;
                  if (activeTriggerMeta?.field === "faviconUrl" || activeTriggerMeta?.field === "defaultBadgeUrl") iconUrl = preset.favicon;
                  if (activeTriggerMeta?.field === "defaultIconUrl") iconUrl = preset.pushIcon;

                  return (
                    <div
                      key={preset.key}
                      className="group flex flex-col items-center gap-2 rounded-xl border border-border bg-background p-2 transition-all hover:border-primary hover:bg-primary/5"
                    >
                      <button type="button" onClick={() => handlePresetSelect(iconUrl)} className="flex w-full flex-col items-center gap-2">
                        <div className="flex h-16 w-16 items-center justify-center rounded-lg border border-border bg-muted/30 p-1 group-hover:scale-105 transition-transform">
                          <img src={`${iconUrl}?v=${preset.key}`} alt={preset.label} className="max-h-full max-w-full object-contain" />
                        </div>
                        <span className="text-[9px] font-medium text-center leading-tight">{preset.label}</span>
                      </button>
                      <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-[10px]" onClick={() => handleUsePreset(iconUrl)}>
                        Use SVG
                      </Button>
                    </div>
                  );
                })}
              </div>

              <div className="relative">
                <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
                <div className="relative flex justify-center text-xs uppercase"><span className="bg-background px-2 text-muted-foreground">Or</span></div>
              </div>

              <div className="flex justify-center">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFileUpload(file);
                    e.target.value = "";
                  }}
                />
                <Button size="lg" className="w-full sm:w-auto px-8" onClick={() => fileInputRef.current?.click()}>
                  <Upload className="mr-2 h-4 w-4" />
                  Upload Custom Image
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <ImageCropDialog
          open={cropOpen}
          onOpenChange={(open) => {
            setCropOpen(open);
            if (!open) {
              if (cropSrc && cropSrc.startsWith("blob:")) URL.revokeObjectURL(cropSrc);
              setCropSrc(null);
              setCropMeta(null);
            }
          }}
          imageSrc={cropSrc}
          title={cropMeta?.title}
          aspect={activePreset.aspect || undefined}
          outputType="image/png"
          quality={1}
          outputWidth={activePreset.exportSize?.w}
          outputHeight={activePreset.exportSize?.h}
          maskShape={activeMaskShape}
          showShapePresets
          showAspectPresets={cropMeta?.field === "logoUrl"}
          onConfirm={async (blob, meta) => {
            if (!cropMeta) return;
            setSaving(true);
            try {
              const ext = extForBlobType(blob.type);
              const file = new File([blob], `${cropMeta.field}.${ext}`, { type: blob.type });
              const url = await uploadCroppedImage({ file, target: cropMeta.target, field: cropMeta.field });

              commitUrl(cropMeta.target, cropMeta.field, url);

              if (cropMeta.target === "branding" && cropMeta.field === "faviconUrl") {
                const shape = meta?.maskShape ?? activeMaskShape;
                const [png16, png32, png48, png180] = await Promise.all([
                  resizeToPng({ source: blob, size: 16, maskShape: shape }),
                  resizeToPng({ source: blob, size: 32, maskShape: shape }),
                  resizeToPng({ source: blob, size: 48, maskShape: shape }),
                  resizeToPng({ source: blob, size: 180, maskShape: shape }),
                ]);

                const [url16, url32, url48, url180] = await Promise.all([
                  uploadBlobAsPng({ blob: png16, target: "branding", field: "faviconVariants", name: "favicon-16.png" }),
                  uploadBlobAsPng({ blob: png32, target: "branding", field: "faviconVariants", name: "favicon-32.png" }),
                  uploadBlobAsPng({ blob: png48, target: "branding", field: "faviconVariants", name: "favicon-48.png" }),
                  uploadBlobAsPng({ blob: png180, target: "branding", field: "faviconVariants", name: "apple-touch-icon-180.png" }),
                ]);

                const nextBranding = {
                  ...branding,
                  faviconVariants: {
                    ...(branding?.faviconVariants || {}),
                    png16: url16,
                    png32: url32,
                    png48: url48,
                    png180: url180,
                  },
                };
                setBranding(nextBranding);
                props.onAutoSaveSetting?.("branding", nextBranding);
              }

              toast({ title: "Image saved" });
            } catch (e: any) {
              toast({ title: "Upload failed", description: e?.message ?? "Error uploading image", variant: "destructive" });
            } finally {
              setSaving(false);
            }
          }}
        />

        {saving ? <p className="text-xs text-muted-foreground">Saving…</p> : null}
      </CardContent>
    </Card>
  );
}
