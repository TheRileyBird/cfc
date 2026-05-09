import { describe, expect, it, vi } from 'vitest';
import { getCheckoutUrl, getProducts, getSubscriptionCheckoutUrl, shopifyFetch } from '../../src/lib/shopify';
import { productFixture, sellingPlanId, variantId } from '../fixtures/shopify';

function mockFetch(body: unknown, ok = true, status = 200) {
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok,
    status,
    json: async () => body,
  })));
}

describe('Shopify product utilities', () => {
  it('returns expected product fields from a product fetch', async () => {
    mockFetch({ data: { products: { edges: [{ node: productFixture }] } } });

    const products = await getProducts();

    expect(products[0]).toMatchObject({
      id: productFixture.id,
      title: 'CFC Gentle Cleanser',
      handle: 'gentle-cleanser',
      availableForSale: true,
    });
    expect(products[0].priceRange.minVariantPrice).toEqual({ amount: '28.00', currencyCode: 'USD' });
    expect(products[0].images.edges[0].node.url).toContain('cleanser.jpg');
  });

  it('handles variant IDs without stripping Storefront gid values', async () => {
    mockFetch({ data: { products: { edges: [{ node: productFixture }] } } });

    const products = await getProducts();

    expect(products[0].variants.edges[0].node.id).toBe(variantId);
  });

  it('returns checkoutUrl-compatible Shopify cart permalink for a variant', () => {
    expect(getCheckoutUrl(variantId)).toBe('https://cfcskincare.myshopify.com/cart/2001:1');
  });

  it('adds selling plan IDs to subscription checkout permalinks', () => {
    expect(getSubscriptionCheckoutUrl(variantId, sellingPlanId)).toBe(
      'https://cfcskincare.myshopify.com/cart/2001:1?selling_plan=3001'
    );
  });

  it('throws friendly API errors from shopifyFetch', async () => {
    mockFetch({ errors: [{ message: 'Access denied' }] });

    await expect(shopifyFetch('query Test')).rejects.toThrow('Access denied');
  });
});
