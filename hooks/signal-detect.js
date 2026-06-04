// SPDX-License-Identifier: MIT
// Copyright (c) 2026 EvoMap
//
// Antigravity hook: PostToolUse (write_to_file|replace_file_content|multi_replace_file_content).
// Inspects freshly edited content and tool errors for evolution signals.
//
// Invocation: `node signal-detect.js` with a JSON object on stdin.
// Output: a JSON object on stdout, exit 0. On any failure / timeout: `{}`.

'use strict';

const { detectSignals } = require('./_signals');

const STDIN_WATCHDOG_MS = 1500;

let alreadyEmitted = false;

/** Emit JSON exactly once and exit. */
function emit(obj) {
  if (alreadyEmitted) {
    return;
  }
  alreadyEmitted = true;
  let text = '{}';
  try {
    text = JSON.stringify(obj);
  } catch (_err) {
    text = '{}';
  }
  process.stdout.write(text);
  process.exit(0);
}

/**
 * Pull the edited content out of the various shapes Claude Code or Antigravity may use.
 */
function extractContent(input) {
  if (!input || typeof input !== 'object') {
    return '';
  }
  // Try tool_input, arguments, or the top level
  const ti =
    (input.toolCall && input.toolCall.args) ||
    input.tool_input ||
    input.arguments ||
    input;
  const parts = [];
  if (ti && typeof ti === 'object') {
    for (const key of [
      'content',
      'new_string',
      'file_text',
      'file_content',
      'CodeContent',
      'ReplacementContent',
      'TargetContent',
      'Description',
      'Instruction',
    ]) {
      if (typeof ti[key] === 'string') {
        parts.push(ti[key]);
      }
    }
    if (Array.isArray(ti.ReplacementChunks)) {
      parts.push(
        ti.ReplacementChunks.map(chunk => chunk.ReplacementContent || '').join('\n')
      );
    }
  }
  if (typeof input.content === 'string') parts.push(input.content);
  if (typeof input.file_content === 'string') parts.push(input.file_content);
  if (typeof input.diff === 'string') parts.push(input.diff);
  if (typeof input.error === 'string') parts.push(input.error);
  return parts.join('\n');
}

/**
 * Pull the edited file path out of the various shapes.
 */
function extractFilePath(input) {
  if (!input || typeof input !== 'object') {
    return '';
  }
  const ti =
    (input.toolCall && input.toolCall.args) ||
    input.tool_input ||
    input.arguments ||
    input;
  if (ti && typeof ti === 'object') {
    if (typeof ti.file_path === 'string') return ti.file_path;
    if (typeof ti.TargetFile === 'string') return ti.TargetFile;
  }
  const tr = input.tool_response;
  if (tr && typeof tr === 'object' && typeof tr.filePath === 'string') {
    return tr.filePath;
  }
  if (typeof input.path === 'string') return input.path;
  if (typeof input.file_path === 'string') return input.file_path;
  if (typeof input.TargetFile === 'string') return input.TargetFile;
  return '';
}

function process_(raw) {
  let input = {};
  try {
    input = raw ? JSON.parse(raw) : {};
  } catch (_err) {
    input = {};
  }

  const content = extractContent(input);
  const signals = detectSignals(content);

  if (signals.length === 0) {
    emit({});
    return;
  }

  // PostToolUse does not support context injection in Antigravity 2.x. The Stop
  // hook records the final diff, so this hook only validates detection and exits
  // cleanly.
  emit({});
}

// Drain stdin with a watchdog so we always exit promptly with valid JSON.
(function run() {
  try {
    let buffer = '';
    const watchdog = setTimeout(() => {
      try {
        process_(buffer);
      } catch (_err) {
        emit({});
      }
    }, STDIN_WATCHDOG_MS);
    if (typeof watchdog.unref === 'function') {
      watchdog.unref();
    }

    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      buffer += chunk;
    });
    process.stdin.on('end', () => {
      clearTimeout(watchdog);
      try {
        process_(buffer);
      } catch (_err) {
        emit({});
      }
    });
    process.stdin.on('error', () => {
      clearTimeout(watchdog);
      emit({});
    });
    process.stdin.resume();
  } catch (_err) {
    emit({});
  }
})();
