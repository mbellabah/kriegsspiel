/** @type {import('tailwindcss').Config} */
import colors from 'tailwindcss/colors';

export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Warm 'stone' greys everywhere neutral is used, to sit on the paper-toned map
        neutral: colors.stone,
        parchment: {
          50: '#fbf9f5',
          100: '#f6f2e9',
          200: '#ece3ce',
          300: '#dfcfad',
          400: '#cbb387',
          500: '#ba9a67',
          600: '#ab8554',
          700: '#8e6b43',
          800: '#73573a',
          900: '#5e4732',
        },
        napoleon: {
          blue: '#1e3a8a',
          gold: '#d97706',
          alliedGreen: '#14532d',
          austrianWhite: '#e2e8f0',
          prussianBlack: '#0f172a',
          britishRed: '#991b1b',
        }
      },
      fontFamily: {
        sans: ['"IBM Plex Sans"', 'system-ui', 'sans-serif'],
        condensed: ['"IBM Plex Sans Condensed"', '"Arial Narrow"', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'Menlo', 'monospace'],
        serif: ['"IBM Plex Serif"', 'Georgia', 'serif'],
      }
    },
  },
  plugins: [],
}
