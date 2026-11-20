/**
 * 8-Validation Autonomous Gate — canonical implementation (lib).
 *
 * Owner's Section 7 amendment (2026-11-15 ~23:03 IST, binding): content
 * is publishable WITHOUT owner review ONLY if ALL 8 mandatory
 * server-side validations pass. ANY failure -> Held/Quarantined, never
 * published.
 *
 *   (1) Islamic source & reference integrity
 *   (2) Arabic text integrity
 *   (3) Bengali translation & editorial quality
 *   (4) Misleading / fabricated religious claims detection
 *   (5) Content-visual consistency
 *   (6) Bengali readability & image quality
 *   (7) Duplicate content & duplicate publication prevention
 *   (8) Finalized asset integrity
 *
 * This is a PURE function: it takes the planned content (refs, Arabic,
 * Bengali, cards, poster asset, history) plus the LIVE rows it must be
 * verified against, and returns a structured verdict — per-validation
 * pass/fail + reason, and an overall PASS (publish) / HOLD. No I/O, no
 * network, no secrets, no AI calls. Each validation is independently
 * testable (evaluateAutonomousGate runs all eight; the per-validation
 * evaluators are exported for single-validation tests).
 *
 * FAIL-CLOSED (never a silent skip): a validation that cannot be
 * verified from the inputs FAILS. In particular:
 *  - liveHadith null, or a dua card whose slug has no live row -> the
 *    ref/verbatim checks (V1/V2/V3) cannot run -> those validations FAIL.
 *  - posterBaseUrl empty -> the poster URL check (V8) cannot run -> V8 FAILS.
 *  - hadithCycle / cardCycle null -> the cycle windows (V7) cannot be
 *    checked -> V7 FAILS.
 *  - poster_qc_status anything but "passed" -> V5/V6 FAIL (the render's
 *    QC evidence is the only evidence; there is no re-render here).
 *
 * Design notes (each is a deliberate, measured decision — see report):
 *  - V2/V3 verbatim: the card text must equal the live row's text
 *    character-for-character. That IS the integrity check; no separate
 *    Arabic/Bengali script test (it adds nothing once verbatim holds,
 *    and it would fail the synthetic test fixtures).
 *  - V3 meaning: fails ONLY on meaning-level failure
 *    (classifyBengali meaningFidelity === "FAIL" — the পিতৃসত্তা /
 *    bn-en mismatch shapes). Soft issues (Literal AI Translation,
 *    Repetition, AI filler) are recorded as warnings, never blocking.
 *    Measured on the 218 bundled duas: 0 false-fails.
 *  - V4 claim scan: a claim-pattern hit FAILS only when the matched
 *    word does NOT appear in the corresponding live source text
 *    (introduced in transit). A hit whose word is in the live source
 *    text is the source's own wording -> noted, pass. V4 does NOT
 *    re-adjudicate corpus provenance (the 93 virtue fields / Row
 *    19bac378 are Phase 9's job, owner-blocked) — documented as a
 *    partial, not a silent skip.
 *  - V5 publish-time scope: does NOT re-run the full checkVisualQC
 *    (semantic score + safety). The semantic score is a pure function
 *    of (card, topic, concept, scene) — unchanged since the render
 *    unless the cards changed (caught by V1/V2/V3 verbatim) or the
 *    history changed; safety is a static property of the catalog
 *    scene. Re-running them adds no new information. The render's QC
 *    evidence is consumed via poster_qc_status === "passed". V5
 *    re-checks what CAN go stale after the render: the topic match
 *    (classify the stored cards now, match against the stored scene)
 *    and the similarity windows (history rebuilt now, so a late poster
 *    run for an old date is caught), plus a classification-independent
 *    direct scene-window guard (any published row with the same scene
 *    inside 14 days blocks, even if its history entry was dropped by
 *    a classification miss).
 *  - V6: fit is render-time evidence only (the poster QC enforced it;
 *    the row carries no fit measurement) — V6 consumes
 *    poster_qc_status === "passed" and checks the push title/body are
 *    non-empty. Documented, not hidden.
 *  - V7 mirrors the planner's cycle logic exactly (edge index.ts
 *    planDay): hadith reuse = same hadith_ref in a published row of
 *    the same hadith_cycle; card reuse = same recordRef in a published
 *    row of the same card_cycle; plus no published row for this date.
 *  - V8 re-validates the STORED poster fields with set_poster's
 *    validators (URL date+format, asset ID, storage path, 64-hex
 *    checksum, urls/checksums maps, scene slug, generatedAt present
 *    and dated today) — the same validators, not a weaker copy.
 *
 * Edge port: supabase/functions/daily-content/index.ts carries a
 * VERBATIM port of this file (same evaluators, same verdict shape).
 * The lib file is canonical; the port is mechanical. A parity test
 * (lib gate vs edge gate on identical fixtures must agree exactly)
 * guards drift.
 */
import {
  checkVisualSimilarity,
  classifyHadith,
  conceptsForTopic,
  contentVisualMatch,
  evaluateSafetyGate,
  SELECTION_WINDOWS,
  type ValidationId,
} from "./visualConceptEngine.js";
import {
  buildHadithInput,
  buildHistoryEntries,
} from "./visualSelection.js";
import {
  classifyBengali,
  RELIGIOUS_CLAIM_PATTERNS,
} from "./bengaliQuality.js";
import type { CardPayload, HadithRecord } from "./types.js";

/* ------------------------------------------------------------------ */
/* Input / output shapes                                               */
/* ------------------------------------------------------------------ */

/** One stored card (the subset the gate reads; the stored row carries the full CardPayload). */
export type GateCardInput = {
  kind: string;
  recordRef: string;
  arabic: string;
  bengali: string;
  sourceLine: string | null;
};

/** One live `hadiths` row (the hadith slot's source of truth). */
export type GateLiveHadith = {
  id: string;
  book_key: string;
  chapter_id: number | null;
  hadith_number: number;
  arabic: string;
  bengali: string | null;
  english?: string | null;
};

/** One live `admin_content` row (a dua/content slot's source of truth). */
export type GateLiveDua = {
  slug: string;
  title: string | null;
  content: string | null;
  content_arabic: string | null;
  metadata: { reference?: string | null; source?: string | null; source_type?: string | null } | null;
  status: string;
  content_type: string;
};

/** The stored poster fields (the subset the gate re-validates). */
export type GatePosterInput = {
  url: string | null;
  urls?: Record<string, unknown> | null;
  assetId: string | null;
  storagePath: string | null;
  checksum: string | null;
  checksums?: Record<string, unknown> | null;
  sceneId: string | null;
  qcStatus: string | null;
  generatedAt: string | null;
};

/** One published publication row (history for V5 + V7). */
export type GateHistoryRow = {
  kolkata_date: string;
  hadith_ref: string | null;
  cards: unknown;
  poster_scene_id: string | null;
  hadith_cycle: number | null;
  card_cycle: number | null;
};

export type GateInput = {
  kolkataDate: string;
  hadithRef: string | null;
  hadithSourceLine: string | null;
  cards: GateCardInput[];
  push: { title: string; body: string } | null;
  poster: GatePosterInput;
  /** Null = the live hadith could not be fetched -> V1/V2/V3 FAIL (fail-closed). */
  liveHadith: GateLiveHadith | null;
  /** By slug. A dua card whose slug is absent here -> V1/V2/V3 FAIL (fail-closed). */
  liveDuas: Map<string, GateLiveDua> | Record<string, GateLiveDua>;
  /** Published rows (any date); the gate excludes today itself. */
  history: GateHistoryRow[];
  /** History rows' hadith records (chapter_id + English) for the
   *  history rebuild; without them classification is card-only. */
  historyRecords?: ReadonlyMap<string, { chapter_id: number | null; english: string | null }>;
  /** The row's cycle numbers (planner-assigned). Null -> V7 FAILS (fail-closed). */
  hadithCycle: number | null;
  cardCycle: number | null;
  /** Base URL for the poster-URL check (the project's SUPABASE_URL).
   *  Empty -> V8 FAILS (fail-closed). */
  posterBaseUrl: string;
};

export type GateValidationResult = {
  id: ValidationId;
  pass: boolean;
  /** Machine-readable detail (the failing reason, or the passing evidence). */
  detail: string;
  /** Soft issues — recorded, never blocking. */
  warnings: string[];
};

export type GateVerdict = {
  decision: "publish" | "hold";
  results: GateValidationResult[];
  failed: ValidationId[];
  reasons: string[];
};

/* ------------------------------------------------------------------ */
/* Poster validators — port of the edge's set_poster validators        */
/* (index.ts isValidPosterUrl / isValidChecksum / POSTER_FORMATS).     */
/* The URL check is parameterized by the base URL (the edge passes     */
/* SUPABASE_URL); the shape rules are identical.                       */
/* ------------------------------------------------------------------ */

export const POSTER_FORMATS = ["portrait", "square", "wide", "story"] as const;

export function isValidPosterUrl(value: unknown, kolkataDate: string, baseUrl: string): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > 500) return false;
  if (!baseUrl) return false;
  const prefix = `${baseUrl}/storage/v1/object/public/daily-content-posters/`;
  if (!value.startsWith(prefix)) return false;
  const rest = value.slice(prefix.length);
  return POSTER_FORMATS.some((f) => rest === `${kolkataDate}/${f}.png`);
}

export function isValidChecksum(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
}

/** Kolkata date (YYYY-MM-DD) of an ISO timestamp — same algorithm as
 *  the edge's kolkataDateString (Intl, Asia/Kolkata). */
export function kolkataDateOf(iso: string): string | null {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(at);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const y = get("year");
  const m = get("month");
  const d = get("day");
  if (!y || !m || !d) return null;
  return `${y}-${m}-${d}`;
}

/* ------------------------------------------------------------------ */
/* Shared helpers                                                      */
/* ------------------------------------------------------------------ */

const hasText = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;

const ok = (id: ValidationId, detail: string, warnings: string[] = []): GateValidationResult => ({ id, pass: true, detail, warnings });
const fail = (id: ValidationId, detail: string, warnings: string[] = []): GateValidationResult => ({ id, pass: false, detail, warnings });

function parseHadithRef(ref: string | null): string | null {
  if (typeof ref !== "string") return null;
  const m = /^hadith:([A-Za-z0-9-]+)$/.exec(ref);
  return m ? m[1] : null;
}

function parseContentRef(ref: string): string | null {
  const m = /^content:([A-Za-z0-9-]+)$/.exec(ref);
  return m ? m[1] : null;
}

function liveDuaFor(liveDuas: GateInput["liveDuas"], slug: string): GateLiveDua | null {
  if (liveDuas instanceof Map) return liveDuas.get(slug) ?? null;
  return (liveDuas as Record<string, GateLiveDua>)[slug] ?? null;
}

/** The live row a card must be verbatim against (hadith card -> live
 *  hadith; content card -> live dua). Null when the live row is missing. */
function liveRowForCard(
  card: GateCardInput,
  input: GateInput,
): { arabic: string; bengali: string; english?: string | null } | null {
  if (card.recordRef.startsWith("hadith:")) {
    const h = input.liveHadith;
    if (!h) return null;
    return { arabic: h.arabic, bengali: h.bengali ?? "", english: h.english ?? null };
  }
  const slug = parseContentRef(card.recordRef);
  if (slug === null) return null;
  const d = liveDuaFor(input.liveDuas, slug);
  if (!d) return null;
  return { arabic: d.content_arabic ?? "", bengali: d.content ?? "" };
}

/* ------------------------------------------------------------------ */
/* V1 — Islamic source & reference integrity                           */
/* ------------------------------------------------------------------ */

export function evalSourceReferenceIntegrity(input: GateInput): GateValidationResult {
  const id: ValidationId = "source_reference_integrity";
  const cards = Array.isArray(input.cards) ? input.cards : [];
  if (cards.length < 1 || cards.length > 5) {
    return fail(id, `cards must be 1-5, got ${cards.length}`);
  }
  const hadithCards = cards.filter((c) => c.recordRef.startsWith("hadith:"));
  if (hadithCards.length !== 1) {
    return fail(id, `exactly one hadith card required, got ${hadithCards.length}`);
  }
  const contentCards = cards.filter((c) => c.recordRef.startsWith("content:"));
  if (hadithCards.length + contentCards.length !== cards.length) {
    return fail(id, "every card must be hadith:<id> or content:<slug>");
  }
  const refs = cards.map((c) => c.recordRef);
  if (new Set(refs).size !== refs.length) {
    return fail(id, `duplicate card refs: ${refs.join(", ")}`);
  }
  const hadithId = parseHadithRef(input.hadithRef);
  if (hadithId === null) {
    return fail(id, `hadith_ref malformed: ${JSON.stringify(input.hadithRef)}`);
  }
  const hadithCard = hadithCards[0];
  if (hadithCard.recordRef !== input.hadithRef) {
    return fail(id, `hadith card ref ${hadithCard.recordRef} != hadith_ref ${input.hadithRef}`);
  }
  if (hadithCard.kind !== "hadith") {
    return fail(id, `hadith card kind must be "hadith", got ${JSON.stringify(hadithCard.kind)}`);
  }
  for (const c of contentCards) {
    if (c.kind !== "dua" && c.kind !== "quran" && c.kind !== "hadith") {
      return fail(id, `content card ${c.recordRef} kind must be dua/quran/hadith, got ${JSON.stringify(c.kind)}`);
    }
  }
  // The hadith card's source line must match the row's, and both must
  // match the live record's book + number (the corpus is Bukhari-only;
  // any other book fails closed until the gate learns it).
  if (!hasText(hadithCard.sourceLine) || hadithCard.sourceLine !== input.hadithSourceLine) {
    return fail(id, "hadith card sourceLine does not match the row's hadith_source_line");
  }
  const live = input.liveHadith;
  if (!live) {
    return fail(id, `live hadith ${hadithId} not found — cannot verify refs (fail-closed)`);
  }
  if (live.id !== hadithId) {
    return fail(id, `live hadith id ${live.id} != ref id ${hadithId}`);
  }
  if (!hasText(live.arabic) || !hasText(live.bengali)) {
    return fail(id, `live hadith ${hadithId} is ineligible (empty Arabic or Bengali)`);
  }
  if (live.book_key !== "bukhari") {
    return fail(id, `live hadith ${hadithId} book_key ${JSON.stringify(live.book_key)} is not bukhari — unknown book (fail-closed)`);
  }
  const expectedSourceLine = `Sahih al-Bukhari, Hadith ${live.hadith_number}`;
  if (input.hadithSourceLine !== expectedSourceLine) {
    return fail(id, `hadith_source_line ${JSON.stringify(input.hadithSourceLine)} != expected ${JSON.stringify(expectedSourceLine)}`);
  }
  for (const c of contentCards) {
    const slug = parseContentRef(c.recordRef);
    if (slug === null) return fail(id, `content card ref malformed: ${c.recordRef}`);
    const d = liveDuaFor(input.liveDuas, slug);
    if (!d) {
      return fail(id, `live dua ${slug} not found — cannot verify refs (fail-closed)`);
    }
    if (d.status !== "published") {
      return fail(id, `live dua ${slug} status ${JSON.stringify(d.status)} != published`);
    }
    if (typeof d.content_type !== "string" || d.content_type.toLowerCase() !== "dua") {
      return fail(id, `live dua ${slug} content_type ${JSON.stringify(d.content_type)} != dua`);
    }
    const reference = d.metadata?.reference ?? d.metadata?.source ?? null;
    if (!hasText(d.content) || !hasText(d.content_arabic) || !hasText(reference)) {
      return fail(id, `live dua ${slug} is ineligible (empty content, Arabic, or reference)`);
    }
  }
  return ok(id, `hadith ${input.hadithRef} + ${contentCards.length} content card(s) resolve in the live pools; source line ${expectedSourceLine}`);
}

/* ------------------------------------------------------------------ */
/* V2 — Arabic text integrity (verbatim vs the live row)               */
/* ------------------------------------------------------------------ */

export function evalArabicIntegrity(input: GateInput): GateValidationResult {
  const id: ValidationId = "arabic_integrity";
  for (const card of input.cards) {
    if (!hasText(card.arabic)) {
      return fail(id, `card ${card.recordRef} has empty Arabic`);
    }
    const live = liveRowForCard(card, input);
    if (!live) {
      return fail(id, `card ${card.recordRef} has no live row to verify Arabic against (fail-closed)`);
    }
    if (card.arabic !== live.arabic) {
      return fail(id, `card ${card.recordRef} Arabic differs from the live row (introduced in transit)`);
    }
  }
  return ok(id, `${input.cards.length} card(s) Arabic verbatim vs live rows`);
}

/* ------------------------------------------------------------------ */
/* V3 — Bengali translation & editorial quality                        */
/* ------------------------------------------------------------------ */

export function evalBengaliEditorialQuality(input: GateInput): GateValidationResult {
  const id: ValidationId = "bengali_editorial_quality";
  const warnings: string[] = [];
  for (const card of input.cards) {
    if (!hasText(card.bengali)) {
      return fail(id, `card ${card.recordRef} has empty Bengali`);
    }
    const live = liveRowForCard(card, input);
    if (!live) {
      return fail(id, `card ${card.recordRef} has no live row to verify Bengali against (fail-closed)`);
    }
    if (card.bengali !== live.bengali) {
      return fail(id, `card ${card.recordRef} Bengali differs from the live row (introduced in transit)`);
    }
    const result = classifyBengali({ bn: card.bengali, en: live.english ?? undefined });
    if (result.meaningFidelity === "FAIL") {
      return fail(id, `card ${card.recordRef} meaning failure: ${result.issues.join(" | ")}`);
    }
    if (result.issues.length > 0) {
      warnings.push(`${card.recordRef}: ${result.issues.join(" | ")}`);
    }
    if (!live.english) {
      warnings.push(`${card.recordRef}: no English parallel — bn/en mismatch check not run`);
    }
  }
  return ok(id, `${input.cards.length} card(s) Bengali verbatim vs live rows; no meaning failure`, warnings);
}

/* ------------------------------------------------------------------ */
/* V4 — misleading / fabricated religious claims detection             */
/*                                                                     */
/* Scans every published Bengali word (all cards + push title/body)    */
/* for the claim patterns. A hit FAILS only when the matched word      */
/* does NOT appear in the live source text (introduced in transit);    */
/* a hit whose word is in the live source text is the source's own     */
/* wording -> noted, pass.                                             */
/* ------------------------------------------------------------------ */

export function evalFabricatedClaimsDetection(input: GateInput): GateValidationResult {
  const id: ValidationId = "fabricated_claims_detection";
  // The live source wording for this publication (all cards' live Bengali).
  const liveTexts: string[] = [];
  for (const card of input.cards) {
    const live = liveRowForCard(card, input);
    if (!live) {
      return fail(id, `card ${card.recordRef} has no live row to discriminate claim wording against (fail-closed)`);
    }
    liveTexts.push(live.bengali);
  }
  const texts: Array<{ where: string; text: string }> = input.cards.map((c) => ({ where: `card ${c.recordRef}`, text: c.bengali }));
  if (input.push) {
    texts.push({ where: "push title", text: input.push.title });
    texts.push({ where: "push body", text: input.push.body });
  }
  const noted: string[] = [];
  for (const { where, text } of texts) {
    if (!text) continue;
    for (const { re, label } of RELIGIOUS_CLAIM_PATTERNS) {
      const m = re.exec(text);
      if (!m) continue;
      const matched = m[0];
      if (liveTexts.some((live) => live.includes(matched))) {
        noted.push(`${where}: "${matched}" is the live source's own wording (${label}) — noted, pass`);
      } else {
        return fail(id, `${where}: claim pattern hit "${matched}" (${label}) not present in any live source text — introduced in transit`);
      }
    }
  }
  return ok(
    id,
    noted.length > 0
      ? `${noted.length} claim-pattern hit(s), all source wording: ${noted.join(" | ")}`
      : "no claim-pattern hits in cards or push",
  );
}

/* ------------------------------------------------------------------ */
/* V5 — content-visual consistency                                     */
/* ------------------------------------------------------------------ */

export function evalContentVisualConsistency(input: GateInput): GateValidationResult {
  const id: ValidationId = "content_visual_consistency";
  const poster = input.poster;
  if (poster.qcStatus !== "passed") {
    return fail(id, `poster_qc_status ${JSON.stringify(poster.qcStatus)} != passed — no render QC evidence`);
  }
  const hadithCard = input.cards.find((c) => c.recordRef.startsWith("hadith:"));
  if (!hadithCard) {
    return fail(id, "no hadith card to classify");
  }
  if (!hasText(poster.sceneId)) {
    return fail(id, "poster_scene_id is empty");
  }
  const sceneId = poster.sceneId as string;
  // Build the engine input from the stored card + the live hadith
  // record (chapter + English when available), exactly as the poster
  // path does.
  const live = input.liveHadith;
  const cardPayload = {
    kind: hadithCard.kind,
    recordRef: hadithCard.recordRef,
    title: "",
    arabic: hadithCard.arabic,
    bengali: hadithCard.bengali,
    sourceLine: hadithCard.sourceLine ?? "",
    canonicalLink: "",
    altText: "",
    caption: "",
    pronunciation: null,
    pronunciationStatus: "missing",
  } as unknown as CardPayload;
  const record = live
    ? ({ id: live.id, book_key: live.book_key, chapter_id: live.chapter_id, hadith_number: live.hadith_number, arabic: live.arabic, bengali: live.bengali, english: live.english ?? null } as HadithRecord)
    : null;
  const engineInput = buildHadithInput(cardPayload, record);
  const classification = classifyHadith(engineInput);
  const topicId = classification.topicId;
  if (!contentVisualMatch(topicId, sceneId)) {
    return fail(id, `scene ${sceneId} does not belong to topic ${topicId} (classified ${classification.method}: ${classification.reasoning.join(" | ")})`);
  }
  const concept = conceptsForTopic(topicId).find((c) => c.sceneId === sceneId);
  if (!concept) {
    return fail(id, `no concept in topic ${topicId} uses scene ${sceneId}`);
  }
  const historyRows = (input.history ?? []).filter((r) => r.kolkata_date !== input.kolkataDate);
  const entries = buildHistoryEntries(
    historyRows.map((r) => ({ kolkata_date: r.kolkata_date, hadith_ref: r.hadith_ref, cards: r.cards, poster_scene_id: r.poster_scene_id })),
    input.kolkataDate,
    input.historyRecords,
  );
  const similarity = checkVisualSimilarity(
    { sceneId, conceptId: concept.id, topicId },
    entries,
    input.kolkataDate,
  );
  if (similarity.blocked) {
    return fail(id, `visual repetition: ${similarity.warnings.join(" | ")}`);
  }
  // Classification-independent scene guard: the scene window reads the
  // DB scene id directly, so a history entry dropped by a
  // classification miss cannot hide a reuse.
  const dayMs = 86_400_000;
  const todayMs = Date.parse(`${input.kolkataDate}T00:00:00Z`);
  for (const r of historyRows) {
    if (r.poster_scene_id !== sceneId) continue;
    const gap = Math.round((todayMs - Date.parse(`${r.kolkata_date}T00:00:00Z`)) / dayMs);
    if (gap >= 0 && gap <= SELECTION_WINDOWS.sceneReuseDays) {
      return fail(id, `scene ${sceneId} was used ${gap === 0 ? "today" : `${gap} day(s) ago`} (${r.kolkata_date}) — inside the ${SELECTION_WINDOWS.sceneReuseDays}-day window; BLOCKED`);
    }
  }
  const warnings = [...similarity.warnings];
  return ok(id, `topic ${topicId} (${classification.method}) matches scene ${sceneId} (concept ${concept.id}); similarity windows clear`, warnings);
}

/* ------------------------------------------------------------------ */
/* V6 — Bengali readability & image quality                            */
/*                                                                     */
/* Fit is render-time evidence only: the poster QC enforced it and     */
/* the row carries no fit measurement, so V6 consumes                  */
/* poster_qc_status === "passed" (the render's full QC passed for     */
/* these cards) and checks the push text is present.                   */
/* ------------------------------------------------------------------ */

export function evalBengaliReadabilityImageQuality(input: GateInput): GateValidationResult {
  const id: ValidationId = "bengali_readability_image_quality";
  if (input.poster.qcStatus !== "passed") {
    return fail(id, `poster_qc_status ${JSON.stringify(input.poster.qcStatus)} != passed — no render QC evidence`);
  }
  if (input.cards.length < 1) {
    return fail(id, "no cards to render");
  }
  if (!input.push || !hasText(input.push.title) || !hasText(input.push.body)) {
    return fail(id, "push title/body empty — nothing readable to send");
  }
  return ok(id, "poster QC passed for these cards; push title/body present (fit is render-time evidence)");
}

/* ------------------------------------------------------------------ */
/* V7 — duplicate content & duplicate publication prevention           */
/* (mirrors the planner's cycle logic exactly)                         */
/* ------------------------------------------------------------------ */

export function evalDuplicatePrevention(input: GateInput): GateValidationResult {
  const id: ValidationId = "duplicate_prevention";
  if (input.hadithCycle === null || input.cardCycle === null) {
    return fail(id, "hadith_cycle / card_cycle missing — cycle windows cannot be checked (fail-closed)");
  }
  const history = input.history ?? [];
  for (const r of history) {
    if (r.kolkata_date === input.kolkataDate && r.hadith_ref) {
      return fail(id, `a published row already exists for ${input.kolkataDate} (duplicate publication)`);
    }
  }
  const hadithCycle = input.hadithCycle;
  const cardCycle = input.cardCycle;
  for (const r of history) {
    if ((r.hadith_cycle ?? 1) === hadithCycle && r.hadith_ref === input.hadithRef) {
      return fail(id, `hadith ${input.hadithRef} already published in hadith_cycle ${hadithCycle} (${r.kolkata_date})`);
    }
  }
  const refs = new Set(input.cards.map((c) => c.recordRef));
  for (const r of history) {
    if ((r.card_cycle ?? 1) !== cardCycle) continue;
    const cards = Array.isArray(r.cards) ? (r.cards as Array<{ recordRef?: unknown }>) : [];
    for (const c of cards) {
      if (typeof c.recordRef === "string" && refs.has(c.recordRef)) {
        return fail(id, `card ${c.recordRef} already published in card_cycle ${cardCycle} (${r.kolkata_date})`);
      }
    }
  }
  return ok(id, `no duplicate publication for ${input.kolkataDate}; hadith + ${refs.size} card(s) unused in cycles ${hadithCycle}/${cardCycle}`);
}

/* ------------------------------------------------------------------ */
/* V8 — finalized asset integrity (set_poster's validators, re-run)    */
/* ------------------------------------------------------------------ */

export function evalFinalizedAssetIntegrity(input: GateInput): GateValidationResult {
  const id: ValidationId = "finalized_asset_integrity";
  const p = input.poster;
  const date = input.kolkataDate;
  if (!input.posterBaseUrl) {
    return fail(id, "poster base URL not configured — URL cannot be verified (fail-closed)");
  }
  if (!isValidPosterUrl(p.url, date, input.posterBaseUrl)) {
    return fail(id, `poster_url is not a daily-content-posters URL for ${date} and a known format`);
  }
  if (p.urls !== undefined && p.urls !== null) {
    if (typeof p.urls !== "object" || Array.isArray(p.urls)) {
      return fail(id, "poster_urls must be an object");
    }
    for (const [format, url] of Object.entries(p.urls)) {
      if (!(POSTER_FORMATS as readonly string[]).includes(format) || !isValidPosterUrl(url, date, input.posterBaseUrl)) {
        return fail(id, `poster_urls[${format}] is not a valid poster URL`);
      }
    }
  }
  if (typeof p.sceneId !== "string" || !/^[a-z0-9-]{1,64}$/.test(p.sceneId)) {
    return fail(id, "poster_scene_id must be a lowercase slug");
  }
  if (p.assetId !== `poster:${date}`) {
    return fail(id, `poster_asset_id must be poster:${date}`);
  }
  if (p.storagePath !== `daily-content-posters/${date}/portrait.png`) {
    return fail(id, `poster_storage_path must be daily-content-posters/${date}/portrait.png`);
  }
  if (!isValidChecksum(p.checksum)) {
    return fail(id, "poster_checksum must be a SHA-256 hex string");
  }
  if (p.checksums !== undefined && p.checksums !== null) {
    if (typeof p.checksums !== "object" || Array.isArray(p.checksums)) {
      return fail(id, "poster_checksums must be an object");
    }
    for (const [format, sum] of Object.entries(p.checksums)) {
      if (!(POSTER_FORMATS as readonly string[]).includes(format) || !isValidChecksum(sum)) {
        return fail(id, `poster_checksums[${format}] must be a SHA-256 hex string`);
      }
    }
  }
  if (!hasText(p.generatedAt)) {
    return fail(id, "poster_generated_at is missing");
  }
  const generatedDate = kolkataDateOf(p.generatedAt as string);
  if (generatedDate === null) {
    return fail(id, "poster_generated_at is not a valid timestamp");
  }
  if (generatedDate !== date) {
    return fail(id, `poster_generated_at is dated ${generatedDate}, not ${date}`);
  }
  return ok(id, `poster ${p.assetId} validated: URL, storage path, checksum, scene ${p.sceneId}, generated ${date}`);
}

/* ------------------------------------------------------------------ */
/* The gate — all eight, combined by the engine's evaluateSafetyGate   */
/*                                                                     */
/* The inputs are NORMALIZED first: a stored row with a corrupt card   */
/* (missing recordRef / non-string text) or a missing poster object    */
/* must HOLD, never throw. A gate that crashes on malformed input is   */
/* not fail-closed — it is a 500, and the heal tick would misread it.  */
/* ------------------------------------------------------------------ */

/** One stored card, coerced to the gate's shape (missing fields -> ""). */
function normalizeGateCard(card: unknown): GateCardInput {
  const c = (card ?? {}) as Record<string, unknown>;
  return {
    kind: typeof c.kind === "string" ? c.kind : "",
    recordRef: typeof c.recordRef === "string" ? c.recordRef : "",
    arabic: typeof c.arabic === "string" ? c.arabic : "",
    bengali: typeof c.bengali === "string" ? c.bengali : "",
    sourceLine: typeof c.sourceLine === "string" ? c.sourceLine : null,
  };
}

export function evaluateAutonomousGate(input: GateInput): GateVerdict {
  const safe: GateInput = {
    ...input,
    cards: (Array.isArray(input.cards) ? input.cards : []).map(normalizeGateCard),
    poster: input.poster ?? {
      url: null, urls: null, assetId: null, storagePath: null,
      checksum: null, checksums: null, sceneId: null, qcStatus: null, generatedAt: null,
    },
    history: input.history ?? [],
  };
  const results: GateValidationResult[] = [
    evalSourceReferenceIntegrity(safe),
    evalArabicIntegrity(safe),
    evalBengaliEditorialQuality(safe),
    evalFabricatedClaimsDetection(safe),
    evalContentVisualConsistency(safe),
    evalBengaliReadabilityImageQuality(safe),
    evalDuplicatePrevention(safe),
    evalFinalizedAssetIntegrity(safe),
  ];
  const combined = evaluateSafetyGate(results.map((r) => ({ id: r.id, pass: r.pass, detail: r.detail })));
  if (combined.decision === "publish") {
    return { decision: "publish", results, failed: [], reasons: [] };
  }
  return { decision: "hold", results, failed: combined.failed, reasons: combined.reasons };
}
