---
name: evolver-status
description: Show Evolver health — evolution memory location & size, recent log, and whether the full engine is installed. Use when the user asks for "evolver status", "evolver health", or "check evolver".
---

# Evolver Status

Check the health and readiness of the Evolver persistent self-evolution memory plugin.

## Execution Guide

When requested by the user, run the following diagnostic checks using shell/terminal commands and report the findings back to the user as a clean checklist:

1. **Evolution memory** — check if the local JSONL graph exists and print how many outcomes it holds:

   ```bash
   F=~/.evolver/memory/evolution/memory_graph.jsonl
   [ -f "$F" ] && echo "memory graph: $F ($(wc -l < "$F" | tr -d ' ') outcomes)" || echo "no local evolution memory yet (it appears after a session ends with changes in a git repo)"
   ```

2. **This workspace's id** — verify the forge-resistant workspace ID (scoping key):

   ```bash
   R=$(git rev-parse --show-toplevel 2>/dev/null); [ -n "$R" ] && { [ -f "$R/.evolver/workspace-id" ] && echo "workspace-id: present" || echo "workspace-id: not yet created (made on first recorded outcome)"; } || echo "not a git repo — memory inactive here"
   ```

3. **Recent activity** — print the last few lines of the evolution log:

   ```bash
   tail -n 5 ~/.evolver/logs/evolution.log 2>/dev/null || echo "no evolution log yet"
   ```

4. **Full engine (optional)** — check if the global `@evomap/evolver` CLI is installed:

   ```bash
   command -v evolver >/dev/null 2>&1 && evolver --version 2>/dev/null | head -1 || echo "evolver CLI not installed — hooks still work standalone; 'npm i -g @evomap/evolver' unlocks full pipeline features"
   ```

Finish with a single-line summary statement on the overall readiness of the self-evolution memory.
