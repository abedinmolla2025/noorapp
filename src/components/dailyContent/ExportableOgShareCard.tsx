import { useRef, useState } from "react";
import { OgShareCard } from "./OgShareCard";
import { useDomToPng } from "@/hooks/useDomToPng";
import type { CardPayload } from "@/lib/dailyContent/types";
import { OG_STAGE_SIZE, ogExportSize, type OgFormat } from "@/lib/dailyContent/ogQc";

type ExportableOgShareCardProps = {
  card: CardPayload;
  backgroundUrl: string;
  badgeLabel: string;
};

/**
 * OG card with a format toggle and PNG export. Stage 540×675 / 540×540 at
 * pixelRatio 2 exports exactly 1080×1350 / 1080×1080 — the two sizes the
 * daily cards must support.
 */
export function ExportableOgShareCard({ card, backgroundUrl, badgeLabel }: ExportableOgShareCardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [format, setFormat] = useState<OgFormat>("portrait");
  const stage = OG_STAGE_SIZE[format];
  const { download, isRendering } = useDomToPng(ref, {
    fileName: `noorapp-${card.recordRef.replace(/[^a-z0-9]+/gi, "-")}-${format}.png`,
    pixelRatio: 2,
    width: stage.width,
    height: stage.height,
  });
  const exp = ogExportSize(format);

  return (
    <div className="space-y-2">
      <div style={{ height: stage.height * 0.62, position: "relative" }}>
        <div ref={ref} style={{ width: stage.width, height: stage.height, transform: "scale(0.62)", transformOrigin: "top left" }}>
          <OgShareCard card={card} backgroundUrl={backgroundUrl} badgeLabel={badgeLabel} format={format} />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setFormat("portrait")}
          className={`rounded-full border px-3 py-1 text-xs ${format === "portrait" ? "bg-primary text-primary-foreground" : ""}`}
        >
          Portrait 1080×1350
        </button>
        <button
          type="button"
          onClick={() => setFormat("square")}
          className={`rounded-full border px-3 py-1 text-xs ${format === "square" ? "bg-primary text-primary-foreground" : ""}`}
        >
          Square 1080×1080
        </button>
        <button
          type="button"
          onClick={() => void download()}
          disabled={isRendering}
          className="rounded-full border px-3 py-1 text-xs"
        >
          {isRendering ? "Rendering…" : `Export PNG (${exp.width}×${exp.height})`}
        </button>
      </div>
    </div>
  );
}
