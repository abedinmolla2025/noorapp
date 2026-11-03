// OG-style share-card preview generator (local only, never published).
// Mirrors src/components/dailyContent/OgShareCard.tsx markup/CSS in standalone
// HTML, then headless Chromium screenshots it at deviceScaleFactor 2.
// Text is copied VERBATIM from scripts/daily-content/fixture.json (real
// bundled records) and from src/components/DailyHadith.tsx (the intentions
// item, the app's own rotation entry — source "Sahih Bukhari", no number,
// because that entry carries no number and none is invented here).
// The generator ABORTS if any exact string is missing from its page.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(dir, "..", "..", "..");
const outDir = path.join(dir, "out");
fs.mkdirSync(outDir, { recursive: true });

const GOLD = "#e9c15c";
const GOLD_BORDER = "rgba(233, 193, 92, 0.85)";

const fixture = JSON.parse(fs.readFileSync(path.join(dir, "..", "fixture.json"), "utf8"));
const bySlug = new Map(fixture.contents.map((c) => [c.slug, c]));
function duaCard(slug) {
  const c = bySlug.get(slug);
  if (!c) throw new Error(`fixture record missing: ${slug}`);
  return {
    role: slug.includes("faatiha") ? "Quran" : "Dua",
    kind: "quran",
    title: c.title_bn,
    arabic: c.arabic,
    bengali: c.translation_bn,
    sourceLine: c.reference,
    badge: "QURANIC DUA",
  };
}

const CARDS = [
  {
    ...duaCard("dua-for-guidance-surah-al-faatiha-1-6"),
    role: "Quran",
    file: "og-quran-guidance",
    background: "bg-guidance-path.jpg",
    backgroundScene: "Winding path through misty green hills at dawn, distant mosque silhouette",
  },
  {
    role: "Hadith",
    kind: "hadith",
    title: "আজকের হাদিস",
    arabic: "إنما الأعمال بالنيات",
    bengali: "কর্মের ফলাফল নিয়তের উপর নির্ভরশীল।",
    sourceLine: "Sahih Bukhari",
    badge: "HADITH",
    file: "og-hadith-intentions",
    background: "bg-intention-sunrise.jpg",
    backgroundScene: "Golden sunrise over layered mountains and a valley river",
  },
  {
    ...duaCard("dua-for-forgiveness-surah-al-araaf-7-23"),
    role: "Dua",
    file: "og-dua-forgiveness",
    background: "bg-forgiveness-leaf.jpg",
    backgroundScene: "Rain-washed green leaf with droplets in golden light",
  },
];

function divider() {
  return `<div style="display:flex;align-items:center;gap:8px;width:78%">
    <span style="flex:1;height:1px;background:linear-gradient(90deg, transparent, ${GOLD})"></span>
    <span style="width:9px;height:9px;transform:rotate(45deg);border:1.5px solid ${GOLD};flex-shrink:0"></span>
    <span style="flex:1;height:1px;background:linear-gradient(90deg, ${GOLD}, transparent)"></span>
  </div>`;
}

function page(card, format) {
  const portrait = format === "portrait";
  const W = portrait ? 540 : 540;
  const H = portrait ? 675 : 540;
  return `<!doctype html><html lang="bn"><head><meta charset="utf-8">
<style>html,body{margin:0;padding:0;background:#0b1526}*{box-sizing:border-box}</style></head>
<body><div style="position:relative;width:${W}px;height:${H}px;overflow:hidden;font-family:system-ui,sans-serif;background:#0b1526">
<img src="${card.background}" alt="" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover">
<div style="position:absolute;inset:0;background:linear-gradient(180deg, rgba(4,10,20,0.62) 0%, rgba(4,10,20,0.28) 38%, rgba(4,10,20,0.30) 62%, rgba(4,10,20,0.74) 100%)"></div>
<div style="position:relative;height:100%;display:flex;flex-direction:column;padding:${portrait ? "28px 28px 30px" : "24px 26px 26px"}">
<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px">
<div style="display:flex;align-items:center;gap:9px">
<img src="logo-1-emerald-gold.svg" alt="NoorApp" style="width:40px;height:40px;border-radius:12px">
<div><div style="color:#fff;font-weight:800;font-size:15px;letter-spacing:0.5px;line-height:1.2">NOOR APP</div>
<div style="color:#e8e8e8;font-size:11px;line-height:1.4"><span style="color:${GOLD}">—</span> noorapp.in <span style="color:${GOLD}">—</span></div></div></div>
<div style="display:flex;align-items:center;gap:8px;background:rgba(6,17,32,0.88);border:1px solid ${GOLD_BORDER};border-radius:14px;padding:8px 12px;flex-shrink:0">
<svg width="26" height="26" viewBox="0 0 24 24" fill="none"><path d="M12 4.5C10 3 7 2.5 4 3v13.5c3-.5 6 0 8 1.5 2-1.5 5-2 8-1.5V3c-3-.5-6 0-8 1.5Z" fill="${GOLD}"/><path d="M12 4.5V19" stroke="#0b1526" stroke-width="1.4"/></svg>
<div><div style="color:${GOLD};font-weight:800;font-size:11px;letter-spacing:0.8px;line-height:1.3">${card.badge}</div>
<div style="color:#fff;font-size:11px;line-height:1.3">${card.sourceLine}</div></div></div></div>
<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:${portrait ? 18 : 14}px;padding:${portrait ? "10px 0" : "6px 0"}">
<div style="color:${GOLD};font-weight:800;font-size:${portrait ? 44 : 36}px;line-height:1.3;font-family:'Noto Sans Bengali','Noto Serif Bengali',system-ui,sans-serif;text-shadow:0 2px 14px rgba(0,0,0,0.65)">${card.title}</div>
${divider()}
<div style="width:100%;background:rgba(6,15,28,0.66);border:1px solid ${GOLD_BORDER};border-radius:18px;padding:${portrait ? "16px 20px" : "13px 18px"}">
<div dir="rtl" lang="ar" style="color:#fff;font-size:${portrait ? 30 : 25}px;line-height:1.9;font-family:'Noto Naskh Arabic','Amiri',serif;text-shadow:0 2px 12px rgba(0,0,0,0.6)">${card.arabic}</div></div>
<div style="color:#fff;font-size:${portrait ? 22 : 19}px;line-height:1.65;font-family:'Noto Sans Bengali','Noto Serif Bengali',system-ui,sans-serif;text-shadow:0 2px 12px rgba(0,0,0,0.65)"><span style="color:${GOLD};font-size:${portrait ? 26 : 22}px;font-weight:700">“</span>${card.bengali}<span style="color:${GOLD};font-size:${portrait ? 26 : 22}px;font-weight:700">”</span></div>
</div></div></div></body></html>`;
}

const jobs = [];
for (const card of CARDS) {
  for (const format of card.file === "og-dua-forgiveness" ? ["portrait", "square"] : ["portrait"]) {
    const name = format === "portrait" ? card.file : `${card.file}-square`;
    const html = page(card, format);
    // Verbatim check: every religious string must appear exactly in the page.
    for (const field of ["title", "arabic", "bengali", "sourceLine"]) {
      if (!html.includes(card[field])) throw new Error(`verbatim check failed: ${card.file} ${field}`);
    }
    fs.writeFileSync(path.join(outDir, `${name}.html`), html);
    const W = 540;
    const H = format === "portrait" ? 675 : 540;
    jobs.push({ page: `${name}.html`, out: `${name}.png`, width: W, height: H, role: card.role, background: card.backgroundScene });
    console.log(`page ok - ${name}.html (${W}x${H}, ${card.role})`);
  }
  fs.copyFileSync(path.join(root, "public/assets/card-backgrounds", card.background), path.join(outDir, card.background));
}
fs.copyFileSync(path.join(root, "public/assets/logos/logo-1-emerald-gold.svg"), path.join(outDir, "logo-1-emerald-gold.svg"));
fs.writeFileSync(path.join(outDir, "jobs.json"), JSON.stringify(jobs, null, 2));
console.log(`jobs: ${jobs.length} pages in ${outDir}`);
