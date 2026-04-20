/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  theme: {
    extend: {
      colors: {
        gold: {
          50:  'hsl(43, 100%, 97%)',
          100: 'hsl(43, 90%, 92%)',
          200: 'hsl(43, 85%, 82%)',
          300: 'hsl(43, 80%, 70%)',
          400: 'hsl(43, 75%, 58%)',
          500: 'hsl(43, 70%, 38%)',  // #B8860B base
          600: 'hsl(43, 72%, 32%)',
          700: 'hsl(43, 74%, 26%)',
          800: 'hsl(43, 76%, 20%)',
          900: 'hsl(43, 78%, 14%)',
        },
        cream: {
          50:  'hsl(43, 100%, 99%)',
          100: 'hsl(43, 100%, 97%)',  // #FFF8E7 base
          200: 'hsl(43, 60%, 93%)',
          300: 'hsl(43, 40%, 88%)',
          400: 'hsl(43, 25%, 82%)',
        },
        sage: {
          50:  'hsl(140, 30%, 97%)',
          100: 'hsl(140, 28%, 92%)',
          200: 'hsl(140, 25%, 82%)',
          300: 'hsl(140, 22%, 68%)',
          400: 'hsl(140, 20%, 54%)',
          500: 'hsl(140, 18%, 42%)',
          600: 'hsl(140, 20%, 34%)',
        },
        charcoal: {
          50:  'hsl(220, 10%, 97%)',
          100: 'hsl(220, 10%, 92%)',
          200: 'hsl(220, 10%, 82%)',
          300: 'hsl(220, 10%, 68%)',
          400: 'hsl(220, 10%, 52%)',
          500: 'hsl(220, 10%, 36%)',
          600: 'hsl(220, 12%, 24%)',
          700: 'hsl(220, 14%, 18%)',
          800: 'hsl(220, 16%, 14%)',  // close to #1A1A1A
          900: 'hsl(220, 18%, 10%)',
        },
      },
      fontFamily: {
        serif: ['"Playfair Display"', 'Georgia', 'serif'],
        sans: ['"Inter"', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        'elegant': '0 2px 4px rgba(26,26,26,0.06), 0 12px 32px rgba(26,26,26,0.08)',
        'card': '0 1px 3px rgba(26,26,26,0.08), 0 8px 24px rgba(26,26,26,0.06)',
        'lift': '0 4px 8px rgba(26,26,26,0.10), 0 20px 48px rgba(26,26,26,0.10)',
      },
    },
  },
  plugins: [],
};
