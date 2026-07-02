# Changelog

All notable changes to the Evolver Antigravity Desktop plugin are documented here.
This project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Changed — onboarding UX
- README: the Installation section now states that local memory works with zero
  config, and a new **"Connecting to the EvoMap network (optional)"** section
  walks through the blank-node-id → `evolver` → claim-link flow (and notes that
  reusing a specific older node is the harder, secret-requiring path). The
  `session-start.js` hook row now mentions the one-time claim nudge.
- `session-start.js` gives a one-time, throttled nudge to claim the node when
  one has been registered locally (`~/.evomap/claim_url`) but not yet connected
  to the network (fail-closed, 12h throttle).
- `evolver-status` skill now translates connection state into plain "are you
  connected?" language — surfacing the pending claim link and explaining HTTP
  402 as "network features need credits" (https://evomap.ai/pricing) instead of
  dumping raw JSON or internal terms like `node_secret` / `stake`.

## [0.1.1] — 2026-06-25

### Fixed
- `Stop` outcome recording now inspects only current working-tree and staged
  changes, not `HEAD~1`, and suppresses duplicate records for the same session
  or unchanged diff.
- Optional Hub recording now uses Node `fetch`, so API keys are not exposed in
  `curl` process arguments.
- The MCP bridge now only sends the Proxy bearer token to loopback/local
  `http(s)` URLs from `~/.evolver/settings.json`; invalid or non-local URLs
  fall back to the default local Proxy address without a token.

## [0.1.0] — 2026-06-05

Initial public release of the native Antigravity Desktop port. 

This version delivers complete alignment with the `evolver-claude-code-plugin` design specifications but introduces highly-integrated, premium desktop client optimizations.

### Added
- **Built-in Zero-Config MCP (`mcp_config.json`)**: Seamless, automated client launch and loading of `@evomap/gep-mcp-server` via `npx -y` with no manual client-side configuration required.
- **Standalone Hooks (MIT, Clean-Room)**:
  - `SessionStart`: Injects recent, workspace-scoped successful GEP outcomes (score ≥ 0.5, < 7 days old, max 3) to the session startup context.
  - `PostToolUse`: Monitors edits natively on Antigravity's file-write and replace operations (`write_to_file`, `replace_file_content`, `multi_replace_file_content`) to detect evolution signal keywords.
  - `Stop`: Inspects git diffs of the workspace, computes metrics and outcomes, and appends to the memory graph.
- **Workspace-Scoped Protection**: Prevents cross-project database leakage by maintaining the workspace identifier key inside `<root>/.evolver/workspace-id`.
- **Integrated Agent Skills**:
  - `capability-evolver`: Core guidance on GEP memory optimization, enriched with instructions for calling active `gep_*` MCP tools.
  - `evolver-status`: Diagnostics and readiness checker.
  - `evolver-evolve`: Checkpointing pipeline.
  - `evolver-review`: Accept/Solidify or rollback proposed changes.
  - `evolver-solidify`: Capsule-solidification.
  - `evolver-run`: Runs full engine loops.
  - `evolver-distill`: Skill builder compiler.
  - `evolver-sync`: Community Hub synchronize utility.
