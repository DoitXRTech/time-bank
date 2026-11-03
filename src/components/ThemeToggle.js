import es from '../content/es';
import { useTheme } from '../context/ThemeContext';
import { THEMES } from '../lib/theme';

function MoonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M4.646.06c.451-.223.907.236.802.727a7.6 7.6 0 0 0-.18 1.703c0 4.486 3.636 8.122 8.122 8.122.585 0 1.155-.062 1.704-.18.492-.106.95.35.727.8-1.363 2.755-4.2 4.649-7.48 4.649C3.735 15.88 0 12.146 0 7.538 0 4.258 1.893 1.422 4.646.06Z"
        fill="currentColor"
      />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="3.5" fill="currentColor" />
      <path
        d="M8 0v2.5M8 13.5V16M0 8h2.5M13.5 8H16M2.34 2.34l1.77 1.77M11.89 11.89l1.77 1.77M2.34 13.66l1.77-1.77M11.89 4.11l1.77-1.77"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function ThemeToggle() {
  const { theme, changeTheme } = useTheme();
  if (!theme) return <span className="h-10 w-10" aria-hidden="true" />;

  const isDark = theme === THEMES.DARK;
  return (
    <button
      type="button"
      onClick={() => changeTheme(isDark ? THEMES.LIGHT : THEMES.DARK)}
      aria-label={isDark ? es.theme.toLight : es.theme.toDark}
      className="flex h-10 w-10 items-center justify-center rounded-[8px] border border-line text-ink-soft transition-colors hover:bg-chip hover:text-ink"
    >
      {isDark ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}
