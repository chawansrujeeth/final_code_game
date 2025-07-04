/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class', // enable class-based dark mode (matches your existing .dark class)
  content: [
    "./src/**/*.{js,jsx,ts,tsx}"
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Segoe UI', 'Roboto', 'sans-serif'],
      },
      borderRadius: {
        'xl': '1rem',
        '2xl': '1.5rem',
      },
      boxShadow: {
        card: '0 1px 4px rgba(0,0,0,0.1)',
      },
      colors: {
        primary: '#7c3aed',
      },
      colors: {
        primary: '#7c3aed',
      }
    },
  },
  plugins: [],
};
