import { describe, expect, it, vi } from 'vitest';
import {
  addLinesToCart,
  addToCart,
  createCart,
  normalizeCheckoutUrl,
  parseCart,
  removeFromCart,
  searchProducts,
  updateCartDiscountCodes,
  updateCartItem,
} from '../../src/lib/cart-client';
import { rawCart, sellingPlanId, variantId } from '../fixtures/shopify';

function mockFetch(body: unknown, ok = true, status = 200) {
  const fetchMock = vi.fn(async () => ({
    ok,
    status,
    json: async () => body,
  }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('Shopify cart API utilities', () => {
  it('creates a cart on API success and exposes checkoutUrl', async () => {
    mockFetch({ data: { cartCreate: { cart: rawCart(0) } } });

    const cart = await createCart();

    expect(cart.id).toBe('gid://shopify/Cart/cart-1');
    expect(cart.checkoutUrl).toContain('/checkouts/');
    expect(cart.items).toEqual([]);
  });

  it('surfaces cart creation API errors', async () => {
    mockFetch({ errors: [{ message: 'Cart create failed' }] });

    await expect(createCart()).rejects.toThrow('Cart create failed');
  });

  it('adds valid merchandiseId and quantity to the cart', async () => {
    const fetchMock = mockFetch({ data: { cartLinesAdd: { cart: rawCart(2) } } });

    const cart = await addToCart('gid://shopify/Cart/cart-1', variantId, 2);
    const request = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));

    expect(request.variables.lines).toEqual([{ merchandiseId: variantId, quantity: 2 }]);
    expect(cart.totalQuantity).toBe(2);
  });

  it('adds a sellingPlanId for subscription cart lines', async () => {
    const fetchMock = mockFetch({ data: { cartLinesAdd: { cart: rawCart(1) } } });

    await addToCart('gid://shopify/Cart/cart-1', variantId, 1, sellingPlanId);
    const request = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));

    expect(request.variables.lines).toEqual([{ merchandiseId: variantId, quantity: 1, sellingPlanId }]);
  });

  it('adds multiple cart lines in one Shopify mutation', async () => {
    const fetchMock = mockFetch({ data: { cartLinesAdd: { cart: rawCart(3) } } });

    const cart = await addLinesToCart('gid://shopify/Cart/cart-1', [
      { merchandiseId: variantId, quantity: 1 },
      { merchandiseId: 'gid://shopify/ProductVariant/2002', quantity: 2 },
    ]);
    const request = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));

    expect(request.variables.lines).toEqual([
      { merchandiseId: variantId, quantity: 1 },
      { merchandiseId: 'gid://shopify/ProductVariant/2002', quantity: 2 },
    ]);
    expect(cart.totalQuantity).toBe(3);
  });

  it('updates quantity for increase and decrease requests', async () => {
    const fetchMock = mockFetch({ data: { cartLinesUpdate: { cart: rawCart(3) } } });

    await updateCartItem('gid://shopify/Cart/cart-1', 'gid://shopify/CartLine/line-1', 3);
    let request = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(request.variables.lines).toEqual([{ id: 'gid://shopify/CartLine/line-1', quantity: 3 }]);

    fetchMock.mockClear();
    mockFetch({ data: { cartLinesUpdate: { cart: rawCart(1) } } });
    const cart = await updateCartItem('gid://shopify/Cart/cart-1', 'gid://shopify/CartLine/line-1', 1);
    expect(cart.totalQuantity).toBe(1);
  });

  it('updates Shopify cart discount codes', async () => {
    const fetchMock = mockFetch({
      data: {
        cartDiscountCodesUpdate: {
          cart: {
            ...rawCart(1),
            discountCodes: [{ code: 'COLLAB10', applicable: true }],
          },
          userErrors: [],
        },
      },
    });

    const cart = await updateCartDiscountCodes('gid://shopify/Cart/cart-1', ['COLLAB10']);
    const request = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));

    expect(request.variables).toEqual({
      cartId: 'gid://shopify/Cart/cart-1',
      discountCodes: ['COLLAB10'],
    });
    expect(request.query).toContain('discountCodes { code applicable }');
    expect(request.query).toContain('userErrors { field message }');
    expect(cart.discountCodes).toEqual([{ code: 'COLLAB10', applicable: true }]);
  });

  it('surfaces Shopify discount application errors', async () => {
    mockFetch({
      data: {
        cartDiscountCodesUpdate: {
          cart: rawCart(1),
          userErrors: [{ field: ['discountCodes'], message: 'Discount code is not valid' }],
        },
      },
    });

    await expect(updateCartDiscountCodes('gid://shopify/Cart/cart-1', ['COLLAB10'])).rejects.toThrow(
      'Discount code is not valid'
    );
  });

  it('removes a line item on success and surfaces failure', async () => {
    const fetchMock = mockFetch({ data: { cartLinesRemove: { cart: rawCart(0) } } });

    const cart = await removeFromCart('gid://shopify/Cart/cart-1', 'gid://shopify/CartLine/line-1');
    const request = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));

    expect(request.variables.lineIds).toEqual(['gid://shopify/CartLine/line-1']);
    expect(cart.items).toEqual([]);

    mockFetch({ errors: [{ message: 'Line does not exist' }] });
    await expect(removeFromCart('gid://shopify/Cart/cart-1', 'missing-line')).rejects.toThrow('Line does not exist');
  });

  it('parses cart totals, line items, and uses a Shopify checkout URL', () => {
    const cart = parseCart(rawCart(2));

    expect(cart).toMatchObject({
      checkoutUrl: 'https://cfcskincare.myshopify.com/checkouts/cn/test',
      totalQuantity: 2,
      totalAmount: '56.00',
    });
    expect(cart.items[0]).toMatchObject({
      variantId,
      quantity: 2,
      productTitle: 'CFC Gentle Cleanser',
      imageAlt: 'Cleanser bottle',
    });
  });

  it('normalizes checkout URLs away from the static site host', () => {
    expect(normalizeCheckoutUrl('https://cfcskincare.shop/checkouts/cn/test?key=abc')).toBe(
      'https://cfcskincare.myshopify.com/checkouts/cn/test?key=abc'
    );
  });

  it('rewrites Shopify generated cart checkout URLs to checkout paths', () => {
    expect(normalizeCheckoutUrl('https://cfcskincare.shop/cart/c/cart-token?_s=session&key=abc')).toBe(
      'https://cfcskincare.myshopify.com/checkouts/cn/cart-token?_s=session&key=abc'
    );
  });

  it('rewrites myshopify cart checkout URLs before they redirect to the primary domain', () => {
    expect(normalizeCheckoutUrl('https://cfcskincare.myshopify.com/cart/c/cart-token?key=abc')).toBe(
      'https://cfcskincare.myshopify.com/checkouts/cn/cart-token?key=abc'
    );
  });

  it('treats configured headless checkout domains with protocols as unsafe', async () => {
    vi.resetModules();
    vi.stubEnv('PUBLIC_SHOPIFY_CHECKOUT_DOMAIN', 'https://cfcskincare.shop/');
    const { normalizeCheckoutUrl } = await import('../../src/lib/cart-client');

    expect(normalizeCheckoutUrl('https://cfcskincare.shop/cart/c/cart-token?key=abc')).toBe(
      'https://cfcskincare.myshopify.com/checkouts/cn/cart-token?key=abc'
    );

    vi.unstubAllEnvs();
  });
});

describe('predictive search wholesale filtering', () => {
  function searchResponse(products: Array<{ title: string; handle: string; tags?: string[] }>) {
    return {
      data: {
        predictiveSearch: {
          products: products.map((p, i) => ({
            id: `gid://shopify/Product/${i}`,
            title: p.title,
            handle: p.handle,
            tags: p.tags ?? [],
            priceRange: { minVariantPrice: { amount: '10.0', currencyCode: 'USD' } },
            images: { edges: [] },
            variants: { edges: [{ node: { id: `gid://shopify/ProductVariant/${i}` } }] },
          })),
        },
      },
    };
  }

  it('omits Back Bar and wholesale SKUs from retail search results', async () => {
    mockFetch(
      searchResponse([
        { title: 'Jamin Jasmine Cleanser', handle: 'jamin-jasmine-cleanser' },
        { title: 'NAD+ Jamin Jasmine Cleanser back bar (whole sale)', handle: 'nad-jamin-jasmine-cleanser' },
        { title: 'Apple Stem Wrinkle Eraser Back Bar (Whole Sale)', handle: 'apple-stem-wrinkle-eraser-back-bar-whole-sale' },
      ])
    );

    const results = await searchProducts('jamin');

    expect(results.map((r) => r.title)).toEqual(['Jamin Jasmine Cleanser']);
  });

  it('excludes tagged wholesale products even when the name looks retail', async () => {
    mockFetch(
      searchResponse([
        { title: 'Creamy Glow Cleanser', handle: 'creamy-glow-cleanser' },
        { title: 'Pro Refill Cleanser', handle: 'pro-refill-cleanser', tags: ['Wholesale'] },
      ])
    );

    const results = await searchProducts('cleanser');

    expect(results.map((r) => r.title)).toEqual(['Creamy Glow Cleanser']);
  });

  it('keeps retail products whose names merely resemble wholesale terms', async () => {
    mockFetch(
      searchResponse([
        { title: 'Whole Grain Body Scrub', handle: 'whole-grain-body-scrub' },
        { title: 'Barbary Fig Serum', handle: 'barbary-fig-serum' },
      ])
    );

    const results = await searchProducts('whole');

    expect(results).toHaveLength(2);
  });

  it('caps results at eight after filtering', async () => {
    mockFetch(
      searchResponse(
        Array.from({ length: 10 }, (_, i) => ({ title: `Retail Product ${i}`, handle: `retail-${i}` }))
      )
    );

    const results = await searchProducts('retail');

    expect(results).toHaveLength(8);
  });
});
