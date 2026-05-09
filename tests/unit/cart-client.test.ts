import { describe, expect, it, vi } from 'vitest';
import {
  addToCart,
  createCart,
  parseCart,
  removeFromCart,
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

  it('removes a line item on success and surfaces failure', async () => {
    const fetchMock = mockFetch({ data: { cartLinesRemove: { cart: rawCart(0) } } });

    const cart = await removeFromCart('gid://shopify/Cart/cart-1', 'gid://shopify/CartLine/line-1');
    const request = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));

    expect(request.variables.lineIds).toEqual(['gid://shopify/CartLine/line-1']);
    expect(cart.items).toEqual([]);

    mockFetch({ errors: [{ message: 'Line does not exist' }] });
    await expect(removeFromCart('gid://shopify/Cart/cart-1', 'missing-line')).rejects.toThrow('Line does not exist');
  });

  it('parses cart totals, line items, and checkoutUrl correctly', () => {
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
});
