# Changelog

All notable changes to the Evolver Antigravity Desktop plugin are documented here.
This project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.2.0] - 2026-10-26

Aligned with the DeepSeek Harness plugin (dsh-evolver 0.3.0): Evolver stays out of the model context.

### Added
- Antigravity hooks (`hooks.json`, one named hook with the documented events only) for the whole pipeline:
  `PreInvocation` opens a turn on the first model call after a new prompt in the transcript and injects one
  recalled strategy as an `ephemeralMessage` step, ending with `Apply them where they fit.`, again before each
  later model call of the turn (an ephemeral message lasts one call); `PreToolUse` hashes
  files before an edit and answers `{"decision":"allow"}`; `Stop` reads the turn from the transcript and reports
  every injected strategy with the turn's evidence (`antigravity:<conversation>:<turn>`), mapping
  `terminationReason` to completed, cut short, aborted or error; `SessionStart` sends retention reports and the
  aborted reports of sessions whose Antigravity process is gone, and sets Evolver up in the background.
  The first model call of a conversation under a new Antigravity process does the same when no `SessionStart`
  ran (CLI 1.3.x has none; the App runs none for a reopened conversation).
- Checks read their exit code from the command's result step in the transcript; a command moved to the background
  counts as not run. Steps are read in `step_index` order.
- Session end without a session-end event: the worker `SessionStart` starts waits for the session's Antigravity
  process (the nearest `agy`/`language_server` ancestor) to exit, then reports the session's open strategies as
  aborted and distills its candidate; the next session start does the same for one it missed.
- Follow-up correction/praise reports, retention reports, a report outbox with retries, and local root-event
  records through the installed Evolver's core.
- Session-end distillation: a verified turn becomes the session's candidate (one that reused an injected strategy
  too; the engine's intake drops a repeated Gene)
  (`~/.evolver/state/antigravity-distill-pending.json`), dropped by a correction, and is distilled once by
  Antigravity itself, headless (`agy --input-format stream-json --output-format stream-json
  --disable-slash-commands --model <session model>`, empty workspace, `EVOLVER_ANTIGRAVITY_HEADLESS=1` keeping this
  plugin's hooks out of the run), then sent to `POST /conversation/distill` with `platform: 'antigravity'`. Three
  tries; leftovers of ended sessions are claimed by the next session start. State writes go through a shared lock.
- Every reuse report says `applied: used` (dsh-evolver#55): an injected strategy counts as used, and the outcome,
  the next prompt and kept edits judge whether it helped. The turn-end report is `L1` whenever a check ran.
- A Stop with an unknown `terminationReason` leaves the turn open for a later Stop or the next prompt. Reports are
  queued before their injections are marked reported, so a crash sends one twice rather than never.
- Turn counters survive the session, so a resumed conversation never repeats a task id.
- `scripts/evolver.mjs` with `status`, `search`, `distill`, `evolve`, `sync`, `review`, `run`, `solidify`, run by the
  person in a terminal (an Antigravity plugin's commands are skills, which cannot be kept out of the context).
- `npm test` (node --test) for the libraries and the hooks, including runs under a fake Antigravity host process.

### Removed
- The MCP servers (`mcp_config.json`, `mcp/evolver-proxy.mjs`, `@evomap/gep-mcp-server`) and every `evolver_*` and
  `gep_*` tool.
- The eight skills (`capability-evolver`, `evolver-*`): Antigravity cannot keep a plugin skill out of the context,
  and dsh ships its skill off.
- The `PostToolUse` evolution-signal notice, the git-diff outcome recording at `Stop`, the claim nudge and the
  workspace id file (`.evolver/workspace-id`).
- `marketplace.json`: Antigravity has no such file; plugins install from a folder or GitHub URL.
- The `ANTIGRAVITY_PLUGIN_ROOT` variable in hook commands: Antigravity does not document it. Hooks run the plugin
  from the two documented install folders only, never from their working directory.

### Changed since 0.1.1 (the MCP parts are superseded by the removal above)
- MCP bridge is Recipe-first: `evolver_recipe_search` then `evolver_recipe_express`
  against Proxy `/recipe/search` and `/recipe/express`. `evolver_search_assets`
  remains as Gene/Capsule fallback when no Recipe hits.

### Changed since 0.1.1 — onboarding UX
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
