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
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        stage: {
          backlog: "hsl(var(--stage-backlog))",
          "not-contacted": "hsl(var(--stage-not-contacted))",
          "first-contact": "hsl(var(--stage-first-contact))",
          connected: "hsl(var(--stage-connected))",
          reply: "hsl(var(--stage-reply))",
          "positive-reply": "hsl(var(--stage-positive-reply))",
          negotiation: "hsl(var(--stage-negotiation))",
          closed: "hsl(var(--stage-closed))",
          lost: "hsl(var(--stage-lost))",
          disqualified: "hsl(var(--stage-disqualified))",
        },
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
