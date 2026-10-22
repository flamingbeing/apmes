# Logbook screens: Connect an AI assistant

Part of the logbook working notes; index of screens in [../screens.md](../screens.md). The MCP extension (`mcp/`) and its Settings page.

- **Connect an AI assistant** (`mcp/`, Settings → Connect an AI assistant (advanced) links its README on GitHub): an MCP
  server residents run locally (reads, plus `add_case`, `update_case`, `save_reflection` for drafts: preview, then
  `confirm: true`; no deletes; new cases also queue their `sheetOutbox` entry); Google "Desktop app" OAuth (loopback, PKCE) → Firebase `signInWithIdp` → Firestore
  REST as the user, so the rules apply; only `logbooks/{own email}` and the user's own `residents` entry. Owner
  setup (the Desktop client ID and its non-confidential secret in `mcp/config.mjs`) is in `mcp/README.md`; until
  then sign-in can't work. The Desktop client ID is set in `mcp/config.mjs`; the agent's safety check refuses to
  commit the `client_secret` (even with the owner's go-ahead), so the owner pastes it via a GitHub web edit, then
  test `node server.mjs login` live. Tests: `logbook/mcp/test/*.test.mjs` (tools test needs `npm install` there).
