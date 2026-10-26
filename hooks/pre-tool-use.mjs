#!/usr/bin/env node
import { runHook, sessionIdOf } from '../lib/hook-io.mjs';
import { noteFileBeforeEdit } from '../lib/turn-record.mjs';

runHook('PreToolUse', (input) => {
  const sessionId = sessionIdOf(input);
  if (sessionId && input.toolCall) noteFileBeforeEdit(sessionId, input.toolCall);
  return '';
});
