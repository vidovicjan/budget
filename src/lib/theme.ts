import type { ThemePref } from './types';

const KEY = 'budget-tracker-theme';
const media = typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)') : null;
let current: ThemePref = 'system';

function paint() {
  const dark = current === 'dark' || (current === 'system' && !!media?.matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
}

media?.addEventListener('change', () => current === 'system' && paint());

/** Applies the theme and remembers it so the next start paints in the right colors immediately. */
export function applyTheme(pref: ThemePref) {
  current = pref;
  paint();
  try {
    localStorage.setItem(KEY, pref);
  } catch {
    /* storage unavailable: theme still applies for this session */
  }
}

/** Called before the first render, before the saved data has loaded. */
export function applySavedTheme() {
  let pref: ThemePref = 'system';
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'light' || v === 'dark' || v === 'system') pref = v;
  } catch {
    /* ignore */
  }
  current = pref;
  paint();
}
