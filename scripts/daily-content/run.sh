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
  src/lib/dailyContent/recommendationPlan.ts \
  --module esnext --target es2020 --skipLibCheck --outDir scripts/daily-content/.out
# Separate invocation for the Islamic Calendar lib: its own outDir (.out-cal).
# Mixing it into the lib compile would change the common rootDir and move
# the dailyContent outputs into .out/dailyContent/..., breaking test imports.
./node_modules/.bin/tsc src/lib/islamicCalendar/hijri.ts src/lib/islamicCalendar/events.ts \
  src/lib/islamicCalendar/corrections.ts src/lib/islamicCalendar/context.ts \
  src/lib/islamicCalendar/index.ts \
  --module esnext --target es2020 --skipLibCheck --outDir scripts/daily-content/.out-cal
# Separate invocation: mixing api/ into the lib compile would move the
# lib outputs into .out/src/... (common rootDir), breaking test imports.
./node_modules/.bin/tsc api/daily-content-run.ts \
  --module esnext --target es2020 --skipLibCheck --outDir scripts/daily-content/.out
echo "== build fixture (real bundled duas) =="
node scripts/daily-content/build-fixture.mjs
echo "== unit tests =="
node scripts/daily-content/tests.mjs
echo "== islamic calendar tests =="
node scripts/daily-content/calendar-tests.mjs
echo "== chapter -> event mapping tests =="
node scripts/daily-content/chapter-events-tests.mjs
echo "== edge-function regression tests (real edge code, stubbed deps) =="
node scripts/daily-content/edge-tests.mjs
echo "== ai recommendation tests (real recommend function, stubbed deps) =="
node supabase/functions/_shared/ai-recommend.test.mjs
echo "== dry-run (plan only) =="
node scripts/daily-content/dry-run.mjs
rm -rf scripts/daily-content/.out scripts/daily-content/.out-cal
echo "== daily-content verification complete =="
