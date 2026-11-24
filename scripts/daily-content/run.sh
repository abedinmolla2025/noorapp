#!/usr/bin/env bash
# Daily Content local verification: fixture -> unit tests -> 4-day dry-run.
# No network, no production writes, no sends. Cleans compiled output after.
set -euo pipefail
cd "$(dirname "$0")/../.."
echo "== compile dailyContent lib =="
./node_modules/.bin/tsc src/lib/dailyContent/types.ts src/lib/dailyContent/eligibility.ts \
  src/lib/dailyContent/selection.ts src/lib/dailyContent/cards.ts src/lib/dailyContent/push.ts \
  src/lib/dailyContent/delivery.ts src/lib/dailyContent/plan.ts \
  src/lib/dailyContent/backgrounds.ts src/lib/dailyContent/ogQc.ts \
  src/lib/dailyContent/preferences.ts src/lib/dailyContent/containerState.ts \
  src/lib/dailyContent/chapterEvents.ts src/lib/dailyContent/recommendations.ts \
  src/lib/dailyContent/recommendationPlan.ts src/lib/dailyContent/semantic.ts \
  src/lib/dailyContent/visualConceptEngine.ts src/lib/dailyContent/visualSelection.ts \
  src/lib/dailyContent/dailyShare.ts src/lib/dailyContent/monitoring.ts \
  src/lib/dailyContent/bengaliQuality.ts src/lib/dailyContent/autonomousGate.ts \
  src/lib/dailyContent/palettes.ts src/lib/dailyContent/adaptivePoster.ts \
  --module esnext --target es2020 --skipLibCheck --outDir scripts/daily-content/.out
# Separate invocation for the Islamic Calendar lib: its own outDir (.out-cal).
# Mixing it into the lib compile would change the common rootDir and move
# the dailyContent outputs into .out/dailyContent/..., breaking test imports.
./node_modules/.bin/tsc src/lib/islamicCalendar/hijri.ts src/lib/islamicCalendar/events.ts \
  src/lib/islamicCalendar/corrections.ts src/lib/islamicCalendar/context.ts \
  src/lib/islamicCalendar/correctionsApi.ts src/lib/islamicCalendar/index.ts \
  --module esnext --moduleResolution bundler --target es2020 --skipLibCheck --outDir scripts/daily-content/.out-cal
# NOTE: --moduleResolution bundler is needed ONLY because correctionsApi.ts
# imports the SupabaseClient TYPE from @supabase/supabase-js (type-only,
# erased at emit). The emitted JS is identical to the esnext compile.
# Separate invocation: mixing api/ into the lib compile would move the
# lib outputs into .out/src/... (common rootDir), breaking test imports.
./node_modules/.bin/tsc api/daily-content-run.ts \
  --module esnext --target es2020 --skipLibCheck --outDir scripts/daily-content/.out
# Syntax check for the poster render route + card (TSX files the tsc
# invocations above do not cover — a syntax error here went green in
# run.sh and only surfaced as a vite 500 at render time, 2026-11-22:
# a dropped `linesOf` header in PosterRender.tsx). esbuild parses
# (no bundling, no import resolution) — the same class of error the
# vite transform reports.
echo "== syntax check poster render route + card =="
for f in src/pages/demo/PosterRender.tsx src/pages/demo/adaptivePosterFixtures.ts src/components/dailyContent/OgShareCard.tsx; do
  ./node_modules/vite/node_modules/.bin/esbuild "$f" --loader:.tsx=tsx --outfile=/dev/null
done
echo "== build fixture (real bundled duas) =="
node scripts/daily-content/build-fixture.mjs
echo "== adaptive long-hadith poster tests =="
node scripts/daily-content/adaptive-poster-tests.mjs
echo "== unit tests =="
node scripts/daily-content/tests.mjs
echo "== visual intelligence integration tests =="
node scripts/daily-content/visual-integration-tests.mjs
echo "== islamic calendar tests =="
node scripts/daily-content/calendar-tests.mjs
echo "== chapter -> event mapping tests =="
node scripts/daily-content/chapter-events-tests.mjs
echo "== edge-function regression tests (real edge code, stubbed deps) =="
node scripts/daily-content/edge-tests.mjs
echo "== service-worker push tests (real public/sw.js, stubbed self) =="
node scripts/daily-content/sw-tests.mjs
echo "== facebook page publication tests (real edge code, mocked Graph API) =="
node supabase/functions/daily-content/facebook.test.mjs
echo "== split-flow self-healing tests (real edge code, stubbed deps) =="
node supabase/functions/daily-content/heal-splitflow.test.mjs
echo "== text-only fallback tests (real edge code, stubbed deps) =="
node supabase/functions/daily-content/text-only-fallback.test.mjs
echo "== Mode A/B + per-channel switches tests (real edge code, mocked Graph API) =="
node supabase/functions/daily-content/mode-ab.test.mjs
echo "== monitoring + schedule-miss tests (real edge code, stubbed deps) =="
node supabase/functions/daily-content/monitoring.test.mjs
echo "== ai-adapter tests (real _shared adapter, stubbed fetch) =="
node supabase/functions/_shared/ai-adapter.test.mjs
echo "== bengali editorial quality tests =="
node supabase/functions/_shared/bengali-quality.test.mjs
echo "== ai recommendation tests (real recommend function, stubbed deps) =="
node supabase/functions/_shared/ai-recommend.test.mjs
echo "== recommend function tests (real recommend function, stubbed deps) =="
node supabase/functions/recommend-daily-content/recommend-daily-content.test.mjs
echo "== dry-run (plan only) =="
node scripts/daily-content/dry-run.mjs
rm -rf scripts/daily-content/.out scripts/daily-content/.out-cal
echo "== daily-content verification complete =="
