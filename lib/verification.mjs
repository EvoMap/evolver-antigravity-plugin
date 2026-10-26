import { detectSignals } from './signals.mjs';

const VERIFICATION_COMMANDS = [
  /\b(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?(?:test|build|lint|typecheck|type-check|check)\b/,
  /\bnode\s+--test\b/,
  /\b(?:jest|vitest|mocha|pytest|rspec|phpunit|tsc|eslint|ruff|mypy)\b/,
  /\bgo\s+(?:test|build|vet)\b/,
  /\bcargo\s+(?:test|build|check|clippy)\b/,
  /\bdotnet\s+(?:test|build)\b/,
  /\b(?:mvn|gradle|gradlew)\b/,
  /\bmake\b/,
];

const FAILURE_SIGNALS = new Set(['test_failure', 'log_error']);

// Summaries of a passing run still name failures by count ("0 failed",
// "failures: 0"); only those counts are dropped, so "1 failed, 0 errors"
// still reads as a failure.
const ZERO_COUNT = /\b0\s+(?:failed|failures?|errors?)\b|\b(?:failed|failures?|errors?)\s*[:=]\s*0\b/gi;

export function isVerificationCommand(command) {
  return typeof command === 'string' && VERIFICATION_COMMANDS.some((pattern) => pattern.test(command));
}

const EXIT_LINE = /^The command exited with code (-?\d+)\./m;
const OUTPUT_MARKER = /^Output:\n?/m;
const EXIT_IN_ERROR = /\bexit (?:status|code)\D*(-?\d+)/i;
const CHECK_COMMAND_MAX_CHARS = 200;
const COMPLETED = new Set(['DONE', 'ERROR']);

export function verificationFailed(output) {
  const evidence = String(output ?? '').replace(ZERO_COUNT, '');
  return detectSignals(evidence).some((signal) => FAILURE_SIGNALS.has(signal));
}

function exitCodeOf(result) {
  const match = EXIT_LINE.exec(String(result.content ?? '')) ?? EXIT_IN_ERROR.exec(String(result.error ?? ''));
  return match ? Number(match[1]) : null;
}

function outputOf(content) {
  const text = String(content ?? '');
  const marker = OUTPUT_MARKER.exec(text);
  return marker ? text.slice(marker.index + marker[0].length) : text;
}

// A zero exit code still leaves the output to read, since a failing run piped through `tail` exits zero.
function resultFailed(result) {
  const exit = exitCodeOf(result);
  if (exit !== null && exit !== 0) return true;
  if (exit === null && (result.status === 'ERROR' || result.error)) return true;
  return verificationFailed(outputOf(result.content));
}

/**
 * The check a `run_command` call was, or null when it was none or has no verdict: a command with no result
 * step, or one whose step has not completed (moved to the background), counts as not run. Antigravity writes the
 * exit code into the result step's text (`The command exited with code 2.`); hooks get no exit code.
 */
export function checkOf(command, result) {
  if (!isVerificationCommand(command) || !result || !COMPLETED.has(result.status)) return null;
  return { command: command.slice(0, CHECK_COMMAND_MAX_CHARS), failed: resultFailed(result) };
}
