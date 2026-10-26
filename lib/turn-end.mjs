import { reportUnreported } from './injected-assets.mjs';
import { queueReports } from './report-queue.mjs';
import { rememberForRetention } from './retention-pending.mjs';
import { immediateReportOf, reportedReuseOf } from './reuse.mjs';
import { candidateOf, dropTurnCandidate, rememberCandidate, skipReason } from './session-distill.mjs';
import { takeTurnRecord, transcriptRecordOf } from './turn-record.mjs';
import { outcomeOfReason } from './turn-outcomes.mjs';

// Stop's terminationReason: the docs name model_stop, max_steps_exceeded and error; agy 1.2.7 and 1.2.9 were seen
// sending NO_TOOL_CALL for a turn that simply finished, and the enum's TERMINATION_REASON_ prefix may come along.
// What a cancelled turn sends, if Stop runs for one, is unverified. A reason nobody has named is unknown (null).
const COMPLETED = /^(?:no_tool_call|model_stop)$/i;
const CUT_SHORT = /max_steps/i;
const CANCELLED = /cancel|interrupt/i;
const FAILED = /error/i;

export function reasonKindOf({ terminationReason, error }) {
  const reason = String(terminationReason ?? '').replace(/^termination_reason_/i, '');
  if (CANCELLED.test(reason)) return 'aborted';
  if (error || FAILED.test(reason)) return 'error';
  if (COMPLETED.test(reason)) return 'completed';
  return CUT_SHORT.test(reason) ? 'max-tokens' : null;
}

function reportsOf(assets, { sessionId, turn, reasonKind, record }) {
  return assets.map((asset) => immediateReportOf({
    asset,
    sessionId,
    turn: turn ?? asset.turn,
    reasonKind,
    checks: record.checks,
  }));
}

/** Queues an aborted report for each of `assets`. */
export function queueAbortedReports(assets) {
  queueReports(abortedReports(assets));
}

function abortedReports(assets) {
  return assets.map((asset) => ({
    report: reportsOf([asset], { sessionId: asset.sessionId, reasonKind: 'aborted', record: { checks: [] } })[0],
    sessionId: asset.sessionId,
  }));
}

function rememberTurnCandidate({ sessionId, session, reasonKind, record, model, ownerPid }) {
  if (skipReason(reasonKind, record)) return false;
  rememberCandidate(sessionId, candidateOf({ prompt: session.prompt, record, model, turn: session.turn, pid: ownerPid() }));
  return true;
}

/**
 * Every injected strategy is reported when its turn ends, with the turn's own evidence read from the transcript
 * between its prompt and `until`; the turn itself becomes the session's distillation candidate when it finished
 * verified. Returns the reuses the next prompt may label, and whether anything was queued.
 * `ownerPid` is only asked when a candidate is written.
 */
export function closeTurn({ sessionId, session, transcriptPath, until = Infinity, reasonKind, model, projectDir, ownerPid = () => null }) {
  const record = takeTurnRecord(sessionId, transcriptPath, session.mark, until);
  if (!outcomeOfReason(reasonKind)) return { reuses: [], queued: false };
  let reports = [];
  reportUnreported(sessionId, session.turn, (assets) => {
    reports = reportsOf(assets, { sessionId, turn: session.turn, reasonKind, record });
    queueReports(reports.map((report) => ({ report, sessionId })));
  });
  const reuses = reports.map(reportedReuseOf);
  rememberForRetention({ sessionId, projectDir, reuses, editedBefore: record.editedBefore });
  rememberTurnCandidate({ sessionId, session, reasonKind, record, model, ownerPid });
  return { reuses, queued: reports.length > 0 };
}

/**
 * Antigravity runs Stop at the end of every execution, and a turn runs again without a new prompt when a
 * background command it started finishes or another Stop hook continues it. Its reuse reports went out at the
 * first Stop and cannot be taken back, but the candidate is judged again on the whole turn: written when it
 * still ended verified, dropped when not.
 */
export function rejudgeTurn({ sessionId, session, transcriptPath, reasonKind, model, ownerPid = () => null }) {
  const record = transcriptRecordOf(transcriptPath, session.mark);
  if (!rememberTurnCandidate({ sessionId, session, reasonKind, record, model, ownerPid })) {
    dropTurnCandidate(sessionId, session.turn);
  }
}
