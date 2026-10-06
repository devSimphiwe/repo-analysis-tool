// Git operations for RATty: deep clone, reference resolution and a robust
// parser for `git log -z --numstat` output.
//
// Why the `-z` form? With rename detection git prints renamed paths using an
// ambiguous `old => new` / `{old => new}` brace syntax in the default numstat
// output. The `-z` form emits NUL-terminated fields and, for renames, an empty
// path field followed by the old and new paths as separate NUL-terminated
// tokens — which is unambiguous and safe for paths containing spaces.
//
// Verified byte layout per commit block (RS = 0x1e, US = 0x1f):
//   RS H US aN US aE US ae US ct US subject NUL \n <records>
// where each <record> is:
//   normal: added \t removed \t path NUL
//   rename: added \t removed \t NUL oldPath NUL newPath NUL
// Binary files are reported as: - \t - \t path NUL  (and are skipped).

import { execFile } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { promisify } from 'util';
import type { FileNumstat, RawCommit } from './types';

const execFileAsync = promisify(execFile);

/** Record separator emitted by our custom `--format` (matches %x1e). */
const RS = '\x1e';
/** Unit separator between header fields (matches %x1f). */
const US = '\x1f';
/**
 * The literal format string; git expands %x1e/%x1f into the bytes above.
 * %aN/%aE (capitalised) are the mailmap-respecting author name/email: git
 * applies the repository's `.mailmap` automatically, merging identities.
 * %ae (lowercase) is the raw, pre-mailmap author email — diffed against %aE it
 * reveals which addresses git folded, so the UI can list them as aliases.
 */
const LOG_FORMAT = '%x1e%H%x1f%aN%x1f%aE%x1f%ae%x1f%ct%x1f%s';

/** 512 MB — enough for very large histories (e.g. the git/git repo). */
const MAX_BUFFER = 512 * 1024 * 1024;

export class GitError extends Error {
  stderr?: string;
  constructor(message: string, stderr?: string) {
    super(message);
    this.name = 'GitError';
    this.stderr = stderr;
  }
}

async function runGit(args: string[], cwd?: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync('git', args, {
      cwd,
      maxBuffer: MAX_BUFFER,
      encoding: 'utf8',
      env: {
        ...process.env,
        // Never hang waiting for credentials on private/unreachable remotes.
        GIT_TERMINAL_PROMPT: '0',
      },
    });
    return stdout as string;
  } catch (err) {
    const e = err as { message?: string; stderr?: string | Buffer };
    const stderr = e.stderr ? e.stderr.toString() : undefined;
    const detail = (stderr || e.message || 'unknown git error').toString().trim();
    throw new GitError(detail, stderr);
  }
}

/** Reject empty values and anything that could be parsed as a git option. */
function assertSafeArg(value: string, label: string): void {
  if (!value || value.startsWith('-')) {
    throw new GitError(`Invalid ${label}`);
  }
}

/**
 * Deeply clone `url` into `dest` (full history — no `--depth`), returning the
 * resolved HEAD commit and branch name.
 */
export async function deepClone(
  url: string,
  dest: string
): Promise<{ head: string; branch: string }> {
  assertSafeArg(url, 'repository URL');
  await runGit(['clone', url, dest]);
  const head = (await runGit(['rev-parse', 'HEAD'], dest)).trim();
  let branch = 'HEAD';
  try {
    branch = (await runGit(['rev-parse', '--abbrev-ref', 'HEAD'], dest)).trim();
  } catch {
    branch = 'HEAD';
  }
  return { head, branch };
}

/** Resolve a reference (default HEAD) to a full commit hash. */
export async function resolveHead(repoDir: string, ref = 'HEAD'): Promise<string> {
  return (await runGit(['rev-parse', ref], repoDir)).trim();
}

/**
 * Whether the repository provides a `.mailmap` at its working-tree root. git
 * applies it automatically to %aN/%aE, so this flag only informs the UI whether
 * author identities were already normalised (vs. needing a manual merge).
 */
export async function hasMailmap(repoDir: string): Promise<boolean> {
  try {
    await fs.access(path.join(repoDir, '.mailmap'));
    return true;
  } catch {
    return false;
  }
}

/**
 * Count the merge commits reachable from `ref` (whole history). RATty analyses
 * only non-merge commits (H̄), so this reconciles the count against hosts like
 * GitHub that list every commit: non-merge + merges = total.
 *
 * `ref` must be an already-resolved hexadecimal commit hash.
 */
export async function countMergeCommits(repoDir: string, ref: string): Promise<number> {
  if (!/^[0-9a-f]{4,64}$/i.test(ref)) {
    throw new GitError(`Invalid commit reference: ${ref}`);
  }
  const out = await runGit(['rev-list', '--count', '--merges', ref], repoDir);
  const n = Number.parseInt(out.trim(), 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Parse the raw output of
 * `git log -z --numstat --no-merges --find-renames=50% --format=<LOG_FORMAT>`.
 */
export function parseLogZ(output: string): RawCommit[] {
  const commits: RawCommit[] = [];

  for (const block of output.split(RS)) {
    if (!block) continue;

    const nulIndex = block.indexOf('\x00');
    if (nulIndex === -1) continue;

    const header = block.slice(0, nulIndex);
    let rest = block.slice(nulIndex + 1);
    if (rest.startsWith('\n')) rest = rest.slice(1);

    const hf = header.split(US);
    const hash = hf[0] ?? '';
    if (!hash) continue;
    const authorName = hf[1] ?? '';
    const authorEmail = hf[2] ?? '';
    const authorEmailRaw = hf[3] ?? '';
    const committerDate = Number.parseInt(hf[4] ?? '0', 10) || 0;
    const subject = hf[5] ?? '';

    const files: FileNumstat[] = [];
    const tokens = rest.split('\x00');
    let i = 0;
    while (i < tokens.length) {
      const tok = tokens[i];
      if (tok === '') {
        i += 1;
        continue;
      }
      const t1 = tok.indexOf('\t');
      const t2 = t1 === -1 ? -1 : tok.indexOf('\t', t1 + 1);
      if (t1 === -1 || t2 === -1) {
        i += 1;
        continue;
      }
      const addedS = tok.slice(0, t1);
      const removedS = tok.slice(t1 + 1, t2);
      const pathPart = tok.slice(t2 + 1);

      // Binary file: not measured. Skip (and consume rename tokens if present).
      if (addedS === '-' || removedS === '-') {
        i += pathPart === '' ? 3 : 1;
        continue;
      }

      const added = Number.parseInt(addedS, 10);
      const removed = Number.parseInt(removedS, 10);
      if (Number.isNaN(added) || Number.isNaN(removed)) {
        i += 1;
        continue;
      }

      let filePath = pathPart;
      if (pathPart === '') {
        // Rename/copy: next two tokens are oldPath then newPath.
        const oldPath = tokens[i + 1] ?? '';
        const newPath = tokens[i + 2] ?? '';
        // Attribute changes to the new path (brief §2: rename detection).
        filePath = newPath || oldPath;
        i += 3;
      } else {
        i += 1;
      }
      if (!filePath) continue;
      files.push({ path: filePath, added, removed });
    }

    commits.push({ hash, authorName, authorEmail, authorEmailRaw, committerDate, subject, files });
  }

  return commits;
}

/**
 * Read the full non-merge commit log (H̄) reachable from `ref`, with numstat,
 * rename detection at 50% and merge commits excluded.
 *
 * `ref` must be an already-resolved hexadecimal commit hash to avoid any chance
 * of it being interpreted as a git option.
 */
export async function getCommitLog(repoDir: string, ref: string): Promise<RawCommit[]> {
  if (!/^[0-9a-f]{4,64}$/i.test(ref)) {
    throw new GitError(`Invalid commit reference: ${ref}`);
  }
  const output = await runGit(
    [
      'log',
      '-z',
      '--numstat',
      '--no-merges',
      '--find-renames=50%',
      `--format=${LOG_FORMAT}`,
      ref,
    ],
    repoDir
  );
  return parseLogZ(output);
}
