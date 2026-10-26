import assert from 'node:assert/strict';
import { test } from 'node:test';

import { rememberInjected, reportOrphaned, reportUnreported } from '../lib/injected-assets.mjs';
import { freshHome } from './helpers/sandbox.mjs';

const failing = () => {
  throw new Error('queue write failed');
};

test('an injection is marked reported only after its report was queued: a failed queue leaves it for the next try', (t) => {
  t.after(freshHome());
  rememberInjected('s', 'sha256:a', { turn: 1, strategyText: '1. a.', pid: null });
  assert.throws(() => reportUnreported('s', 1, failing));
  const queued = [];
  reportUnreported('s', 1, (assets) => queued.push(...assets));
  assert.deepEqual(queued.map((asset) => asset.assetId), ['sha256:a']);
  reportUnreported('s', 1, () => assert.fail('reported twice'));
});

test("a gone session's injection is handed over for an aborted report again when queuing it failed", (t) => {
  t.after(freshHome());
  rememberInjected('killed', 'sha256:b', { turn: 3, strategyText: '1. b.', pid: 999 });
  const isGone = (pid) => pid === 999;
  assert.throws(() => reportOrphaned(failing, { isGone }));
  const queued = [];
  reportOrphaned((assets) => queued.push(...assets), { isGone });
  assert.deepEqual(queued.map((asset) => [asset.assetId, asset.sessionId, asset.turn]), [['sha256:b', 'killed', 3]]);
  reportOrphaned(() => assert.fail('reported twice'), { isGone });
});
