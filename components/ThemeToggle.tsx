'use client';

// Theme toggle for RATty. Uses useSyncExternalStore to read the theme applied to
// <html> (set by the pre-paint script in app/layout.tsx) without a data-fetching
// effect, so it satisfies React 19's react-hooks lint rules and avoids a
// hydration mismatch: the server snapshot is 'dark', matching the SSR markup.

import { useCallback, useSyncExternalStore } from 'react';
import {
  applyTheme,
  getAppliedTheme,
  subscribeTheme,
  THEME_CHANGE_EVENT,
  type Theme,
} from '@/lib/theme';

const getServerSnapshot = (): Theme => 'dark';

export default function ThemeToggle() {
  const theme = useSyncExternalStore(subscribeTheme, getAppliedTheme, getServerSnapshot);
  const isDark = theme === 'dark';
  const target: Theme = isDark ? 'light' : 'dark';

  const toggle = useCallback(() => {
    applyTheme(target);
    window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
  }, [target]);

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={`Switch to ${target} mode`}
      title={`Switch to ${target} mode`}
      className="flex items-center gap-2 rounded-full border border-line bg-surface px-3.5 py-1.5 text-xs font-medium text-foreground shadow-card transition-all hover:border-accent hover:text-accent"
    >
      {isDark ? <SunIcon /> : <MoonIcon />}
      <span>{isDark ? 'Light' : 'Dark'}</span>
    </button>
  );
}

function SunIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
    </svg>
  );
}
