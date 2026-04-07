/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/**/*.{js,jsx,ts,tsx,html}'],
  theme: {
    extend: {
      colors: {
        zinc: {
          950: '#09090b',
          900: '#18181b',
          800: '#27272a',
          700: '#3f3f46',
          600: '#52525b',
          400: '#a1a1aa',
          200: '#e4e4e7',
          100: '#f4f4f5',
        },
      },
    },
  },
  plugins: [],
}

