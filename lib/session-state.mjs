import fs from 'node:fs';
import path from 'node:path';

import { OUTBOX_TTL_MS } from './report-outbox.mjs';
import { hashedName, readState, stateDir, statePath, updateState } from './state-file.mjs';

const SESSION_FILE = /^antigravity-(?:session|turn|injected)-[0-9a-f]{16}\.jsonl?$/;

const sessionPath = (sessionId) => statePath(hashedName('antigravity-session', sessionId));

// `mark` names the transcript step of the prompt that opened the session's latest turn, `strategy` what
// was injected into it, and `host` the Antigravity process its session start ran under.
const EMPTY_SESSION = { turn: 0, closed: true, prompt: '', mark: null, strategy: '', labelable: [], host: null };

export function readSession(sessionId) {
  return { ...EMPTY_SESSION, ...readState(sessionPath(sessionId), {}) };
}

export function updateSession(sessionId, change) {
  return updateState(sessionPath(sessionId), {}, (state) => change({ ...EMPTY_SESSION, ...state }));
}

/** Marks the session's open turn closed and returns it as it was, or null when no turn is open. */
export function closeOpenTurn(sessionId) {
  let opened = null;
  updateSession(sessionId, (session) => {
    if (session.closed) return undefined;
    opened = session;
    return { ...session, closed: true };
  });
  return opened;
}

// Session files outlive the conversation: a resumed conversation keeps its id, and a turn counter that restarted
// would repeat `antigravity:<session>:<turn>`, which the Hub takes as a duplicate report. They are pruned once
// older than the outbox TTL.
export function pruneOldSessions(now = Date.now()) {
  let names = [];
  try {
    names = fs.readdirSync(stateDir());
  } catch {
    return;
  }
  for (const name of names.filter((candidate) => SESSION_FILE.test(candidate))) {
    const file = path.join(stateDir(), name);
    try {
      if (now - fs.statSync(file).mtimeMs > OUTBOX_TTL_MS) fs.rmSync(file, { force: true });
    } catch {
    }
  }
}
