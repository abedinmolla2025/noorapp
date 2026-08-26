import fs from "node:fs";
import path from "node:path";

const [, , inputPath, outputPath] = process.argv;
if (!inputPath || !outputPath) {
  console.error("Usage: node build_r2_story_upload_manifest.mjs input.json output.tsv");
  process.exit(1);
}

const records = JSON.parse(fs.readFileSync(inputPath, "utf8"));
const seen = new Map();
const lines = [];
const unmatched = [];

const rules = [
  ["আনাস_ইবনে_মালিক", "legacy-servant-anas-ibn-islam"],
  ["আবু_উবাইদাহ", "abu-ubaidah-ibn-al-islam"],
  ["আবু_বকর_রা_ও_সওর_গুহা", "abu-bakr-siddiq-companion-cave-islam"],
  ["আবু_বকর_(রা", "second-two-abu-bakr-islam"],
  ["আবু_হুরায়রা", "abu-hurairah-father-of-kittens"],
  ["আয়েশা_রা_পবিত্রতা", "radiance-innocence-incident-ifk-islam"],
  ["আরাফাতের_দিন", "yawm-al-arafah-day-of-forgiveness"],
  ["আলী_রা_ও_খায়বার", "ali-ibn-abi-talib-bravery-islam"],
  ["আলী_রা_সাহসিকতা", "sacrifice-youth-ali-ibn-islam"],
  ["আশুরা_ও_মুসা", "ashura-muharram-musa-victory"],
  ["আসহাবে_উখদুদ", "people-ditch-steadfast-faith-islam"],
  ["আসহাবে_কাহাফ", "people-of-cave-story-islam"],
  ["ইউনুস_(আ", "prophet-yunus-whale-story-detailed"],
  ["ইবনে_আব্বাস", "abdullah-ibn-abbas-knowledge-islam"],
  ["ইব্রাহিম_আ_ও_আগুন", "prophet-ibrahim-fire-story-islam"],
  ["ইব্রাহিম_(আ", "prophet-ibrahim-story-islam"],
  ["ইসরা_ও_মিরাজ", "isra-miraj-night-journey"],
  ["ঈদুল_আযহা", "eid-ul-adha-sacrifice-ibrahim"],
  ["ঈদুল_ফিতর", "eid-ul-fitr-reward-ramadan"],
  ["ঈদে_মিলাদুন্নবী", "mawlid-al-nabi-birth-mercy"],
  ["উমর_ইবনুল_খাত্তাব", "umar-ibn-khattab-story-islam"],
  ["কাব_ইবনে_মালিক", "triumph-truth-repentance-ka-islam"],
  ["কিবলা_পরিবর্তনের", "transformation-direction-divine-sovereignty-islam"],
  ["খন্দকের_যুদ্ধে", "prophet-muhammad-miracle-food-trench"],
  ["খাদিজা_বিনতে", "khadija-bint-khuwaylid-support-islam"],
  ["খেজুর_গাছের_কান্নার", "prophet-muhammad-crying-palm-tree"],
  ["গাদীরে_খুমের", "ghadir-khumm-declaration-leadership"],
  ["চন্দ্র_দ্বিখণ্ডিতকরণের", "prophet-muhammad-splitting-moon"],
  ["জুরাইজ_ও_অলৌকিক", "devotion-trial-jurayj-lesson-islam"],
  ["তায়েফের_সফর", "prophet-muhammad-journey-taif"],
  ["নূহ_আ_ও_মহাপ্লাবন", "prophet-nuh-ark-story-islam"],
  ["প্রথম_ওহী_লাভ", "prophet-muhammad-first-revelation"],
  ["বদরের_ঐতিহাসিক", "battle-badr-preparation-supplication-islam"],
  ["বিদায়_হজের_ঐতিহাসিক", "farewell-pilgrimage-perfection-faith-islam"],
  ["বিদায়_হজের_ভাষণ", "prophet-muhammad-farewell-sermon"],
  ["বিলাল_ইবনে_রাবাহ_রা_ঈমানের", "bilal-ibn-rabah-steadfast-islam"],
  ["বিলাল_ইবনে_রাবাহ", "bilal-ibn-rabah-ra-islam"],
  ["মক্কা_বিজয়_ও_সাধারণ_ক্ষমা", "prophet-muhammad-conquest-makkah-mercy"],
];

function findSlug(name) {
  const rule = rules.find(([needle]) => name.includes(needle));
  return rule?.[1] ?? null;
}

for (const record of records) {
  const original = String(record.name || "").trim();
  const driveId = String(record.id || "").trim();
  if (!original || !driveId) continue;
  const slug = findSlug(original);
  if (!slug) {
    unmatched.push(original);
    continue;
  }
  const ext = path.extname(original).toLowerCase() || ".mp3";
  const contentType = ext === ".wav" ? "audio/wav" : ext === ".m4a" ? "audio/mp4" : ext === ".ogg" ? "audio/ogg" : "audio/mpeg";
  const occurrence = (seen.get(slug) || 0) + 1;
  seen.set(slug, occurrence);
  const suffix = occurrence === 1 ? "" : `-duplicate-${occurrence}`;
  const objectKey = `stories/${slug}${suffix}${ext}`;
  lines.push([driveId, original, objectKey, contentType].join("\t"));
}

if (unmatched.length) {
  console.error(`Unmatched audio records: ${unmatched.length}`);
  for (const name of unmatched) console.error(name);
  process.exit(2);
}

fs.writeFileSync(outputPath, lines.join("\n") + "\n");
console.log(`Wrote ${lines.length} records to ${outputPath}`);
