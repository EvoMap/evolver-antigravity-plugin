---
name: evolver-evolve
description: Run an evolution checkpoint — recall relevant past outcomes, reflect on the current task, and record what was learned. Use when the user requests an evolution checkpoint or asks to "evolve" or "checkpoint".
---

# Evolver Evolve Checkpoint

Execute a manual checkpoint in the evolution lifecycle of the current task.

## Execution Guide

When triggered, guide yourself through these three steps:

1. **Recall.** Look at the evolution memory the SessionStart hook injected (or read the tail of the memory graph at `~/.evolver/memory/evolution/memory_graph.jsonl`, or the project's local `memory/evolution/memory_graph.jsonl` if present). Summarize any recent outcome — success or failure — that is relevant to what is currently being worked on.

2. **Reflect.** Given the current diff or task state, formulate a concise reflection:
   - What worked so far?
   - What didn't work?
   - What is the durable lesson?

3. **Record.** Remind the user that the `Stop` hook records outcomes automatically at task/session end. If they want to run the full engine *now*, and `@evomap/evolver` is on `PATH`, run:

   ```bash
   evolver run
   ```

   If it is not installed, inform them that the outcome will still be captured automatically by the Stop hook, and that running `npm install -g @evomap/evolver` unlocks the full review-and-solidify cycle.

Keep the process lightweight and focused on generating a durable lesson.
