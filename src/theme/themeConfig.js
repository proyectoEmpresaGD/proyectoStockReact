export const DEFAULT_THEME = 'light';
export const THEMES = Object.freeze(['light', 'dark']);
export const normalizeTheme = (value) => value === 'dark' ? 'dark' : DEFAULT_THEME;
