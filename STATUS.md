# Status

## Now
- Apps copied from anawj-site (21 Oct 2026). apmes.anawj.com and beta-apmes.anawj.com are still served by
  anawj-site's Workers. This repo's `apmes-beta` Worker takes beta-apmes.anawj.com first; apmes.anawj.com follows
  once beta works end to end.

## Waiting on the owner
- Beta: remove beta-apmes.anawj.com from the old `anawj-beta` Worker, then connect this repo in Workers Builds as
  Worker `apmes-beta` (branch `beta`, deploy command `npx wrangler deploy --env beta`); the domain attaches on its
  first deploy.

## Next (in order)
1. Beta check: sign in on beta-apmes.anawj.com (Google), save a test entry in the logbook and evals.
2. Live cut-over: guest passcode secrets and rate limit on the `apmes` Worker, its rules deployer service account and
   rules workflow, the logbook MCP release workflow, then apmes.anawj.com moves here (add its route to `wrangler.jsonc`).
3. anawj-site drops the apmes folders and hosts.

## Recently done
- 21 Oct 2026: imported logbook, evals, people, applicants, 360, apmes, `__/auth/`, apmes-auth, apmes-auth-beta;
  own exceljs and jszip (`logbook/vendor/`); kit from design.anawj.com (cached offline); guest sign-in code; checks.

## Decisions (dated, one line each)
- 21 Oct 2026: beta moves first (Worker `apmes-beta`); the live Worker `apmes` gets no address until the cut-over.
- 21 Oct 2026: People always opens NUH Junior Monthly at its own address (it lives in the rosters repo).
- 21 Oct 2026: the logbook's QR generator loads from the design kit (`/v1/feedback/qr.js`).
