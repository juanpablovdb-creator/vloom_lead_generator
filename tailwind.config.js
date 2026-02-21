/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
    "./src/**/*.css",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        // Vloom-style dark theme (ideas.wearevloom.com)
        vloom: {
          bg: '#0c0c0e',
          surface: '#16161a',
          border: '#2a2a2e',
          muted: '#71717a',
          text: '#fafafa',
          accent: '#8b5cf6',
          'accent-hover': '#a78bfa',
        },
      },
    },
  },
  plugins: [],
}
