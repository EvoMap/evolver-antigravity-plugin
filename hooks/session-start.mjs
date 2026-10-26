#!/usr/bin/env node
import { runHook, sessionIdOf } from '../lib/hook-io.mjs';
import { hostProcess } from '../lib/process-owner.mjs';
import { startSession } from '../lib/session-start.mjs';

runHook('SessionStart', (input) => {
  const sessionId = sessionIdOf(input);
  return sessionId ? startSession(sessionId, input, hostProcess()) : '';
});
