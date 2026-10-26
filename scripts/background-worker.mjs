#!/usr/bin/env node
import { agyModelRunner } from '../lib/agy-headless.mjs';
import { AGY_OPTION, DISTILL_TASK, DRAIN_TASK, ENGINE_TASK, OWNER_OPTION, WATCH_TASK } from '../lib/background.mjs';
import { DISTILL_TIMEOUT_MS, distillLeftovers } from '../lib/distiller.mjs';
import { setUpEngine } from '../lib/engine-job.mjs';
import { engineRuntime } from '../lib/engine-runtime.mjs';
import { reportOrphaned } from '../lib/injected-assets.mjs';
import { recordReuseLocally } from '../lib/local-ledger.mjs';
import { afterOwnerExits } from '../lib/owner-watch.mjs';
import { createProxyClient } from '../lib/proxy.mjs';
import { drainOutbox } from '../lib/report-queue.mjs';
import { pruneOldSessions } from '../lib/session-state.mjs';
import { queueAbortedReports } from '../lib/turn-end.mjs';

async function ranCleanly(work) {
  try {
    await work();
    return true;
  } catch {
    return false;
  }
}

function optionOf(argv, option) {
  const index = argv.indexOf(option);
  return index === -1 ? null : argv[index + 1];
}

const argv = process.argv.slice(2);
const tasks = new Set(argv);
const drain = () => drainOutbox({ proxyFetch: createProxyClient(), recordLocally: recordReuseLocally });
const distill = () => distillLeftovers({
  proxyFetch: createProxyClient({ timeoutMs: DISTILL_TIMEOUT_MS }),
  runModel: agyModelRunner({ executable: optionOf(argv, AGY_OPTION) ?? 'agy' }),
});
const endSessionsOfGoneOwner = async () => {
  reportOrphaned(queueAbortedReports);
  await drain();
  await distill();
};

const results = [await ranCleanly(() => pruneOldSessions())];
if (tasks.has(ENGINE_TASK)) results.push(await ranCleanly(() => setUpEngine(engineRuntime())));
if (tasks.has(DRAIN_TASK)) results.push(await ranCleanly(drain));
if (tasks.has(DISTILL_TASK)) results.push(await ranCleanly(distill));
const ownerPid = Number(optionOf(argv, OWNER_OPTION));
if (tasks.has(WATCH_TASK) && Number.isInteger(ownerPid) && ownerPid > 0) {
  results.push(await ranCleanly(() => afterOwnerExits(ownerPid, endSessionsOfGoneOwner)));
}
process.exit(results.every(Boolean) ? 0 : 1);
