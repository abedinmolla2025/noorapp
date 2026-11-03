import type { CardPayload } from "@/lib/dailyContent/types";
import type { OgFormat } from "@/lib/dailyContent/ogQc";
import { OG_STAGE_SIZE } from "@/lib/dailyContent/ogQc";

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

type OgShareCardProps = {
  card: CardPayload;
  /** Text-free photographic background (generated separately, never with text). */
  backgroundUrl: string;
  /** Reference-badge label, e.g. QURANIC DUA / HADITH / PROPHETIC DUA. */
  badgeLabel: string;
  format?: OgFormat;
};

/**
 * OG-poster-style share card. This rebuilds the visual language of the
 * existing Dua OG posters — green NOOR APP mark, dark reference pill with
 * gold book icon, gold Bengali title, gold divider, dark glass Arabic
 * panel, white Bengali translation, white footer banner — as a DOM
 * component, so every religious string comes from the record verbatim.
 * The background is a text-free photograph under a dark scrim; the model
 * that made it never wrote any text into it.
 */
export function OgShareCard({ card, backgroundUrl, badgeLabel, format = "portrait" }: OgShareCardProps) {
  const stage = OG_STAGE_SIZE[format];
  const portrait = format === "portrait";
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
      {/* Dark scrim: keeps gold/white text readable on any photograph. */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(180deg, rgba(4,10,20,0.62) 0%, rgba(4,10,20,0.28) 38%, rgba(4,10,20,0.30) 62%, rgba(4,10,20,0.74) 100%)",
        }}
      />
      <div
        style={{
          position: "relative",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          padding: portrait ? "26px 28px 20px" : "22px 26px 18px",
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

        {/* Body: title, divider, Arabic panel, translation. */}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
            gap: portrait ? 14 : 11,
            padding: portrait ? "10px 0" : "6px 0",
          }}
        >
          <div
            style={{
              color: GOLD,
              fontWeight: 800,
              fontSize: portrait ? 40 : 33,
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
              padding: portrait ? "16px 20px" : "13px 18px",
              boxSizing: "border-box",
            }}
          >
            <div
              dir="rtl"
              lang="ar"
              style={{
                color: "#fff",
                fontSize: portrait ? 27 : 23,
                lineHeight: 1.9,
                fontFamily: '"Noto Naskh Arabic", "Amiri", serif',
                textShadow: "0 2px 12px rgba(0,0,0,0.6)",
              }}
            >
              {card.arabic}
            </div>
          </div>
          <div
            style={{
              color: "#fff",
              fontSize: portrait ? 20 : 17,
              lineHeight: 1.65,
              fontFamily: '"Noto Sans Bengali", "Noto Serif Bengali", system-ui, sans-serif',
              textShadow: "0 2px 12px rgba(0,0,0,0.65)",
            }}
          >
            <span style={{ color: GOLD, fontSize: portrait ? 26 : 22, fontWeight: 700 }}>“</span>
            {card.bengali}
            <span style={{ color: GOLD, fontSize: portrait ? 26 : 22, fontWeight: 700 }}>”</span>
          </div>
        </div>

        {/* Footer banner: logo, Bengali CTA, store pills (DOM text — the repo
            holds no official store-badge artwork, so no badge image is faked). */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            background: "#fdfcf8",
            borderRadius: 999,
            padding: "9px 14px",
            width: "100%",
            boxSizing: "border-box",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 7, flexShrink: 0 }}>
            <img src={LOGO} alt="NoorApp" style={{ width: 30, height: 30, borderRadius: 9 }} />
            <span style={{ color: "#0d3b2e", fontWeight: 800, fontSize: 13, letterSpacing: 0.3 }}>NOOR APP</span>
          </div>
          <div style={{ width: 1, alignSelf: "stretch", background: "#e2ddd2", flexShrink: 0 }} />
          <div
            style={{
              flex: 1,
              color: "#1f2937",
              fontSize: 11.5,
              lineHeight: 1.5,
              fontFamily: '"Noto Sans Bengali", system-ui, sans-serif',
            }}
          >
            দোয়া, জিকির, কুরআন, হাদিস ও ইসলামিক কনটেন্ট পেতে
            <br />
            আজই ডাউনলোড করুন <span style={{ color: "#0d6b4f", fontWeight: 700 }}>Noor App</span>
          </div>
          <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
            <span
              style={{
                background: "#111",
                color: "#fff",
                borderRadius: 6,
                padding: "5px 8px",
                fontSize: 9.5,
                lineHeight: 1.3,
                textAlign: "center",
              }}
            >
              GET IT ON
              <br />
              <b style={{ fontSize: 11 }}>Google Play</b>
            </span>
            <span
              style={{
                background: "#111",
                color: "#fff",
                borderRadius: 6,
                padding: "5px 8px",
                fontSize: 9.5,
                lineHeight: 1.3,
                textAlign: "center",
              }}
            >
              Download on the
              <br />
              <b style={{ fontSize: 11 }}>App Store</b>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
