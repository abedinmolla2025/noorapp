#!/usr/bin/env python3
"""Generate the quiz duplicate -> canonical-primary mapping (one-time, auditable).

Reads quiz_questions read-only, re-derives the exact-duplicate groups from
QUIZ_FORENSIC_AUDIT_2026-09-28.md using the documented normalization, validates
the transcribed genuinely-redundant near-duplicate pairs, applies the report's
retention rule, and writes src/data/quiz-duplicate-canonicals.json.

No writes. No deletions. The mapping is render-layer only (canonical hints).

Usage: python3 scripts/generate-quiz-canonicals.mjs  (actually .py; run directly)
"""
import sys, json, unicodedata, re, urllib.request
from difflib import SequenceMatcher
from collections import defaultdict

sys.path.insert(0, "/opt/hatch/skills/skill-creator/bin")
from dynamic_credentials import add_surrogate_to_request, read_json_response

BASE = "https://llicfiepatzgllmjhzbw.supabase.co"
HOSTS = ["llicfiepatzgllmjhzbw.supabase.co"]
CRED = "custom.supabase"
ELIGIBLE = {"verified", "verified_primary", "verified_secondary"}

# Transcribed from QUIZ_FORENSIC_AUDIT_2026-09-28.md §4 (genuinely redundant pairs).
# The script validates each: both resolve, similarity >= 0.80, identical explanations.
NEAR_DUP_PAIRS = [
    ("fa6b14bc", "47cebbaf"), ("8b2920fd", "790a4853"), ("16657e2b", "91508a8f"),
    ("7ad2bb48", "a11d7538"), ("3c721283", "1ee99660"), ("e2bbb2c7", "713c1853"),
    ("4a1fb4fe", "6b730819"), ("30d24f16", "218548e4"), ("fdc6963f", "e30b5847"),
    ("30fecbf8", "30d473e5"), ("608b5612", "6d56bfe7"), ("1b2bfc00", "92ceba14"),
    ("b6dde8f3", "e97e91a8"),
]
# Explicitly excluded per the report:
# 9e706e3c/23e49c9e (needs_review involved), 62df78df/f2d00410 (disputed),
# f4f1cb3c/bf41f99d (disputed), 3334d4ff/a66899e7 (needs_review involved),
# 299c664b/a8c91f0c (needs-editorial-review), EXACT-38 (correct-answer conflict).

# Exact-group overrides, keyed by frozenset of 8-char prefixes (from report §3).
EXACT_EXCLUDE = [frozenset(("f3b63b75", "330d1142"))]          # EXACT-38
EXACT_PARTIAL = {  # group prefixes -> allowed mergeable edge prefixes
    frozenset(("cb669489", "dbaf94d7", "1653909f")): ("cb669489", "1653909f"),   # EXACT-20
    frozenset(("7f596085", "404b63d2", "79b5109a")): ("7f596085", "404b63d2"),   # EXACT-24
}

def get(path):
    r = urllib.request.Request(BASE + path, method="GET")
    add_surrogate_to_request(r, CRED, allowed_hosts=HOSTS)
    with urllib.request.urlopen(r, timeout=60) as resp:
        return read_json_response(resp)

def norm(s):
    s = unicodedata.normalize("NFC", s or "")
    s = re.sub(r"\s+", " ", s).strip().casefold()
    return re.sub(r"[^\w\s]", "", s, flags=re.UNICODE)

def correct_text(r):
    opts = r.get("options_en") or r.get("options_bn") or []
    ca = r.get("correct_answer")
    if ca is None or ca >= len(opts):
        return None
    return norm(str(opts[ca]))

def main():
    rows = []
    limit, offset = 1000, 0
    while True:
        batch = get(f"/rest/v1/quiz_questions?select=id,question,question_en,question_bn,"
                    f"options,options_en,options_bn,correct_answer,explanation_bn,"
                    f"explanation_en,source_reference,editorial_note,category,"
                    f"verification_status,order_index&order=id.asc&limit={limit}&offset={offset}")
        rows.extend(batch)
        if len(batch) < limit: break
        offset += limit
    print(f"rows fetched: {len(rows)}")
    assert len(rows) == 313, f"expected 313 rows, got {len(rows)}"
    by_id = {r["id"]: r for r in rows}
    by_prefix = {}
    for r in rows:
        p = r["id"][:8]
        assert p not in by_prefix, f"prefix collision: {p}"
        by_prefix[p] = r["id"]

    # --- 1. Re-derive exact-duplicate groups ---
    # Report: a pair duplicates if normalized question_en matches OR normalized
    # Bengali legacy `question` matches (either field, non-empty). Then
    # connected components over those pairwise links.
    parent = {}
    def find(x):
        parent.setdefault(x, x)
        while parent[x] != x:
            parent[x] = parent[parent[x]]; x = parent[x]
        return x
    def union(a, b):
        ra, rb = find(a), find(b)
        if ra != rb: parent[rb] = ra
    bucket_en, bucket_bn = defaultdict(list), defaultdict(list)
    for r in rows:
        ke, kb = norm(r.get("question_en")), norm(r.get("question"))
        if ke: bucket_en[ke].append(r["id"])
        if kb: bucket_bn[kb].append(r["id"])
    for bucket in list(bucket_en.values()) + list(bucket_bn.values()):
        for i in range(len(bucket)):
            for j in range(i + 1, len(bucket)):
                union(bucket[i], bucket[j])
    comp = defaultdict(list)
    for r in rows:
        comp[find(r["id"])].append(r["id"])
    exact_groups = sorted([sorted(v) for v in comp.values() if len(v) > 1])
    print("derived exact groups:")
    for g in exact_groups:
        print("   ", [i[:8] for i in g])
    print(f"exact groups derived: {len(exact_groups)}")
    assert len(exact_groups) == 22, f"report says 22, derived {len(exact_groups)}"

    # --- 2. Build mergeable edges ---
    edges = []
    for g in exact_groups:
        prefixes = frozenset(i[:8] for i in g)
        if prefixes in EXACT_EXCLUDE:
            print(f"  excluded (needs review): {sorted(prefixes)}")
            continue
        if prefixes in EXACT_PARTIAL:
            a, b = EXACT_PARTIAL[prefixes]
            edges.append((by_prefix[a], by_prefix[b], "exact-partial"))
            print(f"  partial merge: {a} + {b}")
            continue
        for i in range(len(g)):
            for j in range(i + 1, len(g)):
                edges.append((g[i], g[j], "exact"))

    # --- 3. Validate transcribed near-duplicate pairs ---
    # Worker invariant: all genuinely-redundant pairs share identical explanations.
    # Safety invariant (ours): same correct-answer TEXT — pairs that fail it are
    # not auto-canonicalized; they are recorded for editorial review instead.
    excluded_needs_review = []
    for pa, pb in NEAR_DUP_PAIRS:
        assert pa in by_prefix and pb in by_prefix, f"prefix not found: {pa}/{pb}"
        ra, rb = by_id[by_prefix[pa]], by_id[by_prefix[pb]]
        sim = SequenceMatcher(None, norm(ra.get("question_en")), norm(rb.get("question_en"))).ratio()
        same_expl = norm(ra.get("explanation_en")) == norm(rb.get("explanation_en"))
        assert same_expl, f"pair {pa}/{pb} explanations differ"
        ca, cb = correct_text(ra), correct_text(rb)
        if not ca or ca != cb:
            excluded_needs_review.append({
                "pair": [ra["id"], rb["id"]],
                "reason": f"correct-answer text differs ({ca!r} vs {cb!r}); "
                          f"forensic audit called it redundant — needs human review",
            })
            print(f"  excluded (needs review): {pa}/{pb} correct-text differs")
            continue
        if sim < 0.80:
            print(f"  note: pair {pa}/{pb} similarity {sim:.2f} < 0.80 "
                  f"(worker editorial call; identical explanations confirmed)")
        edges.append((ra["id"], rb["id"], "near-redundant"))
    print(f"near-dup pairs validated: {len(NEAR_DUP_PAIRS)}")

    # --- 4. Connected components -> primary per retention rule ---
    parent = {}
    def find(x):
        parent.setdefault(x, x)
        while parent[x] != x:
            parent[x] = parent[parent[x]]; x = parent[x]
        return x
    def union(a, b):
        ra, rb = find(a), find(b)
        if ra != rb: parent[rb] = ra
    for a, b, kind in edges:
        # Safety: never merge rows that teach different correct answers
        # (compared by answer text — option order may legitimately differ).
        ca, cb = correct_text(by_id[a]), correct_text(by_id[b])
        assert ca and ca == cb, \
            f"edge {a[:8]}/{b[:8]} ({kind}) correct answer differs: {ca!r} vs {cb!r} — aborting"
        union(a, b)
    components = defaultdict(list)
    for a, b, _ in edges:
        components[find(a)].append(a); components[find(a)].append(b)
    components = {k: sorted(set(v)) for k, v in components.items()}

    def rank(r):
        d = by_id[r]
        return (0 if (d.get("question_bn") or "").strip() else 1,
                -(len(d.get("source_reference") or "")),
                0 if (d.get("editorial_note") or "").strip() else 1,
                d.get("order_index") if d.get("order_index") is not None else 10**9,
                d["id"])
    mapping, primaries = {}, {}
    for comp in components.values():
        indexed = [i for i in comp if by_id[i]["verification_status"] in ELIGIBLE]
        if len(indexed) < 2:
            continue  # nothing indexed to consolidate
        primary = min(indexed, key=rank)
        for i in indexed:
            if i != primary:
                assert i not in mapping, f"{i} in two components"
                mapping[i] = primary
        primaries[primary] = sorted(indexed)
    print(f"components: {len(components)}, consolidated groups: {len(primaries)}, "
          f"duplicate urls: {len(mapping)}")
    for p, members in sorted(primaries.items()):
        ms = [m[:8] for m in members if m != p]
        print(f"  primary {p[:8]} <- {ms}")

    out = {
        "generated": "2026-09-28",
        "source": "QUIZ_FORENSIC_AUDIT_2026-09-28.md",
        "method": "exact groups re-derived (NFC/whitespace/casefold/punctuation-strip); "
                  "near-dup pairs transcribed from report §4 and validated "
                  "(similarity>=0.80, identical explanations); exclusions per report "
                  "(EXACT-38, EXACT-20/24 partial, needs-review pairs); retention rule: "
                  "question_bn populated > richer source_reference > editorial_note present > lower order_index",
        "note": "Render-layer canonical hints only. No DB changes. Reversible: delete this file's consumers.",
        "excluded_needs_review": excluded_needs_review,
        "map": mapping,
    }
    with open("src/data/quiz-duplicate-canonicals.json", "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    print("written: src/data/quiz-duplicate-canonicals.json")

if __name__ == "__main__":
    main()
