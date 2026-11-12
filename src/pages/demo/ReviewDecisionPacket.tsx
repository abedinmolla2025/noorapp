/**
 * Human Review Decision Packet — interactive review interface.
 *
 * Route: /demo/daily-content/review (linked from the engines page).
 *
 * This page presents the HUMAN-REVIEW-DECISION-PACKET.md contents
 * interactively: the two word-level suspects (W-1, W-2), the five open
 * transliteration convention decisions, the errors-vs-convention
 * separation, the preserved queue states, and the preserved semantic
 * profiles/scores.
 *
 * SAFETY: every control on this page records a DECISION only. Decisions
 * live in the browser's localStorage (key `noorapp-review-decisions`)
 * and change nothing outside this page — no dataset, no record, no
 * Arabic text, no Bengali translation, no database row. Applying a
 * recorded decision to data is a separate, separately authorized step.
 * Pronunciation approval and visual approval remain separate; final
 * approval of a record needs both.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { loadDemoDatasets, type DemoDatasets } from "./demoData";
import { buildEngineExamples } from "./visualExamples";
import { PRONUNCIATION_AUDIT } from "@/lib/dailyContent/pronunciationAudit";
import { SEMANTIC_THRESHOLD } from "@/lib/dailyContent/semantic";

const STORAGE_KEY = "noorapp-review-decisions";

type DecisionAction = "approve" | "reject" | "request-correction";
type Decision = {
  itemId: string;
  itemLabel: string;
  action: DecisionAction;
  option?: string;
  note: string;
  at: string;
};

const ACTION_LABEL: Record<DecisionAction, string> = {
  approve: "অনুমোদন",
  reject: "বাতিল / যেমন আছে রাখুন",
  "request-correction": "সংশোধন / আরও প্রমাণ চাই",
};

function loadDecisions(): Decision[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Approve / reject / request-correction controls for one review item. */
function DecisionControls({
  itemId,
  itemLabel,
  approveLabel,
  options,
  onRecord,
  existing,
}: {
  itemId: string;
  itemLabel: string;
  approveLabel: string;
  options?: { id: string; label: string }[];
  onRecord: (d: Decision) => void;
  existing?: Decision;
}) {
  const [note, setNote] = useState("");
  const [option, setOption] = useState<string | undefined>(undefined);
  const record = (action: DecisionAction) => {
    onRecord({
      itemId,
      itemLabel,
      action,
      option: options ? option : undefined,
      note: note.trim(),
      at: new Date().toISOString(),
    });
    setNote("");
  };
  return (
    <div className="space-y-2 rounded-md border p-3" data-testid={`controls-${itemId}`}>
      {options && (
        <div className="flex flex-wrap gap-2">
          {options.map((o) => (
            <Button
              key={o.id}
              size="sm"
              variant={option === o.id ? "default" : "outline"}
              onClick={() => setOption(o.id)}
            >
              {o.label}
            </Button>
          ))}
        </div>
      )}
      <input
        className="w-full rounded-md border px-2 py-1 text-sm"
        placeholder="মন্তব্য (ঐচ্ছিক) — যেমন: কোন উৎস, কোন বানান"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          disabled={!!options && !option}
          onClick={() => record("approve")}
        >
          {approveLabel}
        </Button>
        <Button size="sm" variant="outline" onClick={() => record("reject")}>
          যেমন আছে রাখুন
        </Button>
        <Button size="sm" variant="outline" onClick={() => record("request-correction")}>
          আরও প্রমাণ / সংশোধন চাই
        </Button>
      </div>
      {options && !option && (
        <p className="text-xs text-muted-foreground">অনুমোদনের আগে একটি বিকল্প বাছুন।</p>
      )}
      {existing && (
        <p className="text-xs">
          <Badge variant="outline">সিদ্ধান্ত নেওয়া হয়েছে</Badge>{" "}
          {ACTION_LABEL[existing.action]}
          {existing.option ? ` — ${existing.option}` : ""}
          {existing.note ? ` — “${existing.note}”` : ""}{" "}
          <span className="text-muted-foreground">
            ({new Date(existing.at).toLocaleString("bn-BD")})
          </span>
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        এই সিদ্ধান্ত শুধু এই পাতায় রেকর্ড হয় — কোনো রেকর্ড, আরবি বা
        অনুবাদ বদলায় না।
      </p>
    </div>
  );
}

function WordTable({
  rows,
  highlight,
}: {
  rows: { arabic: string | null; candidate: string | null; stored: string | null; status: string; sim?: number | null }[];
  highlight: number;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-muted-foreground">
            <th className="py-1 pr-2">#</th>
            <th className="py-1 pr-2">আরবি</th>
            <th className="py-1 pr-2">প্রার্থী</th>
            <th className="py-1 pr-2">সংরক্ষিত</th>
            <th className="py-1 pr-2">অবস্থা</th>
            <th className="py-1">সাদৃশ্য</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr
              key={i}
              className={i === highlight ? "bg-amber-100 font-semibold" : ""}
            >
              <td className="py-1 pr-2">{i + 1}</td>
              <td className="py-1 pr-2 font-arabic" dir="rtl">
                {r.arabic ?? "—"}
              </td>
              <td className="py-1 pr-2">{r.candidate ?? "—"}</td>
              <td className="py-1 pr-2">{r.stored ?? "—"}</td>
              <td className="py-1 pr-2">{r.status}</td>
              <td className="py-1">{r.sim == null ? "—" : r.sim.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* --- Static evidence (from SIX-RECORD-VERIFICATION.md + aligned-words.json).
 * The source of truth is the audit data; these tables are the packet's
 * presentation of it. Nothing here is generated at review time. --- */

/** Priority 3 — the 58 missing records in usage order (ADMIN-REVIEW-QUEUE.md
 * Batch 2a daily essentials → 2b Ramadan/Hajj/Laylatul Qadr → 2c the rest).
 * Verified 2026-11-08 against audit-218.json: exactly the Missing class,
 * none omitted, none extra. Note the 58th slug is Bengali-script. */
const MISSING_USAGE_ORDER = [
  "dua-for-parents", "ayatul-kursi", "ayatul-kursi-2", "surah-al-ikhlas",
  "surah-al-ikhlas-2", "surah-al-falaq", "surah-al-falaq-2", "surah-an-nas",
  "surah-an-nas-2", "surah-al-fatihah", "the-master-of-seeking-forgiveness",
  "durood-ibrahim", "dua-before-sleeping", "dua-upon-waking-up",
  "dua-before-eating", "dua-after-eating", "dua-after-wudu",
  "dua-before-entering-toilet", "dua-after-leaving-toilet", "dua-for-travel",
  "dua-for-the-sick", "dua-for-breaking-fast", "dua-for-breaking-fast-iftar",
  "dua-for-sehri-intention-for-fasting", "intention-for-fasting",
  "special-dua-for-ramadan", "special-dua-for-laylatul-qadr",
  "dua-for-laylatul-qadr", "talbiyah-hajj-chant",
  "dua-after-every-4-rakats-of-taraweeh", "dua-for-guidance-istikhara",
  "dua-when-looking-in-the-mirror", "dua-when-wearing-new-clothes",
  "allahumma-ajirni-minan-naar", "dua-when-provoked-while-fasting",
  "dua-after-salah", "dua-for-children", "dua-when-it-rains",
  "dua-for-beneficial-knowledge", "dua-for-anxiety-and-sorrow",
  "dua-in-times-of-distress", "dua-for-protection-from-evil-eye",
  "dua-qunut-for-witr-prayer", "dua-for-funeral-prayer", "verses-against-magic",
  "morning-remembrance", "evening-remembrance", "dua-when-leaving-masjid",
  "dua-when-entering-masjid", "dua-for-guidance", "dua-for-increase-in-knowledge",
  "dua-for-steadfastness-in-faith", "dua-of-prophet-yunus",
  "dua-when-visiting-graves", "dua-when-leaving-home",
  "ইসমে-আযমের-দোয়া-অত্যন্ত-ফজিলতপূর্ণ", "al-baqarah-2-286", "al-baqarah-2-285",
];

const W1_ROWS = [
  { arabic: "وَمَا", candidate: "ওয়ামা", stored: "মা (+ অতিরিক্ত ‘ওয়া’)", status: "differs", sim: 0.33 },
  { arabic: "كَانَ", candidate: "কানা", stored: "কানা", status: "match", sim: 1 },
  { arabic: "قَوْلَهُمْ", candidate: "ক্বওলাহুম", stored: "কাওলাহুম", status: "differs", sim: 0.88 },
  { arabic: "إِلَّا", candidate: "ইল্লা", stored: "ইল্লা", status: "uncertain", sim: 1 },
  { arabic: "أَن", candidate: "আন", stored: "আনা", status: "differs — W-1", sim: 0.67 },
  { arabic: "قَالُوا", candidate: "ক্বালূ", stored: "কালু।", status: "differs", sim: 0.75 },
  { arabic: "رَبَّنَا", candidate: "রাব্বানা", stored: "রাব্বানা", status: "match", sim: 1 },
  { arabic: "ٱغْفِرْ", candidate: "গ্বফির", stored: "ঘফির", status: "differs", sim: 0.75 },
  { arabic: "لَنَا", candidate: "লানা", stored: "লানা", status: "match", sim: 1 },
  { arabic: "ذُنُوبَنَا", candidate: "যুনূবানা", stored: "ধুনূবানা", status: "differs", sim: 1 },
  { arabic: "وَإِسْرَافَنَا", candidate: "ওয়াইসরাফানা", stored: "ইস্রাফানা", status: "differs", sim: 0.58 },
  { arabic: "فِى", candidate: "ফী", stored: "ফি", status: "differs", sim: 0.5 },
  { arabic: "أَمْرِنَا", candidate: "আমরিনা", stored: "আমরিনা,", status: "match", sim: 1 },
  { arabic: "وَثَبِّتْ", candidate: "ওয়াছাব্বিত", stored: "থাব্বিত", status: "differs", sim: 0.55 },
  { arabic: "أَقْدَامَنَا", candidate: "আক্বদামানা", stored: "আকদামানা", status: "differs", sim: 1 },
  { arabic: "وَٱنصُرْنَا", candidate: "ওয়ানস্বুরনা", stored: "আনসুরনা", status: "differs", sim: 0.6 },
  { arabic: "عَلَى", candidate: "'আলা", stored: "আল", status: "differs", sim: 0.67 },
  { arabic: "ٱلْقَوْمِ", candidate: "লক্বওমি", stored: "কাওমি", status: "differs", sim: 0.6 },
  { arabic: "ٱلْكَٰفِرِينَ", candidate: "লকাফিরীনা", stored: "কাফিরীন", status: "differs", sim: 0.78 },
];

const W2_ROWS = [
  { arabic: "يَٰمَرْيَمُ", candidate: "য়ামারয়ামু", stored: "য়া-মারইযামু", status: "differs", sim: 0.55 },
  { arabic: "ٱقْنُتِى", candidate: "ক্বনুতী", stored: "ইকনুতি", status: "differs", sim: 0.67 },
  { arabic: "لِرَبِّكِ", candidate: "লিরাব্বিকি", stored: "লি-রাব্বিকি", status: "differs", sim: 0.91 },
  { arabic: null, candidate: null, stored: "ও", status: "অতিরিক্ত সংরক্ষিত শব্দ", sim: null },
  { arabic: "وَٱسْجُدِى", candidate: "ওয়াসজুদী", stored: "আসজুদী", status: "differs", sim: 0.56 },
  { arabic: null, candidate: null, stored: "ও", status: "অতিরিক্ত সংরক্ষিত শব্দ", sim: null },
  { arabic: "وَٱرْكَعِى", candidate: "ওয়ারকা'ই", stored: "আর্কআই", status: "differs", sim: 0.25 },
  { arabic: "مَعَ", candidate: "মা'আ", stored: "মিনা", status: "differs — W-2", sim: 0.25 },
  { arabic: "ٱلرَّٰكِعِينَ", candidate: "র্রাকি'ইয়না", stored: "আর-রাকি'ীন", status: "differs", sim: 0.45 },
];

const CONVENTIONS: {
  id: string;
  title: string;
  question: string;
  evidence: string;
  options: { id: string; label: string }[];
  examples: { arabic: string; candidate: string; stored: string; record: string }[];
}[] = [
  {
    id: "D1",
    title: "D-1 · যুক্তাক্ষর নাকি সরল অক্ষর?",
    question:
      "প্রার্থী জোরালো ব্যঞ্জন যুক্তাক্ষরে লেখে (ত্ব, স্ব, ক্ব, দ্ব, য্ব, গ্ব); সংরক্ষিত মান বেশিরভাগ সরল অক্ষরে লেখে (ত, স, ক, দ, জ, গ)। কোনটি মান হবে?",
    evidence:
      "ত্ব: প্রার্থী ৩০ / সংরক্ষিত ০ · স্ব: ৫৩ / ০ · ক্ব: ১২৭ / ২৩ · দ্ব: ৩৭ / ১ · য্ব: ২৪ / ০ · গ্ব: ৪৯ / ০। প্রকাশিত উৎস সংরক্ষিত পক্ষে (সাগিরা, তাগফির) — শুধু ط-তে ত্ব লেখে (ত্বয়্যিবাহ)।",
    options: [
      { id: "A", label: "ক — সবখানে যুক্তাক্ষর" },
      { id: "B", label: "খ — প্রকাশিত সরল-অক্ষর ধারা" },
      { id: "C", label: "গ — মিশ্র (ত্ব/ক্ব যেখানে প্রচলিত)" },
    ],
    examples: [
      { arabic: "قَوْلَهُمْ", candidate: "ক্বওলাহুম", stored: "কাওলাহুম", record: "৩:১৪৭" },
      { arabic: "طَيِّبَةً", candidate: "ত্বয়্য়িবাতান", stored: "তাইবাতান", record: "৩:৩৮" },
      { arabic: "ظَلَمْنَا", candidate: "য্বলামনা", stored: "জালামনা", record: "৭:২৩" },
      { arabic: "صَغِيرًا", candidate: "স্বগ্বীরা", stored: "(সংরক্ষিত নেই)", record: "১৭:২৪" },
    ],
  },
  {
    id: "D2",
    title: "D-2 · হামজাতুল ওয়াসল: বাদ দেব, না রাখব?",
    question:
      "সংযুক্ত পাঠে পরের শব্দের শুরুর হামজা উচ্চারিত হয় না — প্রার্থী কোথাও বাদ দেয়, কোথাও রাখে; সংরক্ষিত মান বেশিরভাগ আলাদা সিলেবল হিসেবে রাখে।",
    evidence:
      "২১৮টি রেকর্ডের ১৭৭টিতে wasla-elided ফ্ল্যাগ — অডিটের সবচেয়ে সাধারণ ফ্ল্যাগ। প্রকাশিত উৎস ধারাবাহিকভাবে বাদ দেয় (হামহুমা); প্রার্থী ১৭:২৪-এ রাখে (আরহামহুমা) — প্রার্থীর পরিচিত দুর্বলতা।",
    options: [
      { id: "A", label: "ক — ধারাবাহিকভাবে বাদ" },
      { id: "B", label: "খ — লেখা অনুযায়ী রাখা" },
      { id: "C", label: "গ — শুধু স্বরধ্বনির পরে বাদ" },
    ],
    examples: [
      { arabic: "ٱرْحَمْ", candidate: "আরহামহুমা (রাখে)", stored: "(সংরক্ষিত নেই)", record: "১৭:২৪" },
      { arabic: "مَالِكِ ٱلنَّاسِ", candidate: "মালিকি ন্নাআসি", stored: "মালিকি আন-নাস", record: "১১৪:২" },
      { arabic: "ٱللَّهُ ٱلصَّمَدُ", candidate: "আল্লাহু স্ব্স্বমাদু", stored: "আল্লাহু আস-সামাদু", record: "১১২:২" },
    ],
  },
  {
    id: "D3",
    title: "D-3 · শেষ শব্দ: ওয়াকফ রূপ না সংযুক্ত রূপ?",
    question:
      "উদ্ধৃত অংশ মাঝ-আয়াতে শেষ হলে শেষ শব্দ ওয়াকফে পড়া হয় (তানউইন বাদ, ة → হ)। প্রার্থী সংযুক্ত রূপ লেখে; উৎস ওয়াকফ রূপ লেখে। ডেমো কোনটি দেখাবে, আর তা কি বলবে?",
    evidence:
      "৪০টি রেকর্ডে waqf ফ্ল্যাগ; প্রার্থী ২১৮টির ১৮৬টিতেই শেষ শব্দে তানউইন (ান/িন/ুন) রাখে। দুটো রূপই নিজের প্রসঙ্গে সঠিক — ৩:৩৮-এ প্রার্থী পুরো আয়াতের জন্য সঠিক, উৎস উদ্ধৃত অংশের জন্য সঠিক।",
    options: [
      { id: "A", label: "ক — সবসময় সংযুক্ত রূপ" },
      { id: "B", label: "খ — উদ্ধৃত অংশ শেষে ওয়াকফ রূপ" },
      { id: "C", label: "গ — সংযুক্ত রূপ + প্রসঙ্গ লেখা" },
    ],
    examples: [
      { arabic: "وَالِيًّا", candidate: "ওয়ালিয়্য়া", stored: "ওয়ালিয়্যান", record: "১৯:৬" },
      { arabic: "أَحَدٌ", candidate: "আহাদু", stored: "আহাদুন", record: "১১২:৪" },
      { arabic: "طَيِّبَةً", candidate: "ত্বয়্য়িবাতান", stored: "তাইয়্যিবাতান", record: "৩:৩৮" },
    ],
  },
  {
    id: "D4",
    title: "D-4 · গুন্নাহ: একীভূত করব, না রেখে ফ্ল্যাগ দেব?",
    question:
      "نْ-এর পরে ي / و / م / ن এলে গুন্নাহ হয়। প্রার্থী এগুলো একীভূত করে না — আলাদা রেখে ghunnah-review ফ্ল্যাগ দেয়। মান কি একীভূত করা, রাখা, নাকি কারির সিদ্ধান্ত?",
    evidence:
      "৩৮টি রেকর্ডে ghunnah-review ফ্ল্যাগ। ২৩:৯৮-এ প্রার্থী আর সংরক্ষিত মান একই বানান লেখে (‘আন’) — ফ্ল্যাগই একমাত্র পার্থক্য।",
    options: [
      { id: "A", label: "ক — রাখা বানানই মান" },
      { id: "B", label: "খ — যেখানে নিয়ম প্রযোজ্য একীভূত করা" },
      { id: "C", label: "গ — ৩৮টি রেকর্ড কারির কাছে পাঠানো" },
    ],
    examples: [
      { arabic: "أَن يَحْضُرُونِ", candidate: "আন য়াহদ্বুরূনি", stored: "আন ইয়াহদুরুন", record: "২৩:৯৮" },
      { arabic: "مِن لِّسَانِي", candidate: "ম্মি ল্লিসানী", stored: "মিন লিসসানী", record: "২০:২৭" },
      { arabic: "وَإِنِّى", candidate: "ওয়াইন্নী", stored: "ও ইন্নী", record: "১৯:৫" },
    ],
  },
  {
    id: "D5",
    title: "D-5 · وَ: জুড়ে লিখব, না আলাদা?",
    question:
      "প্রার্থী وَ পরের শব্দের সঙ্গে জুড়ে লেখে (‘ওয়ামা’, ‘ওয়াই ল্লাম’); সংরক্ষিত মান প্রায়ই আলাদা শব্দ হিসেবে লেখে (‘ওয়া মা’, ‘ওয় ইন লাম’)।",
    evidence:
      "সংরক্ষিত মানে وَ আলাদা টোকেন হিসেবে আছে ১৫টি রেকর্ডে; প্রার্থী জুড়ে লেখে ১৫৬টি রেকর্ডে।",
    options: [
      { id: "A", label: "ক — সবসময় জুড়ে" },
      { id: "B", label: "খ — সবসময় আলাদা" },
      { id: "C", label: "গ — শুধু স্বর/হামজার আগে জুড়ে" },
    ],
    examples: [
      { arabic: "وَمَا", candidate: "ওয়ামা", stored: "ওয়া মা", record: "৩:১৪৭" },
      { arabic: "وَإِن لَّمْ", candidate: "ওয়াই ল্লাম", stored: "ওয় ইন লাম", record: "৭:২৩" },
      { arabic: "وَإِذْ", candidate: "ওয়াইয", stored: "ওয়া ইয", record: "২:১২৭" },
      { arabic: "وَقَالَ", candidate: "ওয়াক্বালা", stored: "ওয়া কালা", record: "২৭:১৯" },
    ],
  },
];

export default function ReviewDecisionPacketPage() {
  const [datasets, setDatasets] = useState<DemoDatasets | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [decisions, setDecisions] = useState<Decision[]>(() => loadDecisions());
  const [copied, setCopied] = useState(false);
  const [importSummary, setImportSummary] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  /** Import a decisions JSON file (user-initiated, via file picker).
   * Validation: array of {itemId, action, at[, option, note]}. Merge
   * rule: an imported entry replaces an existing same-itemId entry
   * ONLY when its timestamp is newer; older entries are skipped.
   * Import never deletes decisions and never touches any dataset —
   * the browser's localStorage is modified only by this explicit
   * user action, never remotely. */
  const importFile = async (file: File) => {
    try {
      const parsed: unknown = JSON.parse(await file.text());
      if (!Array.isArray(parsed)) {
        setImportSummary("আমদানি ব্যর্থ: ফাইলটি সিদ্ধান্তের তালিকা (array) নয়।");
        return;
      }
      const valid: Decision[] = [];
      let rejected = 0;
      for (const item of parsed) {
        const ok =
          item !== null &&
          typeof item === "object" &&
          typeof (item as Decision).itemId === "string" &&
          (item as Decision).itemId.trim() !== "" &&
          ["approve", "reject", "request-correction"].includes((item as Decision).action) &&
          typeof (item as Decision).at === "string" &&
          !Number.isNaN(Date.parse((item as Decision).at)) &&
          ((item as Decision).option === undefined || typeof (item as Decision).option === "string") &&
          ((item as Decision).note === undefined || typeof (item as Decision).note === "string");
        if (ok) {
          valid.push({
            itemId: (item as Decision).itemId,
            itemLabel: typeof (item as Decision).itemLabel === "string" ? (item as Decision).itemLabel : (item as Decision).itemId,
            action: (item as Decision).action,
            option: (item as Decision).option,
            note: typeof (item as Decision).note === "string" ? (item as Decision).note : "",
            at: (item as Decision).at,
          });
        } else {
          rejected++;
        }
      }
      let imported = 0;
      let skipped = 0;
      // Merge against the current state directly — never count inside a
      // setState updater: React may invoke an updater more than once
      // (StrictMode), which would double-count the merge.
      const next = [...decisions];
      for (const d of valid) {
        const i = next.findIndex((p) => p.itemId === d.itemId);
        if (i === -1) {
          next.push(d);
          imported++;
        } else if (Date.parse(d.at) > Date.parse(next[i].at)) {
          next[i] = d;
          imported++;
        } else {
          skipped++;
        }
      }
      setDecisions(next);
      setImportSummary(
        `আমদানি সম্পন্ন: ${imported}টি গৃহীত/আপডেট, ${skipped}টি পুরোনো বলে বাদ, ${rejected}টি অবৈধ বলে বাতিল।`,
      );
    } catch {
      setImportSummary("আমদানি ব্যর্থ: ফাইলটি বৈধ JSON নয়।");
    }
  };

  useEffect(() => {
    let cancelled = false;
    loadDemoDatasets()
      .then((d) => {
        if (!cancelled) setDatasets(d);
      })
      .catch((e) => {
        if (!cancelled) setLoadError(String(e?.message ?? e));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(decisions));
    } catch {
      /* storage unavailable — decisions stay in memory only */
    }
  }, [decisions]);

  const record = (d: Decision) =>
    setDecisions((prev) => {
      const rest = prev.filter((p) => p.itemId !== d.itemId);
      return [...rest, d];
    });
  const byId = useMemo(() => {
    const m: Record<string, Decision> = {};
    for (const d of decisions) m[d.itemId] = d;
    return m;
  }, [decisions]);

  const queueCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of PRONUNCIATION_AUDIT) c[r.class] = (c[r.class] ?? 0) + 1;
    return c;
  }, []);

  /** Full review queue, computed live from the audit data. Historical
   * snapshot (2026-11-08): Verified 0, Candidate 157, Missing 58,
   * Suspected 3 — the live counts below must match it; any difference
   * is a discrepancy to resolve explicitly, not to paper over. */
  const queue = useMemo(() => {
    const bySlug: Record<string, (typeof PRONUNCIATION_AUDIT)[number]> = {};
    for (const r of PRONUNCIATION_AUDIT) bySlug[r.slug] = r;
    const suspected = PRONUNCIATION_AUDIT.filter((r) => r.class === "Suspected error");
    const candidates = PRONUNCIATION_AUDIT.filter((r) => r.class === "Candidate — unverified");
    const p4 = candidates
      .filter((r) => r.looseSim !== null && r.looseSim >= 0.9)
      .sort((x, y) => (y.looseSim ?? 0) - (x.looseSim ?? 0));
    const p5count = candidates.length - p4.length;
    const p3 = MISSING_USAGE_ORDER.map((slug) => bySlug[slug]).filter(Boolean);
    return { suspected, p4, p5count, p3 };
  }, []);

  const examples = useMemo(
    () => (datasets ? buildEngineExamples(datasets) : []),
    [datasets],
  );

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(decisions, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "noorapp-review-decisions.json";
    a.click();
    URL.revokeObjectURL(url);
  };
  const copyJson = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(decisions, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4" data-testid="review-page">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">মানব পর্যালোচনা — সিদ্ধান্ত প্যাকেট</CardTitle>
          <div className="flex flex-wrap gap-2">
            <Badge>LOCAL DEMO</Badge>
            <Badge variant="outline">পর্যালোচকের সিদ্ধান্তের জন্য</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>
            Track E-র অডিটে ২১৮টি দোয়ার কোনোটিই “যাচাইকৃত” নয় — যাচাই
            মানুষের সিদ্ধান্ত। এই পাতা সেই সিদ্ধান্ত নেওয়ার যন্ত্র:
            দুটি সন্দেহজনক শব্দ, পাঁচটি প্রথাগত সিদ্ধান্ত, আর ভুল বনাম
            প্রথার পার্থক্য।
          </p>
          <p className="font-semibold">
            এখানকার প্রতিটি বোতাম শুধু একটি সিদ্ধান্ত রেকর্ড করে — এই
            ব্রাউজারে, এই পাতায়। কোনো রেকর্ড, আরবি, বাংলা অনুবাদ বা
            ডেটাবেস বদলায় না। সিদ্ধান্ত ডেটায় প্রয়োগ করা আলাদা ধাপ,
            আলাদা অনুমোদন সাপেক্ষে।
          </p>
          <p>
            <Link className="underline" to="/demo/daily-content/engines">
              ← উচ্চারণ + সেমান্টিক ইঞ্জিন ডেমো
            </Link>{" "}
            · পূর্ণ প্যাকেট:{" "}
            <code>noorapp-ai-daily-content/HUMAN-REVIEW-DECISION-PACKET.md</code>
          </p>
        </CardContent>
      </Card>

      {/* ---------- মালিকের পর্যবেক্ষণ (স্থায়ী, শুধু-পড়া) ---------- */}
      <Card data-testid="owner-observations">
        <CardHeader>
          <CardTitle>মালিকের পর্যবেক্ষণ — স্থায়ী রেকর্ড (শুধু-পড়া)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p>
            এই পাতায় তিনটি আলাদা রেকর্ড থাকে — কখনো একসঙ্গে মেশানো হয়
            না: <strong>১ · মালিকের পর্যবেক্ষণ</strong> (নিচে — প্যাকেট
            নথিতে লেখা স্থায়ী রেকর্ড, এখানে শুধু দেখানো হয়),{" "}
            <strong>২ · ব্রাউজার-স্থানীয় পর্যালোচনা সিদ্ধান্ত</strong>{" "}
            (§ছ-র লগ — এই ব্রাউজারে রেকর্ড হয়),{" "}
            <strong>৩ · অনুমোদিত ধর্মীয় বিষয়বস্তুর সিদ্ধান্ত</strong>{" "}
            (এখনো শূন্য — নিচে দেখুন)। কোনো পর্যবেক্ষণ নিজে থেকে সিদ্ধান্ত
            নয়, কোনো সিদ্ধান্ত নিজে থেকে অনুমোদন নয়।
          </p>
          <div className="rounded-md border p-3" data-testid="owner-observation-W-1">
            <p className="font-semibold">W-1 · সূরা আলে ইমরান ৩:১৪৭ — মালিকের প্রাথমিক ভাষাগত পর্যবেক্ষণ (২০২৬-১১-০৮)</p>
            <div className="overflow-x-auto">
              <table className="w-full">
                <tbody>
                  <tr>
                    <td className="py-1 pr-2 font-semibold">মূল আরবি</td>
                    <td className="py-1" dir="rtl">أَنْ</td>
                  </tr>
                  <tr>
                    <td className="py-1 pr-2 font-semibold">সংরক্ষিত বাংলা</td>
                    <td className="py-1">আনা</td>
                  </tr>
                  <tr>
                    <td className="py-1 pr-2 font-semibold">প্রার্থী বিকল্প</td>
                    <td className="py-1">আন / আন্</td>
                  </tr>
                  <tr>
                    <td className="py-1 pr-2 font-semibold">পর্যবেক্ষণ</td>
                    <td className="py-1">
                      সংরক্ষিত রূপ “আনা”-তে أَنْ-এ নেই এমন একটি অতিরিক্ত
                      শেষ স্বরধ্বনি এসেছে বলে মনে হয়। “আন/আন্” কাছাকাছি
                      বাংলা উপস্থাপনা হতে পারে — সংযুক্ত পাঠ ও তাজউইদ
                      পর্যালোচনা সাপেক্ষে।
                    </td>
                  </tr>
                  <tr>
                    <td className="py-1 pr-2 font-semibold">সংযুক্ত পাঠ</td>
                    <td className="py-1">
                      ق-এর আগে নূন সাকিন — ইখফা বিবেচনা প্রয়োজন (أَن-এর
                      নূন সাকিনের পরে قَالُوا আসে)।
                    </td>
                  </tr>
                  <tr>
                    <td className="py-1 pr-2 font-semibold">অবস্থা</td>
                    <td className="py-1">
                      <Badge>Pending qualified human review</Badge>
                    </td>
                  </tr>
                  <tr>
                    <td className="py-1 pr-2 font-semibold">সংশোধন</td>
                    <td className="py-1">প্রয়োগ করা হয়নি — ডেটাসেট, সংরক্ষিত মান ও W-1-এর শ্রেণি অপরিবর্তিত।</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
          <div className="rounded-md border p-3" data-testid="approved-content-decisions">
            <p className="font-semibold">৩ · অনুমোদিত ধর্মীয় বিষয়বস্তুর সিদ্ধান্ত</p>
            <p>
              এখনো কোনো অনুমোদিত ধর্মীয় বিষয়বস্তুর সিদ্ধান্ত নেই —{" "}
              <strong>০টি রেকর্ড যাচাইকৃত</strong>। এই অংশ ইচ্ছাকৃতভাবে
              খালি: কোনো উচ্চারণ, অনুবাদ বা বিষয়বস্তু যোগ্য মানব
              পর্যালোচনা ছাড়া অনুমোদিত হয়নি। কোনো সিদ্ধান্ত এখানে এলে
              তা আলাদা অনুমোদন-ধাপের মাধ্যমে আসবে, ব্রাউজার লগ বা
              পর্যবেক্ষণ থেকে স্বয়ংক্রিয়ভাবে নয়।
            </p>
          </div>
        </CardContent>
      </Card>

      {/* ---------- ক · W-1 ---------- */}
      <Card data-testid="w1-card">
        <CardHeader>
          <CardTitle>ক · W-1 — সূরা আলে ইমরান ৩:১৪৭: أَن, সংরক্ষিত “আনা”</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p dir="rtl" className="text-lg leading-loose">
            وَمَا كَانَ قَوْلَهُمْ إِلَّا أَن قَالُوا۟ رَبَّنَا ٱغْفِرْ
            لَنَا ذُنُوبَنَا وَإِسْرَافَنَا فِىٓ أَمْرِنَا وَثَبِّتْ
            أَقْدَامَنَا وَٱنصُرْنَا عَلَى ٱلْقَوْمِ ٱلْكَٰفِرِينَ
          </p>
          <p>
            <span className="font-semibold">বাংলা অর্থ:</span> তারা আর
            কিছুই বলেনি-শুধু বলেছে, হে আমাদের পালনকর্তা! মোচন করে দাও
            আমাদের পাপ এবং যা কিছু বাড়াবাড়ি হয়ে গেছে আমাদের কাজে। আর
            আমাদিগকে দৃঢ় রাখ এবং কাফেরদের উপর আমাদিগকে সাহায্য কর।
          </p>
          <p>
            <span className="font-semibold">সন্দেহজনক শব্দ:</span>{" "}
            <span dir="rtl">أَن</span> — “that” (অব্যয়)। প্রার্থী:{" "}
            <strong>আন</strong>। সংরক্ষিত মান লেখে{" "}
            <strong>আনা</strong> — যা <span dir="rtl">أَنَا</span> (“আমি”)-র
            উচ্চারণ। “তাদের কথা ছিল শুধু ‘আমি’ তারা বলেছে” — ব্যাকরণে
            অসম্ভব, আর রেকর্ডের নিজের অর্থের বিরোধী।
          </p>
          <WordTable rows={W1_ROWS} highlight={4} />
          <p>
            <span className="font-semibold">সংরক্ষিত (পুরো):</span> ওয়া মা
            কানা কাওলাহুম ইল্লা আনা কালু। রাব্বানা ঘফির লানা ধুনূবানা ও
            ইস্রাফানা ফি আমরিনা, থাব্বিত আকদামানা ও আনসুরনা আল কাওমি
            আল কাফিরীন
          </p>
          <p>
            <span className="font-semibold">প্রার্থী (পুরো):</span> ওয়ামা
            কানা ক্বওলাহুম ইল্লা আন ক্বালূ রাব্বানা গ্বফির লানা
            যুনূবানা ওয়াইসরাফানা ফী আমরিনা ওয়াছাব্বিত আক্বদামানা
            ওয়ানস্বুরনা 'আলা লক্বওমি লকাফিরীনা
          </p>
          <div>
            <p className="font-semibold">উৎস-প্রমাণ:</p>
            <ul className="list-disc pl-5">
              <li>
                qurano.com শব্দ-শব্দ (উর্দু): أَن = “an, that” —{" "}
                <a className="underline" href="https://qurano.com/ur/3-ali-imran/ayah-147/" target="_blank" rel="noreferrer">
                  qurano.com/3-147
                </a>
              </li>
              <li>
                islamicfinder লাতিন উচ্চারণ: “an q a loo” —{" "}
                <a className="underline" href="https://www.islamicfinder.org/id/quran/surah-aal-i-imraan/147/" target="_blank" rel="noreferrer">
                  islamicfinder.org/3:147
                </a>
              </li>
              <li>
                quranenc বাংলা অনুবাদ: “তাদের একটিই কথা ছিলো” — অব্যয়-পাঠ
                নিশ্চিত করে (অর্থমাত্র, উচ্চারণ নয়)।
              </li>
              <li>
                বাংলা ওয়েবে “আনা” লেখা কোনো উৎস পাওয়া যায়নি — সংরক্ষিত
                বানানের কোনো সমর্থন নেই।
              </li>
            </ul>
          </div>
          <DecisionControls
            itemId="W-1"
            itemLabel="W-1 · ৩:১৪৭ أَن → ‘আনা’"
            approveLabel="শব্দটি সংশোধন করুন (আনা → আন)"
            onRecord={record}
            existing={byId["W-1"]}
          />
        </CardContent>
      </Card>

      {/* ---------- খ · W-2 ---------- */}
      <Card data-testid="w2-card">
        <CardHeader>
          <CardTitle>খ · W-2 — সূরা আলে ইমরান ৩:৪৩: مَعَ, সংরক্ষিত “মিনা”</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p dir="rtl" className="text-lg leading-loose">
            يَٰمَرْيَمُ ٱقْنُتِى لِرَبِّكِ وَٱسْجُدِى وَٱرْكَعِى مَعَ
            ٱلرَّٰكِعِينَ
          </p>
          <p>
            <span className="font-semibold">বাংলা অর্থ:</span> হে মারইয়াম!
            তোমার পালনকর্তার উপাসনা কর এবং রুকুকারীদের সাথে সেজদা ও রুকু
            কর।
          </p>
          <p>
            <span className="font-semibold">সন্দেহজনক শব্দ:</span>{" "}
            <span dir="rtl">مَعَ</span> — “with” (সাথে)। প্রার্থী:{" "}
            <strong>মা'আ</strong>। সংরক্ষিত মান লেখে{" "}
            <strong>মিনা</strong> — যা <span dir="rtl">مِنَ</span>
            (“from”, থেকে)-র উচ্চারণ। “রুকুকারীদের থেকে রুকু কর” আয়াতটি
            বলে না; রেকর্ডের নিজের অর্থ (“সাথে”) এর বিরোধী। সাদৃশ্য
            ০.২৫ — পুরো অডিটের সর্বনিম্ন জোড়া।
          </p>
          <WordTable rows={W2_ROWS} highlight={7} />
          <p>
            <span className="font-semibold">সংরক্ষিত (পুরো):</span>{" "}
            য়া-মারইযামু ইকনুতি লি-রাব্বিকি ও আসজুদী ও আর্কআই মিনা
            আর-রাকি'ীন
          </p>
          <p>
            <span className="font-semibold">প্রার্থী (পুরো):</span>{" "}
            য়ামারয়ামু ক্বনুতী লিরাব্বিকি ওয়াসজুদী ওয়ারকা'ই মা'আ
            র্রাকি'ইয়না
          </p>
          <p>
            <span className="font-semibold">উৎস-প্রমাণ:</span> এই আয়াতের
            বাংলা উচ্চারণের কোনো প্রকাশিত উৎস ২০২৬-১১-০৮-এর অনুসন্ধানে
            পাওয়া যায়নি। প্রমাণ অভ্যন্তরীণ: আরবি দ্ব্যর্থহীন (مَعَ =
            “with”, مِنَ = “from”), আর রেকর্ডের নিজের অর্থ “সাথে” বলে।
          </p>
          <DecisionControls
            itemId="W-2"
            itemLabel="W-2 · ৩:৪৩ مَعَ → ‘মিনা’"
            approveLabel="শব্দটি সংশোধন করুন (মিনা → মা'আ)"
            onRecord={record}
            existing={byId["W-2"]}
          />
        </CardContent>
      </Card>

      {/* ---------- গ · পাঁচটি প্রথাগত সিদ্ধান্ত ---------- */}
      <Card>
        <CardHeader>
          <CardTitle>গ · পাঁচটি প্রথাগত সিদ্ধান্ত (মান নির্ধারণ)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <p>
            এই পাঁচটি সিদ্ধান্ত মান নির্ধারণ করে। এগুলো না হলে কোনো
            রেকর্ডই “যাচাইকৃত” বলা যায় না — যাচাই মানে “গৃহীত প্রথা
            অনুযায়ী আরবির সঙ্গে হুবহু মিল”, আর প্রথা এখনো গৃহীত হয়নি।
          </p>
          {CONVENTIONS.map((c) => (
            <div key={c.id} className="space-y-2 rounded-md border p-3" data-testid={`convention-${c.id}`}>
              <p className="font-semibold">{c.title}</p>
              <p>{c.question}</p>
              <p className="text-muted-foreground">{c.evidence}</p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-muted-foreground">
                      <th className="py-1 pr-2">আরবি</th>
                      <th className="py-1 pr-2">প্রার্থী</th>
                      <th className="py-1 pr-2">সংরক্ষিত</th>
                      <th className="py-1">রেকর্ড</th>
                    </tr>
                  </thead>
                  <tbody>
                    {c.examples.map((e, i) => (
                      <tr key={i}>
                        <td className="py-1 pr-2" dir="rtl">{e.arabic}</td>
                        <td className="py-1 pr-2">{e.candidate}</td>
                        <td className="py-1 pr-2">{e.stored}</td>
                        <td className="py-1">{e.record}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <DecisionControls
                itemId={c.id}
                itemLabel={`${c.title}`}
                approveLabel="এই বিকল্প গ্রহণ করুন"
                options={c.options}
                onRecord={record}
                existing={byId[c.id]}
              />
            </div>
          ))}
        </CardContent>
      </Card>

      {/* ---------- ঘ · ভুল বনাম প্রথা ---------- */}
      <Card data-testid="separation">
        <CardHeader>
          <CardTitle>ঘ · আসল ভুল বনাম প্রথার পার্থক্য</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p>
            <span className="font-semibold">আসল সন্দেহজনক ভুল: মাত্র ২টি
            শব্দ</span> — W-1 (“আনা”) আর W-2 (“মিনা”)। দুটোতেই সংরক্ষিত
            শব্দটি ভিন্ন আরবি শব্দের উচ্চারণ, অর্থ বদলে যায়।
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="py-1 pr-2">রেকর্ড</th>
                  <th className="py-1 pr-2">সাদৃশ্য</th>
                  <th className="py-1">যাচাই</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="py-1 pr-2">১১৩:৪ (সূরা আল-ফালাক)</td>
                  <td className="py-1 pr-2">০.৫০</td>
                  <td className="py-1">পরিচ্ছন্ন পুরোনো প্রথার উচ্চারণ (হাইফেন, আর্টিকেল লেখা) — সম্ভবত প্রথার ভিন্নতা, ভুল নয় — নিশ্চিত করতে হবে।</td>
                </tr>
                <tr>
                  <td className="py-1 pr-2">১১৪:৫ (সূরা আন-নাস)</td>
                  <td className="py-1 pr-2">০.৫৩</td>
                  <td className="py-1">একই — পুরোনো প্রথা (ধ, স, “আল-নাসি”) — সম্ভবত ভুল নয় — নিশ্চিত করতে হবে।</td>
                </tr>
                <tr>
                  <td className="py-1 pr-2">৩:৪৩ (সূরা আলে ইমরান)</td>
                  <td className="py-1 pr-2">০.৬০</td>
                  <td className="py-1">প্রথার ভিন্নতা + আসল সন্দেহ W-2 — আগে W-2 সিদ্ধান্ত নিন (§খ)।</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p>
            <span className="font-semibold">বাকি সব প্রথার পার্থক্য:</span>{" "}
            ১৫৭টি প্রার্থী-রেকর্ডের পার্থক্য প্রায় পুরোটাই প্রথা। ১,৯৫৯টি
            সারিবদ্ধ শব্দের মধ্যে ১,৩২০টি ভিন্ন, ২৬৯টি অনিশ্চিত — আর
            ফ্ল্যাগের হিসাব বলে সেগুলো কী: collapsing-hah ১৮৫, wasla-elided
            ১৭৭, assimilation-al ১৫৬, annotation-stripped ১৩৭,
            collapsing-ain ১৩৪, no-diacritic ১১৫, waqf ৪০, ghunnah-review
            ৩৮, unhandled-char ৩৫, assimilation-nun ২৩। প্রতিটিই বানান বা
            পাঠের প্রথা, ভিন্ন শব্দ নয়। সাদৃশ্যের সর্বনিম্ন ০.৫০ — কোনো
            রেকর্ডই এর নিচে নয়; “সঠিক” বনাম “ভুল”-এর কোনো স্বাভাবিক
            সীমারেখা নেই।
          </p>
          <p>
            <span className="font-semibold">তথ্য-মানের নোট (ধর্মীয় ভুল
            নয়):</span> ৩:৩৮-এর সংরক্ষিত মান শেষ দুটি আরবি শব্দ এক
            টোকেনে জুড়ে “...” দিয়ে লেখে (“সামীউদ্...দ্বু'আ”) — বিষয়বস্তু
            আছে, জোড়া অগোছালো।
          </p>
        </CardContent>
      </Card>

      {/* ---------- ঙ · সারির অবস্থা + পূর্ণ পর্যালোচনা সারি ---------- */}
      <Card data-testid="queue-states">
        <CardHeader>
          <CardTitle>ঙ · পর্যালোচনা সারি — স্পষ্ট অনুমোদন না হওয়া পর্যন্ত অপরিবর্তিত</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <p>
            ঐতিহাসিক স্ন্যাপশট (২০২৬-১১-০৮): Verified ০, Candidate ১৫৭,
            Missing ৫৮, Suspected error ৩ — নিচের লাইভ গণনা এর সঙ্গে
            মিলতে হবে। কোনো পার্থক্য থাকলে তা স্পষ্টভাবে সমাধান করতে
            হবে, চাপা দেওয়া যাবে না। এই চক্রে কোনো পার্থক্য নেই।
          </p>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="py-1 pr-2">অগ্রাধিকার</th>
                  <th className="py-1 pr-2">সংখ্যা</th>
                  <th className="py-1">অবস্থা</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="py-1 pr-2">P1 — শব্দ-স্তরের সন্দেহ (W-1, W-2)</td>
                  <td className="py-1 pr-2">২টি শব্দ</td>
                  <td className="py-1">খোলা — সিদ্ধান্তের অপেক্ষায় (§ক, §খ)</td>
                </tr>
                <tr>
                  <td className="py-1 pr-2">P2 — সন্দেহজনক রেকর্ড</td>
                  <td className="py-1 pr-2">{queue.suspected.length}টি</td>
                  <td className="py-1">খোলা — পর্যালোচনার অপেক্ষায়</td>
                </tr>
                <tr>
                  <td className="py-1 pr-2">P3 — অনুপস্থিত (Missing), ব্যবহারের ক্রমে</td>
                  <td className="py-1 pr-2">{queue.p3.length}টি</td>
                  <td className="py-1">খোলা — প্রার্থী তৈরি, পর্যালোচনার অপেক্ষায়</td>
                </tr>
                <tr>
                  <td className="py-1 pr-2">P4 — যাচাইকৃতের সবচেয়ে কাছের প্রার্থী</td>
                  <td className="py-1 pr-2">{queue.p4.length}টি</td>
                  <td className="py-1">খোলা — পর্যালোচনার অপেক্ষায়</td>
                </tr>
                <tr>
                  <td className="py-1 pr-2">P5 — বাকি প্রার্থী</td>
                  <td className="py-1 pr-2">{queue.p5count}টি</td>
                  <td className="py-1">খোলা — পর্যালোচনার অপেক্ষায়</td>
                </tr>
                <tr>
                  <td className="py-1 pr-2">যাচাইকৃত (Verified)</td>
                  <td className="py-1 pr-2">{queueCounts["Verified"] ?? 0}টি</td>
                  <td className="py-1">০ — কোনো রেকর্ড যাচাইকৃত নয়</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div data-testid="queue-p2">
            <p className="font-semibold">P2 — সন্দেহজনক রেকর্ড (৩টি)</p>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-left text-muted-foreground">
                    <th className="py-1 pr-2">রেকর্ড</th>
                    <th className="py-1 pr-2">সাদৃশ্য</th>
                    <th className="py-1">যাচাই</th>
                  </tr>
                </thead>
                <tbody>
                  {queue.suspected.map((r) => (
                    <tr key={r.slug}>
                      <td className="py-1 pr-2">{r.reference}</td>
                      <td className="py-1 pr-2">{r.looseSim?.toFixed(2) ?? "—"}</td>
                      <td className="py-1">
                        {r.slug.includes("3-43")
                          ? "প্রথার ভিন্নতা + আসল সন্দেহ W-2 — আগে W-2 সিদ্ধান্ত নিন (§খ)।"
                          : "সম্ভবত প্রথার ভিন্নতা, ভুল নয় — নিশ্চিত করতে হবে।"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <details data-testid="queue-p3">
            <summary className="cursor-pointer font-semibold">
              P3 — অনুপস্থিত ৫৮টি, ব্যবহারের ক্রমে (দৈনন্দিন প্রয়োজন আগে)
            </summary>
            <ol className="list-decimal pl-5">
              {queue.p3.map((r) => (
                <li key={r.slug} className="py-0.5">
                  {r.titleBn} — {r.reference}
                </li>
              ))}
            </ol>
            <p className="text-muted-foreground">
              ক্রম: দৈনন্দিন প্রয়োজন (২১টি) → রমজান/হজ/লাইলাতুল কদর
              (১০টি) → বাকি (২৭টি)। ৫৮তম স্লাগ বাংলা অক্ষরে
              (ইসমে-আযমের দোয়া) — ডেটাসেটের তথ্য-মানের নোট।
            </p>
          </details>

          <details data-testid="queue-p4">
            <summary className="cursor-pointer font-semibold">
              P4 — যাচাইকৃতের সবচেয়ে কাছের ১৫টি (সাদৃশ্য ≥ ০.৯০)
            </summary>
            <ol className="list-decimal pl-5">
              {queue.p4.map((r) => (
                <li key={r.slug} className="py-0.5">
                  {r.reference} — {r.looseSim?.toFixed(3)}
                </li>
              ))}
            </ol>
          </details>

          <p data-testid="queue-p5">
            P5 — বাকি {queue.p5count}টি প্রার্থী: পূর্ণ তালিকা ইঞ্জিন
            পাতার অডিট ভিউতে (ফিল্টার: Candidate — unverified)। এই
            প্যাকেট বা এই পাতা কোনো রেকর্ডের শ্রেণি বদলায় না, কোনো
            প্রার্থী গ্রহণ করে না, কোনো সংরক্ষিত মান বদলায় না। সিদ্ধান্ত
            রেকর্ড হয়; ডেটায় প্রয়োগ আলাদা, আলাদা অনুমোদন সাপেক্ষ ধাপ।
          </p>
        </CardContent>
      </Card>

      {/* ---------- চ · সেমান্টিক প্রোফাইল সংরক্ষিত ---------- */}
      <Card data-testid="semantic-preserved">
        <CardHeader>
          <CardTitle>চ · সেমান্টিক প্রোফাইল — অপরিবর্তিত (৮টি, সবগুলো ≥ {SEMANTIC_THRESHOLD})</CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          {loadError && <p className="text-destructive">{loadError}</p>}
          {!datasets && !loadError && <p>ডেটাসেট লোড হচ্ছে…</p>}
          {datasets && (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-left text-muted-foreground">
                    <th className="py-1 pr-2">রেকর্ড</th>
                    <th className="py-1 pr-2">দিকনির্দেশনা</th>
                    <th className="py-1 pr-2">স্কোর</th>
                    <th className="py-1">ফল</th>
                  </tr>
                </thead>
                <tbody>
                  {examples.map((ex) => (
                    <tr key={ex.ref}>
                      <td className="py-1 pr-2">{ex.card.title || ex.ref}</td>
                      <td className="py-1 pr-2">{ex.scene?.id ?? "—"}</td>
                      <td className="py-1 pr-2">
                        {ex.sceneScore ? `${ex.sceneScore.total}/100` : "—"}
                      </td>
                      <td className="py-1">
                        {ex.sceneScore && ex.sceneScore.passed ? "PASS" : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-2">
            উচ্চারণের অনুমোদন আর ছবির অনুমোদন আলাদা — চূড়ান্ত অনুমোদনে
            দুটোই লাগে। এই মিশনে কোনো প্রোফাইল বা স্কোর বদলানো হয়নি।
          </p>
        </CardContent>
      </Card>

      {/* ---------- ছ · সিদ্ধান্তের লগ ---------- */}
      <Card data-testid="decision-log">
        <CardHeader>
          <CardTitle>ছ · সিদ্ধান্তের লগ ({decisions.length}টি)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p>
            এই লগ শুধু এই ব্রাউজারে থাকে (localStorage)। এখান থেকে রপ্তানি
            করা যায়, মোছা যায়। লগে লেখা সিদ্ধান্ত কোনো ডেটা বদলায় না।
          </p>
          {decisions.length === 0 && (
            <p className="text-muted-foreground">এখনো কোনো সিদ্ধান্ত রেকর্ড হয়নি।</p>
          )}
          {decisions.length > 0 && (
            <ul className="space-y-2">
              {decisions.map((d, i) => (
                <li key={i} className="rounded-md border p-2">
                  <span className="font-semibold">{d.itemLabel}</span> —{" "}
                  {ACTION_LABEL[d.action]}
                  {d.option ? ` — বিকল্প ${d.option}` : ""}
                  {d.note ? ` — “${d.note}”` : ""}{" "}
                  <span className="text-muted-foreground">
                    ({new Date(d.at).toLocaleString("bn-BD")})
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={exportJson} disabled={decisions.length === 0}>
              JSON ডাউনলোড
            </Button>
            <Button size="sm" variant="outline" onClick={copyJson} disabled={decisions.length === 0}>
              {copied ? "কপি হয়েছে ✓" : "JSON কপি"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()}>
              JSON আমদানি
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              data-testid="decision-import-input"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void importFile(f);
                e.target.value = "";
              }}
            />
            <Button
              size="sm"
              variant="outline"
              onClick={() => setDecisions([])}
              disabled={decisions.length === 0}
            >
              লগ মুছুন
            </Button>
          </div>
          {importSummary && (
            <p className="text-xs" data-testid="import-summary">{importSummary}</p>
          )}
          <p className="text-xs text-muted-foreground">
            আমদানি শুধু আপনার ফাইল বাছাইয়ে হয় — নতুন এন্ট্রি পুরোনো
            এন্ট্রির চেয়ে নতুন হলে তবেই বদলায়; আমদানি কখনো সিদ্ধান্ত
            মোছে না। লগ মোছা শুধু উপরের “লগ মুছুন” বোতামে, স্পষ্ট
            ক্রিয়ায় হয়।
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
