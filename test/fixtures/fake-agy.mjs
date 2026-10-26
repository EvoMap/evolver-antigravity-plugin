#!/usr/bin/env node
import { appendFileSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const GENE = { title: 'Retry uploads', summary: 'Retry a flaky upload with backoff.', strategy: '1. Measure. 2. Back off.', signals: ['retry'] };

const [line] = readFileSync(0, 'utf8').split('\n');
const prompt = JSON.parse(line).message.content;
appendFileSync(join(homedir(), 'fake-agy.log'), `${JSON.stringify({ args: process.argv.slice(2), prompt, cwd: process.cwd(), marker: process.env.EVOLVER_ANTIGRAVITY_HEADLESS ?? null })}\n`);
const answer = process.env.FAKE_AGY_ANSWER ?? JSON.stringify(GENE);
const usage = { input_tokens: 900, output_tokens: 120, thinking_tokens: 30, cache_read_tokens: 0, total_tokens: 1020 };
const events = [
  { event: 'init', conversation_id: 'c-headless', init: { cwd: process.cwd(), tools: ['run_command'], permission_mode: 'request-review' } },
  { event: 'step_update', step_update: { conversation_id: 'c-headless', step_index: 0, state: 'DONE', step_type: 'user_input' } },
  { event: 'step_update', step_update: { conversation_id: 'c-headless', step_index: 2, state: 'DONE', step_type: 'agent_response', text_delta: answer } },
  process.env.FAKE_AGY_STATUS
    ? { event: 'result', result: { conversation_id: 'c-headless', status: process.env.FAKE_AGY_STATUS, response: '', error: 'Authentication required', num_turns: 1, usage } }
    : { event: 'result', result: { conversation_id: 'c-headless', status: 'SUCCESS', response: `${answer}\n`, duration_seconds: 2.1, num_turns: 1, usage } },
];
process.stdout.write(events.map((event) => JSON.stringify(event)).join('\n') + '\n');
process.exit(process.env.FAKE_AGY_STATUS ? 1 : 0);
