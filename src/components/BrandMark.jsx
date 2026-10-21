import { useThemePreference } from '../theme/ThemeContext.jsx';

/** Square CJM mark; its appearance follows the app's selected user theme. */
export default function BrandMark({ className = '' }) {
    const { theme } = useThemePreference();

    return (
        <img
            src={theme === 'dark' ? '/branding/cjm-icon-dark.svg' : '/branding/cjm-icon-light.svg'}
            alt="CJM Group"
            width="512"
            height="512"
            decoding="async"
            className={`inline-block aspect-square shrink-0 object-contain ${className}`.trim()}
        />
    );
}
