import { useEffect, useMemo, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";

async function createImage(src: string): Promise<HTMLImageElement> {
  return await new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      // Keep the browser's intrinsic SVG dimensions. Forcing width/height here
      // changes the coordinate system used by react-easy-crop and causes lean/blank exports.
      resolve(img);
    };
    img.onerror = reject;
    img.src = src;
  });
}

async function cropToBlob(params: {
  imageSrc: string;
  crop: Area;
  outputType: "image/jpeg" | "image/webp" | "image/png";
  quality: number;
  outputWidth?: number;
  outputHeight?: number;
  maskShape?: "square" | "circle";
}): Promise<Blob> {
  const { imageSrc, crop, outputType, quality, outputWidth, outputHeight, maskShape = "square" } = params;

  const image = await createImage(imageSrc);
  
  const sourceW = image.naturalWidth || image.width || 512;
  const sourceH = image.naturalHeight || image.height || 512;

  // react-easy-crop returns pixels in the image's intrinsic coordinate system.
  // Clamp them so an SVG with a missing/implicit size cannot export a blank canvas.
  const sx = Math.max(0, Math.min(sourceW - 1, crop.x));
  const sy = Math.max(0, Math.min(sourceH - 1, crop.y));
  const sw = Math.max(1, Math.min(sourceW - sx, crop.width));
  const sh = Math.max(1, Math.min(sourceH - sy, crop.height));

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { alpha: true });
  if (!ctx) throw new Error("Canvas not supported");

  // Calculate target dimensions
  const targetW = outputWidth ? Math.max(1, Math.floor(outputWidth)) : Math.max(1, Math.floor(crop.width));
  const targetH = outputHeight ? Math.max(1, Math.floor(outputHeight)) : Math.max(1, Math.floor(crop.height));
  canvas.width = targetW;
  canvas.height = targetH;

  // Ensure high quality and transparency
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  if (maskShape === "circle") {
    const r = Math.min(canvas.width, canvas.height) / 2;
    ctx.save();
    ctx.beginPath();
    ctx.arc(canvas.width / 2, canvas.height / 2, r, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
  }

  // Draw the image. 
  // react-easy-crop provides crop in pixels relative to the image's "natural" size.
  ctx.drawImage(
    image,
    sx,
    sy,
    sw,
    sh,
    0,
    0,
    canvas.width,
    canvas.height,
  );

  if (maskShape === "circle") {
    ctx.restore();
  }

  const blob: Blob | null = await new Promise((resolve) => canvas.toBlob((b) => resolve(b), outputType, quality));
  if (!blob) throw new Error("Failed to export cropped image");
  return blob;
}

export function ImageCropDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  imageSrc: string | null;
  title?: string;
  aspect?: number;
  outputType?: "image/jpeg" | "image/webp" | "image/png";
  quality?: number;
  outputWidth?: number;
  outputHeight?: number;
  maskShape?: "square" | "circle";
  showPositionPresets?: boolean;
  showShapePresets?: boolean;
  showAspectPresets?: boolean;
  onConfirm: (blob: Blob, meta?: { maskShape: "square" | "circle"; aspect: number }) => void | Promise<void>;
}) {
  const {
    open,
    onOpenChange,
    imageSrc,
    title = "Crop image",
    aspect = 16 / 9,
    outputType = "image/webp",
    quality = 0.9,
    outputWidth,
    outputHeight,
    maskShape = "square",
    showPositionPresets = false,
    showShapePresets = false,
    showAspectPresets = false,
    onConfirm,
  } = props;

  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedPixels, setCroppedPixels] = useState<Area | null>(null);
  const [saving, setSaving] = useState(false);
  const [selectedMaskShape, setSelectedMaskShape] = useState<"square" | "circle">(maskShape);
  const [selectedAspect, setSelectedAspect] = useState(aspect);

  useEffect(() => {
    // Keep the dialog UI in sync with caller defaults.
    setSelectedMaskShape(maskShape);
    setSelectedAspect(aspect);
  }, [aspect, maskShape, open]);

  const disabled = useMemo(() => !imageSrc || !croppedPixels || saving, [imageSrc, croppedPixels, saving]);

  const cropShape = useMemo<"rect" | "round">(
    () => (selectedMaskShape === "circle" ? "round" : "rect"),
    [selectedMaskShape],
  );

  const handleSave = async () => {
    if (!imageSrc || !croppedPixels) return;
    setSaving(true);
    try {
      const blob = await cropToBlob({
        imageSrc,
        crop: croppedPixels,
        outputType,
        quality,
        outputWidth,
        outputHeight,
        maskShape: selectedMaskShape,
      });
      await onConfirm(blob, { maskShape: selectedMaskShape, aspect: selectedAspect });
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  const nudgeCrop = (dx: number, dy: number) => {
    // react-easy-crop uses a centered coordinate system where x/y are percentages.
    // Keep it simple: nudge by fixed steps.
    setCrop((p) => ({ x: p.x + dx, y: p.y + dy }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[820px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="relative w-full overflow-hidden rounded-xl border border-border bg-muted" style={{ height: 360 }}>
            {imageSrc ? (
              <Cropper
                image={imageSrc}
                crop={crop}
                zoom={zoom}
                aspect={selectedAspect}
                cropShape={cropShape}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={(_, areaPixels) => setCroppedPixels(areaPixels)}
              />
            ) : null}
          </div>

          <div className="grid gap-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Zoom</p>
              <p className="text-xs text-muted-foreground">{Math.round(zoom * 100)}%</p>
            </div>
            <Slider value={[zoom]} min={1} max={3} step={0.01} onValueChange={(v) => setZoom(v[0] ?? 1)} />
          </div>

          {showAspectPresets ? (
            <div className="grid gap-2">
              <p className="text-sm font-medium">Logo format</p>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant={selectedAspect === 3 / 1 ? "default" : "outline"}
                  size="sm"
                  onClick={() => {
                    setSelectedAspect(3 / 1);
                    setSelectedMaskShape("square");
                  }}
                >
                  Wide 3:1
                </Button>
                <Button
                  type="button"
                  variant={selectedAspect === 16 / 9 ? "default" : "outline"}
                  size="sm"
                  onClick={() => {
                    setSelectedAspect(16 / 9);
                    setSelectedMaskShape("square");
                  }}
                >
                  Landscape 16:9
                </Button>
                <Button
                  type="button"
                  variant={selectedAspect === 1 && selectedMaskShape === "circle" ? "default" : "outline"}
                  size="sm"
                  onClick={() => {
                    setSelectedAspect(1);
                    setSelectedMaskShape("circle");
                  }}
                >
                  Circle 1:1
                </Button>
                <Button
                  type="button"
                  variant={selectedAspect === 1 && selectedMaskShape === "square" ? "default" : "outline"}
                  size="sm"
                  onClick={() => {
                    setSelectedAspect(1);
                    setSelectedMaskShape("square");
                  }}
                >
                  Square 1:1
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">The crop preview and exported file update to the selected format.</p>
            </div>
          ) : null}

          {showPositionPresets ? (
            <div className="grid gap-2">
              <p className="text-sm font-medium">Position</p>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setCrop({ x: 0, y: 0 })}>
                  Center
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => nudgeCrop(0, -20)}>
                  Up
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => nudgeCrop(0, 20)}>
                  Down
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => nudgeCrop(-20, 0)}>
                  Left
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => nudgeCrop(20, 0)}>
                  Right
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">Tip: drag inside the crop area for precise positioning.</p>
            </div>
          ) : null}

          {showShapePresets && !showAspectPresets ? (
            <div className="grid gap-2">
              <p className="text-sm font-medium">Crop preset</p>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant={selectedMaskShape === "circle" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSelectedMaskShape("circle")}
                >
                  Circle
                </Button>
                <Button
                  type="button"
                  variant={selectedMaskShape === "square" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSelectedMaskShape("square")}
                >
                  Square
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">Tip: drag inside the crop area for precise positioning.</p>
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSave} disabled={disabled}>
            {saving ? "Saving…" : "Use cropped"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
