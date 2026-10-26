import { setTimeout as sleep } from 'node:timers/promises';

import { ownerIsGone } from './process-owner.mjs';
import { withLock } from './state-file.mjs';

const POLL_MS = 2_000;

/**
 * Runs `work` once the host process `pid` has exited, for the session end Antigravity never announces. The App
 * hosts every conversation in one language server, so its sessions end together when the App quits. One watcher
 * per host process: another that finds the lock held by a live one returns false at once.
 */
export function afterOwnerExits(pid, work, { isGone = ownerIsGone, pollMs = POLL_MS } = {}) {
  return withLock(`antigravity-watch-${pid}`, async () => {
    while (!isGone(pid)) await sleep(pollMs);
    await work();
  });
}
