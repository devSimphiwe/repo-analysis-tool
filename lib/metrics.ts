// Metric engine for RATty.
//
// Implements the metric definitions from the test brief:
//   §2.1 File metrics        (per commit, aggregated into commit-set totals)
//   §2.2 Directory metrics   (recursive sum over immediate children)
//   §2.3 Repository metrics  (directory metrics on the root)
//   §2.4 Commit set metrics  (l+, l-, growth, churn, modifications, η, ρ)
//   §2.5 Author metrics      (author modifications, churn, ownership)
//
// Because a directory's metric is defined as the sum of its immediate files plus
// its immediate subdirectories (which recurse the same way), a directory's value
// equals the sum over ALL files in its subtree. We therefore propagate each
// file's per-commit delta to every ancestor directory (and the root).

import type {
  AnalyzeOptions,
  AnalysisResult,
  AuthorMetrics,
  ObjectMetrics,
  RawCommit,
} from './types';

interface Accumulator {
  added: number;
  removed: number;
  /** Number of commits in which this object had churn > 0. */
  mods: number;
}

interface AuthorAcc {
  name: string;
  email: string;
  commits: number;
  churn: number;
  mods: number;
  /** Raw emails folded into this canonical identity. */
  aliases: Set<string>;
}

const ROOT = ''; // the repository root directory

function newAcc(): Accumulator {
  return { added: 0, removed: 0, mods: 0 };
}

/**
 * Compute all metrics over the commit set H ⊆ H̄ selected by `opts.since` /
 * `opts.until` (both UNIX seconds; `since` inclusive, `until` exclusive).
 * With no bounds, H = H̄ (every non-merge commit reachable from HEAD).
 */
export function computeMetrics(commits: RawCommit[], opts: AnalyzeOptions = {}): AnalysisResult {
  const since = typeof opts.since === 'number' ? opts.since : undefined;
  const until = typeof opts.until === 'number' ? opts.until : undefined;

  // Manual author merges: map every folded email -> its canonical identity.
  // git's .mailmap is already applied upstream (commits carry %aN/%aE values).
  const mergeMap = new Map<string, { name: string; email: string }>();
  for (const m of opts.authorMerges ?? []) {
    const canon = { name: m.canonicalName || m.canonicalEmail, email: m.canonicalEmail };
    mergeMap.set(m.canonicalEmail.toLowerCase(), canon);
    for (const e of m.emails) mergeMap.set(e.toLowerCase(), canon);
  }
  const resolveAuthor = (name: string, email: string): { name: string; email: string } =>
    mergeMap.get(email.toLowerCase()) ?? { name, email };

  // H_{i,j} = { h ∈ H̄ | i ≤ h[committer-date] < j }
  const H = commits.filter((c) => {
    if (since !== undefined && c.committerDate < since) return false;
    if (until !== undefined && c.committerDate >= until) return false;
    return true;
  });

  const files = new Map<string, Accumulator>();
  const dirs = new Map<string, Accumulator>(); // ROOT ('') = repository
  const authors = new Map<string, AuthorAcc>();

  const ensureFile = (p: string): Accumulator => {
    let a = files.get(p);
    if (!a) {
      a = newAcc();
      files.set(p, a);
    }
    return a;
  };
  const ensureDir = (p: string): Accumulator => {
    let a = dirs.get(p);
    if (!a) {
      a = newAcc();
      dirs.set(p, a);
    }
    return a;
  };
  ensureDir(ROOT);

  for (const c of H) {
    // Resolve the canonical identity and key authors by canonical email.
    const canon = resolveAuthor(c.authorName, c.authorEmail);
    let au = authors.get(canon.email);
    if (!au) {
      au = {
        name: canon.name,
        email: canon.email,
        commits: 0,
        churn: 0,
        mods: 0,
        aliases: new Set<string>(),
      };
      authors.set(canon.email, au);
    }
    au.commits += 1;
    // Record raw addresses folded into this identity — by git's .mailmap
    // (authorEmailRaw != canonical %aE) and/or by a manual merge (authorEmail
    // != the resolved canonical email) — so the UI can show what was combined.
    for (const alias of [c.authorEmailRaw, c.authorEmail]) {
      if (alias && alias.toLowerCase() !== canon.email.toLowerCase()) {
        au.aliases.add(alias);
      }
    }

    let commitChurn = 0;
    // Directories with churn > 0 in THIS commit (each counted once for mods).
    const touchedDirs = new Set<string>();

    for (const fe of c.files) {
      const churn = fe.added + fe.removed;

      const f = ensureFile(fe.path);
      f.added += fe.added;
      f.removed += fe.removed;
      if (churn > 0) f.mods += 1;

      // Propagate to the root/repository.
      const root = ensureDir(ROOT);
      root.added += fe.added;
      root.removed += fe.removed;
      if (churn > 0) touchedDirs.add(ROOT);

      // Propagate to every ancestor directory of the file.
      const segs = fe.path.split('/');
      let acc = '';
      for (let i = 0; i < segs.length - 1; i++) {
        acc = i === 0 ? segs[0] : `${acc}/${segs[i]}`;
        const d = ensureDir(acc);
        d.added += fe.added;
        d.removed += fe.removed;
        if (churn > 0) touchedDirs.add(acc);
      }

      commitChurn += churn;
    }

    // Author metrics measured on the repository (root) object.
    au.churn += commitChurn;
    if (commitChurn > 0) au.mods += 1;

    for (const d of touchedDirs) {
      ensureDir(d).mods += 1;
    }
  }

  const n = H.length; // |H|

  const toObject = (path: string, kind: 'file' | 'directory', a: Accumulator): ObjectMetrics => {
    const growth = a.added - a.removed;
    const churn = a.added + a.removed;
    return {
      path,
      kind,
      added: a.added,
      removed: a.removed,
      growth,
      churn,
      modifications: a.mods,
      modificationFrequency: n !== 0 ? a.mods / n : 0,
      churnRate: n !== 0 ? churn / n : 0,
    };
  };

  const fileList: ObjectMetrics[] = [];
  for (const [p, a] of files) fileList.push(toObject(p, 'file', a));
  fileList.sort((x, y) => y.churn - x.churn || x.path.localeCompare(y.path));

  // Directories exclude the root (reported separately as `repository`).
  const dirList: ObjectMetrics[] = [];
  for (const [p, a] of dirs) {
    if (p === ROOT) continue;
    dirList.push(toObject(p, 'directory', a));
  }
  dirList.sort((x, y) => y.churn - x.churn || x.path.localeCompare(y.path));

  const rootAcc = dirs.get(ROOT) ?? newAcc();
  const rootChurn = rootAcc.added + rootAcc.removed;
  const repository = {
    added: rootAcc.added,
    removed: rootAcc.removed,
    growth: rootAcc.added - rootAcc.removed,
    churn: rootChurn,
    modifications: rootAcc.mods,
    modificationFrequency: n !== 0 ? rootAcc.mods / n : 0,
    churnRate: n !== 0 ? rootChurn / n : 0,
  };

  const authorList: AuthorMetrics[] = [];
  for (const a of authors.values()) {
    authorList.push({
      name: a.name,
      email: a.email,
      commits: a.commits,
      modifications: a.mods,
      churn: a.churn,
      ownership: rootChurn !== 0 ? a.churn / rootChurn : 0,
      aliases: [...a.aliases].sort(),
    });
  }
  authorList.sort((x, y) => y.churn - x.churn || x.name.localeCompare(y.name));

  // `commits` is newest-first (git log order).
  const newest = commits.length ? commits[0].committerDate : 0;
  const oldest = commits.length ? commits[commits.length - 1].committerDate : 0;

  return {
    repoName: opts.repoName ?? '',
    head: opts.head ?? (commits.length ? commits[0].hash : ''),
    mailmap: opts.mailmap ?? false,
    commitsInSet: n,
    commitsTotal: commits.length,
    mergeCommits: opts.mergeCommits ?? 0,
    commitsAll: commits.length + (opts.mergeCommits ?? 0),
    timeRange: { firstCommit: oldest, lastCommit: newest },
    files: fileList,
    directories: dirList,
    repository,
    authors: authorList,
  };
}
