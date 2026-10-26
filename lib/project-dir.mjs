import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

function pathOf(workspace) {
  if (typeof workspace !== 'string' || !workspace) return null;
  if (!workspace.startsWith('file:')) return workspace;
  try {
    return fileURLToPath(workspace);
  } catch {
    return null;
  }
}

// A hook runs in the directory of the hooks.json that registered it, not the project, so the project is the
// first workspace in the payload: a plain path in the docs, a file:// URI in Antigravity's own conversation index.
// Print mode without --new-project has none.
export function projectDirOf(input) {
  const [workspace] = Array.isArray(input?.workspacePaths) ? input.workspacePaths : [];
  const dir = pathOf(workspace);
  if (!dir) return null;
  try {
    return fs.realpathSync(dir);
  } catch {
    return dir;
  }
}
