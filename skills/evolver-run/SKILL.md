---
name: evolver-run
description: Run one Evolver self-evolution cycle on the current repo (collect signals → select/mutate genes → propose changes). Use when the user asks to "run evolution cycle", "start evolver loop", or "run evolver strategy".
---

# Evolver Run Cycle

Execute an automated self-evolution cycle in the current git repository.

## Execution Guide

When requested, follow these steps:

1. **Verify git environment** — run `git rev-parse --is-inside-work-tree`. If we are not in a git repo, explain that Evolver requires git and stop.

2. **Resolve CLI and execute**:
   
   ```bash
   EVOLVER="evolver"
   command -v evolver >/dev/null 2>&1 || EVOLVER="npx -y @evomap/evolver"
   ```

   Run the evolution cycle passing through strategy or looping arguments if requested (defaulting strategy to `balanced`):
   
   ```bash
   EVOLVE_STRATEGY="balanced" $EVOLVER run
   ```

3. **Summarize results** — explain what changes occurred:
   - What signals were collected?
   - What gene was selected or mutated?
   - Are there any changes **pending solidify**?

If there are pending changes, remind the user they can review and approve them using the `evolver-review` skill (e.g. `npx @evomap/evolver review --approve`), or roll them back if they are not to their liking. Do not auto-approve pending changes yourself; always leave that decision to the user.
