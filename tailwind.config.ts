import type { Config } from 'tailwindcss'

export default {
  content: [
    './index.html',
    './src/client/**/*.{ts,tsx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      // SpaceX-style system, shared with the gravity and poland apps: pure black,
      // hairline borders, condensed uppercase headings, monospace telemetry numbers.
      fontFamily: {
        sans: ['Barlow', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        cond: ['"Barlow Semi Condensed"', 'Barlow', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SF Mono', 'Menlo', 'monospace'],
      },
      colors: {
        // Cool technical blue for live values and accents (gravity's --data).
        primary: {
          50: '#eef4ff',
          100: '#dde8ff',
          200: '#c2d6ff',
          300: '#8fb6ff',
          400: '#6a9bf5',
          500: '#4a7fe0',
          600: '#3566c4',
          700: '#2a52a0',
          800: '#22427f',
          900: '#1b3463',
        },
        // Neutral greys without the blue cast; the dark end is near-pure black.
        gray: {
          50: '#f7f7f7',
          100: '#ededed',
          200: '#dcdcdc',
          300: '#bdbdbd',
          400: '#8c8c8c',
          500: '#6b6b6b',
          600: '#4d4d4d',
          700: '#262626',
          800: '#0d0d0e',
          900: '#060607',
          950: '#000000',
        },
        ink: {
          900: '#000000',
          800: '#050608',
          700: '#0a0b0e',
          600: '#111317',
          500: '#181a1f',
        },
      },
      // Square, technical corners; only `rounded-full` stays round.
      borderRadius: {
        sm: '1px',
        DEFAULT: '2px',
        md: '2px',
        lg: '3px',
        xl: '4px',
        '2xl': '4px',
        '3xl': '6px',
      },
      boxShadow: {
        sm: 'none',
        DEFAULT: 'none',
        md: 'none',
        lg: '0 0 0 1px rgba(255,255,255,0.14)',
        xl: '0 0 0 1px rgba(255,255,255,0.14)',
        '2xl': '0 0 0 1px rgba(255,255,255,0.18)',
      },
      keyframes: {
        'fade-in-up': {
          '0%': { opacity: '0', transform: 'translateY(6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        'scale-in': {
          '0%': { opacity: '0', transform: 'scale(.96)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        'bell-shake': {
          '0%,100%': { transform: 'rotate(0)' },
          '15%': { transform: 'rotate(14deg)' },
          '30%': { transform: 'rotate(-12deg)' },
          '45%': { transform: 'rotate(9deg)' },
          '60%': { transform: 'rotate(-6deg)' },
          '75%': { transform: 'rotate(3deg)' },
        },
        'pop': {
          '0%': { transform: 'scale(0)' },
          '60%': { transform: 'scale(1.25)' },
          '100%': { transform: 'scale(1)' },
        },
        'ping-slow': { '75%,100%': { transform: 'scale(1.8)', opacity: '0' } },
      },
      animation: {
        'fade-in-up': 'fade-in-up .28s cubic-bezier(.2,.7,.2,1) both',
        'fade-in': 'fade-in .2s ease both',
        'scale-in': 'scale-in .18s cubic-bezier(.2,.7,.2,1) both',
        'bell-shake': 'bell-shake .9s ease',
        'pop': 'pop .3s cubic-bezier(.2,.9,.3,1.4) both',
        'ping-slow': 'ping-slow 1.6s cubic-bezier(0,0,.2,1) infinite',
      },
    },
  },
  plugins: [],
} satisfies Config
