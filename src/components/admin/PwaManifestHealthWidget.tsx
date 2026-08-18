import React, { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCcw, Smartphone, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

const MANIFEST_PATH = "/manifest.json";

function manifestUrl(): string {
  if (typeof window === "undefined") return MANIFEST_PATH;
  return new URL(MANIFEST_PATH, window.location.origin).toString();
}

type IconCheck = {
  src: string;
  declaredSizes: string;
  declaredType: string;
  declaredPurpose?: string;
  reachable: boolean;
  contentType: string | null;
  isPng: boolean;
  naturalWidth: number | null;
  naturalHeight: number | null;
  sizesMatch: boolean | null;
  error?: string;
};

type ManifestReport = {
  status: "loading" | "ok" | "warn" | "error" | "idle";
  manifestReachable: boolean;
  manifestError?: string;
  name?: string;
  shortName?: string;
  display?: string;
  themeColor?: string;
  backgroundColor?: string;
  startUrl?: string;
  icons: IconCheck[];
  has192: boolean;
  has512: boolean;
  hasMaskable: boolean;
  checkedAt?: string;
};

function parseSize(sizes: string): { w: number; h: number } | null {
  const m = (sizes ?? "").trim().split(/\s+/)[0]?.match(/^(\d+)x(\d+)$/);
  if (!m) return null;
  return { w: Number(m[1]), h: Number(m[2]) };
}

async function probeImage(url: string): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => resolve(null);
    img.src = url + (url.includes("?") ? "&" : "?") + "manifestcheck=" + Date.now();
  });
}

async function checkIcon(icon: any): Promise<IconCheck> {
  const src = String(icon?.src ?? "");
  const declaredSizes = String(icon?.sizes ?? "");
  const declaredType = String(icon?.type ?? "");
  const declaredPurpose = icon?.purpose ? String(icon.purpose) : undefined;

  const result: IconCheck = {
    src,
    declaredSizes,
    declaredType,
    declaredPurpose,
    reachable: false,
    contentType: null,
    isPng: false,
    naturalWidth: null,
    naturalHeight: null,
    sizesMatch: null,
  };

  if (!src) {
    result.error = "Missing src";
    return result;
  }

  // HEAD request for content-type & reachability
  try {
    const headRes = await fetch(src, { method: "HEAD", cache: "no-store" });
    result.reachable = headRes.ok;
    result.contentType = headRes.headers.get("content-type");
    result.isPng = !!result.contentType?.toLowerCase().includes("image/png");
  } catch (e) {
    result.error = e instanceof Error ? e.message : "HEAD request failed";
  }

  // Image probe for natural dimensions
  const dims = await probeImage(src);
  if (dims) {
    result.reachable = true;
    result.naturalWidth = dims.width;
    result.naturalHeight = dims.height;

    const expected = parseSize(declaredSizes);
    if (expected) {
      result.sizesMatch = dims.width === expected.w && dims.height === expected.h;
    }
  } else if (!result.error) {
    result.error = "Image failed to load";
  }

  return result;
}

function iconStatus(icon: IconCheck): "ok" | "warn" | "error" {
  if (!icon.reachable || !icon.naturalWidth) return "error";
  if (!icon.isPng) return "warn";
  if (icon.sizesMatch === false) return "warn";
  return "ok";
}

function StatusIcon({ status }: { status: "ok" | "warn" | "error" }) {
  if (status === "ok") return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
  if (status === "warn") return <AlertTriangle className="h-4 w-4 text-amber-500" />;
  return <XCircle className="h-4 w-4 text-destructive" />;
}

export default function PwaManifestHealthWidget() {
  const [report, setReport] = useState<ManifestReport>({
    status: "idle",
    manifestReachable: false,
    icons: [],
    has192: false,
    has512: false,
    hasMaskable: false,
  });

  const runChecks = useCallback(async () => {
    setReport((r) => ({ ...r, status: "loading" }));

    try {
      const res = await fetch(`${MANIFEST_PATH}?_=${Date.now()}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`Manifest HTTP ${res.status}`);
      const json = await res.json();
      const icons = Array.isArray(json?.icons) ? json.icons : [];

      const iconResults = await Promise.all(icons.map(checkIcon));

      const has192 = iconResults.some(
        (i) => parseSize(i.declaredSizes)?.w === 192 && i.reachable && i.isPng,
      );
      const has512 = iconResults.some(
        (i) => parseSize(i.declaredSizes)?.w === 512 && i.reachable && i.isPng,
      );
      const hasMaskable = iconResults.some(
        (i) => (i.declaredPurpose ?? "").includes("maskable") && i.reachable && i.isPng,
      );

      const allOk = iconResults.every((i) => iconStatus(i) === "ok");
      const anyError = iconResults.some((i) => iconStatus(i) === "error");
      const overall: ManifestReport["status"] =
        anyError || !has192 || !has512 ? "error" : allOk && hasMaskable ? "ok" : "warn";

      setReport({
        status: overall,
        manifestReachable: true,
        name: json?.name,
        shortName: json?.short_name,
        display: json?.display,
        themeColor: json?.theme_color,
        backgroundColor: json?.background_color,
        startUrl: json?.start_url,
        icons: iconResults,
        has192,
        has512,
        hasMaskable,
        checkedAt: new Date().toLocaleString(),
      });
    } catch (e) {
      setReport({
        status: "error",
        manifestReachable: false,
        manifestError: e instanceof Error ? e.message : String(e),
        icons: [],
        has192: false,
        has512: false,
        hasMaskable: false,
        checkedAt: new Date().toLocaleString(),
      });
    }
  }, []);

  useEffect(() => {
    void runChecks();
  }, [runChecks]);

  const overallBadge = useMemo(() => {
    if (report.status === "loading")
      return <Badge variant="secondary">Checking…</Badge>;
    if (report.status === "ok")
      return <Badge className="bg-emerald-500 hover:bg-emerald-500">Healthy</Badge>;
    if (report.status === "warn")
      return <Badge className="bg-amber-500 hover:bg-amber-500">Warnings</Badge>;
    if (report.status === "error") return <Badge variant="destructive">Issues</Badge>;
    return <Badge variant="outline">—</Badge>;
  }, [report.status]);

  return (
    <Card className="bg-card/70 border border-border/60 rounded-2xl shadow-soft">
      <CardHeader className="pb-1 pt-4">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Smartphone className="h-5 w-5 text-primary" />
            <span className="font-semibold">PWA Manifest Health</span>
            <span className="ml-1">{overallBadge}</span>
          </CardTitle>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void runChecks()}
            className="gap-2"
            disabled={report.status === "loading"}
          >
            <RefreshCcw className={`h-4 w-4 ${report.status === "loading" ? "animate-spin" : ""}`} />
            Re-check
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-1 break-all">
          Source: <span className="font-mono">{manifestUrl()}</span>
        </p>
        {report.checkedAt ? (
          <p className="text-xs text-muted-foreground">Last checked: {report.checkedAt}</p>
        ) : null}
      </CardHeader>

      <CardContent className="pt-2 pb-5 space-y-4">
        {!report.manifestReachable && report.manifestError ? (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm">
            <p className="font-medium text-destructive">Manifest fetch failed</p>
            <p className="text-xs text-destructive/80 mt-1 break-words">{report.manifestError}</p>
          </div>
        ) : null}

        {report.manifestReachable ? (
          <>
            {/* Manifest summary */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Name</span>
                <span className="font-medium truncate">{report.name ?? "—"}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Short name</span>
                <span className="font-medium truncate">{report.shortName ?? "—"}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Display</span>
                <span className="font-medium">{report.display ?? "—"}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Start URL</span>
                <span className="font-medium truncate">{report.startUrl ?? "—"}</span>
              </div>
            </div>

            <Separator />

            {/* Required-coverage checks */}
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span>192×192 PNG present</span>
                <StatusIcon status={report.has192 ? "ok" : "error"} />
              </div>
              <div className="flex items-center justify-between">
                <span>512×512 PNG present</span>
                <StatusIcon status={report.has512 ? "ok" : "error"} />
              </div>
              <div className="flex items-center justify-between">
                <span>Maskable icon present</span>
                <StatusIcon status={report.hasMaskable ? "ok" : "warn"} />
              </div>
            </div>

            <Separator />

            {/* Per-icon results */}
            <div className="space-y-3">
              <p className="text-sm font-medium">
                Icons ({report.icons.length})
              </p>
              {report.icons.length === 0 ? (
                <p className="text-xs text-muted-foreground">No icons declared in manifest.</p>
              ) : (
                report.icons.map((icon, idx) => {
                  const s = iconStatus(icon);
                  const expected = parseSize(icon.declaredSizes);
                  const actual =
                    icon.naturalWidth && icon.naturalHeight
                      ? `${icon.naturalWidth}×${icon.naturalHeight}`
                      : "—";
                  return (
                    <div
                      key={`${icon.src}-${idx}`}
                      className="rounded-lg border border-border/60 bg-background/60 p-3 space-y-2"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-2 min-w-0">
                          <StatusIcon status={s} />
                          <div className="min-w-0">
                            <p className="text-sm font-medium">
                              {icon.declaredSizes || "(no sizes)"}{" "}
                              <span className="text-muted-foreground font-normal">
                                · {icon.declaredType || "(no type)"}
                              </span>
                            </p>
                            {icon.declaredPurpose ? (
                              <p className="text-[11px] text-muted-foreground">
                                purpose: {icon.declaredPurpose}
                              </p>
                            ) : null}
                            <p className="text-[11px] text-muted-foreground break-all mt-1">
                              {icon.src}
                            </p>
                          </div>
                        </div>
                        {icon.reachable ? (
                          <img
                            src={icon.src}
                            alt=""
                            className="h-10 w-10 shrink-0 rounded-md border border-border/60 bg-background object-contain"
                          />
                        ) : null}
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-[11px]">
                        <div className="flex justify-between gap-2">
                          <span className="text-muted-foreground">Reachable</span>
                          <span className={icon.reachable ? "text-emerald-500" : "text-destructive"}>
                            {icon.reachable ? "Yes" : "No"}
                          </span>
                        </div>
                        <div className="flex justify-between gap-2">
                          <span className="text-muted-foreground">PNG content-type</span>
                          <span className={icon.isPng ? "text-emerald-500" : "text-amber-500"}>
                            {icon.contentType ?? "unknown"}
                          </span>
                        </div>
                        <div className="flex justify-between gap-2">
                          <span className="text-muted-foreground">Declared</span>
                          <span className="font-medium">
                            {expected ? `${expected.w}×${expected.h}` : icon.declaredSizes || "—"}
                          </span>
                        </div>
                        <div className="flex justify-between gap-2">
                          <span className="text-muted-foreground">Actual</span>
                          <span
                            className={
                              icon.sizesMatch === false ? "text-amber-500 font-medium" : "font-medium"
                            }
                          >
                            {actual}
                          </span>
                        </div>
                      </div>

                      {icon.error ? (
                        <p className="text-[11px] text-destructive break-words">{icon.error}</p>
                      ) : null}
                    </div>
                  );
                })
              )}
            </div>

            <p className="text-[11px] text-muted-foreground">
              Tip: Android caches the icon at install time. After a fix + Publish, uninstall the home-screen app and re-install for the new icon to apply.
            </p>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
