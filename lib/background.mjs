import { spawn } from 'node:child_process';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const WORKER = fileURLToPath(new URL('../scripts/background-worker.mjs', import.meta.url));

export const ENGINE_TASK = 'engine';
export const DRAIN_TASK = 'drain';
export const DISTILL_TASK = 'distill';
export const WATCH_TASK = 'watch';
export const AGY_OPTION = '--agy';
export const OWNER_OPTION = '--owner';

// Hooks run under a short timeout, so slow work (installing Evolver, posting reports, distilling, waiting for the
// session's host to exit) runs in a detached child in a session of its own.
export function startInBackground(tasks, { agyExecutable = null, ownerPid = null } = {}) {
  if (tasks.length === 0) return;
  const args = [
    WORKER,
    ...new Set(tasks),
    ...(agyExecutable ? [AGY_OPTION, agyExecutable] : []),
    ...(ownerPid ? [OWNER_OPTION, String(ownerPid)] : []),
  ];
  const child = spawn(process.execPath, args, { detached: true, stdio: 'ignore', windowsHide: true, cwd: os.homedir() });
  child.unref();
}
