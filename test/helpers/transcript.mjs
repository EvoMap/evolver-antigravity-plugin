import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

// Rows shaped like Antigravity CLI's transcript.jsonl: tool arguments JSON-encoded, the prompt wrapped in
// <USER_REQUEST>, a command's exit code in its result text.
export function transcriptWriter(file) {
  mkdirSync(dirname(file), { recursive: true });
  let step = 0;
  const write = (row) => appendFileSync(file, `${JSON.stringify({ step_index: step++, status: 'DONE', created_at: new Date().toISOString(), ...row })}\n`);
  const encoded = (args) => Object.fromEntries(Object.entries(args).map(([key, value]) => [key, JSON.stringify(value)]));
  return {
    file,
    raw: (row) => appendFileSync(file, `${JSON.stringify({ status: 'DONE', ...row })}\n`),
    prompt: (text) => {
      write({ source: 'USER_EXPLICIT', type: 'USER_INPUT', content: `<USER_REQUEST>\n${text}\n</USER_REQUEST>\n<ADDITIONAL_METADATA>\nThe current local time is 2026-10-26.\n</ADDITIONAL_METADATA>` });
      write({ source: 'SYSTEM', type: 'CONVERSATION_HISTORY' });
    },
    ephemeral: (text) => write({ source: 'SYSTEM_SDK', type: 'EPHEMERAL_MESSAGE', content: text }),
    calls: (...calls) => write({ source: 'MODEL', type: 'PLANNER_RESPONSE', tool_calls: calls.map(([name, args]) => ({ name, args: encoded(args) })) }),
    result: (row) => write({ source: 'MODEL', type: 'GENERIC', ...row }),
    command: (commandLine, { exit, output = '', ...row } = {}) => {
      write({ source: 'MODEL', type: 'PLANNER_RESPONSE', tool_calls: [{ name: 'run_command', args: encoded({ CommandLine: commandLine, Cwd: '/w', WaitMsBeforeAsync: 5000 }) }] });
      const content = exit === undefined ? output : `The command exited with code ${exit}.\nOutput:\n${output}`;
      write({ source: 'MODEL', type: 'RUN_COMMAND', content, ...row });
    },
    answer: (text) => write({ source: 'MODEL', type: 'PLANNER_RESPONSE', content: text }),
  };
}
