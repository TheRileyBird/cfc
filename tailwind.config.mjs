/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  theme: {
    extend: {
      colors: {
        gold: {
          50:  '#FFFBEB',
          100: '#FEF3C7',
          200: '#FDE68A',
          300: '#D4A843',
          400: '#C9A84C',
          500: '#B8950A',
          600: '#9A7D08',
          700: '#7D6607',
          800: '#5F4F05',
          900: '#423704',
        },
      },
      fontFamily: {
        serif: ['"Playfair Display"', 'Georgia', 'serif'],
        sans: ['"Inter"', 'system-ui', 'sans-serif'],
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
