<p align="center">
  <img src="assets/logo.png" alt="Evolver" width="96" height="96" />
</p>

# Evolver — Self-Evolving Agent Memory (Antigravity Desktop Plugin)

Give the Antigravity Desktop agent a **persistent, auditable evolution memory**. Instead of re-solving the same problem every session, the agent recalls what worked before, notices improvement signals as it edits, and records how each task turned out — so the next session starts smarter.

Powered by the [Genome Evolution Protocol (GEP)](https://evomap.ai) and the [`@evomap/evolver`](https://github.com/EvoMap/evolver) engine. 

> **Status:** v0.1.0 — Native Antigravity port. Zero-Config MCP & Hooks. Fully compatible with standalone local memory graphs.

---

## Features

### 1. Standalone Session Hooks (Zero-Config, Automatic)

Three lifecycle hooks run automatically on events and require no configuration or CLI tools:

| Hook | Event | Effect |
|---|---|---|
| `session-start.js` | `PreInvocation` | Injects a summary of recent **successful** outcomes for this workspace (score ≥ 0.5, < 7 days, max 3) as an ephemeral model context step. When a node has been registered locally but not yet connected to the network, it also gives a one-time (throttled) nudge to claim it. |
| `signal-detect.js` | `PostToolUse` | Detects improvement signals (`log_error`, `perf_bottleneck`, `capability_gap`, `test_failure` ...) in tool outputs or edits and exits cleanly under Antigravity's PostToolUse contract. |
| `session-end.js` | `Stop` | Classifies the current working-tree/staged git diff once per session and appends the outcome to the evolution memory graph. |

### 2. Built-in GEP MCP Server (Exclusive to Antigravity Port)

Unlike the Claude Code plugin which requires manual configuration of the Model Context Protocol, the **Antigravity Port natively bundles GEP MCP integration**.

Through [mcp_config.json](mcp_config.json), the plugin automatically provisions the client to pull and run `@evomap/gep-mcp-server` via `npx -y` on launch. This loads the `gep_*` tool suite directly into the agent's toolbelt, enabling:
- **Interactive query capabilities**: The agent can search past memory charts on-the-fly using `gep_query_outcomes`.
- **Maturity monitoring**: Check overall workspace evolution status with `gep_get_workspace_state`.

The same config also registers the local **Evolver Proxy bridge** (`mcp/evolver-proxy.mjs`) when a Proxy is running. This exposes `evolver_status`, asset search/fetch/publish tools, and `evolver_distill_conversation` so Antigravity can turn a high-signal conversation into a gated Gene/Capsule without waiting for a manual CLI distill step.

### 3. Native Agent Skills

Original Claude Code slash commands are mapped directly into discoverable **Agent Skills** (located under `skills/`):
- `capability-evolver`: Main guide for GEP self-evolution, including MCP instructions.
- `evolver-status`: Full diagnostic checklist of the plugin's status.
- `evolver-evolve`: Triggers manual checkpoint.
- `evolver-review`: Review, approve (solidify), or reject (roll back) pending changes.
- `evolver-solidify`: Manually solidify changes as a durable capsule.
- `evolver-run`: Shell wrapper to run the full `evolver run` cycle pipeline.
- `evolver-distill`: Distill history to package reusable skills.
- `evolver-sync`: Manually push/pull outcomes with an EvoMap Hub node.

---

## Installation

### Antigravity Plugin Availability
Antigravity currently supports local plugin bundles and Google-curated "Build with Google" bundles. There is no documented public third-party Antigravity plugin marketplace submission flow for this package yet.

For CLI installs, use Antigravity's local plugin command:
```bash
agy plugin install /path/to/evolver-antigravity-plugin
```

### Sideloading (Local Development)
1. Clone or download this directory into your scratch workspace:
   ```bash
   ~/.gemini/antigravity/scratch/evolver-antigravity-plugin
   ```
2. Establish a symlink from this directory into Antigravity's active plugins directory:
   ```bash
   ln -s ~/.gemini/antigravity/scratch/evolver-antigravity-plugin ~/.gemini/config/plugins/evolver-antigravity-plugin
   ```
3. Restart or refresh Antigravity Desktop.

If `~/.gemini/config/mcp_config.json` exists, it must contain valid JSON, for example:
```json
{
  "mcpServers": {}
}
```

After installing, that's it — **local memory works with zero config**: no account, no key, nothing to fill in.

### Connecting to the EvoMap network (optional)

The network layer (searching/reusing genes & capsules) is opt-in. To connect:

1. In the plugin's config, **leave "Node ID" blank**. Don't paste an old id and
   don't go hunting for a secret — blank is the intended path.
2. Install the engine and run it once inside a git repo:

   ```bash
   npm i -g @evomap/evolver
   evolver
   ```

   The first run registers a fresh node for you and prints a **claim link**.
3. Open that link while signed in to [evomap.ai](https://evomap.ai) to claim the
   node. Check status any time with the `evolver-status` skill.

If you see a different, older node than you expected, don't worry about it —
just claim the current one. Reusing a specific older node requires that node's
secret, which is more trouble than it's worth.

---

## Requirements

- **Node.js** ≥ 18 (the hooks are Node scripts).
- **Git** — outcomes and scores are derived from the project's local git diffs.
- Active workspace configured inside a Git repository.

---

## Memory Modes

### Local Mode (Default, Zero Config)
By default, the hooks write outcomes to:
`~/.evolver/memory/evolution/memory_graph.jsonl` (or project-local `memory/evolution/` within evolver-managed projects).
**No account, no API keys, and no network connections required.**

### Full Evolution Engine (Optional Upgrade)
To unlock the complete automated review-and-solidify pipeline (log analysis, automatic refactoring, prompt optimization), install the CLI:
```bash
npm install -g @evomap/evolver
```
Installing the engine CLI does *not* impact hook performance. The hooks continue writing memory entries locally, which are then consumed by the engine's pipelines.

### Hub Mode (Community Strategies)
Most people don't need this — follow "Connecting to the EvoMap network" above (leave the node id blank, run the engine once, claim the node it prints). These env vars are only for advanced setups that stream outcomes to a **node you already run and have claimed**:
```bash
export EVOMAP_HUB_URL="https://evomap.ai"
export EVOMAP_API_KEY="…"     # from your claimed node on evomap.ai
export EVOMAP_NODE_ID="…"     # leave unset to use the auto-registered node instead
```
Leave `EVOMAP_NODE_ID` unset unless you're deliberately pointing this at a specific node — you never need to invent or hunt for an id. The hooks safely write to the Hub with a fallback to local memory if the server is unreachable. Hub recording uses Node's built-in `fetch`, so the API key is not exposed in process arguments.

---

## License

MIT © EvoMap. Fully clean-room implementation written against GEP specifications, containing no GPL components.
