import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

// Stands in for Antigravity's language server: runs each hook it is sent through `sh -c`, as Antigravity does,
// and stays up until killed, so hooks find it as their host process.
const lines = createInterface({ input: process.stdin });
lines.on('line', (line) => {
  const { id, script, input } = JSON.parse(line);
  const child = spawn('/bin/sh', ['-c', 'node "$0"', script], { stdio: ['pipe', 'pipe', 'inherit'] });
  let output = '';
  child.stdout.on('data', (chunk) => {
    output += chunk;
  });
  child.on('exit', (code) => process.stdout.write(`${JSON.stringify({ id, code, output })}\n`));
  child.stdin.end(JSON.stringify(input));
});
setInterval(() => {}, 60_000);
