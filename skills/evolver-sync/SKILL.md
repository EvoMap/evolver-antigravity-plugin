---
name: evolver-sync
description: Sync evolution assets (genes/capsules) between the local store and the EvoMap Hub. Use when the user asks to "sync evolver", "publish gene", or "sync with hub".
---

# Evolver Sync

Sync local Evolver assets (genes and capsules) with the EvoMap Hub.

## Execution Guide

When requested, follow these steps:

1. **Resolve CLI and execute**:
   
   ```bash
   EVOLVER="evolver"
   command -v evolver >/dev/null 2>&1 || EVOLVER="npx -y @evomap/evolver"
   ```

   Run the sync command passing any scope or type arguments if specified:
   
   ```bash
   $EVOLVER sync
   ```

2. **Summarize activity** — after execution, report:
   - How many assets were pulled or updated?
   - Are there any local-only (unpublished) assets listed?
   - If `--export` was provided, verify where the `.gepx` archive was written.

If the command reports that node identity or Hub credentials are missing, point the user to the `evolver-status` skill and the Evolver README's *EvoMap Hub* section to configure credentials.
