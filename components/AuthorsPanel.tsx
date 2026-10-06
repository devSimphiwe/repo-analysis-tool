'use client';

// Authors panel with identity merging.
//
// git's `.mailmap` (when present) is already applied server-side via %aN/%aE, so
// the authors shown are mailmap-normalised. When there is no mailmap — or the
// user wants to go further — they can select two or more authors here and merge
// them into one canonical identity. Merges are lifted to the dashboard, which
// recomputes the analysis over POST /api/repos/[id]/analysis.

import { useMemo, useState } from 'react';
import type { AuthorMerge, AuthorMetrics } from '@/lib/types';
import { fmtInt, fmtPct } from '@/lib/format';

interface Props {
  authors: AuthorMetrics[];
  mailmap: boolean;
  merges: AuthorMerge[];
  busy: boolean;
  onChange: (next: AuthorMerge[]) => void;
}

export default function AuthorsPanel({ authors, mailmap, merges, busy, onChange }: Props) {
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [canonicalEmail, setCanonicalEmail] = useState('');

  const mergeable = authors.length >= 2;
  const selectedAuthors = useMemo(
    () => authors.filter((a) => selected.has(a.email)),
    [authors, selected]
  );

  // Default the canonical identity to the highest-churn selection, but honour an
  // explicit choice while it remains part of the selection.
  const effectiveCanonical = useMemo(() => {
    if (selectedAuthors.length === 0) return '';
    const found = selectedAuthors.find((a) => a.email === canonicalEmail);
    if (found) return found.email;
    return [...selectedAuthors].sort((x, y) => y.churn - x.churn)[0].email;
  }, [selectedAuthors, canonicalEmail]);

  const allSelected = mergeable && authors.every((a) => selected.has(a.email));

  function toggleOne(email: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(email)) next.delete(email);
      else next.add(email);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) =>
      prev.size === authors.length ? new Set() : new Set(authors.map((a) => a.email))
    );
  }

  function clearSelection() {
    setSelected(new Set());
    setCanonicalEmail('');
  }

  function doMerge() {
    if (selectedAuthors.length < 2) return;
    const canonical =
      selectedAuthors.find((a) => a.email === effectiveCanonical) ?? selectedAuthors[0];
    // Collect every raw email behind the selected (possibly already-merged) rows.
    const emails = new Set<string>();
    for (const a of selectedAuthors) {
      emails.add(a.email);
      for (const alias of a.aliases) emails.add(alias);
    }
    const group: AuthorMerge = {
      canonicalName: canonical.name,
      canonicalEmail: canonical.email,
      emails: [...emails],
    };
    // Absorb overlapping groups so the merge list stays disjoint.
    const next = merges.filter((g) => !g.emails.some((e) => emails.has(e)));
    next.push(group);
    clearSelection();
    onChange(next);
  }

  function removeMerge(index: number) {
    onChange(merges.filter((_, i) => i !== index));
  }

  function resetAll() {
    clearSelection();
    onChange([]);
  }

  return (
    <div>
      {/* mailmap status / hint */}
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 border-b border-line bg-surface-2/40 px-5 py-3 text-xs">
        {mailmap ? (
          <>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-2.5 py-1 font-semibold text-accent">
              <CheckIcon />
              .mailmap applied
            </span>
            <span className="text-muted">
              git normalised author identities from the repository&apos;s .mailmap. You can still
              merge further below.
            </span>
          </>
        ) : (
          <span className="text-muted">
            No .mailmap found — select two or more authors below to merge them manually.
          </span>
        )}
      </div>

      {/* active merges + selection toolbar */}
      {(merges.length > 0 || selectedAuthors.length > 0) && (
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-3">
          {merges.map((m, i) => (
            <span
              key={`${m.canonicalEmail}-${i}`}
              className="inline-flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent-soft px-3 py-1 text-xs"
            >
              <span className="font-semibold text-accent">{m.canonicalName || m.canonicalEmail}</span>
              <span className="text-muted">← {m.emails.length}</span>
              <button
                type="button"
                onClick={() => removeMerge(i)}
                disabled={busy}
                aria-label={`Undo merge for ${m.canonicalName || m.canonicalEmail}`}
                className="ml-0.5 rounded-full text-muted transition-colors hover:text-negative disabled:opacity-40"
              >
                ×
              </button>
            </span>
          ))}
          {merges.length > 0 && (
            <button
              type="button"
              onClick={resetAll}
              disabled={busy}
              className="rounded-full border border-line px-3 py-1 text-xs font-medium text-muted transition-colors hover:border-accent hover:text-accent disabled:opacity-40"
            >
              Reset all
            </button>
          )}

          {selectedAuthors.length > 0 && (
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-surface-2 px-2.5 py-1 text-xs font-medium text-muted ring-1 ring-line">
                {selectedAuthors.length} selected
              </span>
              {selectedAuthors.length >= 2 && (
                <>
                  <span className="text-xs text-muted">merge into</span>
                  <select
                    value={effectiveCanonical}
                    onChange={(e) => setCanonicalEmail(e.target.value)}
                    disabled={busy}
                    className="max-w-[16rem] rounded-full border border-line bg-surface px-3 py-1.5 text-xs outline-none transition-colors focus:border-accent disabled:opacity-40"
                  >
                    {selectedAuthors.map((a) => (
                      <option key={a.email} value={a.email}>
                        {a.name} &lt;{a.email}&gt;
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={doMerge}
                    disabled={busy}
                    className="rounded-full bg-accent px-4 py-1.5 text-xs font-semibold text-accent-fg shadow-card transition-colors hover:bg-accent-hover disabled:opacity-40"
                  >
                    Merge
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={clearSelection}
                disabled={busy}
                className="rounded-full border border-line px-3 py-1 text-xs font-medium text-muted transition-colors hover:border-accent hover:text-accent disabled:opacity-40"
              >
                Clear
              </button>
            </div>
          )}
        </div>
      )}

      {/* authors table */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-surface-2/40 text-xs uppercase tracking-wide text-muted">
              {mergeable && (
                <th className="w-10 px-4 py-2.5">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                    disabled={busy}
                    aria-label="Select all authors"
                    className="h-4 w-4 rounded accent-[var(--accent)]"
                  />
                </th>
              )}
              <th className="px-4 py-2.5 text-left font-medium">Author</th>
              <th className="px-4 py-2.5 text-right font-medium">Commits</th>
              <th className="px-4 py-2.5 text-right font-medium">Mods</th>
              <th className="px-4 py-2.5 text-right font-medium">Churn λ</th>
              <th className="px-4 py-2.5 text-left font-medium">Ownership ω</th>
            </tr>
          </thead>
          <tbody>
            {authors.length === 0 && (
              <tr>
                <td colSpan={mergeable ? 6 : 5} className="px-4 py-10 text-center text-muted">
                  No authors in this commit set.
                </td>
              </tr>
            )}
            {authors.map((a) => (
              <tr
                key={a.email}
                className={`border-t border-line transition-colors hover:bg-surface-2/50 ${
                  selected.has(a.email) ? 'bg-accent-soft' : ''
                }`}
              >
                {mergeable && (
                  <td className="px-4 py-2.5">
                    <input
                      type="checkbox"
                      checked={selected.has(a.email)}
                      onChange={() => toggleOne(a.email)}
                      disabled={busy}
                      aria-label={`Select ${a.name}`}
                      className="h-4 w-4 rounded accent-[var(--accent)]"
                    />
                  </td>
                )}
                <td className="px-4 py-2.5 text-left">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium">{a.name}</span>
                    {a.aliases.length > 0 && (
                      <span
                        className="shrink-0 rounded-full border border-accent/30 bg-accent-soft px-2 py-0.5 text-[0.65rem] font-medium text-accent"
                        title={`Merged from: ${a.aliases.join(', ')}`}
                      >
                        merged ×{a.aliases.length}
                      </span>
                    )}
                  </div>
                  <div className="truncate font-mono text-xs text-muted" title={a.email}>
                    {a.email}
                  </div>
                </td>
                <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                  {fmtInt(a.commits)}
                </td>
                <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                  {fmtInt(a.modifications)}
                </td>
                <td className="px-4 py-2.5 text-right font-mono font-medium tabular-nums text-accent">
                  {fmtInt(a.churn)}
                </td>
                <td className="px-4 py-2.5 text-left">
                  <div className="flex items-center gap-2">
                    <span className="block h-2 w-28 shrink-0 overflow-hidden rounded-full bg-surface-2">
                      <span
                        className="block h-2 rounded-full bg-accent"
                        style={{ width: `${Math.min(100, Math.round(a.ownership * 100))}%` }}
                      />
                    </span>
                    <span className="font-mono text-xs tabular-nums text-muted">
                      {fmtPct(a.ownership)}
                    </span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CheckIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}
