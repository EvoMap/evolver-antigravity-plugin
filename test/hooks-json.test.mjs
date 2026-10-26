import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, test } from 'node:test';

import { pluginRoot, sandboxHome } from './helpers/sandbox.mjs';

const NAME = 'evolver-antigravity-plugin';
const spec = JSON.parse(readFileSync(join(pluginRoot, 'hooks.json'), 'utf8'))[NAME];
const DOCUMENTED_EVENTS = ['SessionStart', 'PreToolUse', 'PostToolUse', 'PreInvocation', 'PostInvocation', 'Stop'];
const NEUTRAL = { SessionStart: {}, PreInvocation: {}, PreToolUse: { decision: 'allow' }, Stop: { decision: 'stop' } };

const commandOf = (event) => (event === 'PreToolUse' ? spec[event][0].hooks[0].command : spec[event][0].command);

let sandbox = null;
afterEach(() => sandbox?.cleanup());

function runCommand(event, { cwd, env }) {
  const result = spawnSync('/bin/sh', ['-c', commandOf(event)], { cwd, env: { ...env, EVOLVER_ANTIGRAVITY_HEADLESS: '1' }, input: '{}', encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

test('hooks.json is one named hook with documented events only, timeouts in seconds', () => {
  assert.deepEqual(Object.keys(JSON.parse(readFileSync(join(pluginRoot, 'hooks.json'), 'utf8'))), [NAME]);
  for (const event of Object.keys(spec)) assert.ok(DOCUMENTED_EVENTS.includes(event), event);
  for (const event of Object.keys(spec)) assert.ok(commandOf(event) && (spec[event][0].timeout ?? spec[event][0].hooks[0].timeout) <= 10, event);
});

test('each hook command finds the plugin in its working directory or an install folder, else answers neutrally', () => {
  sandbox = sandboxHome();
  const elsewhere = join(sandbox.home, 'elsewhere');
  mkdirSync(elsewhere, { recursive: true });
  for (const event of Object.keys(spec)) {
    assert.deepEqual(runCommand(event, { cwd: pluginRoot, env: sandbox.env }), NEUTRAL[event], `${event} from the plugin folder`);
    assert.deepEqual(runCommand(event, { cwd: elsewhere, env: sandbox.env }), NEUTRAL[event], `${event} with no plugin anywhere`);
  }
  mkdirSync(join(sandbox.home, '.gemini', 'config', 'plugins'), { recursive: true });
  symlinkSync(pluginRoot, join(sandbox.home, '.gemini', 'config', 'plugins', NAME));
  const found = spawnSync('/bin/sh', ['-c', commandOf('Stop').replace('exec node', 'exec echo')], { cwd: elsewhere, env: sandbox.env, encoding: 'utf8' });
  assert.equal(found.stdout.trim(), join(sandbox.home, '.gemini', 'config', 'plugins', NAME, 'hooks', 'stop.mjs'));
});
