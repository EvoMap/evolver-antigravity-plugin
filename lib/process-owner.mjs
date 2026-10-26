import { execFileSync } from 'node:child_process';
import { readlinkSync } from 'node:fs';
import path from 'node:path';

const HOST_EXECUTABLE = /^(?:agy|language_server)/i;
const CLI_EXECUTABLE = /^agy(?:\.exe)?$/i;
const PS_TIMEOUT_MS = 1_000;

/**
 * Whether the process that wrote a state entry has exited. Signal 0 only probes: ESRCH means no such process;
 * EPERM means it exists under another user. An entry without a pid is never taken for a dead owner's.
 */
export function ownerIsGone(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  if (pid === process.pid) return false;
  try {
    process.kill(pid, 0);
    return false;
  } catch (error) {
    return error?.code === 'ESRCH';
  }
}

export function processTableOf(psOutput) {
  const table = new Map();
  for (const line of String(psOutput).split('\n')) {
    const match = /^\s*(\d+)\s+(\d+)\s+(.+?)\s*$/.exec(line);
    if (match) table.set(Number(match[1]), { ppid: Number(match[2]), command: match[3] });
  }
  return table;
}

function processTable() {
  try {
    return processTableOf(execFileSync('ps', ['-A', '-o', 'pid=,ppid=,comm='], { encoding: 'utf8', timeout: PS_TIMEOUT_MS }));
  } catch {
    return new Map();
  }
}

function executableOf(pid, command) {
  if (path.isAbsolute(command)) return command;
  try {
    return readlinkSync(`/proc/${pid}/exe`);
  } catch {
    return null;
  }
}

function ancestorsOf(start, table) {
  const chain = [];
  for (let pid = start; pid > 1 && table.has(pid) && !chain.some((entry) => entry.pid === pid);) {
    const { ppid, command } = table.get(pid);
    chain.push({ pid, command, name: path.basename(command) });
    pid = ppid;
  }
  return chain;
}

/**
 * The Antigravity process this hook runs for: the nearest ancestor named agy* or language_server*. Hooks run
 * through `sh -c` from the language server that hosts the conversations, a child of the CLI (`agy`) or of the
 * App/IDE, so it outlives the hook and dies with the session's host. `cli` is the nearest `agy` executable above
 * the hook, which can run a distillation headless; null under the App. Null where no process table can be read
 * (Windows).
 */
export function hostProcess(start = process.ppid, table = processTable()) {
  const chain = ancestorsOf(start, table);
  const host = chain.find((entry) => HOST_EXECUTABLE.test(entry.name));
  if (!host) return null;
  const cli = chain.find((entry) => CLI_EXECUTABLE.test(entry.name));
  return { pid: host.pid, cli: cli ? executableOf(cli.pid, cli.command) : null };
}
