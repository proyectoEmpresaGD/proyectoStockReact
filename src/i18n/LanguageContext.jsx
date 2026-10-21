import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useAuthContext } from '../Auth/AuthContext.jsx';
import { DEFAULT_LANGUAGE, LANGUAGES, normalizeLanguage, translate } from './translations.js';

const LanguageContext = createContext(null);
const storageKey = (id) => `stockplus.language.${String(id)}`;

/** Language preference belongs to the authenticated account, never to another user on a shared tablet. */
export function LanguageProvider({ children }) {
  const { user } = useAuthContext();
  const userId = user?.id;
  const [selection, setSelection] = useState({ account: null, language: DEFAULT_LANGUAGE });
  const language = userId != null && selection.account === String(userId)
    ? selection.language : DEFAULT_LANGUAGE;

  useEffect(() => {
    if (userId == null) return;
    let cached = DEFAULT_LANGUAGE;
    try { cached = normalizeLanguage(localStorage.getItem(storageKey(userId))); } catch { /* disabled storage */ }
    // A persisted server preference takes precedence over this device's cache.
    const next = user.idioma === 'es' || user.idioma === 'en' ? user.idioma : cached;
    setSelection({ account: String(userId), language: next });
  }, [userId, user?.idioma]);

  const setLanguage = useCallback((requested) => {
    const next = normalizeLanguage(requested);
    if (userId != null) {
      setSelection({ account: String(userId), language: next });
      try { localStorage.setItem(storageKey(userId), next); } catch { /* storage optional */ }
    }
  }, [userId]);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const t = useCallback((text, values) => translate(language, text, values), [language]);
  const value = useMemo(() => ({ language, setLanguage, t, languages: LANGUAGES }), [language, setLanguage, t]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) throw new Error('useLanguage must be used inside LanguageProvider');
  return context;
}
