import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function readRedirects() {
  return readFileSync(resolve(process.cwd(), 'public/_redirects'), 'utf8');
}

describe('Netlify redirect rules', () => {
  it('routes unknown one-segment Collabs URLs to the discount redirect', () => {
    const config = readRedirects();

    expect(config).toContain('/:discount_code /discount/index.html 200');
  });

  it('routes Shopify account login paths before Collabs slug handling', () => {
    const config = readRedirects();
    const accountRule = config.indexOf('/account/* https://cfcskincare.myshopify.com/account/:splat 302!');
    const loginWithShopRule = config.indexOf(
      '/services/login_with_shop/* https://cfcskincare.myshopify.com/services/login_with_shop/:splat 302!'
    );
    const collabsRule = config.indexOf('/:discount_code /discount/index.html 200');

    expect(accountRule).toBeGreaterThan(-1);
    expect(loginWithShopRule).toBeGreaterThan(-1);
    expect(collabsRule).toBeGreaterThan(-1);
    expect(accountRule).toBeLessThan(collabsRule);
    expect(loginWithShopRule).toBeLessThan(collabsRule);
  });

  it('has no homepage catch-all so unknown multi-segment paths reach the 404 page', () => {
    const config = readRedirects();

    expect(config).not.toContain('/* /index.html');
  });

  it('keeps netlify.toml free of redirect rules so _redirects stays the single source of truth', () => {
    const toml = readFileSync(resolve(process.cwd(), 'netlify.toml'), 'utf8');

    expect(toml).not.toContain('[[redirects]]');
  });
});
