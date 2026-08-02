import type { Config } from 'tailwindcss'

export default {
  content: [
    './index.html',
    './src/client/**/*.{ts,tsx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Tęczowa Madonna — violet accent
        primary: {
          50: '#f5f3ff',
          100: '#ede9fe',
          200: '#ddd6fe',
          300: '#c4b5fd',
          400: '#a78bfa',
          500: '#8b5cf6',
          600: '#7c3aed',
          700: '#6d28d9',
          800: '#5b21b6',
          900: '#4c1d95',
        },
        // SpaceX-ish near-black surfaces for dark mode.
        ink: {
          900: '#050506',
          800: '#0a0a0c',
          700: '#111114',
          600: '#17171b',
          500: '#1e1e24',
        },
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
