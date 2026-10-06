// Route handler: /api/repos
//   GET  -> list cloned repositories
//   POST -> { url, since?, until? } : deep clone the URL and analyse it

import { promises as fs } from 'fs';
import { NextResponse } from 'next/server';
import { countMergeCommits, deepClone, getCommitLog, GitError, hasMailmap } from '@/lib/git';
import { computeMetrics } from '@/lib/metrics';
import {
  addRepo,
  deriveRepoName,
  ensureDataDirs,
  listRepos,
  newId,
  repoPath,
} from '@/lib/store';
import type { AnalyzeOptions, CloneAndAnalyzeResponse, RepoRecord } from '@/lib/types';

export const dynamic = 'force-dynamic';

function toFiniteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export async function GET() {
  const repos = await listRepos();
  return NextResponse.json({ repos });
}

export async function POST(request: Request) {
  let url: string | undefined;
  let since: number | undefined;
  let until: number | undefined;

  try {
    const body = (await request.json()) as { url?: unknown; since?: unknown; until?: unknown };
    url = typeof body.url === 'string' ? body.url.trim() : undefined;
    since = toFiniteNumber(body.since);
    until = toFiniteNumber(body.until);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!url) {
    return NextResponse.json({ error: 'A repository "url" is required' }, { status: 400 });
  }

  const name = deriveRepoName(url);
  const id = newId(name);
  const dest = repoPath(id);

  try {
    await ensureDataDirs();
    const { head, branch } = await deepClone(url, dest);
    const commits = await getCommitLog(dest, head);
    const mailmap = await hasMailmap(dest);
    const mergeCommits = await countMergeCommits(dest, head);

    const opts: AnalyzeOptions = { since, until, repoName: name, head, mailmap, mergeCommits };
    const analysis = computeMetrics(commits, opts);

    const repo: RepoRecord = { id, name, url, clonedAt: Date.now(), head, branch };
    await addRepo(repo);

    const payload: CloneAndAnalyzeResponse = { repo, analysis };
    return NextResponse.json(payload, { status: 201 });
  } catch (err) {
    // Best-effort cleanup of a partial clone so it does not leak on disk.
    await fs.rm(dest, { recursive: true, force: true }).catch(() => {});
    const message = err instanceof GitError ? err.message : (err as Error).message;
    return NextResponse.json({ error: `Clone/analysis failed: ${message}` }, { status: 502 });
  }
}
