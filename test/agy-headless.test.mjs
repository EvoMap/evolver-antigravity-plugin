import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import { agyArguments, agyModelRunner, promptLineOf, resultOfEvents } from '../lib/agy-headless.mjs';
import { freshHome } from './helpers/sandbox.mjs';

const FAKE_AGY = fileURLToPath(new URL('./fixtures/fake-agy.mjs', import.meta.url));

test('agy runs headless on the session model, prompt on stdin as stream-json, with no slash command expansion', () => {
  assert.deepEqual(agyArguments('gemini-3.8-flash-medium'), [
    '--input-format', 'stream-json', '--output-format', 'stream-json', '--disable-slash-commands', '--model', 'gemini-3.8-flash-medium',
  ]);
  assert.deepEqual(JSON.parse(promptLineOf('line one\nline two')), { event: 'user', message: { content: 'line one\nline two' } });
});

test('the answer is the result event of the run', () => {
  const events = [
    { event: 'init', init: {} },
    { event: 'step_update', step_update: { step_type: 'agent_response', text_delta: 'partial' } },
    { event: 'result', result: { status: 'SUCCESS', response: '{"summary":"s"}\n', usage: { input_tokens: 10 } } },
  ].map((event) => JSON.stringify(event)).join('\n');
  assert.deepEqual(resultOfEvents(`${events}\nnot json`), { status: 'SUCCESS', response: '{"summary":"s"}\n', usage: { input_tokens: 10 } });
});

test('the runner marks its environment so this plugin\'s hooks stay out, and works in an empty directory', async (t) => {
  t.after(freshHome());
  const { answer, usage } = await agyModelRunner({ executable: FAKE_AGY })('gemini-test', 'the prompt', AbortSignal.timeout(5_000));
  assert.equal(JSON.parse(answer).title, 'Retry uploads');
  assert.deepEqual(usage, { inputTokens: 900, cachedInputTokens: 0, outputTokens: 120, reasoningOutputTokens: 30 });
  const [call] = readFileSync(join(process.env.HOME, 'fake-agy.log'), 'utf8').trim().split('\n').map((line) => JSON.parse(line));
  assert.equal(call.prompt, 'the prompt');
  assert.equal(call.marker, '1');
  assert.match(call.cwd, /evolver-distill-/);
});

test('a run that is not SUCCESS rejects with its error, and a missing agy with ENOENT', async (t) => {
  t.after(freshHome());
  process.env.FAKE_AGY_STATUS = 'ERROR';
  t.after(() => delete process.env.FAKE_AGY_STATUS);
  await assert.rejects(agyModelRunner({ executable: FAKE_AGY })('m', 'p', AbortSignal.timeout(5_000)), /agy ERROR: Authentication required/);
  await assert.rejects(agyModelRunner({ executable: '/nonexistent/agy' })('m', 'p', AbortSignal.timeout(5_000)), { code: 'ENOENT' });
});
