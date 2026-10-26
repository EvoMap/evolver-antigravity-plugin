import { contentHashOf } from './retention-pending.mjs';
import { appendStateLine, hashedName, removeState, statePath, takeStateLines } from './state-file.mjs';
import { stepsAfter, turnActivityOf } from './transcript.mjs';
import { checkOf } from './verification.mjs';

export const SHELL_TOOL = 'run_command';
export const EDIT_TOOLS = ['write_to_file', 'replace_file_content', 'multi_replace_file_content'];

const PATH_KEYS = ['TargetFile', 'AbsolutePath', 'DirectoryPath', 'SearchPath', 'SearchDirectory'];

const notesPath = (sessionId) => statePath(hashedName('antigravity-turn', sessionId, 'jsonl'));

export function editedPathOf(args) {
  const file = args?.TargetFile;
  return typeof file === 'string' && file ? file : null;
}

/** The file an edit is about to change, hashed before it does, for the retention report. */
export function noteFileBeforeEdit(sessionId, { name, args }) {
  const file = EDIT_TOOLS.includes(name) ? editedPathOf(args) : null;
  if (file) appendStateLine(notesPath(sessionId), { kind: 'before', path: file, hash: contentHashOf(file) });
}

const failedResult = (result) => !result || result.status === 'ERROR' || Boolean(result.error);

function addCall(record, call) {
  const command = call.name === SHELL_TOOL && typeof call.args.CommandLine === 'string' ? call.args.CommandLine : null;
  if (command) {
    record.commands.push(command);
    const check = checkOf(command, call.result);
    if (check) record.checks.push(check);
  }
  record.paths.push(...PATH_KEYS.map((key) => call.args[key]).filter((value) => typeof value === 'string' && value));
  const edited = EDIT_TOOLS.includes(call.name) && !failedResult(call.result) ? editedPathOf(call.args) : null;
  if (edited) record.edits.push(edited);
}

function editedBeforeOf(notes) {
  const editedBefore = new Map();
  for (const note of notes) if (note.kind === 'before' && !editedBefore.has(note.path)) editedBefore.set(note.path, note.hash);
  return editedBefore;
}

export function turnRecordOf(activity, notes = []) {
  const record = { checks: [], commands: [], paths: [], edits: [], editedBefore: editedBeforeOf(notes), answer: activity.answer };
  for (const call of activity.calls) addCall(record, call);
  return record;
}

/** What the turn opened by the marked prompt did, up to byte `to` of the transcript. */
export function transcriptRecordOf(transcriptPath, mark, to = Infinity, notes = []) {
  return turnRecordOf(turnActivityOf(stepsAfter(transcriptPath, mark, to)), notes);
}

/** The turn's record with the file hashes its edits noted; the notes leave the disk once taken. */
export function takeTurnRecord(sessionId, transcriptPath, mark, to = Infinity) {
  const { lines, commit } = takeStateLines(notesPath(sessionId));
  commit();
  return transcriptRecordOf(transcriptPath, mark, to, lines);
}

export function forgetTurnRecord(sessionId) {
  removeState(notesPath(sessionId));
}
