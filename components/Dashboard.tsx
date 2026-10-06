'use client';

// RATty dashboard — clone a repository by URL and inspect its metrics.
//
// Data flow (no data-fetching effects; the initial list arrives from the
// server component and every other fetch is triggered by a user event):
//   POST /api/repos {url,since,until}        -> clone + analyse
//   POST /api/repos/[id]/analysis {…,merges}  -> re-run over a commit set + merges
//   GET  /api/repos                           -> list clones (server-rendered initial)

import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import type { AnalysisResult, AuthorMerge, ObjectMetrics, RepoRecord } from '@/lib/types';
import {
  dateToUnix,
  fmtDateTime,
  fmtInt,
  fmtPct,
  fmtRate,
  fmtSigned,
  shortHash,
} from '@/lib/format';
import AuthorsPanel from '@/components/AuthorsPanel';
import ThemeToggle from '@/components/ThemeToggle';

type LoadState = 'idle' | 'loading' | 'ready' | 'error';

interface AnalysisResponse {
  repo: RepoRecord;
  analysis: AnalysisResult;
}

export default function Dashboard({ initialRepos }: { initialRepos: RepoRecord[] }) {
  const [repos, setRepos] = useState<RepoRecord[]>(initialRepos);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [result, setResult] = useState<AnalysisResponse | null>(null);
  const [merges, setMerges] = useState<AuthorMerge[]>([]);

  const [url, setUrl] = useState('');
  const [since, setSince] = useState('');
  const [until, setUntil] = useState('');

  const [cloning, setCloning] = useState(false);
  const [analysisState, setAnalysisState] = useState<LoadState>('idle');
  const [error, setError] = useState<string | null>(null);

  async function refreshRepos() {
    try {
      const res = await fetch('/api/repos', { cache: 'no-store' });
      if (!res.ok) throw new Error('Failed to load repositories');
      const data = await res.json();
      setRepos(Array.isArray(data.repos) ? (data.repos as RepoRecord[]) : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  // Filter values and merges are passed explicitly so a caller can use the
  // just-typed value instead of relying on state that has not flushed yet.
  async function runAnalysis(
    id: string,
    sinceVal: string,
    untilVal: string,
    mergesList: AuthorMerge[]
  ) {
    setAnalysisState('loading');
    setError(null);
    const hadResult = result !== null;
    try {
      const body: Record<string, unknown> = { merges: mergesList };
      const s = dateToUnix(sinceVal);
      const u = dateToUnix(untilVal);
      if (s !== undefined) body.since = s;
      if (u !== undefined) body.until = u;
      const res = await fetch(`/api/repos/${id}/analysis`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as AnalysisResponse & { error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Analysis failed');
      setResult({ repo: data.repo, analysis: data.analysis });
      setAnalysisState('ready');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      // Keep previously rendered results visible if a re-analysis fails.
      setAnalysisState(hadResult ? 'ready' : 'error');
    }
  }

  function selectRepo(id: string) {
    if (id !== selectedId) {
      setResult(null);
      setMerges([]);
    }
    setSelectedId(id);
    void runAnalysis(id, since, until, []);
  }

  function onSinceChange(value: string) {
    setSince(value);
    if (selectedId) void runAnalysis(selectedId, value, until, merges);
  }

  function onUntilChange(value: string) {
    setUntil(value);
    if (selectedId) void runAnalysis(selectedId, since, value, merges);
  }

  function refreshAnalysis() {
    if (selectedId) void runAnalysis(selectedId, since, until, merges);
  }

  // Author merges (mailmap + manual) are recomputed server-side on every change.
  function handleMergesChange(next: AuthorMerge[]) {
    setMerges(next);
    if (selectedId) void runAnalysis(selectedId, since, until, next);
  }

  async function onClone(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed || cloning) return;
    setCloning(true);
    setError(null);
    try {
      const body: Record<string, unknown> = { url: trimmed };
      const s = dateToUnix(since);
      const u = dateToUnix(until);
      if (s !== undefined) body.since = s;
      if (u !== undefined) body.until = u;
      const res = await fetch('/api/repos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as AnalysisResponse & { error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Clone failed');
      // The POST already returns the analysis for the applied filter — reuse it.
      await refreshRepos();
      setUrl('');
      setMerges([]);
      setSelectedId(data.repo.id);
      setResult({ repo: data.repo, analysis: data.analysis });
      setAnalysisState('ready');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCloning(false);
    }
  }

  return (
    <>
      <Header />

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6">
        {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

        {/* Clone form + global time filter */}
        <form
          onSubmit={onClone}
          className="rounded-2xl border border-line bg-surface p-5 shadow-card sm:p-6"
        >
          <div className="mb-4 flex items-center gap-2.5">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent-soft text-accent">
              <PlusIcon />
            </span>
            <h2 className="text-sm font-semibold tracking-tight">
              Clone &amp; analyse a repository
            </h2>
          </div>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_11rem_11rem_auto]">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-muted">Repository URL or path</span>
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://github.com/user/repo.git"
                spellCheck={false}
                className="rounded-xl border border-line bg-surface-2 px-3.5 py-2.5 font-mono text-sm outline-none transition-all placeholder:text-muted/60 focus:border-accent focus:ring-2 focus:ring-accent/25"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-muted">Since (inclusive)</span>
              <input
                type="date"
                value={since}
                onChange={(e) => onSinceChange(e.target.value)}
                className="rounded-xl border border-line bg-surface-2 px-3.5 py-2.5 text-sm outline-none transition-all focus:border-accent focus:ring-2 focus:ring-accent/25"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-muted">Until (exclusive)</span>
              <input
                type="date"
                value={until}
                onChange={(e) => onUntilChange(e.target.value)}
                className="rounded-xl border border-line bg-surface-2 px-3.5 py-2.5 text-sm outline-none transition-all focus:border-accent focus:ring-2 focus:ring-accent/25"
              />
            </label>
            <div className="flex items-end">
              <button
                type="submit"
                disabled={cloning || !url.trim()}
                className="w-full rounded-full bg-accent px-6 py-2.5 font-semibold text-accent-fg shadow-card transition-all hover:bg-accent-hover hover:shadow-pop disabled:cursor-not-allowed disabled:opacity-40 lg:w-auto"
              >
                {cloning ? 'Cloning…' : 'Clone & analyse'}
              </button>
            </div>
          </div>
          <p className="mt-3 text-xs text-muted">
            Dates are UTC and also re-run the analysis for the selected repository. Leave both
            blank to analyse the full history reachable from HEAD.
          </p>
        </form>

        {/* Body: repo list + results */}
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[18rem_1fr]">
          <RepoList repos={repos} selectedId={selectedId} onSelect={selectRepo} />

          <div className="min-w-0">
            {!selectedId && <EmptyState />}
            {selectedId && !result && analysisState === 'loading' && <LoadingState />}
            {selectedId && !result && analysisState === 'error' && (
              <div className="flex h-full min-h-[18rem] items-center justify-center rounded-2xl border border-line bg-surface p-10 text-center text-sm text-muted shadow-card">
                Analysis failed — see the error above.
              </div>
            )}
            {selectedId && result && (
              <Results
                repo={result.repo}
                analysis={result.analysis}
                onRefresh={refreshAnalysis}
                merges={merges}
                onMergesChange={handleMergesChange}
                busy={analysisState === 'loading'}
              />
            )}
          </div>
        </div>
      </main>

      <footer className="border-t border-line px-6 py-5 text-center text-xs text-muted">
        RATty · deep-clones repositories locally and computes metrics from{' '}
        <span className="font-mono">git log --numstat</span>
      </footer>
    </>
  );
}

/* ---------------------------------- header --------------------------------- */

function Header() {
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3.5 sm:px-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent font-mono text-xl font-bold text-accent-fg shadow-card">
            R
          </div>
          <div className="leading-tight">
            <h1 className="text-lg font-semibold tracking-tight">RATty</h1>
            <p className="text-xs text-muted">Repository Analysis Tool</p>
          </div>
        </div>
        <ThemeToggle />
      </div>
    </header>
  );
}

/* -------------------------------- repo list -------------------------------- */

function RepoList({
  repos,
  selectedId,
  onSelect,
}: {
  repos: RepoRecord[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <aside className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card lg:self-start">
      <div className="flex items-center justify-between border-b border-line bg-surface-2/40 px-4 py-3">
        <h2 className="text-sm font-semibold tracking-tight">Repositories</h2>
        <span className="rounded-full bg-surface px-2.5 py-0.5 font-mono text-xs text-muted ring-1 ring-line">
          {repos.length}
        </span>
      </div>
      <div className="max-h-[70vh] overflow-y-auto p-2">
        {repos.length === 0 && (
          <p className="px-3 py-8 text-center text-sm text-muted">No repositories yet.</p>
        )}
        {repos.map((r) => {
          const active = r.id === selectedId;
          return (
            <button
              key={r.id}
              type="button"
              onClick={() => onSelect(r.id)}
              className={`mb-1 w-full rounded-xl px-3.5 py-3 text-left transition-all ${
                active ? 'bg-accent-soft ring-1 ring-accent/40' : 'hover:bg-surface-2'
              }`}
            >
              <div className="flex items-center gap-2">
                <span
                  className={`h-2 w-2 shrink-0 rounded-full ${active ? 'bg-accent' : 'bg-muted/40'}`}
                />
                <span className="truncate text-sm font-medium">{r.name}</span>
              </div>
              <div className="mt-1.5 flex items-center gap-2 truncate pl-4 text-xs text-muted">
                <span className="rounded-full px-2 py-0.5 font-mono ring-1 ring-line">{r.branch}</span>
                <span className="truncate">{fmtDateTime(Math.floor(r.clonedAt / 1000))}</span>
              </div>
            </button>
          );
        })}
      </div>
    </aside>
  );
}

/* --------------------------------- results --------------------------------- */

function Results({
  repo,
  analysis,
  onRefresh,
  merges,
  onMergesChange,
  busy,
}: {
  repo: RepoRecord;
  analysis: AnalysisResult;
  onRefresh: () => void;
  merges: AuthorMerge[];
  onMergesChange: (next: AuthorMerge[]) => void;
  busy: boolean;
}) {
  const { repository: rm, timeRange } = analysis;
  return (
    <div className="flex flex-col gap-6">
      {/* Loading bar while a re-analysis (merge/filter) is in flight. */}
      {busy && (
        <div className="h-1 w-full overflow-hidden rounded-full bg-accent-soft">
          <div className="h-1 w-1/2 animate-pulse rounded-full bg-accent" />
        </div>
      )}

      {/* Selected repo header */}
      <div className="rounded-2xl border border-line bg-surface p-5 shadow-card">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-xl font-semibold tracking-tight">{repo.name}</h2>
            <p className="mt-1 truncate font-mono text-xs text-muted" title={repo.url}>
              {repo.url}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-surface-2 px-3 py-1 text-xs ring-1 ring-line">
              branch <span className="font-mono text-foreground">{repo.branch}</span>
            </span>
            <span className="rounded-full bg-surface-2 px-3 py-1 text-xs ring-1 ring-line">
              HEAD <span className="font-mono text-accent">{shortHash(repo.head)}</span>
            </span>
            <button
              type="button"
              onClick={onRefresh}
              className="inline-flex items-center gap-1.5 rounded-full border border-line px-3.5 py-1.5 text-xs font-medium transition-colors hover:border-accent hover:text-accent"
            >
              <RefreshIcon />
              Refresh
            </button>
          </div>
        </div>
      </div>

      {/* Commit set */}
      <Section title="Commit set" meta={`|H| = ${fmtInt(analysis.commitsInSet)}`}>
        <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 lg:grid-cols-6">
          <Stat
            label="Commits |H|"
            value={fmtInt(analysis.commitsInSet)}
            sub={`of ${fmtInt(analysis.commitsTotal)} non-merge`}
            accent
          />
          <Stat label="Files touched" value={fmtInt(analysis.files.length)} />
          <Stat label="Directories" value={fmtInt(analysis.directories.length)} />
          <Stat label="Authors" value={fmtInt(analysis.authors.length)} />
          <Stat label="First commit" value={fmtDateTime(timeRange.firstCommit)} />
          <Stat label="Last commit" value={fmtDateTime(timeRange.lastCommit)} />
        </div>
        <MergeNote
          inSet={analysis.commitsInSet}
          total={analysis.commitsTotal}
          merges={analysis.mergeCommits}
          all={analysis.commitsAll}
        />
      </Section>

      {/* Repository metrics */}
      <Section title="Repository metrics" meta="root of the commit tree (§2.3)">
        <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4 lg:grid-cols-7">
          <Stat label="Added l+" value={fmtInt(rm.added)} positive />
          <Stat label="Removed l−" value={fmtInt(rm.removed)} negative />
          <Stat label="Growth δ" value={fmtSigned(rm.growth)} />
          <Stat label="Churn λ" value={fmtInt(rm.churn)} accent />
          <Stat label="Modifications" value={fmtInt(rm.modifications)} />
          <Stat label="Mod freq η" value={fmtPct(rm.modificationFrequency)} />
          <Stat label="Churn rate ρ" value={fmtRate(rm.churnRate)} />
        </div>
      </Section>

      {/* Authors */}
      <Section title="Authors" meta={`${fmtInt(analysis.authors.length)} contributors (§2.5)`}>
        <AuthorsPanel
          authors={analysis.authors}
          mailmap={analysis.mailmap}
          merges={merges}
          busy={busy}
          onChange={onMergesChange}
        />
      </Section>

      {/* Files */}
      <Section title="Files" meta={`${fmtInt(analysis.files.length)} paths (§2.1)`}>
        <ObjectTable rows={analysis.files} emptyLabel="No file changes in this commit set." />
      </Section>

      {/* Directories */}
      <Section title="Directories" meta={`${fmtInt(analysis.directories.length)} paths (§2.2)`}>
        <ObjectTable rows={analysis.directories} emptyLabel="No directories in this commit set." />
      </Section>
    </div>
  );
}

/* ------------------------------ shared widgets ----------------------------- */

function MergeNote({
  inSet,
  total,
  merges,
  all,
}: {
  inSet: number;
  total: number;
  merges: number;
  all: number;
}) {
  return (
    <div className="flex items-start gap-2.5 border-t border-line bg-surface-2/40 px-5 py-3.5 text-xs leading-relaxed text-muted">
      <span className="mt-0.5 shrink-0 text-accent">
        <InfoIcon />
      </span>
      <p>
        <span className="font-semibold text-foreground">{fmtInt(all)}</span> commits are reachable
        from HEAD
        {merges > 0 && (
          <>
            {' '}
            — <span className="font-semibold text-foreground">{fmtInt(merges)}</span> of them merge
            commits
          </>
        )}
        . RATty analyses the{' '}
        <span className="font-semibold text-accent">{fmtInt(total)}</span> non-merge commit
        {total === 1 ? '' : 's'}
        {inSet !== total && (
          <>
            {' '}
            — <span className="font-semibold text-foreground">{fmtInt(inSet)}</span> in the selected
            range
          </>
        )}
        . Merges are excluded because they carry no original diff and would double-count churn, so
        this is lower than the {fmtInt(all)} GitHub reports.
      </p>
    </div>
  );
}

function Section({ title, meta, children }: { title: string; meta?: string; children: ReactNode }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
      <header className="flex items-center justify-between gap-3 border-b border-line bg-surface-2/40 px-5 py-3.5">
        <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
        {meta && (
          <span className="rounded-full bg-surface px-2.5 py-0.5 text-xs text-muted ring-1 ring-line">
            {meta}
          </span>
        )}
      </header>
      {children}
    </section>
  );
}

function Stat({
  label,
  value,
  sub,
  accent,
  positive,
  negative,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
  positive?: boolean;
  negative?: boolean;
}) {
  const tone = accent
    ? 'text-accent'
    : positive
      ? 'text-positive'
      : negative
        ? 'text-negative'
        : 'text-foreground';
  return (
    <div className="rounded-xl border border-line bg-surface-2/40 p-3.5">
      <div className="text-[0.7rem] font-medium uppercase tracking-wide text-muted">{label}</div>
      <div className={`mt-1 font-mono text-xl font-semibold tabular-nums ${tone}`}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-muted">{sub}</div>}
    </div>
  );
}

function ObjectTable({ rows, emptyLabel }: { rows: ObjectMetrics[]; emptyLabel: string }) {
  const maxChurn = useMemo(() => Math.max(1, ...rows.map((r) => r.churn)), [rows]);
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="bg-surface-2/40 text-xs uppercase tracking-wide text-muted">
            <Th className="text-left">Path</Th>
            <Th>Added</Th>
            <Th>Removed</Th>
            <Th>Growth</Th>
            <Th>Churn</Th>
            <Th>Mods</Th>
            <Th>Freq η</Th>
            <Th>Rate ρ</Th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={8} className="px-5 py-10 text-center text-muted">
                {emptyLabel}
              </td>
            </tr>
          )}
          {rows.map((r) => (
            <tr key={r.path} className="border-t border-line transition-colors hover:bg-surface-2/50">
              <Td className="max-w-[24rem] truncate text-left font-mono text-xs" title={r.path}>
                {r.path}
              </Td>
              <Td className="text-right font-mono tabular-nums text-positive">{fmtInt(r.added)}</Td>
              <Td className="text-right font-mono tabular-nums text-negative">
                {fmtInt(r.removed)}
              </Td>
              <Td className="text-right font-mono tabular-nums">{fmtSigned(r.growth)}</Td>
              <Td className="text-right font-mono tabular-nums">
                <div className="flex items-center justify-end gap-2">
                  <span>{fmtInt(r.churn)}</span>
                  <span
                    className="h-1.5 shrink-0 rounded-full bg-accent/80"
                    style={{ width: `${Math.max(2, Math.round((r.churn / maxChurn) * 48))}px` }}
                  />
                </div>
              </Td>
              <Td className="text-right font-mono tabular-nums">{fmtInt(r.modifications)}</Td>
              <Td className="text-right font-mono tabular-nums text-muted">
                {fmtPct(r.modificationFrequency)}
              </Td>
              <Td className="text-right font-mono tabular-nums text-muted">{fmtRate(r.churnRate)}</Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Th({ children, className = '' }: { children?: ReactNode; className?: string }) {
  return (
    <th className={`px-4 py-2.5 text-right font-medium whitespace-nowrap ${className}`}>
      {children}
    </th>
  );
}

function Td({
  children,
  className = '',
  title,
}: {
  children?: ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <td className={`px-4 py-2.5 align-middle ${className}`} title={title}>
      {children}
    </td>
  );
}

function EmptyState() {
  return (
    <div className="flex h-full min-h-[18rem] flex-col items-center justify-center rounded-2xl border border-dashed border-line bg-surface/60 p-10 text-center shadow-card">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-soft font-mono text-2xl font-bold text-accent">
        R
      </div>
      <p className="max-w-sm text-sm text-muted">
        Clone a repository or select one from the list to see its metrics.
      </p>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="flex h-full min-h-[18rem] flex-col items-center justify-center rounded-2xl border border-line bg-surface p-10 shadow-card">
      <div className="mb-4 h-8 w-8 animate-spin rounded-full border-2 border-line border-t-accent" />
      <p className="text-sm text-muted">Computing metrics…</p>
    </div>
  );
}

function ErrorBanner({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return (
    <div className="mb-5 flex items-start justify-between gap-3 rounded-2xl border border-negative/40 bg-negative/10 px-5 py-4 shadow-card">
      <div className="flex min-w-0 items-start gap-2.5">
        <span className="mt-0.5 shrink-0 text-negative">
          <AlertIcon />
        </span>
        <div className="min-w-0">
          <div className="text-sm font-semibold text-negative">Something went wrong</div>
          <div className="mt-0.5 break-words font-mono text-xs text-negative/80">{message}</div>
        </div>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        className="shrink-0 rounded-full border border-negative/40 px-3 py-1 text-xs text-negative transition-colors hover:bg-negative/20"
      >
        Dismiss
      </button>
    </div>
  );
}

/* ---------------------------------- icons ---------------------------------- */

function PlusIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 12a9 9 0 1 1-2.6-6.4" />
      <path d="M21 3v6h-6" />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 16v-5M12 8h.01" />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 9v4M12 17h.01" />
      <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
    </svg>
  );
}
