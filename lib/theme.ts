// Client-side theme helpers for RATty.
//
// Dark is the default. The user's choice is persisted in localStorage and
// applied as <html data-theme="dark|light">, which the CSS variables in
// app/globals.css react to. Keeping the logic here means the toggle component
// and the pre-paint inline script in app/layout.tsx share one source of truth.

export type Theme = 'dark' | 'light';

/** localStorage key. Must match the inline bootstrap script in app/layout.tsx. */
export const THEME_STORAGE_KEY = 'ratty-theme';

/** Custom event fired after the theme changes so subscribers can re-render. */
export const THEME_CHANGE_EVENT = 'ratty-theme-change';

/** Read the theme currently applied to <html>. Falls back to dark. */
export function getAppliedTheme(): Theme {
  return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
}

/** Apply a theme to <html> and persist it. */
export function applyTheme(theme: Theme): void {
  document.documentElement.setAttribute('data-theme', theme);
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Ignore storage failures (private mode / disabled cookies); the in-memory
    // attribute change still applies for this session.
  }
}

/** Subscribe to theme-change events. Returns an unsubscribe function. */
export function subscribeTheme(callback: () => void): () => void {
  window.addEventListener(THEME_CHANGE_EVENT, callback);
  return () => window.removeEventListener(THEME_CHANGE_EVENT, callback);
}
