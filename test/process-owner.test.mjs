import assert from 'node:assert/strict';
import { test } from 'node:test';

import { hostProcess, ownerIsGone, processTableOf } from '../lib/process-owner.mjs';
import { deadPid } from './helpers/sandbox.mjs';

const TABLE = processTableOf([
  '  1     0 /sbin/launchd',
  ' 400     1 /bin/zsh',
  ' 500   400 /Users/me/.local/bin/agy',
  ' 510   500 /bin/sh',
  ' 520   510 node',
  ' 700   400 /Users/me/.local/bin/agy',
  ' 710   700 /Users/me/.local/bin/language_server_macos_arm',
  ' 720   710 /bin/sh',
  ' 600     1 /Applications/Antigravity.app/Contents/MacOS/Antigravity',
  ' 610   600 /Applications/Antigravity.app/Contents/Resources/bin/language_server',
  ' 620   610 node',
].join('\n'));

test('under the CLI the owner is the nearest agy ancestor, past the shell the hook runs in, and can distill', () => {
  assert.deepEqual(hostProcess(510, TABLE), { pid: 500, cli: '/Users/me/.local/bin/agy' });
  assert.equal(hostProcess(500, TABLE).pid, 500, 'a hook started without a shell');
});

test('a language server the CLI runs its hooks from is the owner, and the agy above it still distills', () => {
  assert.deepEqual(hostProcess(720, TABLE), { pid: 710, cli: '/Users/me/.local/bin/agy' });
});

test('under the App the owner is the language server that starts its hooks, which runs no distillation', () => {
  assert.deepEqual(hostProcess(610, TABLE), { pid: 610, cli: null });
});

test('without an Antigravity ancestor there is no owner, and no owner is never gone', () => {
  assert.equal(hostProcess(400, TABLE), null);
  assert.equal(hostProcess(999, TABLE), null);
  assert.equal(ownerIsGone(null), false);
  assert.equal(ownerIsGone(process.pid), false);
  assert.equal(ownerIsGone(deadPid()), true);
});
