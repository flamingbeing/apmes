# apmes

Instructions for every AI assistant working here (Claude Code reads this through `CLAUDE.md`).
The APMES apps of the anaesthesia residency programme, production at `apmes.anawj.com` (Firebase project `apmes-logbook`) and a beta at `beta-apmes.anawj.com` (own Worker `apmes-beta`, test Firebase project):

| App | Folder | Address |
| --- | --- | --- |
| APMES case logbook | `logbook/` | apmes.anawj.com/logbook/ |
| APMES assessments (evals) | `evals/` | apmes.anawj.com/evals/ |
| APMES People | `people/` | apmes.anawj.com/people/ |
| Applicants feedback | `applicants/` | apmes.anawj.com/applicants/ |
| CCC 360 | `360/` | apmes.anawj.com/360/ |
| Programme documents | `apmes/` | not served (only `apmes/guidebook/`, which evals reads) |

`__/` holds Firebase's sign-in helper pages; `apmes-auth/` and `apmes-auth-beta/` hold each host's `init.json`.
Read the app's `NOTES.md` and `README.md` (and `STATUS.md` here) first.

## Public here, private elsewhere

Anything merged here is public. Keep only code, docs, general rules and **made-up** sample data. Never commit
secrets, tokens, personal data, real names or patient details. Private notes belong in the owner's private notes
repo; never copy anything from there into this repo, a PR or an issue (neutral pointers like "ask the owner" are fine).

## Rules that bite

- **Two Workers, one repo** (`wrangler.jsonc`): `apmes` (main branch, apmes.anawj.com, with the guest passcode sign-in,
  `worker/guest.js`) and `apmes-beta` (`env.beta`, the `beta` branch, beta-apmes.anawj.com, test Firebase project).
  Each host serves only the folders listed in `worker/routes.js` `SITES`.
- **Beta** (NOTES.md, "Beta") is opt-in: only when the owner asks, or for sign-in or Firestore-rules changes, point
  `beta` at the branch, send him the beta link and merge on his "ship it". Otherwise PRs merge once Checks pass.
- **Firestore rules:** `logbook/firestore.rules` covers all five apps. Test with `tools/test-rules.sh` (local emulator,
  never the live projects). Never loosen rules on real-data collections to pass a test. They **deploy live on merge**
  (`deploy-firestore-rules.yml`, keyless sign-in to `apmes-logbook`): merge only when Checks are green, confirm the
  "Deploy Firestore rules" run, and report what the rules now allow or deny. A manual run deploys over live rules: ask
  the owner.
- **Logbook MCP extension:** `logbook-mcpb.yml` tests and builds `logbook/mcp` on PRs and puts the `.mcpb` on this
  repo's `logbook-mcp` release on merge (the app's download link points there).
- **Generated files:** `evals/js/catalogue.js` and `forms.js`. Edit `apmes/` or `evals/tools/build-data.mjs`, then run
  `node evals/tools/build-data.mjs` (`tools/check.mjs` fails when they are stale).
- The NUHS design kit (and the shared QR generator, `/v1/feedback/qr.js`) load from `https://design.anawj.com/v1/`
  (another repo); never copy them in. The service workers cache the kit at install and answer it offline (`KIT`).
- **Service workers:** each `sw.js` VERSION starts with its folder name and is stamped at deploy
  (`tools/stamp-versions.mjs`), never by hand; change the base (`logbook-v41`) only when the worker's own logic changes.
- **App version lines:** every app with a service worker ends its settings screen with `App version <date> (<hash>)`
  and a `Not updating? Get the latest version` button that touches only its own worker and caches.
- **Vital app:** the logbook holds residents' real records: full tests before merging.
- NUH Junior Monthly (People's roster import) lives in the rosters repo at nuhjuniormonthly.anawj.com.

## Checks before merging

```
node tools/check.mjs                          # repo checks, Worker tests, generated files
for f in */test/*.test.mjs; do node "$f" || break; done   # unit tests
node tools/proofread.mjs                      # page and doc mistakes
bash tools/test-logbook.sh                    # logbook: full e2e (`quick` skips it); a11y: node logbook/test/e2e/a11y.mjs
python3 -m http.server 8110 &                 # evals: node evals/test/e2e.spec.mjs, edge.e2e.mjs, a11y.mjs
node people/test/e2e.mjs                      # people, applicants, 360: each test/e2e.mjs (no server needed)
bash tools/test-rules.sh                      # when logbook/firestore.rules changes (needs Java)
```

In a cloud session set `PLAYWRIGHT_PATH=/opt/node22/lib/node_modules/playwright/index.mjs` and
`CHROMIUM_PATH=/opt/pw-browsers/chromium` (evals: `CHROMIUM`). People's test also drives NUH Junior Monthly when a
rosters checkout sits beside this one (or `ROSTERS_DIR`); without one it skips those two steps.

## Working with the owner

- Instructions mostly come from a phone. Work through a request to the end; ask only when a decision is genuinely
  the owner's. When asked to plan, plan and wait.
- Keep each PR small and finished on its own. Start PR titles with the app: "Logbook: …".
- Merge your own PRs once the checks pass, then report with the PR link (merge by the number the PR creation
  returned). After opening a PR, call `unsubscribe_pr_activity` at once: each PR event re-sends the whole context.
- Push once per finished step, not after every small commit (limited build minutes).
- Each app keeps `NOTES.md` (lasting decisions, how to test); `STATUS.md` here holds now, waiting on the owner, next
  and dated decisions. Read them before starting; update them when a task finishes. Cheap end of session: `quick-save`.
- Plain words, short; explain technical terms briefly the first time.

## Token savers

- One repo per session: `.claude/settings.json` is only read when a session has exactly one repo attached.
- `.claude/settings.json` denies reading `__/` and `vendor/` folders. Add generated files and very large files to its
  `deny` list (edit their build scripts instead), and say so here. Ask the owner if one is really needed.
- Run only the touched app's tests while iterating and the full run once before merge. Screenshots only for visual
  changes (one, viewport-sized); debug logic with text.
