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

const located = (event, { cwd, env }) => spawnSync('/bin/sh', ['-c', commandOf(event).replace('exec node', 'exec echo')], { cwd, env, encoding: 'utf8' }).stdout.trim();

function install(home, folder) {
  mkdirSync(join(home, folder), { recursive: true });
  symlinkSync(pluginRoot, join(home, folder, NAME));
  return join(home, folder, NAME);
}

test('each hook command runs the installed plugin, never a copy in its working directory, else answers neutrally', () => {
  sandbox = sandboxHome();
  for (const event of Object.keys(spec)) {
    assert.deepEqual(runCommand(event, { cwd: pluginRoot, env: sandbox.env }), NEUTRAL[event], `${event}: a workspace holding these files runs nothing`);
  }
  const config = install(sandbox.home, '.gemini/config/plugins');
  assert.equal(located('Stop', { cwd: pluginRoot, env: sandbox.env }), join(config, 'hooks', 'stop.mjs'));
  const cli = install(sandbox.home, '.gemini/antigravity-cli/plugins');
  assert.equal(located('PreToolUse', { cwd: sandbox.home, env: sandbox.env }), join(cli, 'hooks', 'pre-tool-use.mjs'));
  for (const event of Object.keys(spec)) assert.deepEqual(runCommand(event, { cwd: sandbox.home, env: sandbox.env }), NEUTRAL[event], `${event} installed`);
});
