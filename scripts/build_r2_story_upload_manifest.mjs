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

function slugify(value) {
  return value
    .normalize("NFKC")
    .replace(/\.[^.]+$/, "")
    .replace(/\s*\(1\)\s*$/u, "")
    .replace(/Studio|Full/giu, "")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

for (const record of records) {
  const original = String(record.name || "").trim();
  const driveId = String(record.id || "").trim();
  if (!original || !driveId) continue;
  const ext = path.extname(original).toLowerCase();
  const contentType = ext === ".wav" ? "audio/wav" : ext === ".m4a" ? "audio/mp4" : ext === ".ogg" ? "audio/ogg" : "audio/mpeg";
  const base = slugify(original) || driveId;
  const occurrence = (seen.get(base) || 0) + 1;
  seen.set(base, occurrence);
  const suffix = occurrence === 1 ? "" : `-duplicate-${occurrence}`;
  const objectKey = `stories/${base}${suffix}${ext || ".mp3"}`;
  lines.push([driveId, original, objectKey, contentType].join("\t"));
}

fs.writeFileSync(outputPath, lines.join("\n") + "\n");
console.log(`Wrote ${lines.length} records to ${outputPath}`);
