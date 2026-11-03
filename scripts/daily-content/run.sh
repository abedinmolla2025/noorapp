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
  --module esnext --target es2020 --skipLibCheck --outDir scripts/daily-content/.out
echo "== build fixture (real bundled duas) =="
node scripts/daily-content/build-fixture.mjs
echo "== unit tests =="
node scripts/daily-content/tests.mjs
echo "== dry-run (plan only) =="
node scripts/daily-content/dry-run.mjs
rm -rf scripts/daily-content/.out
echo "== daily-content verification complete =="
