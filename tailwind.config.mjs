/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: 'oklch(13% 0.010 255)',
          mid: 'oklch(30% 0.008 255)',
          soft: 'oklch(50% 0.006 255)',
        },
        parchment: {
          DEFAULT: 'oklch(97.5% 0.008 75)',
          2: 'oklch(95% 0.012 72)',
        },
        gold: {
          DEFAULT: 'oklch(64% 0.115 72)',
          light: 'oklch(80% 0.08 78)',
          deep: 'oklch(52% 0.10 68)',
        },
        white: 'oklch(99.5% 0.003 75)',
        rule: 'oklch(88% 0.006 72)',
      },
      fontFamily: {
        display: ['Cormorant Garamond', 'Georgia', 'serif'],
        sans: ['DM Sans', 'system-ui', 'sans-serif'],
        mono: ['DM Mono', 'monospace'],
      },
      boxShadow: {
        'card':   '0 1px 3px rgba(0,0,0,0.06), 0 8px 20px rgba(0,0,0,0.04)',
        'lift':   '0 4px 8px rgba(0,0,0,0.06), 0 16px 32px rgba(0,0,0,0.07)',
        'strong': '0 8px 16px rgba(0,0,0,0.08), 0 24px 48px rgba(0,0,0,0.10)',
      },
    },
  },
  plugins: [],
};
