// Route handler: /api/repos/[id]/analysis
//   GET  ?since=<unix>&until=<unix>          -> recompute metrics for an existing
//                                              clone over the selected commit set H.
//   POST { since?, until?, merges? }         -> same, plus manual author merges
//                                              applied on top of git's .mailmap.
//
// git's .mailmap (if the repo has one) is applied automatically because the log
// is read with %aN/%aE. `merges` lets a user fold identities even with no mailmap.

import { NextResponse } from 'next/server';
import { countMergeCommits, getCommitLog, GitError, hasMailmap, resolveHead } from '@/lib/git';
import { computeMetrics } from '@/lib/metrics';
import { findRepo, repoPath } from '@/lib/store';
import type { AnalyzeOptions, AuthorMerge } from '@/lib/types';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

interface AnalyzeInput {
  since?: number;
  until?: number;
  merges?: AuthorMerge[];
}

/** Coerce a search-param / body value into a finite UNIX-seconds number. */
function toUnix(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : undefined;
}

/** Validate an untrusted body.merges value into a safe, bounded AuthorMerge[]. */
function sanitizeMerges(value: unknown): AuthorMerge[] {
  if (!Array.isArray(value)) return [];
  const out: AuthorMerge[] = [];
  for (const item of value.slice(0, 500)) {
    if (!item || typeof item !== 'object') continue;
    const m = item as Record<string, unknown>;
    const canonicalEmail = typeof m.canonicalEmail === 'string' ? m.canonicalEmail.trim() : '';
    if (!canonicalEmail) continue;
    const canonicalName = typeof m.canonicalName === 'string' ? m.canonicalName.trim() : '';
    const emails = Array.isArray(m.emails)
      ? m.emails
          .filter((e): e is string => typeof e === 'string' && e.trim() !== '')
          .map((e) => e.trim())
          .slice(0, 1000)
      : [];
    // A group must fold at least one email; otherwise it is a no-op / malformed.
    if (emails.length === 0) continue;
    out.push({ canonicalName: canonicalName || canonicalEmail, canonicalEmail, emails });
  }
  return out;
}

async function analyze(id: string, input: AnalyzeInput) {
  const repo = await findRepo(id);
  if (!repo) {
    return NextResponse.json({ error: 'Repository not found' }, { status: 404 });
  }

  try {
    const dir = repoPath(id);
    const head = await resolveHead(dir, 'HEAD');
    const commits = await getCommitLog(dir, head);
    const mailmap = await hasMailmap(dir);
    const mergeCommits = await countMergeCommits(dir, head);

    const opts: AnalyzeOptions = {
      since: input.since,
      until: input.until,
      repoName: repo.name,
      head,
      mailmap,
      mergeCommits,
      authorMerges: input.merges ?? [],
    };
    const analysis = computeMetrics(commits, opts);
    return NextResponse.json({ repo, analysis });
  } catch (err) {
    const message = err instanceof GitError ? err.message : (err as Error).message;
    return NextResponse.json({ error: `Analysis failed: ${message}` }, { status: 500 });
  }
}

export async function GET(request: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const { searchParams } = new URL(request.url);
  return analyze(id, {
    since: toUnix(searchParams.get('since')),
    until: toUnix(searchParams.get('until')),
  });
}

export async function POST(request: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    // An empty/invalid body simply means "no filters, no merges".
  }
  return analyze(id, {
    since: toUnix(body.since),
    until: toUnix(body.until),
    merges: sanitizeMerges(body.merges),
  });
}
