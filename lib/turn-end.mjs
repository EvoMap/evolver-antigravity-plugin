import { appliedVerdictOf } from './applied.mjs';
import { takeUnreported } from './injected-assets.mjs';
import { queueReports } from './report-queue.mjs';
import { rememberForRetention } from './retention-pending.mjs';
import { immediateReportOf, reportedReuseOf } from './reuse.mjs';
import { candidateOf, dropTurnCandidate, rememberCandidate, skipReason } from './session-distill.mjs';
import { takeTurnRecord, transcriptRecordOf } from './turn-record.mjs';
import { outcomeOfReason } from './turn-outcomes.mjs';

const EMPTY_RECORD = { checks: [], commands: [], paths: [], edits: [], answer: '' };

// Stop's terminationReason: the docs name model_stop, max_steps_exceeded and error; agy 1.2.7 and 1.2.9 were seen
// sending NO_TOOL_CALL for a turn that simply finished, and the enum's TERMINATION_REASON_ prefix may come along.
// What a cancelled turn sends, if Stop runs for one, is unverified. A reason nobody has named is no completion.
const COMPLETED = /^(?:no_tool_call|model_stop)$/i;
const CUT_SHORT = /max_steps/i;
const CANCELLED = /cancel|interrupt/i;

export function reasonKindOf({ terminationReason, error }) {
  const reason = String(terminationReason ?? '').replace(/^termination_reason_/i, '');
  if (CANCELLED.test(reason)) return 'aborted';
  if (error || /error/i.test(reason)) return 'error';
  if (COMPLETED.test(reason)) return 'completed';
  return CUT_SHORT.test(reason) ? 'max-tokens' : 'error';
}

function reportsOf(assets, { sessionId, turn, reasonKind, record }) {
  return assets.map((asset) => immediateReportOf({
    asset,
    sessionId,
    turn: turn ?? asset.turn,
    reasonKind,
    checks: record.checks,
    applied: appliedVerdictOf({ strategyText: asset.strategyText, ...record }).verdict,
  }));
}

export function abortedReports(assets) {
  return assets.map((asset) => ({
    report: reportsOf([asset], { sessionId: asset.sessionId, reasonKind: 'aborted', record: EMPTY_RECORD })[0],
    sessionId: asset.sessionId,
  }));
}

function rememberTurnCandidate({ sessionId, session, reasonKind, record, reusedAsset, model, ownerPid }) {
  if (skipReason(reasonKind, record, { reusedAsset })) return false;
  rememberCandidate(sessionId, candidateOf({ prompt: session.prompt, record, model, turn: session.turn, pid: ownerPid() }));
  return true;
}

/**
 * Every injected strategy is reported when its turn ends, with the turn's own evidence read from the transcript
 * between its prompt and `until`; the turn itself becomes the session's distillation candidate when it finished
 * verified without reusing one. Returns the reuses the next prompt may label, and whether anything was queued.
 * `ownerPid` is only asked when a candidate is written.
 */
export function closeTurn({ sessionId, session, transcriptPath, until = Infinity, reasonKind, model, projectDir, ownerPid = () => null }) {
  const record = takeTurnRecord(sessionId, transcriptPath, session.mark, until);
  if (!outcomeOfReason(reasonKind)) return { reuses: [], queued: false };
  const reports = reportsOf(takeUnreported(sessionId, session.turn), { sessionId, turn: session.turn, reasonKind, record });
  const reuses = reports.map(reportedReuseOf);
  queueReports(reports.map((report) => ({ report, sessionId })));
  rememberForRetention({ sessionId, projectDir, reuses, editedBefore: record.editedBefore });
  const reusedAsset = reuses.some((reuse) => reuse.applied === 'used');
  rememberTurnCandidate({ sessionId, session, reasonKind, record, reusedAsset, model, ownerPid });
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
  const reusedAsset = session.labelable.some((reuse) => reuse.applied === 'used');
  if (!rememberTurnCandidate({ sessionId, session, reasonKind, record, reusedAsset, model, ownerPid })) {
    dropTurnCandidate(sessionId, session.turn);
  }
}
