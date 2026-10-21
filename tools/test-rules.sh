#!/bin/bash
# Firestore rules tests for logbook/firestore.rules (one file for the logbook, evals, people, applicants and CCC 360) in
# the local emulator, with fake accounts and the demo project "demo-logbook": nothing reaches the live Firebase
# projects and no sign-in is needed.
# Needs Java. The test tools install on first use (below), once per machine, into ~/.cache/anawj-rules.
set -u
cd "$(dirname "$0")/.."
TOOLS="${RULES_TOOLS:-$HOME/.cache/anawj-rules}"
if [ ! -x "$TOOLS/node_modules/.bin/firebase" ]; then
  echo "Installing the emulator test tools into $TOOLS (once)…"
  npm install --silent --prefix "$TOOLS" firebase-tools@13 @firebase/rules-unit-testing firebase || exit 1
fi
# the test files import the packages by name: link them in for the run only
made_link=0
if [ ! -e node_modules ]; then ln -s "$TOOLS/node_modules" node_modules; made_link=1; fi
cfg="$(mktemp -d)/firebase.json"
echo '{ "firestore": { "rules": "logbook/firestore.rules" }, "emulators": { "firestore": { "port": 8085, "host": "127.0.0.1" }, "ui": { "enabled": false } } }' > "$cfg"
"$TOOLS/node_modules/.bin/firebase" emulators:exec --config "$cfg" --only firestore --project demo-logbook \
  "node evals/test/rules.emulator.mjs && node applicants/test/rules.emulator.mjs && node 360/test/rules.emulator.mjs && node people/test/rules.emulator.mjs && cd logbook && node test/rules.emulator.mjs" 2>&1 | grep -E 'checks passed|checks failed|^FAIL|^Error:' ; rc=${PIPESTATUS[0]}
[ $made_link = 1 ] && rm -f node_modules
rm -f firebase-debug.log firestore-debug.log logbook/firestore-debug.log
exit $rc
