// Presentation helpers shared by the client dashboard.
// Pure functions only — safe to import from a 'use client' component.

/** Format an integer with thousands separators. */
export function fmtInt(n: number): string {
  return Math.trunc(n).toLocaleString('en-US');
}

/** Format a signed integer (growth) with an explicit + / − sign. */
export function fmtSigned(n: number): string {
  const v = Math.trunc(n);
  if (v > 0) return `+${v.toLocaleString('en-US')}`;
  if (v < 0) return `−${Math.abs(v).toLocaleString('en-US')}`;
  return '0';
}

/** Format a 0..1 ratio as a percentage with one decimal. */
export function fmtPct(x: number): string {
  return `${(x * 100).toFixed(1)}%`;
}

/** Format a rate (churn per commit) with two decimals. */
export function fmtRate(x: number): string {
  return x.toFixed(2);
}

/** Format a UNIX-seconds timestamp as a compact local date. */
export function fmtDate(unix: number): string {
  if (!unix) return '—';
  return new Date(unix * 1000).toLocaleDateString('en-CA'); // YYYY-MM-DD
}

/** Format a UNIX-seconds timestamp as date + time. */
export function fmtDateTime(unix: number): string {
  if (!unix) return '—';
  return new Date(unix * 1000).toLocaleString('en-GB', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Convert an <input type="date"> value (YYYY-MM-DD) to UNIX seconds (UTC midnight). */
export function dateToUnix(value: string): number | undefined {
  if (!value) return undefined;
  const t = Date.parse(value);
  return Number.isFinite(t) ? Math.floor(t / 1000) : undefined;
}

/** Shorten a commit hash for display. */
export function shortHash(hash: string, len = 8): string {
  return hash ? hash.slice(0, len) : '—';
}
