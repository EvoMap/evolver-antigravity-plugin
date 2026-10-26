import { spawn, spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const pluginRoot = fileURLToPath(new URL('../../', import.meta.url));
const FAKE_AGY = fileURLToPath(new URL('../fixtures/fake-agy.mjs', import.meta.url));
const FAKE_HOST = fileURLToPath(new URL('../fixtures/fake-host.mjs', import.meta.url));
const TOKEN = 'test-proxy-token';
const SYSTEM_PATH = process.platform === 'win32' ? process.env.PATH : '/usr/bin:/bin';

/** A HOME of its own for hook processes, with an `agy` on PATH that answers like a stream-json `agy` run. */
export function sandboxHome() {
  const home = mkdtempSync(join(tmpdir(), 'evolver-antigravity-home-'));
  const bin = join(home, 'bin');
  mkdirSync(bin, { recursive: true });
  copyFileSync(FAKE_AGY, join(bin, 'agy'));
  chmodSync(join(bin, 'agy'), 0o755);
  symlinkSync(process.execPath, join(bin, 'language_server'));
  return {
    home,
    bin,
    env: { ...process.env, HOME: home, USERPROFILE: home, PLUGIN_ROOT: pluginRoot, EVOMAP_PROXY_PORT: '1', PATH: `${bin}:${dirname(process.execPath)}:${SYSTEM_PATH}` },
    cleanup: () => rmSync(home, { recursive: true, force: true, maxRetries: 20, retryDelay: 50 }),
  };
}

/** Points this process's own state at a fresh HOME for lib-level tests; returns the restore. */
export function freshHome(prefix = 'evolver-antigravity-lib-') {
  const previous = process.env.HOME;
  const home = mkdtempSync(join(tmpdir(), prefix));
  process.env.HOME = home;
  return () => {
    process.env.HOME = previous;
    rmSync(home, { recursive: true, force: true });
  };
}

export function writeProxySettings(home, { url, version = '2.0.46' }) {
  mkdirSync(join(home, '.evolver'), { recursive: true });
  writeFileSync(join(home, '.evolver', 'settings.json'), JSON.stringify({ proxy: { url, token: TOKEN, version } }));
}

function readBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => resolve(body ? JSON.parse(body) : {}));
  });
}

export async function fakeProxy({ assets = [] } = {}) {
  const requests = [];
  const server = http.createServer(async (req, res) => {
    const body = await readBody(req);
    const reply = (status, payload) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(payload));
    };
    if (req.headers.authorization !== `Bearer ${TOKEN}`) return reply(401, { error: 'unauthorized' });
    requests.push({ path: req.url, body });
    if (req.url === '/proxy/status') return reply(200, { status: 'running' });
    if (req.url === '/asset/fetch') return reply(200, { assets });
    if (req.url === '/asset/reuse-result') return reply(200, { recorded: true, eligible: true, counted: true, weight: 1 });
    if (req.url === '/conversation/distill') return reply(200, { id: 'gene_test' });
    return reply(404, {});
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const of = (path) => requests.filter((request) => request.path === path).map((request) => request.body);
  return { url: `http://127.0.0.1:${server.address().port}`, requests, of, close: () => new Promise((resolve) => server.close(resolve)) };
}

export function runHook(name, input, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [join(pluginRoot, 'hooks', `${name}.mjs`)], { env, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', reject);
    child.on('exit', (code) => (code === 0 ? resolve(parsedOutput(stdout)) : reject(new Error(`${name} exited ${code}: ${stderr}`))));
    child.stdin.end(JSON.stringify(input));
  });
}

const parsedOutput = (stdout) => (stdout ? JSON.parse(stdout) : {});

/**
 * A process named `language_server`, like the one Antigravity runs its hooks from: hooks started through it find it
 * as their host. `kill()` ends it as quitting Antigravity would.
 */
export function fakeHost(sandbox) {
  const child = spawn(join(sandbox.bin, 'language_server'), [FAKE_HOST], { env: sandbox.env, stdio: ['pipe', 'pipe', 'inherit'] });
  const waiting = new Map();
  let buffer = '';
  let nextId = 0;
  child.stdout.on('data', (chunk) => {
    buffer += chunk;
    let newline;
    while ((newline = buffer.indexOf('\n')) !== -1) {
      const reply = JSON.parse(buffer.slice(0, newline));
      buffer = buffer.slice(newline + 1);
      waiting.get(reply.id)(reply);
      waiting.delete(reply.id);
    }
  });
  const exited = new Promise((resolve) => child.once('exit', resolve));
  return {
    pid: child.pid,
    runHook: (name, input) => new Promise((resolve, reject) => {
      const id = nextId++;
      waiting.set(id, ({ code, output }) => (code === 0 ? resolve(parsedOutput(output)) : reject(new Error(`${name} exited ${code}`))));
      child.stdin.write(`${JSON.stringify({ id, script: join(pluginRoot, 'hooks', `${name}.mjs`), input })}\n`);
    }),
    kill: () => {
      child.kill('SIGKILL');
      return exited;
    },
  };
}

export async function waitFor(check, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await check();
    if (Array.isArray(value) ? value.length > 0 : value) return value;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('timed out waiting');
}

export function readJson(file, fallback) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

export function deadPid() {
  return spawnSync(process.execPath, ['-e', '']).pid;
}
