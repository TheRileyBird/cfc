import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';
import alpinejs from '@astrojs/alpinejs';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://cfcskincare.netlify.app',
  integrations: [
    tailwind(),
    alpinejs({ entrypoint: '/src/entrypoint' }),
    sitemap(),
  ],
});
