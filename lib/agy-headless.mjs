import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { HEADLESS_MARKER } from './hook-io.mjs';

const ERROR_MAX_CHARS = 300;
const KILL_GRACE_MS = 5_000;

// The distillation is one answer from the model, not an agent run. Antigravity has no flag that turns hooks,
// plugins or tools off, so the run gets an empty directory as its workspace, headless mode denies the shell, no
// prompt is read as a slash command or skill, and the marker in its environment keeps this plugin's own hooks
// (which Antigravity runs for it like for any session) out of it.
export function agyArguments(model) {
  return ['--input-format', 'stream-json', '--output-format', 'stream-json', '--disable-slash-commands', '--model', model];
}

export function promptLineOf(prompt) {
  return `${JSON.stringify({ event: 'user', message: { content: prompt } })}\n`;
}

function usageOf(usage) {
  if (!usage) return null;
  return {
    inputTokens: usage.input_tokens,
    cachedInputTokens: usage.cache_read_tokens,
    outputTokens: usage.output_tokens,
    reasoningOutputTokens: usage.thinking_tokens,
  };
}

/** The `result` event of a stream-json run: its status, response, error and token usage. */
export function resultOfEvents(jsonl) {
  let result = null;
  for (const line of String(jsonl).split('\n')) {
    try {
      const event = line.trim() ? JSON.parse(line) : null;
      if (event?.event === 'result') result = event.result;
    } catch {
    }
  }
  return result;
}

function failure(message, code) {
  return Object.assign(new Error(message), code ? { code } : {});
}

function settled(code, stdout, stderr) {
  const result = resultOfEvents(stdout);
  if (result?.status === 'SUCCESS') return { answer: String(result.response ?? ''), usage: usageOf(result.usage) };
  const reason = result?.error || stderr.trim() || `exited ${code}`;
  throw failure(`agy ${result?.status ?? 'failed'}: ${String(reason).slice(-ERROR_MAX_CHARS)}`);
}

/**
 * Asks Antigravity itself, headless, for one answer on `model`: the prompt goes in on stdin as a stream-json
 * user message and the answer is the run's `result` event. Rejects with code ENOENT when there is no agy to run.
 */
export function agyModelRunner({ executable = 'agy' } = {}) {
  return (model, prompt, signal) => new Promise((resolve, reject) => {
    const workdir = mkdtempSync(path.join(os.tmpdir(), 'evolver-distill-'));
    const cleanUp = () => rmSync(workdir, { recursive: true, force: true });
    const child = spawn(executable, agyArguments(model), {
      cwd: workdir,
      env: { ...process.env, [HEADLESS_MARKER]: '1' },
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    const stop = () => {
      child.kill('SIGTERM');
      setTimeout(() => child.kill('SIGKILL'), KILL_GRACE_MS).unref();
    };
    signal?.addEventListener('abort', stop, { once: true });
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.stdin.on('error', () => {});
    child.on('error', (error) => {
      cleanUp();
      reject(failure(error.message, error.code));
    });
    child.on('close', (code) => {
      signal?.removeEventListener('abort', stop);
      cleanUp();
      if (signal?.aborted) return reject(failure('cancelled', 'ABORT_ERR'));
      try {
        resolve(settled(code, stdout, stderr));
      } catch (error) {
        reject(error);
      }
    });
    child.stdin.end(promptLineOf(prompt));
  });
}
