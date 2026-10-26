export const HEADLESS_MARKER = 'EVOLVER_ANTIGRAVITY_HEADLESS';

function parsedInput(raw) {
  try {
    const input = JSON.parse(raw);
    return input && typeof input === 'object' ? input : {};
  } catch {
    return {};
  }
}

// PreToolUse and Stop must name a decision: `allow` hands a tool call on to the next hook or the default policy
// unchanged (`{}` makes Antigravity reject the call), and any decision but `continue` lets the turn stop.
const NEUTRAL_OUTPUTS = { PreToolUse: { decision: 'allow' }, Stop: { decision: 'stop' } };

const INJECTING_EVENTS = new Set(['SessionStart', 'PreInvocation']);

/** `context` is a message or a list of them; empty ones are left out. Only events that take `injectSteps` get them. */
export function hookOutputOf(eventName, context) {
  const messages = [context].flat().filter((message) => typeof message === 'string' && message);
  if (messages.length > 0 && INJECTING_EVENTS.has(eventName)) {
    return JSON.stringify({ injectSteps: messages.map((ephemeralMessage) => ({ ephemeralMessage })) });
  }
  return JSON.stringify(NEUTRAL_OUTPUTS[eventName] ?? {});
}

export function sessionIdOf(input) {
  return typeof input?.conversationId === 'string' && input.conversationId ? input.conversationId : null;
}

// The distillation runs `agy` headless from this plugin, which loads this plugin's hooks again: they must not
// recall into the distillation prompt nor start more workers.
export function isOwnHeadlessRun(env = process.env) {
  return env[HEADLESS_MARKER] === '1';
}

// Antigravity writes the payload and closes stdin; a hook that fails answers neutrally rather than block the turn.
export function runHook(eventName, handle) {
  let buffer = '';
  const finish = (context) => process.stdout.write(hookOutputOf(eventName, context), () => process.exit(0));
  const start = async () => {
    try {
      finish(isOwnHeadlessRun() ? '' : await handle(parsedInput(buffer)));
    } catch {
      finish('');
    }
  };
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => {
    buffer += chunk;
  });
  process.stdin.once('end', start);
  process.stdin.once('error', start);
}
