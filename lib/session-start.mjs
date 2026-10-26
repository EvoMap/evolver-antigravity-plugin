import { DISTILL_TASK, DRAIN_TASK, ENGINE_TASK, WATCH_TASK, startInBackground } from './background.mjs';
import { engineNoticeOf } from './engine-notice.mjs';
import { isSetupDue } from './engine-setup.mjs';
import { isAnnounced, markAnnounced, readEngineState } from './engine-state.mjs';
import { meetsMinimum } from './engine-version.mjs';
import { takeOrphanedUnreported } from './injected-assets.mjs';
import { projectDirOf } from './project-dir.mjs';
import { runningProxy } from './proxy.mjs';
import { queueReports } from './report-queue.mjs';
import { retentionReportsOf, takeDueRetentions } from './retention-pending.mjs';
import { updateSession } from './session-state.mjs';
import { abortedReports } from './turn-end.mjs';

const hostKeyOf = (owner) => (owner ? `pid:${owner.pid}` : 'none');

function queueLeftReports(sessionId, projectDir) {
  const { due, commit } = takeDueRetentions({ sessionId, projectDir });
  queueReports([...due.flatMap(retentionReportsOf), ...abortedReports(takeOrphanedUnreported())]);
  commit();
}

// Setting Evolver up takes minutes, so it runs in the background and only its outcome is told, once.
function engineNoticeOnce(outcome) {
  if (!outcome || isAnnounced(outcome)) return null;
  markAnnounced(outcome);
  return engineNoticeOf(outcome);
}

async function isEngineSetupDue(outcome) {
  const running = await runningProxy();
  return !(running && meetsMinimum(running.version)) && isSetupDue(outcome, Date.now());
}

/**
 * Whether this conversation's session start already ran under its current Antigravity process. Some Antigravity
 * versions run no SessionStart (CLI 1.3.x) and the App runs none for a conversation it reopens, so the first model
 * call of a conversation under a new process starts the session instead.
 */
export function isStartedUnder(session, owner) {
  return session.host === hostKeyOf(owner);
}

/**
 * Sends what earlier sessions left (retention reports, the aborted reports of sessions whose process is gone) and
 * starts the background worker. Antigravity has no session-end event, so the worker also waits for the session's
 * host process to exit and then does what a session end would: reports what is left as aborted and distills the
 * candidate. Returns the one-off engine notice, or ''.
 */
export async function startSession(sessionId, input, owner) {
  updateSession(sessionId, (session) => ({ ...session, host: hostKeyOf(owner) }));
  queueLeftReports(sessionId, projectDirOf(input));
  const outcome = readEngineState();
  const tasks = [...(await isEngineSetupDue(outcome) ? [ENGINE_TASK] : []), DRAIN_TASK, DISTILL_TASK, ...(owner ? [WATCH_TASK] : [])];
  startInBackground(tasks, { agyExecutable: owner?.cli, ownerPid: owner?.pid });
  return engineNoticeOnce(outcome) ?? '';
}
