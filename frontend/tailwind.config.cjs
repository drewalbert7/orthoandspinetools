/** Tailwind configuration to enable utility generation in dev and prod builds */
module.exports = {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        reddit: {
          dark: 'var(--reddit-bg)',
          card: 'var(--reddit-card)',
          border: 'var(--reddit-border)',
          text: 'var(--reddit-text)',
          'text-muted': 'var(--reddit-text-muted)',
        },
      },
    },
  },
  plugins: [],
};


