import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Netlify redirect rules', () => {
  it('routes unknown one-segment Collabs URLs to the discount redirect before the app fallback', () => {
    const config = readFileSync(resolve(process.cwd(), 'public/_redirects'), 'utf8');
    const collabsRule = config.indexOf('/:discount_code /discount/index.html 200');
    const appFallback = config.indexOf('/* /index.html 200');

    expect(collabsRule).toBeGreaterThan(-1);
    expect(appFallback).toBeGreaterThan(-1);
    expect(collabsRule).toBeLessThan(appFallback);
  });

  it('routes Shopify account login paths before Collabs slug handling', () => {
    const config = readFileSync(resolve(process.cwd(), 'public/_redirects'), 'utf8');
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
});
