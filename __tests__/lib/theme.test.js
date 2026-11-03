import { resolveInitialTheme, THEME_INIT_SCRIPT, THEME_STORAGE_KEY } from '@/lib/theme';

describe('resolveInitialTheme', () => {
  it('lets a saved choice win over the system preference', () => {
    expect(resolveInitialTheme('light', true)).toBe('light');
    expect(resolveInitialTheme('dark', false)).toBe('dark');
  });

  it('follows the system preference when nothing valid is saved', () => {
    expect(resolveInitialTheme(null, true)).toBe('dark');
    expect(resolveInitialTheme(null, false)).toBe('light');
    expect(resolveInitialTheme('purple', true)).toBe('dark');
  });
});

describe('THEME_INIT_SCRIPT', () => {
  function runScript({ stored, systemDark }) {
    const toggle = jest.fn();
    const sandbox = {
      localStorage: { getItem: (key) => (key === THEME_STORAGE_KEY ? stored : null) },
      window: { matchMedia: () => ({ matches: systemDark }) },
      document: { documentElement: { classList: { toggle } } },
    };
    // eslint-disable-next-line no-new-func
    new Function('localStorage', 'window', 'document', THEME_INIT_SCRIPT)(sandbox.localStorage, sandbox.window, sandbox.document);
    return toggle;
  }

  it('applies the same decision as resolveInitialTheme', () => {
    expect(runScript({ stored: 'dark', systemDark: false })).toHaveBeenCalledWith('dark', true);
    expect(runScript({ stored: 'light', systemDark: true })).toHaveBeenCalledWith('dark', false);
    expect(runScript({ stored: null, systemDark: true })).toHaveBeenCalledWith('dark', true);
    expect(runScript({ stored: null, systemDark: false })).toHaveBeenCalledWith('dark', false);
  });
});
