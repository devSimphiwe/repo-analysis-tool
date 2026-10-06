// Shared types for RATty: repository records, git log records and metric results.
// These types are used by both the server-side engine and the client dashboard.

/** A cloned repository tracked in the local index. */
export interface RepoRecord {
  id: string;
  name: string;
  url: string;
  clonedAt: number;
  head: string;
  branch: string;
}

/**
 * A manual author merge: fold every email in `emails` into one canonical
 * identity. Applied on top of any git `.mailmap` normalisation.
 */
export interface AuthorMerge {
  canonicalName: string;
  canonicalEmail: string;
  /** Raw author emails (as they appear in commits) to collapse. */
  emails: string[];
}

/** Options controlling which commit set (H) metrics are computed over. */
export interface AnalyzeOptions {
  /** UNIX seconds (inclusive lower bound). Forms H_t / H_{i,j}. */
  since?: number;
  /** UNIX seconds (exclusive upper bound). Forms H_{i,j}. */
  until?: number;
  /** Repository display name (metadata only). */
  repoName?: string;
  /** Resolved reference commit hash (metadata only). */
  head?: string;
  /** Manual author merges (in addition to git's .mailmap). */
  authorMerges?: AuthorMerge[];
  /** Whether the repository contained a .mailmap (metadata for the UI). */
  mailmap?: boolean;
  /** Merge commits reachable from HEAD (excluded from H̄; metadata for the UI). */
  mergeCommits?: number;
}

/** A single file entry from `git log --numstat` (binary files are excluded). */
export interface FileNumstat {
  path: string;
  added: number;
  removed: number;
}

/** A parsed non-merge commit. */
export interface RawCommit {
  hash: string;
  /** Mailmap-canonical author name (%aN). */
  authorName: string;
  /** Mailmap-canonical author email (%aE). */
  authorEmail: string;
  /** Raw author email before .mailmap rewriting (%ae); equals authorEmail with no mailmap. */
  authorEmailRaw: string;
  /** Committer date as UNIX seconds. */
  committerDate: number;
  subject: string;
  files: FileNumstat[];
}

/** Commit-set metrics for a file or directory object (brief §2.4). */
export interface ObjectMetrics {
  path: string;
  kind: 'file' | 'directory';
  /** l+_{H,o} */
  added: number;
  /** l-_{H,o} */
  removed: number;
  /** δ_{H,o} = l+ - l- */
  growth: number;
  /** λ_{H,o} = l+ + l- */
  churn: number;
  /** n_{H,o}: commits with churn > 0 */
  modifications: number;
  /** η_{H,o} = n / |H| */
  modificationFrequency: number;
  /** ρ_{H,o} = λ / |H| */
  churnRate: number;
}

/** Repository metrics = directory metrics on the root of the commit tree (§2.3). */
export interface RepositoryMetrics {
  added: number;
  removed: number;
  growth: number;
  churn: number;
  modifications: number;
  modificationFrequency: number;
  churnRate: number;
}

/** Author metrics measured at the repository (root) level (§2.5). */
export interface AuthorMetrics {
  name: string;
  email: string;
  /** Number of commits by this author within the commit set. */
  commits: number;
  /** n_{H,root,a} */
  modifications: number;
  /** λ_{H,root,a} */
  churn: number;
  /** ω_{H,root,a} = λ_{H,root,a} / λ_{H,root} */
  ownership: number;
  /** Raw emails folded into this identity by .mailmap or a manual merge. */
  aliases: string[];
}

/** Full analysis result for one repository over one commit set. */
export interface AnalysisResult {
  repoName: string;
  head: string;
  /** True when the repository provided a .mailmap that git applied. */
  mailmap: boolean;
  /** |H| — commits in the analysed set. */
  commitsInSet: number;
  /** |H̄| — all non-merge commits reachable from HEAD. */
  commitsTotal: number;
  /** Merge commits reachable from HEAD (excluded from H̄; shown to reconcile). */
  mergeCommits: number;
  /** Every commit reachable from HEAD = commitsTotal + mergeCommits. */
  commitsAll: number;
  timeRange: {
    firstCommit: number;
    lastCommit: number;
  };
  files: ObjectMetrics[];
  directories: ObjectMetrics[];
  repository: RepositoryMetrics;
  authors: AuthorMetrics[];
}

/** Response returned when a repository is cloned and analysed in one step. */
export interface CloneAndAnalyzeResponse {
  repo: RepoRecord;
  analysis: AnalysisResult;
}
