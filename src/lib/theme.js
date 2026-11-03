export const THEME_STORAGE_KEY = 'time-bank-theme';

export const THEMES = Object.freeze({ LIGHT: 'light', DARK: 'dark' });

/** A saved choice wins; otherwise follow the operating system preference. */
export function resolveInitialTheme(storedTheme, systemPrefersDark) {
  if (storedTheme === THEMES.DARK || storedTheme === THEMES.LIGHT) return storedTheme;
  return systemPrefersDark ? THEMES.DARK : THEMES.LIGHT;
}

/**
 * Runs in <head> before first paint so the page never flashes the wrong theme.
 * Keep in sync with resolveInitialTheme (it cannot import: it runs as a plain inline script).
 */
export const THEME_INIT_SCRIPT = `(function(){try{var s=localStorage.getItem('${THEME_STORAGE_KEY}');var d=s==='dark'||(s!=='light'&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);}catch(e){}})();`;
