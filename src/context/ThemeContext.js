import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { captureClientException } from '../lib/clientMonitoring';
import { THEME_STORAGE_KEY, THEMES } from '../lib/theme';

const ThemeContext = createContext(null);

/**
 * The `dark` class on <html> is set before paint by THEME_INIT_SCRIPT (see _document.js);
 * this provider only mirrors it into React state and persists the user's explicit choice.
 */
export function ThemeProvider({ children }) {
  // null until mounted: the server cannot know the theme, so nothing theme-dependent renders yet
  const [theme, setTheme] = useState(null);

  useEffect(() => {
    setTheme(document.documentElement.classList.contains('dark') ? THEMES.DARK : THEMES.LIGHT);
  }, []);

  const changeTheme = useCallback((nextTheme) => {
    setTheme(nextTheme);
    document.documentElement.classList.toggle('dark', nextTheme === THEMES.DARK);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
    } catch (error) {
      // Storage can be blocked (private mode); the choice then only lasts for this visit
      captureClientException(error, { action: 'persist-theme' });
    }
  }, []);

  const value = useMemo(() => ({ theme, changeTheme }), [theme, changeTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used inside <ThemeProvider>');
  return context;
}
