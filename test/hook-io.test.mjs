import assert from 'node:assert/strict';
import { test } from 'node:test';

import { hookOutputOf } from '../lib/hook-io.mjs';

test('context is injected only where the event takes injectSteps; PreToolUse and Stop keep their decision', () => {
  assert.deepEqual(JSON.parse(hookOutputOf('PreInvocation', ['', 'notice', 'strategy'])), { injectSteps: [{ ephemeralMessage: 'notice' }, { ephemeralMessage: 'strategy' }] });
  assert.deepEqual(JSON.parse(hookOutputOf('SessionStart', '')), {});
  assert.deepEqual(JSON.parse(hookOutputOf('PreToolUse', 'stray')), { decision: 'allow' });
  assert.deepEqual(JSON.parse(hookOutputOf('Stop', 'stray')), { decision: 'stop' });
});
