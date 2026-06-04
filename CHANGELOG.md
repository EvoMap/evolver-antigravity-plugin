# Changelog

All notable changes to the Evolver Antigravity Desktop plugin are documented here.
This project adheres to [Semantic Versioning](https://semver.org/).

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
