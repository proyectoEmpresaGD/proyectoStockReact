/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
    "./node_modules/tw-elements-react/dist/js/**/*.js",

  ],
  theme: {
    extend: {
      display: ['print'],
      colors: {
        sga: {
          ink: 'var(--sga-ink)', muted: 'var(--sga-muted)',
          surface: 'var(--sga-surface)', soft: 'var(--sga-surface-soft)',
          border: 'var(--sga-border)', accent: 'var(--sga-accent)',
          pale: 'var(--sga-accent-pale)', focus: 'var(--sga-accent-border)',
          input: 'var(--sga-input)', success: 'var(--sga-success)',
          warning: 'var(--sga-warn)', danger: 'var(--sga-danger)',
        },
      },
    },
  },
  plugins: [

  ],
}