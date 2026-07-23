import { useState, useEffect, useCallback } from 'react';

// Single shared localStorage key used by every page (Dashboard, ModuleHub, IM,
// FSA, Profiling, FC, BSA, SRL, etc) so the theme choice is a genuine global
// "last used" preference instead of each page remembering its own separate
// (or no) setting.
const THEME_STORAGE_KEY = 'redwood-theme';

function readStoredTheme() {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === 'dark' || saved === 'light') return saved;
  } catch { /* localStorage unavailable - fall through to default */ }
  return 'dark';
}

/**
 * useThemePreference — drop-in replacement for `useState('dark')` theme state.
 * Reads the last-saved global preference on mount and writes back on every
 * change, so switching theme on any one page carries over to every other page.
 *
 * Usage (matches the existing `const [theme, setTheme] = useState('dark')`
 * pattern used across the app):
 *   const [theme, setTheme] = useThemePreference();
 *   const isDark = theme === 'dark';
 */
export function useThemePreference() {
  const [theme, setThemeState] = useState(readStoredTheme);

  const setTheme = useCallback((next) => {
    setThemeState(prev => {
      const resolved = typeof next === 'function' ? next(prev) : next;
      try { localStorage.setItem(THEME_STORAGE_KEY, resolved); } catch { /* ignore */ }
      return resolved;
    });
  }, []);

  // Stay in sync if the theme is changed from another tab/window.
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === THEME_STORAGE_KEY && (e.newValue === 'dark' || e.newValue === 'light')) {
        setThemeState(e.newValue);
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  return [theme, setTheme];
}

export default useThemePreference;
