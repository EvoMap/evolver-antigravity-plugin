#!/usr/bin/env node
import { DRAIN_TASK, startInBackground } from '../lib/background.mjs';
import { runHook, sessionIdOf } from '../lib/hook-io.mjs';
import { hostProcess } from '../lib/process-owner.mjs';
import { projectDirOf } from '../lib/project-dir.mjs';
import { modelOf } from '../lib/session-distill.mjs';
import { closeOpenTurn, readSession, updateSession } from '../lib/session-state.mjs';
import { closeTurn, reasonKindOf, rejudgeTurn } from '../lib/turn-end.mjs';
import { startTurnIfNew } from '../lib/turn-start.mjs';

const ownerPid = () => hostProcess()?.pid ?? null;

function endTurn(sessionId, session, input) {
  const { reuses, queued } = closeTurn({
    sessionId,
    session,
    transcriptPath: input.transcriptPath,
    reasonKind: reasonKindOf(input),
    model: modelOf(input),
    projectDir: projectDirOf(input),
    ownerPid,
  });
  updateSession(sessionId, (state) => ({ ...state, labelable: reuses }));
  if (queued) startInBackground([DRAIN_TASK]);
}

// A turn whose only model call came before its prompt reached the transcript is opened here, without a recall.
runHook('Stop', (input) => {
  const sessionId = sessionIdOf(input);
  if (!sessionId) return '';
  startTurnIfNew(sessionId, input);
  const opened = closeOpenTurn(sessionId);
  if (opened) {
    endTurn(sessionId, opened, input);
    return '';
  }
  const session = readSession(sessionId);
  if (session.mark !== null) {
    rejudgeTurn({ sessionId, session, transcriptPath: input.transcriptPath, reasonKind: reasonKindOf(input), model: modelOf(input), ownerPid });
  }
  return '';
});
