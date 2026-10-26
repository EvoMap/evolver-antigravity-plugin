import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, test } from 'node:test';

import { deadPid, fakeHost, fakeProxy, readJson, runHook, sandboxHome, waitFor, writeProxySettings } from './helpers/sandbox.mjs';
import { transcriptWriter } from './helpers/transcript.mjs';

const ASSET_ID = 'sha256:40c6ec437967f3ce0a2101857736b95d2770a014f452752a9421db2bee223f37';
const LRU_ASSET = {
  asset_id: ASSET_ID,
  short_title: 'LRU cache in Node.js',
  similarity: 0.8,
  strategy: [
    'Create `lru-cache.js` exporting the cache class',
    'Back it with a `Map` so lookups stay O(1)',
    'Evict the oldest entry with `keys().next()` once over capacity',
    'Run `node --test` to confirm the eviction order',
  ],
};
const LRU_CODE = 'export class LruCache {\n  #entries = new Map();\n  evict() { this.#entries.delete(this.#entries.keys().next().value); }\n}\n';
const LRU_PROMPT = '用 Node 写一个 LRU cache，带 get/set 和淘汰';
const FAILED_RUN = { exit: 1, output: 'not ok 1 - evicts the oldest\nAssertionError: expected 1 to equal 2\n' };
const PASSED_RUN = { exit: 0, output: 'ℹ tests 2\nℹ pass 2\nℹ fail 0\n' };

let sandbox = null;
let proxy = null;
const hosts = [];

afterEach(async () => {
  await Promise.all(hosts.splice(0).map((host) => host.kill()));
  await proxy?.close();
  sandbox?.cleanup();
  sandbox = null;
  proxy = null;
});

async function startSandbox({ assets = [LRU_ASSET], env = {} } = {}) {
  sandbox = sandboxHome();
  Object.assign(sandbox.env, env);
  proxy = await fakeProxy({ assets });
  writeProxySettings(sandbox.home, { url: proxy.url });
}

function startHost() {
  const host = fakeHost(sandbox);
  hosts.push(host);
  return host;
}

function session(id, { host = null } = {}) {
  const cwd = join(sandbox.home, 'project');
  mkdirSync(cwd, { recursive: true });
  const transcript = transcriptWriter(join(sandbox.home, '.gemini', 'antigravity-cli', 'brain', id, '.system_generated', 'logs', 'transcript_full.jsonl'));
  const base = { conversationId: id, workspacePaths: [cwd], transcriptPath: transcript.file, artifactDirectoryPath: join(sandbox.home, 'artifacts'), modelName: 'gemini-test' };
  let current = host;
  let invocation = 0;
  let execution = 0;
  const run = (name, input) => (current ? current.runHook(name, { ...base, ...input }) : runHook(name, { ...base, ...input }, sandbox.env));
  const invoke = () => run('pre-invocation', { invocationNum: invocation++, initialNumSteps: 0 });
  return {
    cwd,
    transcript,
    resumeIn: (next) => {
      current = next;
    },
    start: () => run('session-start', {}),
    invoke,
    prompt: (text) => {
      transcript.prompt(text);
      return invoke();
    },
    edit: async (file, content) => {
      const args = { TargetFile: join(cwd, file), Overwrite: false, CodeContent: content, Description: 'write' };
      const output = await run('pre-tool-use', { toolCall: { name: 'write_to_file', args }, stepIdx: 0 });
      transcript.calls(['write_to_file', args]);
      writeFileSync(args.TargetFile, content);
      transcript.result({ type: 'CODE_ACTION', content: 'created' });
      return output;
    },
    command: (commandLine, result) => transcript.command(commandLine, result),
    stop: (answer, { reason = 'NO_TOOL_CALL', error = '', fullyIdle = true } = {}) => {
      if (answer) transcript.answer(answer);
      execution += 1;
      return run('stop', { executionNum: execution, terminationReason: reason, error, fullyIdle });
    },
  };
}

const statePath = (name) => join(sandbox.home, '.evolver', 'state', name);
const candidates = () => readJson(statePath('antigravity-distill-pending.json'), {});
const fakeAgyCalls = () => readFileSync(join(sandbox.home, 'fake-agy.log'), 'utf8').trim().split('\n').map((line) => JSON.parse(line));
const reuseReports = () => proxy.of('/asset/reuse-result');

const AFTER_EXIT_MS = 30_000;

async function lruTurn(s) {
  const injected = await s.prompt(LRU_PROMPT);
  await s.edit('lru-cache.js', LRU_CODE);
  s.command('node --test', FAILED_RUN);
  s.command('node --test 2>&1 | tail -5', PASSED_RUN);
  await s.stop('LRU 缓存写好了，测试通过。');
  return injected;
}

async function verifiedTurn(s, prompt = 'add a retry to the uploader') {
  await s.prompt(prompt);
  s.command('npm test', PASSED_RUN);
  await s.stop('Retries added; npm test passes.');
}

test('a recalled strategy is injected before the turn\'s first model call and ends with "Apply them where they fit."', async () => {
  await startSandbox();
  const s = session('s-recall');
  const output = await s.prompt(LRU_PROMPT);

  assert.deepEqual(Object.keys(output), ['injectSteps']);
  const [{ ephemeralMessage }] = output.injectSteps;
  assert.equal(ephemeralMessage, [
    '[Evolution Memory] LRU cache in Node.js (EvoMap network):',
    ...LRU_ASSET.strategy.map((step, index) => `${index + 1}. ${step}`),
    '',
    'Apply them where they fit.',
  ].join('\n'));
  assert.doesNotMatch(ephemeralMessage, /evolver_/);
  assert.deepEqual(proxy.of('/asset/fetch'), [{ text: LRU_PROMPT }]);

  assert.deepEqual(await s.invoke(), output, 'an ephemeral message lasts one model call, so later calls of the turn get it again');
  assert.equal(proxy.of('/asset/fetch').length, 1);
  await s.stop('done');
  assert.deepEqual(await s.invoke(), {}, 'a model call before the next prompt reaches the transcript gets no ended turn\'s strategy');
  await s.prompt('what does the uploader do?');
  assert.deepEqual(await s.invoke(), {}, 'a turn that recalled nothing carries no earlier strategy');
});

test('session start adds nothing to the context when Evolver is set up', async () => {
  await startSandbox();
  assert.deepEqual(await session('s-quiet').start(), {});
});

test('every hook answers the JSON its event requires: a decision for PreToolUse and Stop', async () => {
  await startSandbox({ assets: [] });
  const s = session('s-json');
  assert.deepEqual(await s.start(), {});
  assert.deepEqual(await s.prompt('add a retry to the uploader'), {});
  assert.deepEqual(await s.edit('retry.js', 'export const retry = () => {};\n'), { decision: 'allow' });
  assert.deepEqual(await s.stop('done'), { decision: 'stop' });
});

test('the turn end reports the strategy as used with the turn\'s own evidence, and the turn that reused it is still a candidate', async () => {
  await startSandbox();
  const s = session('s-lru');
  await lruTurn(s);

  const [report] = await waitFor(reuseReports);
  assert.deepEqual(report, {
    asset_id: ASSET_ID,
    outcome: 'success',
    task_id: 'antigravity:s-lru:1',
    reason: 'Injected by Evolver into Antigravity turn 1; last test passed after failing earlier.',
    evidence: { tier: 'L1', applied: 'used', check: { kind: 'test', passed: true, fail_then_pass: true }, aborted: false, stage: 'immediate' },
  });
  assert.equal(candidates()['s-lru'].prompt, LRU_PROMPT, 'a reused strategy is no reason to skip distillation');
});

test('without a check the turn end reason decides: cut short, failed and cancelled turns are no success', async () => {
  await startSandbox();
  const cases = [
    ['s-steps', { reason: 'max_steps_exceeded' }, { outcome: 'failed', aborted: false }],
    ['s-error', { reason: 'error', error: 'model unavailable' }, { outcome: 'failed', aborted: false }],
    ['s-cancel', { reason: 'CANCELED' }, { outcome: 'failed', aborted: true }],
    ['s-done', { reason: 'model_stop' }, { outcome: 'success', aborted: false }],
  ];
  for (const [id, end] of cases) {
    const s = session(id);
    await s.prompt(LRU_PROMPT);
    await s.stop('stopped', end);
  }
  const reports = await waitFor(() => (reuseReports().length === cases.length ? reuseReports() : null));
  for (const [id, , expected] of cases) {
    const report = reports.find((candidate) => candidate.task_id === `antigravity:${id}:1`);
    assert.deepEqual({ outcome: report.outcome, aborted: report.evidence.aborted }, expected, id);
  }
});

test('a correction in the next prompt sends an L3 follow-up under :correction', async () => {
  await startSandbox();
  const s = session('s-fix');
  await lruTurn(s);
  await s.prompt('还是报错，不对');
  const correction = await waitFor(() => reuseReports().find((report) => report.task_id.endsWith(':correction')));
  assert.deepEqual(correction, {
    asset_id: ASSET_ID,
    outcome: 'failed',
    task_id: 'antigravity:s-fix:1:correction',
    reason: "The person's next prompt read as correction of the turn that reused this strategy.",
    evidence: { tier: 'L3', applied: 'used', stage: 'correction' },
  });
});

test('the next session in the same project reports whether the edits were kept, under :retention', async () => {
  await startSandbox();
  await lruTurn(session('s-first'));
  await waitFor(reuseReports);
  await session('s-second').start();
  const retention = await waitFor(() => reuseReports().find((report) => report.task_id.endsWith(':retention')));
  assert.equal(retention.task_id, 'antigravity:s-first:1:retention');
  assert.equal(retention.outcome, 'success');
});

test('a turn that got no Stop is reported failed when the next prompt arrives', async () => {
  await startSandbox();
  const s = session('s-nostop');
  await s.prompt(LRU_PROMPT);
  await s.prompt('continue with the README');
  const [report] = await waitFor(reuseReports);
  assert.equal(report.task_id, 'antigravity:s-nostop:1');
  assert.equal(report.outcome, 'failed');
  assert.equal(report.evidence.aborted, false);
});

test('a test suite still running when the turn ends is no evidence: no L1 report', async () => {
  await startSandbox();
  const s = session('s-long');
  await s.prompt(LRU_PROMPT);
  s.command('npm test', { status: 'RUNNING', output: 'Background command ID: 7' });
  await s.stop('The suite is still running.', { fullyIdle: false });
  const [report] = await waitFor(reuseReports);
  assert.equal(report.evidence.tier, 'none');
  assert.equal(report.evidence.check, undefined);
  assert.match(report.reason, /no check ran/);
});

test('a turn that runs again without a new prompt re-judges its candidate on the whole turn; reports go out once', async () => {
  await startSandbox();
  const s = session('s-again');
  await s.prompt('add a retry to the uploader');
  s.command('npm test', PASSED_RUN);
  await s.stop('Retries added; npm test passes.');
  assert.ok(candidates()['s-again']);
  s.command('npm test', FAILED_RUN);
  await s.stop('The background run failed.');
  assert.deepEqual(candidates(), {});
  s.command('npm test', PASSED_RUN);
  await s.stop('Fixed; npm test passes again.');
  assert.deepEqual(candidates()['s-again'].commands, ['npm test', 'npm test', 'npm test']);
  assert.equal(candidates()['s-again'].answer, 'Fixed; npm test passes again.');
  await waitFor(reuseReports);
  await new Promise((resolve) => setTimeout(resolve, 300));
  assert.equal(reuseReports().length, 1);
});

test('a verified turn becomes the candidate; a failed check leaves none, and a correction drops it', async () => {
  await startSandbox({ assets: [] });
  const s = session('s-candidate');
  await s.prompt('fix the flaky upload');
  s.command('npm test', FAILED_RUN);
  await s.stop('Still failing.');
  assert.deepEqual(candidates(), {}, 'failed_check');

  await verifiedTurn(s);
  const candidate = candidates()['s-candidate'];
  assert.equal(candidate.prompt, 'add a retry to the uploader');
  assert.deepEqual(candidate.commands, ['npm test']);
  assert.deepEqual(candidate.model, { model: 'gemini-test' });
  assert.equal(candidate.turn, 2);

  await s.prompt('不对，这样不行');
  assert.deepEqual(candidates(), {});
});

test('a turn with no tool use or no answer leaves no candidate, and a later verified turn replaces the earlier one', async () => {
  await startSandbox({ assets: [] });
  const s = session('s-skip');
  await s.prompt('what does the uploader do?');
  await s.stop('It uploads files.');
  assert.deepEqual(candidates(), {}, 'no_tool_use');
  await verifiedTurn(s, 'add a retry to the uploader');
  await verifiedTurn(s, 'add a timeout to the uploader');
  assert.equal(candidates()['s-skip'].prompt, 'add a timeout to the uploader');
  assert.equal(candidates()['s-skip'].turn, 3);
});

test('the headless distillation run keeps this plugin\'s hooks out: no recall, no worker, no state', async () => {
  await startSandbox({ env: { EVOLVER_ANTIGRAVITY_HEADLESS: '1' } });
  const s = session('s-headless');
  assert.deepEqual(await s.start(), {});
  assert.deepEqual(await s.prompt(LRU_PROMPT), {});
  s.command('npm test', PASSED_RUN);
  assert.deepEqual(await s.stop('done'), { decision: 'stop' });
  await new Promise((resolve) => setTimeout(resolve, 300));
  assert.deepEqual(proxy.requests, []);
  assert.equal(existsSync(statePath('')), false);
});

test("a killed session's open strategies are reported aborted at the next session start", async () => {
  await startSandbox();
  mkdirSync(statePath(''), { recursive: true });
  writeFileSync(statePath('antigravity-injected-0000000000000000.json'), JSON.stringify({
    'sha256:orphan': { turn: 4, injectedAt: Date.now(), strategyText: '1. a.', sessionId: 's-killed', pid: deadPid() },
  }));
  await session('s-next').start();
  const [report] = await waitFor(reuseReports);
  assert.equal(report.asset_id, 'sha256:orphan');
  assert.equal(report.task_id, 'antigravity:s-killed:4');
  assert.deepEqual(report.evidence, { tier: 'none', applied: 'used', aborted: true, stage: 'immediate' });
});

test('without a SessionStart, the first model call of a conversation under a new process starts the session', async () => {
  await startSandbox();
  mkdirSync(statePath(''), { recursive: true });
  writeFileSync(statePath('antigravity-injected-0000000000000000.json'), JSON.stringify({
    'sha256:orphan': { turn: 2, injectedAt: Date.now(), strategyText: '1. a.', sessionId: 's-killed', pid: deadPid() },
  }));
  const s = session('s-nostart', { host: startHost() });
  await s.prompt(LRU_PROMPT);
  const orphan = await waitFor(() => reuseReports().find((report) => report.asset_id === 'sha256:orphan'));
  assert.equal(orphan.evidence.aborted, true);
  await s.invoke();
  await s.stop('done');
  await waitFor(() => (reuseReports().length === 2 ? reuseReports() : null));
  await new Promise((resolve) => setTimeout(resolve, 300));
  assert.equal(reuseReports().length, 2, 'the session started once');
});

test('when Antigravity exits mid-turn, the session\'s open strategy is reported aborted', async () => {
  await startSandbox();
  const host = startHost();
  const s = session('s-quit', { host });
  await s.start();
  await s.prompt(LRU_PROMPT);
  await host.kill();
  const [report] = await waitFor(reuseReports, AFTER_EXIT_MS);
  assert.deepEqual(report, {
    asset_id: ASSET_ID,
    outcome: 'failed',
    task_id: 'antigravity:s-quit:1',
    reason: 'Injected by Evolver into Antigravity turn 1; no check ran.',
    evidence: { tier: 'none', applied: 'used', aborted: true, stage: 'immediate' },
  });
});

test('when Antigravity exits, the candidate is distilled once by agy run headless, outside the conversation', async () => {
  await startSandbox({ assets: [] });
  const host = startHost();
  const s = session('s-distill', { host });
  await s.start();
  await verifiedTurn(s);
  await new Promise((resolve) => setTimeout(resolve, 300));
  assert.equal(proxy.of('/conversation/distill').length, 0, 'nothing runs while the session lives');
  await host.kill();

  const [body] = await waitFor(() => proxy.of('/conversation/distill'), AFTER_EXIT_MS);
  assert.equal(body.platform, 'antigravity');
  assert.equal(body.trigger, 'session_end');
  assert.equal(body.user_prompt, 'add a retry to the uploader');
  assert.equal(body.final_answer, 'Retries added; npm test passes.');
  assert.deepEqual(body.strategy, ['Measure.', 'Back off.']);
  assert.deepEqual(body.execution, { trace: [{ command: 'npm test', exit: 0 }] });
  assert.equal(body.persist, true);
  assert.equal(body.publish, false);
  assert.equal(body.distill_usage.inputTokens, 900);
  await waitFor(() => Object.keys(candidates()).length === 0);

  const [call] = fakeAgyCalls();
  assert.deepEqual(call.args, ['--input-format', 'stream-json', '--output-format', 'stream-json', '--disable-slash-commands', '--model', 'gemini-test']);
  assert.equal(call.marker, '1');
  assert.match(call.cwd, /evolver-distill-/);
  assert.match(call.prompt, /## Task\nadd a retry to the uploader/);
  assert.equal(proxy.of('/conversation/distill').length, 1);
});

test('a verified turn that reused an injected strategy is distilled like any other', async () => {
  await startSandbox();
  const host = startHost();
  const s = session('s-reused', { host });
  await s.start();
  await lruTurn(s);
  await waitFor(reuseReports);
  await host.kill();
  const [body] = await waitFor(() => proxy.of('/conversation/distill'), AFTER_EXIT_MS);
  assert.equal(body.user_prompt, LRU_PROMPT);
  assert.equal(body.final_answer, 'LRU 缓存写好了，测试通过。');
});

test('a resumed conversation keeps counting turns after Antigravity exits, so task ids never repeat, with or without SessionStart', async () => {
  await startSandbox({ assets: [LRU_ASSET, { ...LRU_ASSET, asset_id: 'sha256:second', short_title: 'LRU eviction tests' }] });
  const first = startHost();
  const s = session('s-resume', { host: first });
  await s.start();
  await s.prompt(LRU_PROMPT);
  await s.stop('done');
  await first.kill();
  await waitFor(reuseReports, AFTER_EXIT_MS);

  s.resumeIn(startHost());
  await s.prompt('用 Node 再写一个 LRU cache 的测试，覆盖淘汰顺序');
  await s.stop('done again');
  const reports = await waitFor(() => (reuseReports().length >= 2 ? reuseReports() : null), AFTER_EXIT_MS);
  assert.deepEqual(reports.map((report) => [report.task_id, report.asset_id]).sort(), [
    ['antigravity:s-resume:1', ASSET_ID],
    ['antigravity:s-resume:2', 'sha256:second'],
  ]);
});

test('an unparsed answer keeps the candidate for the next session start, which claims and distills it', async () => {
  await startSandbox({ assets: [], env: { FAKE_AGY_ANSWER: 'not json' } });
  const host = startHost();
  const s = session('s-retry', { host });
  await s.start();
  await verifiedTurn(s);
  await host.kill();
  await waitFor(() => candidates()['s-retry']?.attempts === 1, AFTER_EXIT_MS);
  assert.equal(candidates()['s-retry'].claimedBy, null);

  delete sandbox.env.FAKE_AGY_ANSWER;
  await session('s-after').start();
  await waitFor(() => proxy.of('/conversation/distill'), AFTER_EXIT_MS);
  await waitFor(() => Object.keys(candidates()).length === 0, AFTER_EXIT_MS);
});

test("a killed session's candidate is claimed and distilled by the next session start; an idle one is left alone", async () => {
  await startSandbox({ assets: [] });
  const candidate = (pid, at) => ({ prompt: 'p', commands: ['npm test'], paths: [], checks: [], answer: 'a', model: { model: 'gemini-test' }, turn: 1, pid, attempts: 0, at });
  mkdirSync(statePath(''), { recursive: true });
  writeFileSync(statePath('antigravity-distill-pending.json'), JSON.stringify({ 's-killed': candidate(deadPid(), 1), 's-idle': candidate(process.pid, 2) }));

  await session('s-next').start();
  await waitFor(() => proxy.of('/conversation/distill'));
  await waitFor(() => !candidates()['s-killed']);
  assert.ok(candidates()['s-idle']);
  assert.equal(proxy.of('/conversation/distill').length, 1);
});
