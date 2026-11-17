import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CardPayload } from "@/lib/dailyContent/types";
import type { OgFormat } from "@/lib/dailyContent/ogQc";
import { OG_LAYOUT, OG_STAGE_SIZE, effectiveBengaliFirstLayout, type BengaliFirstLayout, type PosterLayout } from "@/lib/dailyContent/ogQc";
import type { Composition } from "@/lib/dailyContent/visuals";

const GOLD = "#e9c15c";
const GOLD_BORDER = "rgba(233, 193, 92, 0.85)";
const LOGO = "/assets/logos/logo-1-emerald-gold.svg";

/** Gold open-book icon, matching the reference badge on Dua OG posters. */
function BookIcon({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 4.5C10 3 7 2.5 4 3v13.5c3-.5 6 0 8 1.5 2-1.5 5-2 8-1.5V3c-3-.5-6 0-8 1.5Z"
        fill={GOLD}
      />
      <path d="M12 4.5V19" stroke="#0b1526" strokeWidth="1.4" />
      <path d="M5 17.5c2.5-.3 5 .2 7 1.3M19 17.5c-2.5-.3-5 .2-7 1.3" stroke="#0b1526" strokeWidth="1" />
    </svg>
  );
}

/** Gold divider: thin line, diamond ornament, thin line. */
function Divider({ width = "100%" }: { width?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, width }}>
      <span style={{ flex: 1, height: 1, background: `linear-gradient(90deg, transparent, ${GOLD})` }} />
      <span
        style={{
          width: 9,
          height: 9,
          transform: "rotate(45deg)",
          border: `1.5px solid ${GOLD}`,
          flexShrink: 0,
        }}
      />
      <span style={{ flex: 1, height: 1, background: `linear-gradient(90deg, ${GOLD}, transparent)` }} />
    </div>
  );
}

const BENGALI_FONT = '"Noto Sans Bengali", "Noto Serif Bengali", system-ui, sans-serif';

/**
 * Bengali pronunciation block (mission Part A/C). Visually distinct from
 * the Bengali meaning: a labelled, light gold-tinted panel with a status
 * badge. The pronunciation is NEVER presented as verified unless an admin
 * reviewed it — stored values and generated candidates both carry the
 * "অযাচাইকৃত" badge, and a missing pronunciation shows the fallback text
 * "বাংলা উচ্চারণ যাচাই করা হয়নি" instead of an invented value.
 */
function PronunciationBlock({ card, size }: { card: CardPayload; size: number }) {
  const label = card.pronunciationScope === "matn-only" ? "বাংলা উচ্চারণ (মূল বক্তব্য)" : "বাংলা উচ্চারণ";
  const badge =
    card.pronunciationStatus === "verified"
      ? { text: "যাচাইকৃত", color: "#7ee2a8", border: "rgba(126,226,168,0.7)" }
      : card.pronunciationStatus === "stored-unverified"
        ? { text: "অযাচাইকৃত", color: "#f5c86b", border: "rgba(245,200,107,0.7)" }
        : card.pronunciationStatus === "candidate"
          ? { text: "প্রার্থী — যাচাই হয়নি", color: "#f5c86b", border: "rgba(245,200,107,0.7)" }
          : null;
  return (
    <div style={{ width: "100%", textAlign: "left" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <span style={{ color: GOLD, fontWeight: 800, fontSize: Math.max(10, size - 7), letterSpacing: 1.2, fontFamily: BENGALI_FONT }}>
          {label}
        </span>
        {badge && (
          <span
            style={{
              color: badge.color,
              border: `1px solid ${badge.border}`,
              borderRadius: 10,
              padding: "2px 8px",
              fontSize: Math.max(9, size - 8),
              fontWeight: 700,
              fontFamily: BENGALI_FONT,
              whiteSpace: "nowrap",
            }}
          >
            {badge.text}
          </span>
        )}
      </div>
      {card.pronunciation && card.pronunciation.trim() !== "" ? (
        <div
          style={{
            background: "rgba(233, 193, 92, 0.10)",
            border: `1px solid rgba(233, 193, 92, 0.45)`,
            borderRadius: 14,
            padding: "10px 14px",
            color: "#fdf6e3",
            fontSize: size,
            lineHeight: 1.7,
            fontFamily: BENGALI_FONT,
            textShadow: "0 1px 8px rgba(0,0,0,0.6)",
          }}
        >
          {card.pronunciation}
        </div>
      ) : (
        <div
          style={{
            color: "rgba(232,232,232,0.85)",
            fontSize: Math.max(11, size - 2),
            lineHeight: 1.6,
            fontFamily: BENGALI_FONT,
          }}
        >
          বাংলা উচ্চারণ যাচাই করা হয়নি
        </div>
      )}
    </div>
  );
}

type OgShareCardProps = {
  card: CardPayload;
  /** Text-free photographic background (generated separately, never with text). */
  backgroundUrl: string;
  /** Reference-badge label, e.g. QURANIC DUA / HADITH / PROPHETIC DUA. */
  badgeLabel: string;
  format?: OgFormat;
  /**
   * Creative-direction composition. "centered" is the master stack;
   * "lower-third" anchors the content low so more of the photograph shows
   * at the top. Wide always uses its horizontal composition.
   */
  composition?: Composition;
  /**
   * Poster layout. "legacy" is the original Arabic-first composition
   * (Arabic panel first, Bengali below, pronunciation block shown).
   * "a" | "b" | "c" are the Bengali-first variants (owner
   * brief 2026-11-15): Bengali is the hero, Arabic is secondary, and
   * NO pronunciation block is rendered at all — pronunciation/QC state
   * lives in QC metadata only (rule 8). Defaults to "c" (Layout C —
   * Bengali Panel + Arabic Footnote, the standard poster template per
   * the Master Mission Phase 2 decision 2026-11-16); "a", "b" and
   * "legacy" remain available as explicit overrides.
   */
  layout?: PosterLayout;
};

/**
 * Bengali hero block with shrink-to-fit (rules 6–7): the translation is
 * NEVER truncated. The block fills its flex allotment; if the text
 * overflows, the font steps down 2px at a time until it fits or reaches
 * `minSize`. The fit is measured top-aligned (exact scrollHeight vs
 * clientHeight); once fitted, the text is vertically centered. If the
 * text still overflows at `minSize`, `data-fit-overflow="true"` is set
 * and the render route must fail the poster rather than ship a clipped
 * translation. The fit re-runs when webfonts arrive (metrics can change
 * after the first paint). Readiness is exposed via data attributes for
 * the render route's gate: `data-fit-done`, `data-fit-overflow`,
 * `data-fit-size` (the fitted pixel size, for the QC record).
 */
function AutoFitBengali({
  text,
  baseSize,
  minSize,
  lineHeight = 1.65,
  panel = false,
  accentBar = false,
  align = "center",
  /**
   * Coordination signal from the Arabic block (joint fit): when the
   * Arabic block settles, its box shrinks and this block's container
   * grows — incrementing this value re-runs the fit from the base size
   * against the final geometry, so the Bengali lands on the largest
   * size that fits (instead of the smaller size it settled on while
   * the Arabic was still tall). 0 on mount (no reset).
   */
  resetSignal = 0,
  /**
   * Vertical padding (px) inside the glass panel (16 normally; 12 for
   * square long content — square-fix 2026-11-17, frees room for the
   * Bengali hero without touching the text).
   */
  panelPaddingV = 16,
}: {
  text: string;
  baseSize: number;
  minSize: number;
  lineHeight?: number;
  panel?: boolean;
  accentBar?: boolean;
  align?: "center" | "left";
  resetSignal?: number;
  panelPaddingV?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState(baseSize);
  const [done, setDone] = useState(false);
  const [overflow, setOverflow] = useState(false);
  // `pass` forces the measurement effect to re-run after a font-driven
  // reset: resetting `done` alone would not re-run the effect (its deps
  // would be unchanged) and the gate would wait forever.
  const [pass, setPass] = useState(0);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (el.scrollHeight > el.clientHeight + 1) {
      if (size > minSize) {
        setSize((s) => Math.max(minSize, s - 2));
      } else {
        setOverflow(true);
        setDone(true);
      }
    } else {
      setDone(true);
    }
  }, [size, text, minSize, pass]);

  // Webfonts can arrive after the first fit and change text metrics:
  // re-run the fit from the base size once fonts are ready.
  useEffect(() => {
    let cancelled = false;
    const fonts = (document as Document & { fonts?: { ready: Promise<unknown> } }).fonts;
    if (!fonts) return;
    fonts.ready.then(() => {
      if (cancelled) return;
      setSize(baseSize);
      setDone(false);
      setOverflow(false);
      setPass((p) => p + 1);
    }).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [baseSize]);

  // Joint fit: when the Arabic block settles (its box shrinks, this
  // block's container grows), re-run the fit from the base size so the
  // Bengali lands on the largest size that fits the final geometry.
  // Skipped on mount (resetSignal 0) and when the size is already at
  // base (short content fits regardless of the Arabic height).
  const firstSignal = useRef(true);
  useEffect(() => {
    if (firstSignal.current) {
      firstSignal.current = false;
      return;
    }
    if (resetSignal === 0) return;
    setSize(baseSize);
    setDone(false);
    setOverflow(false);
    setPass((p) => p + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetSignal]);

  return (
    <div
      ref={ref}
      data-autofit
      data-fit-kind="bengali"
      data-fit-done={done ? "true" : "false"}
      data-fit-overflow={overflow ? "true" : "false"}
      data-fit-size={size}
      style={{
        flex: 1,
        minHeight: 0,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        justifyContent: done && !overflow ? "center" : "flex-start",
        textAlign: align,
        ...(panel
          ? {
              background: "rgba(6,15,28,0.55)",
              border: `1px solid ${GOLD_BORDER}`,
              borderRadius: 18,
              padding: `${panelPaddingV}px 20px`,
              boxSizing: "border-box",
              ...(accentBar ? { borderLeft: `4px solid ${GOLD}` } : {}),
            }
          : {}),
      }}
    >
      <div
        style={{
          color: "#fff",
          fontSize: size,
          lineHeight,
          fontFamily: BENGALI_FONT,
          textShadow: "0 2px 12px rgba(0,0,0,0.65)",
        }}
      >
        <span style={{ color: GOLD, fontSize: size + 4, fontWeight: 700 }}>“</span>
        {text}
        <span style={{ color: GOLD, fontSize: size + 4, fontWeight: 700 }}>”</span>
      </div>
    </div>
  );
}

/**
 * Arabic citation block with shrink-to-fit (companion to AutoFitBengali).
 * The Arabic original is second priority (rule 4: smaller, never
 * distorted, never reworded) — but with a long Arabic text the fixed-size
 * panel used to eat the height the Bengali hero needs (Bukhari 869: 331
 * Arabic chars took 5 lines at 20px and the 420-char Bengali then
 * overflowed at its minimum size in 5 of 6 Rehearsal renders).
 *
 * The block is therefore capped: `maxHeight` is a share of the body
 * height, so the box can never take more than that share. Inside the
 * capped box the Arabic font steps down 2px at a time until it fits or
 * reaches `minSize`. If it still overflows at `minSize`,
 * `data-fit-overflow="true"` is set and the render route must fail the
 * poster rather than ship a clipped citation. A short Arabic takes only
 * its natural height (below the cap), so short content renders exactly
 * as before. `onSettled` fires once per completed fit pass so the
 * Bengali block (whose container grows as this block shrinks) can
 * re-fit against the final geometry.
 */
function AutoFitArabic({
  text,
  baseSize,
  minSize,
  lineHeight = 1.9,
  capShare,
  panel = false,
  footnote = false,
  arabicPadding = "12px 16px",
  onSettled,
}: {
  text: string;
  baseSize: number;
  minSize: number;
  lineHeight?: number;
  /** Max share of the body height this block may take (0–1). */
  capShare: number;
  /** Glass panel (variants A/B). */
  panel?: boolean;
  /** Hairline footnote (variant C). */
  footnote?: boolean;
  arabicPadding?: string;
  /** Called once when this block's fit pass completes. */
  onSettled?: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState(baseSize);
  const [done, setDone] = useState(false);
  const [overflow, setOverflow] = useState(false);
  const [pass, setPass] = useState(0);
  const settledRef = useRef(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (el.scrollHeight > el.clientHeight + 1) {
      if (size > minSize) {
        setSize((s) => Math.max(minSize, s - 2));
      } else {
        setOverflow(true);
        setDone(true);
        if (!settledRef.current) {
          settledRef.current = true;
          onSettled?.();
        }
      }
    } else {
      setDone(true);
      if (!settledRef.current) {
        settledRef.current = true;
        onSettled?.();
      }
    }
  }, [size, text, minSize, pass]);

  // Webfonts can arrive after the first fit and change text metrics:
  // re-run the fit from the base size once fonts are ready.
  useEffect(() => {
    let cancelled = false;
    const fonts = (document as Document & { fonts?: { ready: Promise<unknown> } }).fonts;
    if (!fonts) return;
    fonts.ready.then(() => {
      if (cancelled) return;
      settledRef.current = false;
      setSize(baseSize);
      setDone(false);
      setOverflow(false);
      setPass((p) => p + 1);
    }).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [baseSize]);

  return (
    <div
      ref={ref}
      data-autofit
      data-fit-kind="arabic"
      data-fit-done={done ? "true" : "false"}
      data-fit-overflow={overflow ? "true" : "false"}
      data-fit-size={size}
      style={{
        flex: "0 0 auto",
        flexShrink: 0,
        minHeight: 0,
        maxHeight: `${Math.round(capShare * 100)}%`,
        overflow: "hidden",
        boxSizing: "border-box",
        ...(panel
          ? {
              width: "100%",
              background: "rgba(6,15,28,0.66)",
              border: `1px solid ${GOLD_BORDER}`,
              borderRadius: 18,
              padding: arabicPadding,
            }
          : footnote
            ? {
                borderTop: `1px solid ${GOLD_BORDER}`,
                paddingTop: 10,
              }
            : {}),
      }}
    >
      <div
        dir="rtl"
        lang="ar"
        style={{
          color: "#fff",
          fontSize: size,
          lineHeight,
          fontFamily: '"Noto Naskh Arabic", "Amiri", serif',
          // Panel (A/B): no explicit alignment — RTL start (= right),
          // exactly as the fixed-size panel rendered before. Footnote
          // (C): explicitly right-aligned under the hairline.
          ...(footnote ? { textAlign: "right" as const } : {}),
          textShadow: "0 2px 12px rgba(0,0,0,0.6)",
        }}
      >
        {text}
      </div>
    </div>
  );
}
function SourcePill({ sourceLine, paddingV = 6 }: { sourceLine: string; paddingV?: number }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        gap: 8,
        flexShrink: 0,
      }}
    >
      <span
        style={{
          color: GOLD,
          fontWeight: 700,
          fontSize: 12,
          letterSpacing: 0.6,
          background: "rgba(6,17,32,0.88)",
          border: `1px solid ${GOLD_BORDER}`,
          borderRadius: 12,
          padding: `${paddingV}px 12px`,
          fontFamily: BENGALI_FONT,
        }}
      >
        {sourceLine}
      </span>
      <span style={{ color: "#e8e8e8", fontSize: 12 }}>noorapp.in</span>
    </div>
  );
}

/**
 * OG-poster-style share card. This rebuilds the visual language of the
 * existing Dua OG posters — green NOOR APP mark, dark reference pill with
 * gold book icon, gold Bengali title, gold divider, dark glass Arabic
 * panel, white Bengali translation — as a DOM component, so every
 * religious string comes from the record verbatim.
 * The background is a text-free photograph under a dark scrim; the model
 * that made it never wrote any text into it.
 * There is deliberately NO footer banner: no store badges, no download
 * text, no bottom strip. Branding lives in the header only, and the
 * content stack is vertically centered, so the frame rebalances itself
 * with no empty space where a banner used to be.
 */
export function OgShareCard({ card, backgroundUrl, badgeLabel, format = "portrait", composition = "centered", layout: posterLayout = "c" }: OgShareCardProps) {
  const stage = OG_STAGE_SIZE[format];
  const ogLayout = OG_LAYOUT[format];
  const lowerThird = composition === "lower-third" && !ogLayout.horizontal;
  // Joint-fit epoch: incremented each time the Arabic block settles, so
  // the Bengali block re-fits against the final geometry (its container
  // grows as the Arabic box shrinks). Legacy renders no autofit blocks,
  // so this stays 0 there.
  const [arabicEpoch, setArabicEpoch] = useState(0);
  // Bengali-first variants (a/b/c) use their own size table, tightened
  // for long content; legacy keeps the exact numbers above.
  const bfLayout =
    posterLayout !== "legacy"
      ? effectiveBengaliFirstLayout(
          posterLayout as BengaliFirstLayout,
          format,
          card.arabic.length,
          card.bengali.length,
        )
      : null;
  return (
    <div
      style={{
        position: "relative",
        width: stage.width,
        height: stage.height,
        overflow: "hidden",
        fontFamily: "system-ui, sans-serif",
        background: "#0b1526",
        flexShrink: 0,
      }}
    >
      <img
        src={backgroundUrl}
        alt=""
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
      />
      {/* Dark scrim: keeps gold/white text readable on any photograph.
          Lower-third directions get a heavier bottom scrim, since the text
          sits low over the photograph. Variant B renders the Bengali hero
          bare on the scrim (no panel), so its middle scrim is heavier. */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            posterLayout === "b"
              ? "linear-gradient(180deg, rgba(4,10,20,0.66) 0%, rgba(4,10,20,0.48) 38%, rgba(4,10,20,0.50) 62%, rgba(4,10,20,0.78) 100%)"
              : lowerThird
                ? "linear-gradient(180deg, rgba(4,10,20,0.45) 0%, rgba(4,10,20,0.22) 30%, rgba(4,10,20,0.42) 55%, rgba(4,10,20,0.82) 100%)"
                : "linear-gradient(180deg, rgba(4,10,20,0.62) 0%, rgba(4,10,20,0.28) 38%, rgba(4,10,20,0.30) 62%, rgba(4,10,20,0.74) 100%)",
        }}
      />
      <div
        style={{
          position: "relative",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          padding: bfLayout ? bfLayout.padding : ogLayout.padding,
          boxSizing: "border-box",
        }}
      >
        {/* Header: brand left, reference badge right. */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <img src={LOGO} alt="NoorApp" style={{ width: 40, height: 40, borderRadius: 12 }} />
            <div>
              <div style={{ color: "#fff", fontWeight: 800, fontSize: 15, letterSpacing: 0.5, lineHeight: 1.2 }}>
                NOOR APP
              </div>
              <div style={{ color: "#e8e8e8", fontSize: 11, lineHeight: 1.4 }}>
                <span style={{ color: GOLD }}>—</span> noorapp.in <span style={{ color: GOLD }}>—</span>
              </div>
            </div>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              background: "rgba(6,17,32,0.88)",
              border: `1px solid ${GOLD_BORDER}`,
              borderRadius: 14,
              padding: "8px 12px",
              flexShrink: 0,
            }}
          >
            <BookIcon size={26} />
            <div>
              <div style={{ color: GOLD, fontWeight: 800, fontSize: 11, letterSpacing: 0.8, lineHeight: 1.3 }}>
                {badgeLabel}
              </div>
              {/* Variants B/C move the source line to a footer pill; A and
                  legacy keep it in the badge. */}
              {(!bfLayout || bfLayout.sourceInBadge) && (
                <div style={{ color: "#fff", fontSize: 11, lineHeight: 1.3 }}>{card.sourceLine}</div>
              )}
            </div>
          </div>
        </div>

        {/* Body: title, divider, Arabic panel, translation.
            Vertical formats use the master centered stack (lower-third
            anchors it low); the wide format uses a horizontal composition —
            title + translation on the left, Arabic panel on the right —
            designed for 1200×630, not a crop of the portrait. */}
        {/* Body — Bengali-first variants (a/b/c): Bengali hero first,
            Arabic second, NO pronunciation block (rule 8). Legacy keeps
            the original Arabic-first stack below, byte-identical. */}
        {bfLayout ? (
          <div
            style={{
              flex: 1,
              // minHeight: 0 is load-bearing: without it the flex item
              // refuses to shrink below its content (min-height:auto), the
              // column grows past the stage, and the auto-fit measurement
              // below can never see an overflow — long text would be
              // silently clipped at the stage edge instead of shrinking.
              minHeight: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "stretch",
              justifyContent: "center",
              gap: bfLayout.gap,
              padding: bfLayout.bodyPadding,
            }}
          >
            {/* Eyebrow title — a label, deliberately smaller than the Bengali hero. */}
            <div
              style={{
                color: GOLD,
                fontWeight: 800,
                fontSize: bfLayout.titleSize,
                lineHeight: 1.3,
                fontFamily: BENGALI_FONT,
                textAlign: posterLayout === "c" ? "left" : "center",
                textShadow: "0 2px 14px rgba(0,0,0,0.65)",
              }}
            >
              {card.title}
            </div>
            <Divider width={posterLayout === "b" ? "60%" : "78%"} />
            {/* Bengali hero — auto-fit, never truncated (rules 6–7). */}
            {card.bengali.trim() !== "" && (
              <AutoFitBengali
                text={card.bengali}
                baseSize={bfLayout.bengaliSize}
                minSize={bfLayout.bengaliMinSize}
                lineHeight={bfLayout.bengaliLineHeight}
                panel={posterLayout === "a" || posterLayout === "c"}
                accentBar={posterLayout === "c"}
                align={posterLayout === "c" ? "left" : "center"}
                resetSignal={arabicEpoch}
                panelPaddingV={bfLayout.panelPaddingV}
              />
            )}
            {/* Arabic second — smaller, verbatim, never reworded (rule 4).
                Joint fit: the block is capped (a share of the body
                height) and auto-fits inside the cap, so a long Arabic
                can no longer starve the Bengali hero of height. */}
            <AutoFitArabic
              text={card.arabic}
              baseSize={bfLayout.arabicSize}
              minSize={bfLayout.arabicMinSize}
              lineHeight={bfLayout.arabicLineHeight}
              capShare={bfLayout.arabicCapShare}
              panel={posterLayout !== "c"}
              footnote={posterLayout === "c"}
              arabicPadding={bfLayout.arabicPadding}
              onSettled={() => setArabicEpoch((e) => e + 1)}
            />
            {/* Source pill — only when the source left the header badge (B/C). */}
            {!bfLayout.sourceInBadge && <SourcePill sourceLine={card.sourceLine} paddingV={bfLayout.sourcePillPaddingV} />}
          </div>
        ) : ogLayout.horizontal ? (
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "row",
              alignItems: "center",
              gap: 16,
              padding: ogLayout.bodyPadding,
            }}
          >
            <div style={{ flex: "0 0 54%", display: "flex", flexDirection: "column", gap: 10, textAlign: "left" }}>
              <div
                style={{
                  color: GOLD,
                  fontWeight: 800,
                  fontSize: ogLayout.titleSize,
                  lineHeight: 1.3,
                  fontFamily: '"Noto Sans Bengali", "Noto Serif Bengali", system-ui, sans-serif',
                  textShadow: "0 2px 14px rgba(0,0,0,0.65)",
                }}
              >
                {card.title}
              </div>
              <Divider width="70%" />
              {card.bengali.trim() !== "" && (
                <div
                  style={{
                    color: "#fff",
                    fontSize: ogLayout.bengaliSize,
                    lineHeight: 1.6,
                    fontFamily: '"Noto Sans Bengali", "Noto Serif Bengali", system-ui, sans-serif',
                    textShadow: "0 2px 12px rgba(0,0,0,0.65)",
                  }}
                >
                  <span style={{ color: GOLD, fontSize: ogLayout.bengaliSize + 4, fontWeight: 700 }}>“</span>
                  {card.bengali}
                  <span style={{ color: GOLD, fontSize: ogLayout.bengaliSize + 4, fontWeight: 700 }}>”</span>
                </div>
              )}
              {/* Required order: ARABIC → PRONUNCIATION → MEANING → REFERENCE.
                  In the wide layout the Arabic panel is on the right, so the
                  pronunciation sits under the meaning on the left. */}
              <PronunciationBlock card={card} size={ogLayout.pronunciationSize} />
            </div>
            <div
              style={{
                flex: 1,
                background: "rgba(6,15,28,0.66)",
                border: `1px solid ${GOLD_BORDER}`,
                borderRadius: 18,
                padding: ogLayout.arabicPadding,
                boxSizing: "border-box",
              }}
            >
              <div
                dir="rtl"
                lang="ar"
                style={{
                  color: "#fff",
                  fontSize: ogLayout.arabicSize,
                  lineHeight: 1.9,
                  fontFamily: '"Noto Naskh Arabic", "Amiri", serif',
                  textShadow: "0 2px 12px rgba(0,0,0,0.6)",
                }}
              >
                {card.arabic}
              </div>
            </div>
          </div>
        ) : (
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: lowerThird ? "flex-end" : "center",
              textAlign: "center",
              gap: ogLayout.gap,
              padding: ogLayout.bodyPadding,
            }}
          >
            <div
              style={{
                color: GOLD,
                fontWeight: 800,
                fontSize: ogLayout.titleSize,
                lineHeight: 1.3,
                fontFamily: '"Noto Sans Bengali", "Noto Serif Bengali", system-ui, sans-serif',
                textShadow: "0 2px 14px rgba(0,0,0,0.65)",
              }}
            >
              {card.title}
            </div>
            <Divider width="78%" />
            <div
              style={{
                width: "100%",
                background: "rgba(6,15,28,0.66)",
                border: `1px solid ${GOLD_BORDER}`,
                borderRadius: 18,
                padding: ogLayout.arabicPadding,
                boxSizing: "border-box",
              }}
            >
              <div
                dir="rtl"
                lang="ar"
                style={{
                  color: "#fff",
                  fontSize: ogLayout.arabicSize,
                  lineHeight: 1.9,
                  fontFamily: '"Noto Naskh Arabic", "Amiri", serif',
                  textShadow: "0 2px 12px rgba(0,0,0,0.6)",
                }}
              >
                {card.arabic}
              </div>
            </div>
            {/* Required order: ARABIC → PRONUNCIATION → MEANING → REFERENCE. */}
            <PronunciationBlock card={card} size={ogLayout.pronunciationSize} />
            {card.bengali.trim() !== "" && (
              <div
                style={{
                  color: "#fff",
                  fontSize: ogLayout.bengaliSize,
                  lineHeight: 1.65,
                  fontFamily: '"Noto Sans Bengali", "Noto Serif Bengali", system-ui, sans-serif',
                  textShadow: "0 2px 12px rgba(0,0,0,0.65)",
                }}
              >
                <span style={{ color: GOLD, fontSize: ogLayout.bengaliSize + 4, fontWeight: 700 }}>“</span>
                {card.bengali}
                <span style={{ color: GOLD, fontSize: ogLayout.bengaliSize + 4, fontWeight: 700 }}>”</span>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
