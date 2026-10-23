# Notes

Lasting rules, owner preferences and lessons (never task chatter), and how to test.

## Beta: try a change signed in, before it goes live

Beta signs in for real against a separate **test** Firebase project (test data only), so a change to the logbook or
evals can be tried before it reaches apmes.anawj.com (owner, 18 Oct 2026).

- **Address:** `https://beta-apmes.anawj.com/logbook/` (and `/evals/`, `/people/`, `/ccc/`). Its browser
  storage is separate from the live site's.
- **What it serves:** the `beta` branch, through the `apmes-beta` Worker (`wrangler.jsonc`, `env.beta`). Since 22 Oct 2026
  both sites deploy from GitHub Actions (`.github/workflows/deploy.yml`): a push to `main` deploys Worker `apmes`, a push
  to `beta` deploys `apmes-beta` with `--env beta`. Workers Builds is disconnected.
- **Which data:** `logbook/js/firebase-config.js` and `evals/js/firebase-config.js` pick the test project
  `apmes-logbook-beta` on any `beta-` host, so the code tried on beta is the code that goes live, unchanged. Its
  sign-in helper pages use `apmes-auth-beta/firebase/init.json`. Free plan: no backups, test data only.
- **Trying a PR:** point `beta` at the PR's branch (`git push --force origin <branch>:beta`); `beta` is disposable,
  nothing ever merges from it. Wait for the Deploy workflow run on `beta`, then send the owner the beta link.
- **Firestore rules:** test with the emulator first; deploy them to the test project before live.

## Testing

- `logbook/vendor/package.json` makes Node read exceljs and jszip as CommonJS (the repo is `"type": "module"`), for
  the unit tests that load them.
- Browser tests load the design kit from design.anawj.com (live), so they need the network. The logbook's feedback
  test compares its warning patterns with the kit's `overlay.js` and skips that part offline.
