// Content assertions against the simulated prerender handler.
// Usage: node scripts/verify-prerender-content.mjs
import handler from "../api/prerender.js";

function makeRes() {
  return {
    statusCode: 200, headers: {}, body: "",
    status(c) { this.statusCode = c; return this; },
    setHeader(k, v) { this.headers[k] = v; return this; },
    send(b) { this.body = String(b ?? ""); return this; },
  };
}
const get = async (routePath) => {
  const req = { query: { path: routePath }, headers: { "user-agent": "Googlebot" } };
  const res = makeRes();
  await handler(req, res);
  return res.body;
};
const checks = [];
const check = (name, cond, detail = "") => checks.push({ name, pass: !!cond, detail });

const names = await get("/99-names");
check("99-names has Ar-Rahman", names.includes("Ar-Rahman"));
check("99-names has As-Sabur (99th)", names.includes("As-Sabur"));
check("99-names has 99 list items", (names.match(/<li /g) || []).length >= 99);

const pg = await get("/prayer-guide");
check("prayer-guide has Takbir Tahrimah", pg.includes("Takbir Tahrimah"));
check("prayer-guide has Arabic recitation", /[\u0600-\u06FF]/.test(pg));

const tasbih = await get("/tasbih");
check("tasbih has SubhanAllah", tasbih.includes("SubhanAllah"));

const cal = await get("/calendar");
check("calendar has Muharram (মুহাররম)", cal.includes("মুহাররম"));
check("calendar has Ashura info", cal.includes("Ashura"));

const quiz = await get("/quiz");
const quizLinks = (quiz.match(/href="\/quiz\/[a-z0-9-]+"/g) || []).length;
check("quiz hub has 281 question links", quizLinks === 281, `found ${quizLinks}`);

const story = await get("/stories/umar-accepting-islam-story");
const title = (story.match(/<title>([^<]*)<\/title>/) || [])[1] || "";
check("story title has no trailing pipe", !title.trimEnd().endsWith("|"), title);
check("story has related stories nav", story.includes('aria-label="Related stories"'));
check("story related link umar→prophet-yusuf", story.includes("/stories/prophet-yusuf-full-story"));

const hadith = await get("/hadith");
check("hadith hub marks planned collections", hadith.includes("Planned — not yet available") || hadith.includes("Planned"));
check("hadith hub has no 'Read Sahih Muslim' claim", !/Read Sahih Muslim/i.test(hadith));

const muslim = await get("/hadith/muslim");
check("muslim placeholder honest", /not yet available|planned/i.test(muslim));

const sources = await get("/sources");
check("sources frames other collections as planned, not live", /are planned for future release and are not yet available on Noor/i.test(sources));
check("sources names Bukhari as current", /Sahih al-Bukhari/i.test(sources));

const dua = await get("/dua/dua-for-protection-surah-quran-x-138");
check("dua page renders 200-class body", dua.length > 1000, `len ${dua.length}`);

let fails = 0;
for (const c of checks) {
  console.log(`${c.pass ? "PASS" : "FAIL"}  ${c.name}${c.detail ? " — " + c.detail : ""}`);
  if (!c.pass) fails++;
}
console.log(fails === 0 ? "ALL CONTENT CHECKS PASSED" : `${fails} CHECKS FAILED`);
process.exit(fails === 0 ? 0 : 1);
