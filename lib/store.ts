// Server-side storage for cloned repositories.
//
// Clones live under a git-ignored data directory (default `<cwd>/.ratty-data`)
// because the runtime sandbox only allows writes inside the workspace. The
// directory layout is:
//   .ratty-data/
//     index.json          -> RepoRecord[]
//     repos/<id>/         -> the cloned working tree + .git

import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';
import type { RepoRecord } from './types';

export function getDataDir(): string {
  return process.env.RATTY_DATA_DIR || path.join(process.cwd(), '.ratty-data');
}

export function getReposDir(): string {
  return path.join(getDataDir(), 'repos');
}

function indexPath(): string {
  return path.join(getDataDir(), 'index.json');
}

export function repoPath(id: string): string {
  return path.join(getReposDir(), id);
}

export async function ensureDataDirs(): Promise<void> {
  await fs.mkdir(getReposDir(), { recursive: true });
}

export async function readIndex(): Promise<RepoRecord[]> {
  try {
    const raw = await fs.readFile(indexPath(), 'utf8');
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as RepoRecord[]) : [];
  } catch {
    return [];
  }
}

async function writeIndex(records: RepoRecord[]): Promise<void> {
  await ensureDataDirs();
  await fs.writeFile(indexPath(), JSON.stringify(records, null, 2), 'utf8');
}

export async function listRepos(): Promise<RepoRecord[]> {
  const records = await readIndex();
  return records.sort((a, b) => b.clonedAt - a.clonedAt);
}

export async function findRepo(id: string): Promise<RepoRecord | undefined> {
  const records = await readIndex();
  return records.find((r) => r.id === id);
}

export async function addRepo(rec: RepoRecord): Promise<void> {
  const records = await readIndex();
  const next = records.filter((r) => r.id !== rec.id);
  next.push(rec);
  await writeIndex(next);
}

/** Derive a human-friendly repository name from a clone URL or path. */
export function deriveRepoName(url: string): string {
  const trimmed = url.trim().replace(/\/+$/, '');
  const last = trimmed.split(/[\\/]/).pop() || trimmed;
  return last.replace(/\.git$/i, '') || 'repo';
}

/** Build a filesystem-safe, collision-resistant id for a repository. */
export function newId(name: string): string {
  const slug =
    name
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'repo';
  return `${slug}-${crypto.randomBytes(4).toString('hex')}`;
}
