<p align="center">
  <img src="assets/logo.png" alt="Evolver" width="96" height="96" />
</p>

<h1 align="center">Evolver</h1>

Evolver for Antigravity, powered by [Evolver](https://github.com/EvoMap/evolver) (`@evomap/evolver`) and
[EvoMap](https://evomap.ai): before each prompt it recalls one proven strategy, grades how the turn reused it on
evidence (the checks the turn ran, whether its edits were kept, your next reply), reports that back to the EvoMap
network, and distills the session's verified work into a new Gene when the session ends.

The plugin runs entirely from Antigravity hooks. It ships **no MCP server, no tools and no skill**, so nothing of
Evolver enters the model's context but the recalled steps, which end with `Apply them where they fit.` — no
instruction to search, report or distill. Reports and distillation run on hook events; people reach Evolver through
the plugin's `scripts/evolver.mjs`.

## What runs when

Antigravity has six hook events and none for a submitted prompt or a session end
([hooks docs](https://antigravity.google/docs/hooks)). Hooks get no prompt, tool output or answer either, only the
conversation's transcript, so the plugin reads those from `transcriptPath`.

| Antigravity hook | What the plugin does |
| --- | --- |
| `SessionStart` (or the first model call of a conversation under a new Antigravity process: CLI 1.3.x runs no `SessionStart`, and the App runs none for a conversation it reopens) | Reports the previous session's kept or reverted edits (retention) and the open strategies of a session whose Antigravity process is gone (aborted), starts Evolver if it is missing or too old, and distills leftover candidates — all in a detached background worker that then waits for this session's Antigravity process to exit. Adds no context, except a one-off notice when it installed, upgraded or could not start Evolver. |
| `PreInvocation` | Runs before every model call. The first call after a new prompt of yours in the transcript opens a turn: it closes a turn that got no `Stop` as one that ended on an error, labels the previous turn's reuse from this prompt (correction or praise) and drops its candidate on a correction, recalls by the prompt text (`POST /asset/fetch {text}` on the local Proxy) and injects the best strategy as an `ephemeralMessage` step. An ephemeral message lasts one model call, so the same strategy is injected again before each later call of the turn; it is recalled once. |
| `PreToolUse` (`write_to_file`, `replace_file_content`, `multi_replace_file_content`) | Hashes the file an edit is about to change, for the retention report. Answers `{"decision":"allow"}`, which hands the call on to your permission settings unchanged. |
| `Stop` | Reads the turn from the transcript — commands, checks (test, build, lint, type check) with their exit codes, touched paths, the files its edits changed, the final answer — reports every strategy injected into the turn, and makes the turn the session's distillation candidate when it ended verified. A turn that runs again without a new prompt (a background command finished, another hook continued it) re-judges the candidate on the whole turn; its reports have already gone out. Answers `{"decision":"stop"}`. |

**Session end.** With no session-end event, a session counts as over once its Antigravity process is gone. The
worker the session start leaves behind polls that process every two seconds; when it exits (you quit the CLI or the
App), the worker reports the session's open strategies as aborted and distills its candidate. If the worker never
ran, the next session start does the same. The App hosts all its conversations in one language server, so there
they end together when the App quits.

**Turn end reasons.** `terminationReason` `model_stop` or `NO_TOOL_CALL` (sent by agy 1.2.7 and 1.2.9) is a
completed turn, `max_steps_exceeded` a cut-short one, anything naming a cancel or interrupt an aborted one, and one
naming an error (or a Stop carrying an `error`) a failed one. A Stop with any other reason settles nothing: a later
Stop, or else the next prompt (as an error), closes the turn.

## Prerequisites

- Antigravity with plugin hooks. Plugin hooks are documented for the App, the CLI and the IDE; only the CLI has
  been seen running them.
- Node.js 20 or newer on the `PATH` Antigravity hooks see. Hook commands are shell commands (`sh -c` on the CLI);
  macOS and Linux only.
- Evolver 2.0.44 or newer. The plugin installs it under `~/.evolver/state/antigravity-engine` and starts its Proxy
  in the background when it is missing; `npm install -g @evomap/evolver@latest` works too.
- For distillation, the Antigravity CLI (`agy`) on the `PATH`, logged in once interactively. Under the App, the
  plugin looks for `agy` on the `PATH`; without it, candidates wait and the status command says so.

## Install

```bash
agy plugin install /path/to/evolver-antigravity-plugin
```

The docs say the CLI stages plugins in `~/.gemini/antigravity-cli/plugins/<name>/` (agy 1.2.7 was seen copying to
`~/.gemini/config/plugins/<name>/` instead). For the App and the IDE, copy or link the folder to
`~/.gemini/config/plugins/evolver-antigravity-plugin`. Antigravity documents no variable for a plugin's own folder
and no working directory for hooks, so each hook command runs the plugin from those two folders only — never from
its working directory, which a project could fill with scripts of its own — and answers neutrally when it finds
neither or no `node`. A plugin installed per workspace (`.agents/plugins/`) is not found.

## Configure

**Local memory works with zero config** — no account, no key, no node id. The plugin reads the live Proxy URL and
token from `~/.evolver/settings.json` (written by the Proxy), else `http://127.0.0.1:19820` (`EVOMAP_PROXY_PORT`
changes the port).

### Connecting to the EvoMap network (optional)

1. **Leave `A2A_NODE_ID` blank.** The first run registers a fresh node for you and prints a **claim link**.
2. Open that link while signed in to [evomap.ai](https://evomap.ai). `evolver.mjs status` shows a pending link.

## Commands

An Antigravity plugin cannot add a command that runs without the model: its commands are skills, and every skill's
name and description sit in the model's context with no way to keep one out. So the commands dsh offers as
`/evolver-*` are one script the person runs in a terminal. Nothing of it reaches the model.

```bash
node <plugin folder>/scripts/evolver.mjs <command> [arguments]
```

| Command | What it does |
| --- | --- |
| `status` | The Proxy, engine setup, the latest recall, recent reuse reports with the Hub's verdict, waiting candidates, claim link. |
| `search <text>` | Searches the EvoMap network (`POST /asset/search`). |
| `distill [--session <id>] [focus]` | Distills a session's latest verified turn now. A terminal has no current session, so it takes the most recently written candidate unless `--session` names one (dsh distills its own session). |
| `evolve [focus]` | Prints an evolution-checkpoint instruction to paste into Antigravity; the only command meant for the agent. |
| `sync`, `review`, `run`, `solidify` | Run the `evolver` CLI (`npx -y @evomap/evolver@^2.0.44` when it is not installed), ten minutes at most. |

## Session-end distillation

A turn that ended completed, used tools and passed its last check leaves a candidate in
`~/.evolver/state/antigravity-distill-pending.json`; a later verified turn replaces it, and a next prompt that reads
as a correction drops it (a distillation already running sees that and stops). A turn that reused an injected
strategy is a candidate too: the engine's Gene intake drops a Gene that repeats one it already has. When the session ends, a detached
worker runs Antigravity itself headless on the session's model —
`agy --input-format stream-json --output-format stream-json --disable-slash-commands --model <modelName>` with the
prompt on stdin as one `user` event, in an empty temporary directory — to write a Gene from a digest of that turn
(task, commands, touched paths, checks, final answer — never the whole history), and sends it to the Proxy's
`POST /conversation/distill` with `platform: 'antigravity'`, `trigger: 'session_end'`, `persist: true`,
`publish: false` and its own token cost as `distill_usage`. Keys and tokens are stripped from the candidate first,
paths and a manual focus included.

`agy` has no flag that turns hooks, plugins or tools off, so the run's environment carries
`EVOLVER_ANTIGRAVITY_HEADLESS=1`: this plugin's hooks see it, recall nothing, start no worker and write no state.
Headless mode soft-denies shell commands, and the run's workspace is the empty directory. Each run leaves a
conversation of its own in Antigravity's history.

A candidate stays on disk until it is distilled; three failed tries (no `agy` to run, not logged in, an unknown
model, an unparsed answer, a Proxy error) give it up. One whose session is over is claimed by the next session
start or the exit worker, one process at a time, while an idle session keeps its own.

**Owner.** Antigravity runs each hook through `sh -c` from the language server that hosts its conversations, so the
hook's own pid says nothing. The owner recorded with a candidate or an injection is the nearest ancestor process
named `agy*` or `language_server*`; the distillation runs the nearest `agy` above the hook, else the one on the
`PATH`. Where no process table can be read no owner is recorded, and such entries are only reported or distilled
once claimed by hand (`evolver.mjs distill`).

## Reuse reports

Every strategy injected into a turn is reported through the Proxy's `POST /asset/reuse-result` as
`{asset_id, outcome, task_id, reason, evidence}`:

| Report | When | `task_id` | `evidence` |
|---|---|---|---|
| Turn end | `Stop`, or the next prompt after a turn that got no `Stop` | `antigravity:<conversation>:<turn>` | `tier` `L1` when the turn ran a test, build, lint or type check, else `none`; `applied: used`; `check` `{kind, passed, fail_then_pass}` of the last check; `aborted`; `stage: immediate` |
| Correction | the next prompt says the answer did not hold, or approves it | `…:correction` | `tier: L3`, `applied: used`, `stage: correction` |
| Retention | the next session in the same project finds the turn's edits kept or reverted | `…:retention` | `tier: L2`, `applied: used`, `stage: retention` |
| Aborted | Antigravity exits, or is killed, before the turn ends (reported by the exit worker, or by the next session start) | `antigravity:<conversation>:<turn>` | `tier: none`, `applied: used`, `aborted: true`, `stage: immediate` |

- **`applied`** is always `used`: the model follows what is injected into its turn. Whether the strategy helped is
  judged by the outcome (the last check, or how the turn ended), the next prompt and whether the edits were kept.
- **Checks** are `run_command` calls that run tests, builds, linters or type checkers. Hooks get no exit code;
  Antigravity writes it into the command's result step in the transcript (`The command exited with code 2.`), and
  the plugin reads it there. A result with no exit code is judged by its output; a command whose result step has
  not completed (moved to the background) counts as not run.
- **Resumed conversations** keep their conversation id, and the turn counter survives the session, so a task id
  never repeats; session files are pruned after 8 days.
- **Delivery.** Reports wait in `~/.evolver/state/antigravity-reports-outbox.json` and are retried by the background
  worker at every turn end, follow-up prompt and session start for 8 days. One the Hub refuses as invalid is
  settled as rejected and never resent. Reports with evidence are also written once to the local root event log.
- Reasons name the turn and the check kind, never the prompt, a command or code, and the
  prompt loses keys and tokens before recall sends it.

## Develop

```bash
npm test
```

## Uninstall

`agy plugin uninstall evolver-antigravity-plugin`, or remove the folder from `~/.gemini/config/plugins/`. Local
Evolver memory under `~/.evolver/` is left intact.

## License

MIT © EvoMap.
