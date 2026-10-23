# Status

## Now
- apmes.anawj.com and beta-apmes.anawj.com are served by this repo's Workers (`apmes` from `main`, `apmes-beta` from
  `beta`, both deployed by the Deploy GitHub Actions workflow). Rules deploy from here on merge (keyless); the logbook MCP
  extension is published on this repo's `logbook-mcp` release.

## Waiting on the owner
- Nothing: deploys run from GitHub Actions (Workers Builds is disconnected).

## Next (in order)
1. Sign-in check on apmes.anawj.com (Google) after the move.
2. anawj-site drops the apmes folders, hosts, guest sign-in code and its logbook rules and MCP workflows.
3. Guidebook notes: on `entrustment.html`, a notes box and a "done" tick on each question, synced with the Logbook sign-in
   (Firestore, the resident's own data only; rules change in `logbook/firestore.rules`, so beta first and merge on the
   owner's "ship it"). Signed out, notes and ticks stay on the device and still export. Export as .md, .txt or
   .docx, and Share / email them.

## Recently done
- 23 Oct 2026: guidebook as an installable app (manifest id `/guide/`, icon from anawj-site `tools/app-icons/`
  `guide.svg`), `home/guide/sw.js` keeps every page offline, app version line and "Get the latest version" on the
  contents page; on the home page it moved to Apps. `check.mjs` and `stamp-versions.mjs` include `home/guide`.
- 23 Oct 2026: applicants feedback moved out to its own repo and site (`residencyapps`, residencyapps.anawj.com):
  `/applicants/` forwards there; its folder, guest passcode sign-in, rules block and People › Access role removed.
  Its old data stays in `apmes-logbook` for now (no rules: console only).
- 23 Oct 2026: guidebook pages reorganised: one page per EPA (`epa-01.html` to `epa-12.html`, 7a/7b with 7) and the
  Appendix, a contents page with search over every section (`search.json`), and `entrustment.html`: every DOPS,
  Mini-CEX and EBD item in three tabs, grouped by EPA, with a filter and the EPA 7 attachments inside their items.
  Later the same day: while filtering, all three types show at once under their own headings, each item carries a
  coloured DOPS / Mini-CEX / EBD label and the matched words are marked.
- 23 Oct 2026: guidebook as readable pages at `/guide/` (`home/guide/`, built by `tools/build-guide.mjs` from
  `apmes/guidebook/`; contents, anchors, tables that scroll sideways); its section is on the home page.
- 23 Oct 2026: home page at apmes.anawj.com/ (`home/`): Open Logbook, MedHub links, an opt-in counts card (own
  summary, read only) and the Logbook's theme; beta apps stay off it until their `live` flag is set.
- 23 Oct 2026: Logbook See it in action: the Display preview is one slim line whose button opens the real Logbook
  with a theme bar (‹ theme ›, light or dark, Done).
- 21 Oct 2026: rules deploy workflow (keyless) and logbook MCP release workflow moved here; apmes.anawj.com moved here.
- 21 Oct 2026: imported logbook, evals, people, applicants, 360, apmes, `__/auth/`, apmes-auth, apmes-auth-beta;
  own exceljs and jszip (`logbook/vendor/`); kit from design.anawj.com (cached offline); guest sign-in code; checks.

## Decisions (dated, one line each)
- 23 Oct 2026: the guidebook `.md` files keep their names (evals reads `epa-01-06.md` and `epa-07-12.md`); the page
  builder splits them per EPA. Search runs in the browser over a built `search.json`, no server.
- 23 Oct 2026: guidebook pages are built HTML committed with the repo (no Markdown library on the phone); the raw
  `.md` at `/apmes/guidebook/` stays for evals.
- 23 Oct 2026: home page at `/` lists live apps only (Logbook for now); MedHub links go to MedHub's home and its mobile
  Duty Hours and Evaluations pages (each shows its own sign-in first); the counts card is off unless turned on per device.
- 21 Oct 2026: beta moves first (Worker `apmes-beta`); the live Worker `apmes` gets no address until the cut-over.
- 21 Oct 2026: People always opens NUH Junior Monthly at its own address (it lives in the rosters repo).
- 21 Oct 2026: the logbook's QR generator loads from the design kit (`/v1/feedback/qr.js`).
