import assert from 'node:assert/strict';
import { test } from 'node:test';

import { checkOf, verificationFailed } from '../lib/verification.mjs';

test('a summary that counts real failures beside zero errors still fails', () => {
  assert.equal(verificationFailed('1 failed, 0 errors'), true);
  assert.equal(verificationFailed('tests 3 | failed: 2 | errors: 0'), true);
});

test('a passing summary that counts zero failures passes', () => {
  for (const text of ['ℹ tests 78\nℹ pass 78\nℹ fail 0', 'Tests: 0 failed, 12 passed', 'failures: 0\nerrors: 0', '✔ Validation passed']) {
    assert.equal(verificationFailed(text), false, text);
  }
});

test('a non-zero exit code Antigravity writes into the result step fails the check whatever the output says', () => {
  assert.deepEqual(checkOf('npm test', { status: 'DONE', content: 'The command exited with code 1.\nOutput:\nℹ fail 0' }), { command: 'npm test', failed: true });
  assert.equal(checkOf('npm test', { status: 'ERROR', error: 'exit status 2' }).failed, true);
  assert.equal(checkOf('npm test', { status: 'DONE', error: 'exit status 0' }).failed, false);
  assert.equal(checkOf('npm test', { status: 'ERROR', error: 'permission check failed' }).failed, true);
});

test('a zero exit code still leaves the output to read: a failing run piped through tail exits zero', () => {
  assert.deepEqual(checkOf('npm test 2>&1 | tail -5', { status: 'DONE', content: 'The command exited with code 0.\nOutput:\nnot ok 1 - evicts\nAssertionError: expected 1 to equal 2' }), { command: 'npm test 2>&1 | tail -5', failed: true });
  assert.deepEqual(checkOf('npm test', { status: 'DONE', content: 'The command exited with code 0.\nOutput:\nℹ pass 3\nℹ fail 0' }), { command: 'npm test', failed: false });
});

test('a completed step without an exit code is judged by its output', () => {
  assert.equal(checkOf('node --test', { status: 'DONE', content: 'not ok 1 - adds\n# fail 1\nAssertionError: expected 2' }).failed, true);
  assert.equal(checkOf('node --test', { status: 'DONE', content: 'ℹ pass 3\nℹ fail 0' }).failed, false);
});

test('a check whose step has not completed or never came has no verdict, and other commands are no check', () => {
  assert.equal(checkOf('npm test', { status: 'RUNNING', content: 'Background command ID: 7' }), null);
  assert.equal(checkOf('npm test', null), null);
  assert.equal(checkOf('ls src', { status: 'DONE', content: 'The command exited with code 1.' }), null);
});
