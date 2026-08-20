import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';
import alpinejs from '@astrojs/alpinejs';
import sitemap from '@astrojs/sitemap';

// Unlisted products get a page but must stay out of the sitemap, so search
// engines are never handed the URL. Same env var the storefront reads.
const unlistedHandles = (process.env.SHOPIFY_UNLISTED_PRODUCT_HANDLES ?? '')
  .split(',')
  .map((handle) => handle.trim())
  .filter(Boolean);

export default defineConfig({
  site: 'https://cfcskincare.shop',
  integrations: [
    tailwind(),
    alpinejs({ entrypoint: '/src/entrypoint' }),
    sitemap({
      filter: (page) => !unlistedHandles.some((handle) => page.includes(`/products/${handle}`)),
    }),
  ],
});
