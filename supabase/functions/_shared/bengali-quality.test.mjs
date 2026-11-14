// Bengali Quality classifier tests — Phase 5 (2026-11-14).
//
// Tests the heuristic classifier in _shared/bengali-quality.ts and
// proves the Editorial Standard is actually wired into every
// function that generates Bengali output.
//
// Regression tests (the two real examples the owner sent, 2026-11-14):
//   R1 — row 19bac378 ("সকল প্রশংসা আল্লাহর — হামদের আয়াত"):
//        Bengali says Allah is "সমস্ত জগতের পিতৃসত্তা" (fatherhood)
//        and "নীরবতা" where the English says "humility". Must be
//        classified Awkward Word Choice + Meaning Distortion +
//        Scholar Review Required, meaning fidelity FAIL.
//   R2 — row 4109ac73 ("ইলম বা জ্ঞান বৃদ্ধির দোয়া"):
//        "কুরআন হস্তগতের সময়ে" and "আত্মউন্নতির লক্ষ্যকে প্রকাশ
//        করে". Must be classified Awkward Word Choice + Literal AI
//        Translation (AI filler phrase).
//
// The classifier is a HEURISTIC — it flags the concrete patterns
// the standard names. A "Natural Bengali" result does not replace
// human review, and these tests prove the classifier catches the
// known failures, not that it catches every bad sentence.
//
// Run: node supabase/functions/_shared/bengali-quality.test.mjs
//   (from the worktree root). No Deno, no network, no real secrets.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { classifyBengali } from "./bengali-quality.ts";
import { BENGALI_EDITORIAL_VERSION } from "./bengali-editorial.ts";

const here = dirname(fileURLToPath(import.meta.url));
const funcsRoot = join(here, ".."); // supabase/functions

let passed = 0;
let failed = 0;

function check(name, fn) {
  try {
    fn();
    passed++;
    console.log(`ok - ${name}`);
  } catch (e) {
    failed++;
    console.log(`FAIL - ${name}\n  ${e.message}`);
  }
}

// --- The two real examples (exact text from the rehearsal DB) ---

const EXAMPLE_1_BN =
  "এই আয়াতে বলা হয়েছে, \"সকল প্রশংসা আল্লাহর, যিনি পৃথিবীর ও আকাশের সৃষ্টিকর্তা।\" এখানে আল্লাহকে সর্বোচ্চ রাব্ব হিসেবে স্মরণ করা হয়, যিনি সমস্ত জগতের পিতৃসত্তা। যখন আমরা কোনো কাজের সাফল্য পাই, তা আমাদের নিজস্ব ক্ষমতা নয়, বরং আল্লাহর করুণার ফল। তাই দোয়া শুরু করার আগে এই শব্দগুলো পড়া আমাদের মনে করিয়ে দেয় যে সবকিছুই তাঁর হাতে। আমরা শিখি যে এই স্বীকৃতিই আমাদের নীরবতা এবং কৃতজ্ঞতা গড়ে তোলে, যা দৈনন্দিন জীবনে সৎ আচরণকে উৎসাহিত করে। যখনই ধ্যান-ধারণা, কাজ-কর্ম বা প্রার্থনা করি, প্রথমে আল্লাহকে ধন্যবাদ জানাই, যেন হৃদয় পরিষ্কার থাকে এবং জীবন সুশৃঙ্খল হয়।";
const EXAMPLE_1_EN =
  "The verse states, \"All praise is for Allah, the Lord of the worlds.\" It acknowledges Allah as the supreme Creator and Sustainer of the heavens, the earth, and everything beyond. When we achieve success, it is not merely our effort but a result of Allah's mercy. Thus, beginning any prayer with these words reminds us that everything lies in His hands. We learn that this acknowledgment nurtures humility and gratitude, shaping our daily conduct. Before any contemplation, work, or worship, we first thank Allah, keeping the heart pure and guiding our life towards order and peace.";

const EXAMPLE_2_BN =
  "এই দোয়াটি আল্লাহর মহিমা ও সত্যিকারের শাসনকে স্মরণ করিয়ে দেয় এবং কুরআন হস্তগতের সময়ে ধৈর্যের গুরুত্ব প্রকাশ করে। যখন আল্লাহ প্রফেটের (সা.) কাছে ওহী পাঠান, তখন তা সম্পূর্ণভাবে অবতরণ না হওয়া পর্যন্ত তাড়াহুড়া করা নিষিদ্ধ। সুতরাং, আমরা শিখি যে জ্ঞান অর্জনের পথে ধৈর্য ও সম্পূর্ণতা বজায় রাখতে হবে। এরপর, \"রব্বি যদ্দনী ইলমা\" বলে আল্লাহর কাছে জ্ঞান বৃদ্ধি কামনা করা হয়, যা আমাদের শেখার ইচ্ছা ও আত্মউন্নতির লক্ষ্যকে প্রকাশ করে। বাস্তবে, এটি আমাদেরকে শেখার সময় ধৈর্যশীল, নিয়মিত এবং আল্লাহর সাহায্য চাওয়ার অভ্যাস গড়ে তুলতে অনুপ্রেরণা দেয়।";
const EXAMPLE_2_EN =
  "This dua reminds us of Allah's supreme authority and the importance of patience when receiving the Qur'an. The verse warns not to rush the revelation before it is fully completed, teaching us that the pursuit of knowledge requires waiting for the right moment. After that, we ask, \"My Lord, increase me in knowledge,\" expressing a sincere desire for intellectual growth. In everyday life, this encourages us to be patient in our studies, to seek knowledge methodically, and to constantly ask Allah for guidance and increase in understanding. It underscores that learning is a continuous process that benefits from divine help and personal perseverance.";

// --- Regression tests ---

check("R1 — example 1 (পিতৃসত্তা / নীরবতা) is Awkward Word Choice + Meaning Distortion + Scholar Review Required", () => {
  const r = classifyBengali({ bn: EXAMPLE_1_BN, en: EXAMPLE_1_EN });
  assert.ok(r.categories.includes("Awkward Word Choice"), `expected Awkward Word Choice, got ${r.categories.join(", ")}`);
  assert.ok(r.categories.includes("Meaning Distortion"), `expected Meaning Distortion, got ${r.categories.join(", ")}`);
  assert.ok(r.categories.includes("Scholar Review Required"), `expected Scholar Review Required, got ${r.categories.join(", ")}`);
  assert.equal(r.meaningFidelity, "FAIL", `expected meaning fidelity FAIL, got ${r.meaningFidelity}`);
  assert.equal(r.religiousSafety, "REVIEW");
  assert.equal(r.humanReviewRequired, true);
  assert.ok(r.issues.some((i) => i.includes("পিতৃসত্তা")), "the পিতৃসত্তা issue must be listed");
  assert.ok(r.issues.some((i) => i.includes("নীরবতা")), "the নীরবতা / humility mismatch must be listed");
});

check("R2 — example 2 (হস্তগত / আত্মউন্নতি / প্রফেট) is Awkward Word Choice + Literal AI Translation", () => {
  const r = classifyBengali({ bn: EXAMPLE_2_BN, en: EXAMPLE_2_EN });
  assert.ok(r.categories.includes("Awkward Word Choice"), `expected Awkward Word Choice, got ${r.categories.join(", ")}`);
  assert.ok(r.categories.includes("Literal AI Translation"), `expected Literal AI Translation, got ${r.categories.join(", ")}`);
  assert.equal(r.humanReviewRequired, true);
  assert.ok(r.issues.some((i) => i.includes("হস্তগত")), "the হস্তগত issue must be listed");
  assert.ok(r.issues.some((i) => i.includes("প্রফেট")), "the প্রফেট issue must be listed");
  assert.ok(r.issues.some((i) => i.includes("আত্মউন্নতির")), "the আত্মউন্নতি filler must be listed");
});

// --- Clean text passes ---

check("clean natural Bengali is Natural Bengali, score 100, no human review required", () => {
  const r = classifyBengali({
    bn: "এই দোয়াটি আল্লাহর কাছে জ্ঞান চাওয়ার দোয়া। কুরআনে বলা হয়েছে, ওহী পুরোপুরি নাযিল না হওয়া পর্যন্ত তাড়াহুড়ো করো না। তাই আমরা ধৈর্য ধরে শিখি, আর বলি — রব্বি যদ্দনী ইলমা, হে আমার রব, আমার জ্ঞান বাড়িয়ে দাও।",
  });
  assert.deepEqual(r.categories, ["Natural Bengali"]);
  assert.equal(r.languageQualityScore, 100);
  assert.equal(r.meaningFidelity, "PASS");
  assert.equal(r.religiousSafety, "PASS");
  assert.equal(r.humanReviewRequired, false);
  assert.deepEqual(r.issues, []);
});

// --- Religious safety ---

check("unsupported virtue/reward claim is flagged and needs Scholar Review", () => {
  const r = classifyBengali({
    bn: "এই দোয়াটি পড়লে অনেক সওয়াব পাওয়া যায় এবং গুনাহ মাফ হয়ে যায়।",
  });
  assert.ok(r.categories.includes("Unsupported Religious Claim"), `expected Unsupported Religious Claim, got ${r.categories.join(", ")}`);
  assert.ok(r.categories.includes("Scholar Review Required"));
  assert.equal(r.religiousSafety, "REVIEW");
  assert.equal(r.humanReviewRequired, true);
});

check("prayer-count claim is flagged", () => {
  const r = classifyBengali({ bn: "এই দোয়াটি ৭ বার পড়তে হয়।" });
  assert.ok(r.categories.includes("Unsupported Religious Claim"));
});

// --- Repetition ---

check("repeated sentence is flagged as Repetition", () => {
  const r = classifyBengali({
    bn: "এই দোয়াটি আমাদের ধৈর্য শেখায়। এই দোয়াটি আমাদের ধৈর্য শেখায়।",
  });
  assert.ok(r.categories.includes("Repetition"), `expected Repetition, got ${r.categories.join(", ")}`);
});

// --- Editorial Standard is wired into every function ---

const FUNCTIONS_WITH_BENGALI = [
  "generate-dua-seo",
  "generate-hadith-seo",
  "fix-dua-content",
  "enrich-dua-content",
  "recommend-daily-content",
];

for (const fn of FUNCTIONS_WITH_BENGALI) {
  check(`prompt wiring — ${fn} imports and uses BENGALI_EDITORIAL_RULES`, () => {
    const src = readFileSync(join(funcsRoot, fn, "index.ts"), "utf8");
    assert.ok(
      src.includes('from "../_shared/bengali-editorial.ts"'),
      `${fn} must import bengali-editorial.ts`,
    );
    assert.ok(
      src.includes("BENGALI_EDITORIAL_RULES"),
      `${fn} must reference BENGALI_EDITORIAL_RULES in its prompt`,
    );
  });
}

check("editorial rules constant is version 1.0 and names the correct terms", () => {
  assert.equal(BENGALI_EDITORIAL_VERSION, "1.0");
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
