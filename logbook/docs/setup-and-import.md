# Logbook: Firebase setup, the import and the Google Form

Moved from [../README.md](../README.md) on 22 Oct 2026 (read on demand, not at start).

## Firebase setup (once)

The Firebase project `apmes-logbook` already exists and its web config is in `js/firebase-config.js`. Those values are public by design.

1. **Authentication**: Firebase console → Authentication → Sign-in method → enable **Google**. Then Authentication → Settings → Authorised domains → add `apmes.anawj.com` (`localhost` is there already for testing; `anawj.com` can stay until the old address is retired).
2. **Firestore**: Firestore Database → Create database → location **asia-southeast1 (Singapore)** → **production mode**.
3. **Rules**: deployed automatically when a change to `firestore.rules` is merged to `main` (`.github/workflows/deploy-firestore-rules.yml`); don't paste them by hand. This one file holds the rules for the whole Firebase project, the logbook and evaluations (`/evals`) alike, so never publish another app's rules file over it.
4. **Admins**: Firestore Database → Data → Start collection `admins`. Add one document per admin. The document ID is the admin's Google email in lower case (use the admins' emails), with a field `name` (string). Admin emails are never written in this repository. **Owner**: the same in a collection `owners`, with one document for the app owner (who is usually an admin too).
5. **Optional, API key restriction**: Google Cloud console → APIs & Services → Credentials → the "Browser key" → Application restrictions → Websites → add `https://apmes.anawj.com/*`, `https://anawj.com/*`, `https://apmes-logbook.firebaseapp.com/*` and `http://localhost/*`. The key isn't a secret, but this stops other sites using it.
6. **Optional, Save to Google Drive and Dropbox** (More → Export / Import → Backup; `js/cloud-save.js`). Until these are done the buttons say "isn't set up yet".
   - **Google Drive**: Google Cloud console, project `apmes-logbook` → APIs & Services → Library → enable **Google Drive API**. OAuth consent screen → Data access → add the scope `.../auth/drive.file` (non-sensitive: the app sees only the files it creates, so no verification is needed). Credentials → the OAuth client of type *Web application* (the one Firebase made, "Web client (auto created by Google Service)", is fine) → Authorised JavaScript origins → add `https://apmes.anawj.com`; Authorised redirect URIs → add `https://apmes.anawj.com/logbook/` (and `http://localhost:8080/logbook/` for testing). Put its client ID in `GOOGLE_CLIENT_ID` in `js/backup-targets.js`. The client ID is public; there is no secret in the app.
   - **Dropbox**: <https://www.dropbox.com/developers/apps> → Create app → Scoped access → **App folder** → name it "APMES Logbook". Permissions: tick `files.content.write`, `files.content.read` and `files.metadata.read` (the last lists the folder to remove old backups). Settings → OAuth 2 → Redirect URIs → add `https://apmes.anawj.com/logbook/` (and `http://localhost:8080/logbook/` for testing). Leave "Allow public clients (Implicit Grant & PKCE)" on. Put the **App key** (not the secret) in `DROPBOX_APP_KEY` in `js/backup-targets.js`. Until the app has 50+ users or is approved for production, Dropbox lets only people added in its settings use it: apply for production when ready.
   - No background sync: unattended backups would need refresh tokens stored on a server. "Remind me…" offers a one-tap save when the app opens and the last backup is over 7 days old.
7. **Optional, Connect an AI assistant**: see `mcp/README.md` (a *Desktop app* OAuth client for the MCP server).
8. Sign in on the page as an admin, open **Settings → Admin**, paste the residents list, then run the import (below).

The project is on Blaze (pay-as-you-go); its free daily quotas, which usage stays within, are: 20,000 writes and 50,000 reads a day. The first import is about 16,000 cases, so it fits in one day; re-imports write only new rows.

Sign-in uses a Google popup, falling back to a redirect if popups are blocked (e.g. some home-screen apps). If redirect sign-in fails on iPhone home-screen installs, open the page in Safari once to sign in.

The Firebase sign-in helper pages are self-hosted at `/__/auth/` (copied from `https://apmes-logbook.firebaseapp.com/__/auth/handler`, `handler.js`, `experiments.js`, `iframe`, `iframe.js`) with `/__/firebase/init.json`, and `authDomain` is `apmes.anawj.com` in both apps' `firebase-config.js` (the Worker serves them there: `SUBDOMAINS.md`; `apmes-auth/firebase/init.json` is that host's copy of `init.json`). This keeps sign-in on the same site, so Chrome's storage partitioning doesn't break the redirect ("Unable to process request due to missing initial state"). `.nojekyll` stops GitHub Pages dropping the `__` folder. Google Cloud console → APIs & Services → Credentials → the Web client (auto created by Google Service) → Authorised redirect URIs must include `https://apmes.anawj.com/__/auth/handler` (and, until the old address is retired, `https://anawj.com/__/auth/handler`). Refresh the copied files now and then (Firebase updates them rarely).

## How the import works

The old data is the Google Form responses workbook (tabs **Case** and **AY20xx Totals**). The app owner only (admins see a note instead). In **Settings → Admin**:

1. Paste the residents list (the `RESIDENTS` array from the old Apps Script). Check names, emails, status and residency year, then save. This creates `residents/{rid}`.
2. Upload the workbook. It is read in the browser (nothing is uploaded except the resulting cases). `js/importer.js` reads the Case tab: resident, date, details and the category columns, merged into one list of codes. Rows marked "WRONG ENTRY" are skipped; dates that can't be read are kept as text and flagged "needs date".
3. The page compares the counts per resident and category with the Totals tabs (`countCheck`) and shows any differences before you import.
4. **Import** writes each resident's cases into `logbooks/{their email}/cases`, then their summary. Every row has an `importKey` (a hash of resident, form timestamp, date, details and categories, plus a counter for identical rows). `imports/{rid}` records which keys are in, so running the import again after more form responses writes only the new rows. The case document ID is derived from the key, so an interrupted import can be resumed without duplicates.

## The Google Form, still open (Oct 2026)

Residents who prefer the old APMES Google Form can keep using it, with no end date; the logbook stays the one record.
One way only: Form → logbook, never back.

1. A small Apps Script on the Form ([`form-script/`](../form-script/README.md): the code and the setup steps) runs on every new or edited response
   and writes just that response to `formInbox/{responseId}`: the respondent's Google sign-in email (the Form
   requires sign-in), date, the initials and case details answer, and the category answers. It signs in as a bot
   account (Firebase email and password) whose uid is listed by hand in `formBots/`. The bot's email is never
   verified, so every other rule (`signedIn()`) stays closed to it; it can only add or replace inbox entries.
2. When the resident next opens the logbook (after the first server copy of their cases), the app reads their
   entries, turns each into a case (`source: 'form'`, id from the response id, initials split off, labels to codes,
   NRIC/long numbers replaced by "[ID removed]", unrecognised tags noted in the details) and deletes the entries.
3. Duplicates: a response already imported from the workbook (Admin portal) is skipped by the inbox, and a re-run
   of the workbook import skips responses the inbox brought in (`sameResponse`: same day, same response second once
   the sheet's time zone is taken off; for a Form case, its first submit or, once the app has picked up an edit, its
   newest one). An old response edited in the Form arrives with its edit time: an imported case with the same day,
   initials and categories counts as it (not added; the toast says so, as it may be another patient: log that one in
   the app). An edit that changes the day, initials or categories still adds a second case. A Form case the resident
   deleted doesn't come back: its id is kept in `formGone` (written when it goes to the bin and again before its bin
   entry goes). An imported case the resident deleted stays gone only while it is in the bin, and only from its own
   response (same time); a response that merely has its day, initials and categories is added (it may be a corrected
   copy) and the toast points to the bin. The pick-up reads the bin and `formGone` from the server and stops if it
   can't; the toast tells only what reached the server. Each entry's case and
   its delete go in one batch (`cloud.commitFormPickup`); at most 50 per pick-up, which runs again when the app comes
   back to the front (every 10 minutes at most).
4. An edited response replaces the case it made, unless the resident has changed that case in the app since
   (`importKey` `form:<responseId>~<newest submit>@<ms written>`, the `@` time being the `updatedAt` actually written;
   a later `updatedAt` means theirs: then only the newest submit is noted in the key); what only the app adds (a
   linked reflection, the star, personal tags) is kept.

Tests: `test/form-inbox.test.mjs`, `test/form-pickup.test.mjs` (cloud.js's real Firestore code against a stand-in SDK,
`test/fake-firebase.mjs`), `test/form-script.test.mjs`, the rules suite (`tools/test-rules.sh`) and the emulator browser
test (`tools/test-reads.sh`). A change to `form-script/Code.gs` must be pasted into the Form by the owner: list it in
`form-script/CHANGES-PENDING.md`.
