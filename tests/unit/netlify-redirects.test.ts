import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function readRedirects() {
  return readFileSync(resolve(process.cwd(), 'public/_redirects'), 'utf8');
}

describe('Netlify redirect rules', () => {
  it('routes unknown one-segment Collabs URLs to the discount redirect', () => {
    const config = readRedirects();

    expect(config).toContain('/:discount_code /index.html 200');
  });

  it('routes Shopify account login paths before Collabs slug handling', () => {
    const config = readRedirects();
    const accountRule = config.indexOf('/account/* https://cfcskincare.myshopify.com/account/:splat 302!');
    const customerAuthenticationRule = config.indexOf(
      '/customer_authentication/* https://cfcskincare.myshopify.com/customer_authentication/:splat 302!'
    );
    const customerIdentityRule = config.indexOf(
      '/customer_identity/* https://cfcskincare.myshopify.com/customer_identity/:splat 302!'
    );
    const loginWithShopRule = config.indexOf(
      '/services/login_with_shop/* https://cfcskincare.myshopify.com/services/login_with_shop/:splat 302!'
    );
    const companyLocationRule = config.indexOf(
      '/company_location/update https://cfcskincare.myshopify.com/company_location/update 302!'
    );
    const collabsRule = config.indexOf('/:discount_code /index.html 200');

    expect(accountRule).toBeGreaterThan(-1);
    expect(customerAuthenticationRule).toBeGreaterThan(-1);
    expect(customerIdentityRule).toBeGreaterThan(-1);
    expect(loginWithShopRule).toBeGreaterThan(-1);
    expect(companyLocationRule).toBeGreaterThan(-1);
    expect(collabsRule).toBeGreaterThan(-1);
    expect(accountRule).toBeLessThan(collabsRule);
    expect(customerAuthenticationRule).toBeLessThan(collabsRule);
    expect(customerIdentityRule).toBeLessThan(collabsRule);
    expect(loginWithShopRule).toBeLessThan(collabsRule);
    expect(companyLocationRule).toBeLessThan(collabsRule);
  });

  it('forwards Shopify invoice payment links to the native Shopify domain', () => {
    const config = readRedirects();
    const paymentRule = config.indexOf(
      '/:shop_id/order_payment/:payment_id https://cfcskincare.myshopify.com/:shop_id/order_payment/:payment_id 302!'
    );
    const collabsRule = config.indexOf('/:discount_code /index.html 200');

    expect(paymentRule).toBeGreaterThan(-1);
    expect(paymentRule).toBeLessThan(collabsRule);
  });

  it('routes Shopify checkout handoff paths before Collabs slug handling', () => {
    const config = readRedirects();
    const cartCheckoutRule = config.indexOf('/cart/c/* https://cfcskincare.myshopify.com/cart/c/:splat 302!');
    const checkoutRule = config.indexOf('/checkouts/* https://cfcskincare.myshopify.com/checkouts/:splat 302!');
    const collabsRule = config.indexOf('/:discount_code /index.html 200');

    expect(cartCheckoutRule).toBeGreaterThan(-1);
    expect(checkoutRule).toBeGreaterThan(-1);
    expect(collabsRule).toBeGreaterThan(-1);
    expect(cartCheckoutRule).toBeLessThan(collabsRule);
    expect(checkoutRule).toBeLessThan(collabsRule);
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
