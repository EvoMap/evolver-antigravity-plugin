import { DRAIN_TASK, startInBackground } from './background.mjs';
import { feedbackLabelOf } from './feedback-label.mjs';
import { projectDirOf } from './project-dir.mjs';
import { queueReports } from './report-queue.mjs';
import { correctionReportOf } from './reuse.mjs';
import { dropCandidate } from './session-distill.mjs';
import { closeOpenTurn, readSession, updateSession } from './session-state.mjs';
import { newUserInput } from './transcript.mjs';
import { closeTurn } from './turn-end.mjs';
import { forgetTurnRecord } from './turn-record.mjs';

// A turn still open when the next prompt arrives got no Stop, so it ended on an error.
function closeFailedTurn(sessionId, input, nextPrompt) {
  const session = closeOpenTurn(sessionId);
  if (!session) return { labelable: readSession(sessionId).labelable, queued: false };
  const { reuses, queued } = closeTurn({
    sessionId, session, transcriptPath: input.transcriptPath, until: nextPrompt.mark.offset, reasonKind: 'error', model: null, projectDir: projectDirOf(input),
  });
  return { labelable: reuses, queued };
}

// The next prompt is the only verdict on a turn available without asking anyone: when it reads as a
// correction, the turn is no longer worth distilling (dropped first, so a running distillation sees it gone),
// and the reuse reports are revised.
function reportFollowUp(sessionId, labelable, prompt) {
  if (!prompt) return false;
  const label = feedbackLabelOf(prompt);
  if (label === 'correction') dropCandidate(sessionId);
  const reports = labelable.map((reuse) => correctionReportOf(reuse, label)).filter((report) => report !== null);
  queueReports(reports.map((report) => ({ report, sessionId })));
  return reports.length > 0;
}

function openTurn(sessionId, prompt) {
  forgetTurnRecord(sessionId);
  return updateSession(sessionId, (session) => ({
    ...session, turn: session.turn + 1, closed: false, prompt: prompt.prompt, mark: prompt.mark, strategy: '', labelable: [],
  }));
}

/**
 * Antigravity has no prompt event: a turn starts when the transcript shows a prompt of the person's that this
 * session has not opened a turn for. Returns the opened turn, or null when the latest prompt already has one.
 */
export function startTurnIfNew(sessionId, input) {
  const prompt = newUserInput(input.transcriptPath, readSession(sessionId).mark);
  if (!prompt) return null;
  const closed = closeFailedTurn(sessionId, input, prompt);
  const followedUp = reportFollowUp(sessionId, closed.labelable, prompt.prompt);
  if (closed.queued || followedUp) startInBackground([DRAIN_TASK]);
  return openTurn(sessionId, prompt);
}
