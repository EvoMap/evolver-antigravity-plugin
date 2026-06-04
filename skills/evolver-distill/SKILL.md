---
name: evolver-distill
description: Distill a reusable skill/gene from recent run history (optionally from an LLM response file). Use when the user asks to "distill skill", "extract gene", or "generalize lessons".
---

# Evolver Distill

Distill a reusable, generalized skill or gene from recent run history or a response file.

## Execution Guide

When requested, follow these steps:

1. **Resolve CLI and execute**:
   
   ```bash
   EVOLVER="evolver"
   command -v evolver >/dev/null 2>&1 || EVOLVER="npx -y @evomap/evolver"
   ```

   Run the distill command passing any optional arguments (e.g. `--response-file=<path>`):
   
   ```bash
   $EVOLVER distill
   ```

2. **Report and explain** — summarize what was distilled:
   - What candidate skill or gene was created?
   - What signals does it generalize?

Remind the user that only assets produced through genuine Evolver self-evolution are eligible to be synced or published to the EvoMap skill store using the `evolver-sync` skill.
