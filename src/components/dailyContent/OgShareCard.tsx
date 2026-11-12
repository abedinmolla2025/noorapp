import type { CardPayload } from "@/lib/dailyContent/types";
import type { OgFormat } from "@/lib/dailyContent/ogQc";
import { OG_LAYOUT, OG_STAGE_SIZE } from "@/lib/dailyContent/ogQc";
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
};

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
export function OgShareCard({ card, backgroundUrl, badgeLabel, format = "portrait", composition = "centered" }: OgShareCardProps) {
  const stage = OG_STAGE_SIZE[format];
  const layout = OG_LAYOUT[format];
  const lowerThird = composition === "lower-third" && !layout.horizontal;
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
          sits low over the photograph. */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: lowerThird
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
          padding: layout.padding,
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
              <div style={{ color: "#fff", fontSize: 11, lineHeight: 1.3 }}>{card.sourceLine}</div>
            </div>
          </div>
        </div>

        {/* Body: title, divider, Arabic panel, translation.
            Vertical formats use the master centered stack (lower-third
            anchors it low); the wide format uses a horizontal composition —
            title + translation on the left, Arabic panel on the right —
            designed for 1200×630, not a crop of the portrait. */}
        {layout.horizontal ? (
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "row",
              alignItems: "center",
              gap: 16,
              padding: layout.bodyPadding,
            }}
          >
            <div style={{ flex: "0 0 54%", display: "flex", flexDirection: "column", gap: 10, textAlign: "left" }}>
              <div
                style={{
                  color: GOLD,
                  fontWeight: 800,
                  fontSize: layout.titleSize,
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
                    fontSize: layout.bengaliSize,
                    lineHeight: 1.6,
                    fontFamily: '"Noto Sans Bengali", "Noto Serif Bengali", system-ui, sans-serif',
                    textShadow: "0 2px 12px rgba(0,0,0,0.65)",
                  }}
                >
                  <span style={{ color: GOLD, fontSize: layout.bengaliSize + 4, fontWeight: 700 }}>“</span>
                  {card.bengali}
                  <span style={{ color: GOLD, fontSize: layout.bengaliSize + 4, fontWeight: 700 }}>”</span>
                </div>
              )}
              {/* Required order: ARABIC → PRONUNCIATION → MEANING → REFERENCE.
                  In the wide layout the Arabic panel is on the right, so the
                  pronunciation sits under the meaning on the left. */}
              <PronunciationBlock card={card} size={layout.pronunciationSize} />
            </div>
            <div
              style={{
                flex: 1,
                background: "rgba(6,15,28,0.66)",
                border: `1px solid ${GOLD_BORDER}`,
                borderRadius: 18,
                padding: layout.arabicPadding,
                boxSizing: "border-box",
              }}
            >
              <div
                dir="rtl"
                lang="ar"
                style={{
                  color: "#fff",
                  fontSize: layout.arabicSize,
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
              gap: layout.gap,
              padding: layout.bodyPadding,
            }}
          >
            <div
              style={{
                color: GOLD,
                fontWeight: 800,
                fontSize: layout.titleSize,
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
                padding: layout.arabicPadding,
                boxSizing: "border-box",
              }}
            >
              <div
                dir="rtl"
                lang="ar"
                style={{
                  color: "#fff",
                  fontSize: layout.arabicSize,
                  lineHeight: 1.9,
                  fontFamily: '"Noto Naskh Arabic", "Amiri", serif',
                  textShadow: "0 2px 12px rgba(0,0,0,0.6)",
                }}
              >
                {card.arabic}
              </div>
            </div>
            {/* Required order: ARABIC → PRONUNCIATION → MEANING → REFERENCE. */}
            <PronunciationBlock card={card} size={layout.pronunciationSize} />
            {card.bengali.trim() !== "" && (
              <div
                style={{
                  color: "#fff",
                  fontSize: layout.bengaliSize,
                  lineHeight: 1.65,
                  fontFamily: '"Noto Sans Bengali", "Noto Serif Bengali", system-ui, sans-serif',
                  textShadow: "0 2px 12px rgba(0,0,0,0.65)",
                }}
              >
                <span style={{ color: GOLD, fontSize: layout.bengaliSize + 4, fontWeight: 700 }}>“</span>
                {card.bengali}
                <span style={{ color: GOLD, fontSize: layout.bengaliSize + 4, fontWeight: 700 }}>”</span>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
