import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useAuthContext } from '../Auth/AuthContext.jsx';
import { DEFAULT_THEME, THEMES, normalizeTheme } from './themeConfig.js';

const ThemeContext = createContext(null);
const storageKey = (userId) => `stockplus.theme.${String(userId)}`;

/** The theme is a property of the account, not of the shared warehouse tablet. */
export function ThemeProvider({ children }) {
  const { user } = useAuthContext();
  const userId = user?.id;
  const [selection, setSelection] = useState({ account: null, theme: DEFAULT_THEME });
  const theme = userId != null && selection.account === String(userId)
    ? selection.theme : DEFAULT_THEME;

  useEffect(() => {
    if (userId == null) return;
    let cached = DEFAULT_THEME;
    try { cached = normalizeTheme(localStorage.getItem(storageKey(userId))); } catch { /* storage optional */ }
    // A server preference takes precedence over any cached value on this device.
    const serverTheme = user.tema === 'light' || user.tema === 'dark' ? user.tema : null;
    setSelection({ account: String(userId), theme: serverTheme ?? cached });
  }, [userId, user?.tema]);

  const setTheme = useCallback((requested) => {
    const next = normalizeTheme(requested);
    if (userId == null) return;
    setSelection({ account: String(userId), theme: next });
    try { localStorage.setItem(storageKey(userId), next); } catch { /* storage optional */ }
  }, [userId]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.style.colorScheme = theme;
  }, [theme]);

  const value = useMemo(() => ({ theme, setTheme, themes: THEMES }), [theme, setTheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useThemePreference() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useThemePreference must be used inside ThemeProvider');
  return context;
}
