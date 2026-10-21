import React from 'react';
import { useLanguage } from './LanguageContext.jsx';

/** UI-only attribute translations. translationKeys disambiguates identical
 *  Spanish labels without changing the visible Spanish source copy. */
const TEXT_ATTRIBUTES = ['placeholder', 'title', 'aria-label', 'alt', 'label', 'helperText', 'emptyLabel', 'description', 'detail', 'subtitle', 'helper', 'tooltip'];
export default function LocalizedElement({ children, translationKeys }) {
  const { t, language } = useLanguage();
  if (!React.isValidElement(children)) return children;
  const props = {};
  for (const key of TEXT_ATTRIBUTES) {
    if (typeof children.props?.[key] === 'string') {
      const source = language === 'en' && translationKeys?.[key]
        ? translationKeys[key]
        : children.props[key];
      props[key] = t(source);
    }
  }
  return Object.keys(props).length ? React.cloneElement(children, props) : children;
}
