import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { newUserInput, promptOf, stepsBetween, turnActivityOf } from '../lib/transcript.mjs';
import { transcriptRecordOf, turnRecordOf } from '../lib/turn-record.mjs';
import { transcriptWriter } from './helpers/transcript.mjs';

function scratchTranscript(t) {
  const dir = mkdtempSync(join(tmpdir(), 'evolver-antigravity-transcript-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return transcriptWriter(join(dir, 'brain', 'c1', '.system_generated', 'logs', 'transcript.jsonl'));
}

test('the prompt is the text inside USER_REQUEST, never the metadata Antigravity wraps around it', () => {
  assert.equal(promptOf('<USER_REQUEST>\nfix the flaky test\n</USER_REQUEST>\n<ADDITIONAL_METADATA>time</ADDITIONAL_METADATA>'), 'fix the flaky test');
  assert.equal(promptOf([{ type: 'text', text: 'plain prompt' }]), 'plain prompt');
});

test('a new prompt is one written after the marked one, and a subagent\'s task is no prompt of the person\'s', (t) => {
  const transcript = scratchTranscript(t);
  transcript.prompt('first');
  transcript.answer('one');
  transcript.prompt('second');
  const latest = newUserInput(transcript.file);
  assert.equal(latest.prompt, 'second');
  assert.equal(stepsBetween(transcript.file).find((step) => step.offset === latest.mark.offset).type, 'USER_INPUT');
  assert.equal(newUserInput(transcript.file, latest.mark), null);
  transcript.raw({ step_index: 99, source: 'SUBAGENT', type: 'USER_INPUT', content: 'subtask', created_at: new Date(Date.now() + 1000).toISOString() });
  assert.equal(newUserInput(transcript.file, latest.mark), null);
  assert.equal(newUserInput(join(tmpdir(), 'missing.jsonl')), null);
});

test('a compaction that rewrites the transcript opens no turn, and the turn\'s steps are still found', (t) => {
  const transcript = scratchTranscript(t);
  transcript.prompt('earlier task');
  transcript.answer('done');
  transcript.prompt('add an LRU cache');
  const { mark } = newUserInput(transcript.file);
  const rows = readFileSync(transcript.file, 'utf8').trim().split('\n').map((line) => JSON.parse(line));
  const kept = rows.filter((row) => row.step_index >= mark.stepIndex);
  writeFileSync(transcript.file, `${JSON.stringify({ step_index: 0, source: 'SYSTEM', type: 'CHECKPOINT', status: 'DONE', content: '{{ CHECKPOINT 1 }}' })}\n${kept.map((row) => JSON.stringify(row)).join('\n')}\n`);
  transcript.command('npm test', { exit: 0, output: 'ℹ pass 1' });

  assert.equal(newUserInput(transcript.file, mark), null);
  assert.deepEqual(transcriptRecordOf(transcript.file, mark).commands, ['npm test']);
  writeFileSync(transcript.file, `${JSON.stringify(rows[0])}\n`);
  assert.equal(newUserInput(transcript.file, mark), null, 'a file that shrank below the mark');
});

test('a turn record pairs each call with its result: commands, checks, touched paths, applied edits and the answer', (t) => {
  const transcript = scratchTranscript(t);
  transcript.prompt('add an LRU cache');
  const { mark } = newUserInput(transcript.file);
  transcript.calls(['view_file', { AbsolutePath: '/w/src/index.js' }]);
  transcript.result({ content: 'export {}' });
  transcript.calls(
    ['write_to_file', { TargetFile: '/w/src/lru.js', CodeContent: 'export class Lru {}', Overwrite: false }],
    ['replace_file_content', { TargetFile: '/w/src/index.js', TargetContent: 'export {}', ReplacementContent: "export { Lru } from './lru.js';" }],
  );
  transcript.result({ type: 'CODE_ACTION', content: 'created' });
  transcript.result({ status: 'ERROR', error: 'target content not found' });
  transcript.command('npm test', { exit: 1, output: 'ℹ fail 1' });
  transcript.command('npm test 2>&1 | tail -5', { exit: 0, output: 'ℹ pass 3\nℹ fail 0' });
  transcript.answer('my_tool_call_analysis: checking');
  transcript.answer('The cache is in place and npm test passes.');

  const record = transcriptRecordOf(transcript.file, mark);
  assert.deepEqual(record.commands, ['npm test', 'npm test 2>&1 | tail -5']);
  assert.deepEqual(record.checks, [{ command: 'npm test', failed: true }, { command: 'npm test 2>&1 | tail -5', failed: false }]);
  assert.deepEqual(record.paths, ['/w/src/index.js', '/w/src/lru.js', '/w/src/index.js']);
  assert.deepEqual(record.edits, ['export class Lru {}'], 'the failed replacement added nothing');
  assert.equal(record.answer, 'The cache is in place and npm test passes.');
});

test('a check moved to the background is no evidence, and a turn ends at the next prompt', (t) => {
  const transcript = scratchTranscript(t);
  transcript.prompt('run the suite');
  const { mark } = newUserInput(transcript.file);
  transcript.command('npm test', { status: 'RUNNING', output: 'Background command ID: 7' });
  transcript.answer('The suite is still running.');
  transcript.prompt('next task');
  transcript.command('npm run build', { exit: 0, output: 'built' });
  const record = transcriptRecordOf(transcript.file, mark);
  assert.deepEqual(record.commands, ['npm test']);
  assert.deepEqual(record.checks, []);
  assert.equal(record.answer, 'The suite is still running.');
});

test('results are paired with their calls in step order, though Antigravity appends steps as they complete', (t) => {
  const transcript = scratchTranscript(t);
  transcript.raw({ step_index: 10, source: 'USER_EXPLICIT', type: 'USER_INPUT', content: '<USER_REQUEST>check both</USER_REQUEST>' });
  const { mark } = newUserInput(transcript.file);
  const call = (CommandLine) => ({ name: 'run_command', args: { CommandLine: JSON.stringify(CommandLine) } });
  transcript.raw({ step_index: 11, source: 'MODEL', type: 'PLANNER_RESPONSE', tool_calls: [call('npm test'), call('npm run lint')] });
  transcript.raw({ step_index: 13, source: 'MODEL', type: 'RUN_COMMAND', content: 'The command exited with code 0.\nOutput:\nclean' });
  transcript.raw({ step_index: 12, source: 'MODEL', type: 'RUN_COMMAND', content: 'The command exited with code 1.\nOutput:\nℹ fail 1' });
  transcript.raw({ step_index: 14, source: 'MODEL', type: 'PLANNER_RESPONSE', content: 'The tests fail; lint is clean.' });
  assert.deepEqual(transcriptRecordOf(transcript.file, mark).checks, [
    { command: 'npm test', failed: true },
    { command: 'npm run lint', failed: false },
  ]);
});

test('the files an edit hashed before it ran are kept once per path', () => {
  const record = turnRecordOf(turnActivityOf([]), [
    { kind: 'before', path: '/w/src/lru.js', hash: 'absent' },
    { kind: 'before', path: '/w/src/lru.js', hash: 'later' },
  ]);
  assert.deepEqual([...record.editedBefore], [['/w/src/lru.js', 'absent']]);
  assert.equal(record.answer, '');
});
