---
name: evolver-distill
description: Distill a reusable skill/gene from recent run history (optionally from an LLM response file). Use when the user asks to "distill skill", "extract gene", or "generalize lessons".
---

# Evolver Distill

Distill a reusable, generalized skill or gene from recent run history or a response file.

## Execution Guide

When requested, follow these steps:

1. **Prefer the Proxy conversation distiller when available** — if `evolver_distill_conversation` is in the MCP tool list and the reusable lesson came from the current conversation, call it first with a concrete summary, signals, strategy steps, artifacts, and validation evidence. The Proxy applies the quality gate, writes the Gene/Capsule locally, and queues Hub publishing when configured.

2. **Resolve CLI and execute as a fallback or for existing history**:
   
   ```bash
   EVOLVER="evolver"
   command -v evolver >/dev/null 2>&1 || EVOLVER="npx -y @evomap/evolver"
   ```

   Run the distill command passing any optional arguments (e.g. `--response-file=<path>`):
   
   ```bash
   $EVOLVER distill
   ```

3. **Report and explain** — summarize what was distilled:
   - What candidate skill or gene was created?
   - What signals does it generalize?

Remind the user that only assets produced through genuine Evolver self-evolution are eligible to be synced or published to the EvoMap skill store using the `evolver-sync` skill.
