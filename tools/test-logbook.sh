#!/bin/bash
# Every check the logbook needs before merging, in one go (fake data only):
#   tools/test-logbook.sh            everything (about 10 minutes)
#   tools/test-logbook.sh quick      repo check, unit tests and the focused browser tests (no full e2e)
# Each step is timed: $OUT/timings.txt, slowest first; the last lines name the total and the three slowest.
# It starts a static server on port 8080 if none is running (and stops it after). The portfolio template steps
# use apmes/templates/portfolio-template-blank.docx.
# Accessibility (logbook/test/e2e/a11y.mjs), the rules emulator (tools/test-rules.sh) and the read counts
# (tools/test-reads.sh, emulator) are run on their own.
set -u
cd "$(dirname "$0")/.."
OUT="${E2E_OUT:-${TMPDIR:-/tmp}/logbook-tests}"; mkdir -p "$OUT"
fail=0
# each step's seconds go to $OUT/timings.txt (slowest first); the end prints only the total and the three slowest
last=''; lastAt=$(date +%s%N); start=$lastAt; : >"$OUT/timings.txt"
lap() { local now; now=$(date +%s%N); [ -n "$last" ] && printf '%6.1f  %s\n' "$(( (now - lastAt) / 1000000 ))e-3" "$last" >>"$OUT/timings.txt"; lastAt=$now; }
step() { lap; last=$1; printf '\n== %s\n' "$1"; }
if ! curl -s -o /dev/null http://localhost:${PORT:-8080}/logbook/; then
  python3 -m http.server ${PORT:-8080} >/dev/null 2>&1 & SERVER=$!; trap 'kill $SERVER 2>/dev/null' EXIT; sleep 1
fi

step 'repo check'; node tools/check.mjs || fail=1
step 'unit tests'
for f in evals/test/*.test.mjs logbook/test/*.test.mjs people/test/*.test.mjs ccc/test/*.test.mjs worker/test/*.test.mjs; do
  node --import ./logbook/test/app-sync-hook.mjs "$f" >"$OUT/unit.txt" 2>&1 || { echo "FAIL $f"; tail -5 "$OUT/unit.txt"; fail=1; }
done
echo 'done'

if [ "${1:-}" != quick ]; then
  step 'full e2e (phone and desk)'
  mkdir -p "$OUT/e2e"; [ -f "$OUT/e2e/fake-old-form.xlsx" ] || node logbook/test/e2e/mkfake.cjs "$OUT/e2e/fake-old-form.xlsx" >/dev/null
  E2E_OUT="$OUT/e2e" timeout 600 node logbook/test/e2e/e2e.mjs >"$OUT/e2e.txt" 2>&1 || fail=1
  grep -E '^== |^FAIL|console errors' "$OUT/e2e.txt"
fi

for t in update-core recovery usability cloud-save notepad daily-note tag-editor simpler profiles moved settings-pages send logging-speed sync sync-engine parts detection reset-all analytics-edit more-edit box-height cal-refl bulk-select notes-select refl-select search grid-sheet paging my-themes app-style md-format lb-group phone-ux inverted-keyboard lazy-load late-back bugfixes feedback formview app-version list-format wallpaper share-link colour-sheet hide-mode try-mode phone-tweaks; do
  step "$t"
  timeout 300 node "logbook/test/e2e/$t.mjs" >"$OUT/$t.txt" 2>&1 && grep -E '^PASS' "$OUT/$t.txt" || { echo "FAIL $t"; tail -15 "$OUT/$t.txt"; fail=1; }
done

# Safari's engine: the notes editor in Playwright's WebKit, when it's installed here (skipped otherwise)
step 'notepad (webkit)'
BROWSER=webkit timeout 300 node logbook/test/e2e/notepad.mjs >"$OUT/notepad-webkit.txt" 2>&1 && grep -E '^(PASS|SKIP)' "$OUT/notepad-webkit.txt" || { echo "FAIL notepad (webkit)"; tail -15 "$OUT/notepad-webkit.txt"; fail=1; }

lap; sort -rn -o "$OUT/timings.txt" "$OUT/timings.txt"
printf '\nTime: %ss; slowest: %s (all: %s)\n' "$(( ($(date +%s%N) - start) / 1000000000 ))" \
  "$(head -3 "$OUT/timings.txt" | awk '{t=$1; $1=""; printf "%s%s %ss", (NR>1?", ":""), substr($0,2), int(t+.5)}')" "$OUT/timings.txt"
printf '\n%s\n' "$([ $fail = 0 ] && echo 'ALL PASSED' || echo "SOMETHING FAILED (logs in $OUT)")"
exit $fail
