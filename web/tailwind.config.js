/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        aura: {
          paper: '#FAFAFA',
          surface: '#FFFFFF',
          subtle: '#F3F4F6',
          ink: '#111827',
          muted: '#6B7280',
          border: '#E5E7EB',
          navy: '#1E3A8A'
        }
      },
      fontFamily: {
        sans: ['"Inter"', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace']
      }
    }
  },
  plugins: []
};
