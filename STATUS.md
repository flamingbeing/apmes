# Status

## Now
- apmes.anawj.com and beta-apmes.anawj.com are served by this repo's Workers (`apmes` from `main`, `apmes-beta` from
  `beta`, both deployed by the Deploy GitHub Actions workflow), with the guest passcode sign-in on `apmes`. Rules deploy from here on merge (keyless); the logbook MCP
  extension is published on this repo's `logbook-mcp` release.

## Waiting on the owner
- Nothing: deploys run from GitHub Actions (Workers Builds is disconnected).

## Next (in order)
1. Home page: readable guidebook pages at `/guide/` (built from `apmes/guidebook/`), then its section on the home page.
2. Sign-in check on apmes.anawj.com (Google and guest passcode) after the move.
3. anawj-site drops the apmes folders, hosts, guest sign-in code and its logbook rules and MCP workflows.

## Recently done
- 23 Oct 2026: home page at apmes.anawj.com/ (`home/`): Open Logbook, MedHub links, an opt-in counts card (own
  summary, read only) and the Logbook's theme; beta apps stay off it until their `live` flag is set.
- 23 Oct 2026: Logbook See it in action: the Display preview is one slim line whose button opens the real Logbook
  with a theme bar (‹ theme ›, light or dark, Done).
- 21 Oct 2026: rules deploy workflow (keyless) and logbook MCP release workflow moved here; apmes.anawj.com moved here.
- 21 Oct 2026: imported logbook, evals, people, applicants, 360, apmes, `__/auth/`, apmes-auth, apmes-auth-beta;
  own exceljs and jszip (`logbook/vendor/`); kit from design.anawj.com (cached offline); guest sign-in code; checks.

## Decisions (dated, one line each)
- 23 Oct 2026: home page at `/` lists live apps only (Logbook for now); MedHub links go to MedHub's home (its deep links
  need its sign-in first); the counts card is off unless turned on per device.
- 21 Oct 2026: beta moves first (Worker `apmes-beta`); the live Worker `apmes` gets no address until the cut-over.
- 21 Oct 2026: People always opens NUH Junior Monthly at its own address (it lives in the rosters repo).
- 21 Oct 2026: the logbook's QR generator loads from the design kit (`/v1/feedback/qr.js`).
