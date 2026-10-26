import fs from 'node:fs';

// Antigravity hands hooks no prompt and no answer, only the conversation's transcript: one JSON object per step
// (`step_index`, `source`, `type`, `status`, `created_at`, `content`, `tool_calls`, and on a failed tool's result
// `error`), appended once the step completes, so not in step order. A compaction rewrites the file, so a prompt is
// marked by its `step_index` and `created_at`; the byte offset of its line only says where to look first.

const USER_REQUEST = /<USER_REQUEST>([\s\S]*?)<\/USER_REQUEST>/;
const INTERMEDIATE_PLANNER = /^my_tool_call_analysis:/;

function fileSize(file) {
  try {
    return fs.statSync(file).size;
  } catch {
    return 0;
  }
}

function bytesBetween(file, from, to) {
  const length = Math.max(0, to - from);
  const buffer = Buffer.alloc(length);
  const fd = fs.openSync(file, 'r');
  try {
    fs.readSync(fd, buffer, 0, length, from);
  } finally {
    fs.closeSync(fd);
  }
  return buffer;
}

function parsedStep(text) {
  try {
    const step = JSON.parse(text);
    return step && typeof step === 'object' && typeof step.type === 'string' ? step : null;
  } catch {
    return null;
  }
}

/** The steps written between byte offsets `from` and `to` (the end of the file when omitted), each with its offset. */
export function stepsBetween(file, from = 0, to = Infinity) {
  if (typeof file !== 'string' || !file) return [];
  const size = fileSize(file);
  if (size === 0) return [];
  const start = from > size ? 0 : from;
  const buffer = bytesBetween(file, start, Math.min(to, size));
  const steps = [];
  let lineStart = 0;
  for (let index = 0; index <= buffer.length; index += 1) {
    if (index < buffer.length && buffer[index] !== 0x0a) continue;
    const step = parsedStep(buffer.subarray(lineStart, index).toString('utf8'));
    if (step) steps.push({ ...step, offset: start + lineStart });
    lineStart = index + 1;
  }
  return steps;
}

function textOf(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.filter((block) => typeof block?.text === 'string').map((block) => block.text).join('\n');
}

export function promptOf(content) {
  const text = textOf(content);
  const request = USER_REQUEST.exec(text);
  return (request ? request[1] : text).trim();
}

const isUserPrompt = (step) => step.type === 'USER_INPUT' && step.source === 'USER_EXPLICIT';

const markOf = (step) => ({ offset: step.offset, stepIndex: step.step_index ?? null, createdAt: step.created_at ?? null });

const isMarked = (step, mark) => {
  const { stepIndex, createdAt } = markOf(step);
  return isUserPrompt(step) && stepIndex === mark.stepIndex && createdAt === mark.createdAt;
};

function isLaterThan(step, mark) {
  const at = Date.parse(step.created_at);
  const markedAt = Date.parse(mark.createdAt);
  return Number.isFinite(at) && Number.isFinite(markedAt) ? at > markedAt : step.offset > mark.offset;
}

/** Where the marked prompt's line is now, or null when the file no longer has it. */
function markedOffsetOf(file, mark) {
  const [atHint] = stepsBetween(file, mark.offset);
  if (atHint?.offset === mark.offset && isMarked(atHint, mark)) return mark.offset;
  return stepsBetween(file).find((step) => isMarked(step, mark))?.offset ?? null;
}

/**
 * The person's latest prompt written after the marked one (any, without a mark), as `{ prompt, mark }`, or null
 * when there is none. A subagent's task is not one.
 */
export function newUserInput(file, mark = null) {
  const from = mark ? markedOffsetOf(file, mark) : 0;
  const isNew = (step) => isUserPrompt(step) && (!mark || (!isMarked(step, mark) && isLaterThan(step, mark)));
  const step = stepsBetween(file, from ?? 0).filter(isNew).at(-1);
  return step ? { prompt: promptOf(step.content), mark: markOf(step) } : null;
}

/** The steps written after the marked prompt, up to byte `to`. */
export function stepsAfter(file, mark, to = Infinity) {
  const from = markedOffsetOf(file, mark);
  if (from === null) return stepsBetween(file, 0, to).filter((step) => isLaterThan(step, mark));
  return stepsBetween(file, from, to).filter((step) => step.offset > from);
}

// transcript.jsonl writes every argument as a JSON-encoded string; transcript_full.jsonl and older versions do not.
function decodedArgument(value) {
  if (typeof value !== 'string' || !/^["[{]/.test(value)) return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function callsOf(step) {
  const calls = Array.isArray(step.tool_calls) ? step.tool_calls : [];
  return calls
    .filter((call) => typeof call?.name === 'string')
    .map((call) => ({
      name: call.name,
      args: Object.fromEntries(Object.entries(call.args ?? {}).map(([key, value]) => [key, decodedArgument(value)])),
      result: null,
    }));
}

const isToolResult = (step) => step.source === 'MODEL' && step.type !== 'PLANNER_RESPONSE';

function finalAnswerOf(step, calls) {
  const text = textOf(step.content).trim();
  return calls.length === 0 && text && !INTERMEDIATE_PLANNER.test(text) ? text : null;
}

const stepIndexOf = (step) => (Number.isInteger(step.step_index) ? step.step_index : Infinity);

function inStepOrder(steps) {
  return [...steps].sort((a, b) => stepIndexOf(a) - stepIndexOf(b) || a.offset - b.offset);
}

/**
 * What a turn did, from the steps that followed its prompt: each tool call with the result step that answered
 * it (results follow their planner step in call order; a call no result answered keeps `result: null`), and
 * the last planner text that called no tool, which is the answer.
 */
export function turnActivityOf(steps) {
  const calls = [];
  let awaiting = [];
  let answer = '';
  for (const step of inStepOrder(steps)) {
    if (isUserPrompt(step)) break;
    if (step.type === 'PLANNER_RESPONSE') {
      const planned = callsOf(step);
      calls.push(...planned);
      awaiting = planned;
      answer = finalAnswerOf(step, planned) ?? answer;
    } else if (isToolResult(step) && awaiting.length > 0) {
      awaiting.shift().result = step;
    }
  }
  return { calls, answer };
}
