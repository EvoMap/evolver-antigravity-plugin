#!/usr/bin/env node
import { runHook, sessionIdOf } from '../lib/hook-io.mjs';
import { injectedIds, rememberInjected } from '../lib/injected-assets.mjs';
import { hubGene, promptTextOf } from '../lib/prime.mjs';
import { hostProcess } from '../lib/process-owner.mjs';
import { createProxyClient } from '../lib/proxy.mjs';
import { recordRecall } from '../lib/recall-log.mjs';
import { isStartedUnder, startSession } from '../lib/session-start.mjs';
import { readSession, updateSession } from '../lib/session-state.mjs';
import { startTurnIfNew } from '../lib/turn-start.mjs';

const RECALL_TIMEOUT_MS = 6_000;

async function recalledStrategy(sessionId, turn, prompt, owner) {
  const match = await hubGene(createProxyClient({ timeoutMs: RECALL_TIMEOUT_MS }), promptTextOf(prompt), {
    listedIds: injectedIds(sessionId),
    onOutcome: recordRecall,
  });
  const [assetId] = match.ids;
  if (!assetId) return '';
  rememberInjected(sessionId, assetId, { turn, strategyText: match.text, pid: owner?.pid ?? null });
  updateSession(sessionId, (session) => (session.turn === turn ? { ...session, strategy: match.text } : undefined));
  return match.text;
}

// PreInvocation runs before every model call of a turn; only the first one after a new prompt recalls. An
// ephemeral message lasts one model call, so the open turn's strategy is injected again before each later one.
async function turnStrategy(sessionId, input, owner) {
  const opened = startTurnIfNew(sessionId, input);
  if (opened) return recalledStrategy(sessionId, opened.turn, opened.prompt, owner);
  const session = readSession(sessionId);
  return session.closed ? '' : session.strategy;
}

async function invocationContext(input) {
  const sessionId = sessionIdOf(input);
  if (!sessionId) return [];
  const owner = hostProcess();
  const notice = isStartedUnder(readSession(sessionId), owner) ? '' : await startSession(sessionId, input, owner);
  return [notice, await turnStrategy(sessionId, input, owner)];
}

runHook('PreInvocation', invocationContext);
