import React from 'react';
import { useLanguage } from './LanguageContext.jsx';

/** Translates UI copy without adding an HTML element. A contextual key is
 *  useful when the same Spanish label has different meanings in two modules. */
export default function TranslatedText({ children, translationKey }) {
  const { t, language } = useLanguage();
  return <>{t(language === 'en' && translationKey ? translationKey : children)}</>;
}
