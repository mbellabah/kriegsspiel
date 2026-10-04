/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
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
        serif: ['Georgia', 'Cambria', 'Baskerville', 'serif'],
        cinzel: ['Cinzel', 'Georgia', 'serif'],
      }
    },
  },
  plugins: [],
}
