---
name: evolver-solidify
description: Solidify the current working changes into a durable Evolver gene/capsule (with rollback safety). Use when the user requests to "solidify changes", "save gene", or "capture this capsule".
---

# Evolver Solidify

Solidify the current working-tree changes into a durable, reusable Evolver asset.

## Execution Guide

When requested, follow these steps:

1. **Verify environment** — ensure we are in a git repository (`git rev-parse --is-inside-work-tree`) and show `git diff --stat` so the user sees what changes are being captured.

2. **Formulate summary** — if the user didn't specify a summary or note, infer a concise one-line description of the change from the diff and use it for the `--summary` flag.

3. **Resolve CLI and execute**:
   
   ```bash
   EVOLVER="evolver"
   command -v evolver >/dev/null 2>&1 || EVOLVER="npx -y @evomap/evolver"
   ```

   Run the solidify command with inferred or specified arguments:
   
   ```bash
   $EVOLVER solidify --summary="[Insert summary here]"
   ```

   *(Pass `--dry-run` first if the user requested a dry run/preview)*.

4. **Report outcome** — print details about the gene/capsule that was created or updated, and whether a rollback point was successfully recorded.
