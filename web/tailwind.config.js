/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        aura: {
          paper: '#F6F4EF',
          surface: '#FFFFFF',
          subtle: '#EFECE6',
          ink: '#141923',
          muted: '#646B78',
          border: '#E4E0D8',
          navy: '#1D3B8B',
          sage: '#047857',
          amber: '#B45309'
        }
      },
      fontFamily: {
        serif: ['"Instrument Serif"', 'Georgia', 'serif'],
        sans: ['"Plus Jakarta Sans"', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace']
      }
    }
  },
  plugins: []
};
