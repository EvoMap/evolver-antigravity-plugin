---
name: evolver-review
description: Review Evolver's pending evolved changes, then approve (solidify) or reject (roll back). Use when the user asks to "review changes", "accept evolver changes", or "discard/rollback evolver changes".
---

# Evolver Review

Review, approve, or reject changes currently pending solidification in this repository.

## Execution Guide

When requested, execute the following steps:

1. **Show the user what is pending** — run `git status --short` and `git diff` (or `git diff HEAD`) so the user can see the actual proposed edits.

2. **Check for CLI or resolve npx command**:
   
   ```bash
   EVOLVER="evolver"
   command -v evolver >/dev/null 2>&1 || EVOLVER="npx -y @evomap/evolver"
   ```

3. **Resolve user intent**:
   - If the user explicitly asks to **approve** or **accept** the changes: run `$EVOLVER review --approve` to solidify.
   - If the user explicitly asks to **reject**, **discard**, or **roll back** the changes: run `$EVOLVER review --reject` to roll back.
   - If no explicit intent was provided, summarize the pending diff and **ask the user** whether to approve or reject the proposed changes before running any modifying command.

Report the final state (solidified / rolled back) and the resulting git status.
