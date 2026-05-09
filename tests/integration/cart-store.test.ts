import { describe, expect, it, vi } from 'vitest';
import { createCartStore } from '../../src/lib/cart-store';
import { alternateVariantId, cartFixture, sellingPlanId, variantId } from '../fixtures/shopify';

function mockApi() {
  return {
    createCart: vi.fn(async () => cartFixture(0)),
    getCart: vi.fn(async () => cartFixture(1)),
    addToCart: vi.fn(async (_cartId: string, _variantId: string, quantity: number, _sellingPlanId?: string) => cartFixture(quantity)),
    removeFromCart: vi.fn(async () => cartFixture(0)),
    updateCartItem: vi.fn(async (_cartId: string, _lineId: string, quantity: number) => cartFixture(quantity)),
  };
}

describe('cart store integration behavior', () => {
  it('adds a product to cart and opens the drawer', async () => {
    const api = mockApi();
    const store = createCartStore(api);

    await store.addItem(variantId, 1);

    expect(api.createCart).toHaveBeenCalled();
    expect(api.addToCart).toHaveBeenCalledWith('gid://shopify/Cart/cart-1', variantId, 1);
    expect(store.items).toHaveLength(1);
    expect(store.isOpen).toBe(true);
  });

  it('adds a selected variant to cart', async () => {
    const api = mockApi();
    const store = createCartStore(api);

    await store.addItem(alternateVariantId, 2);

    expect(api.addToCart).toHaveBeenCalledWith('gid://shopify/Cart/cart-1', alternateVariantId, 2);
    expect(store.totalQuantity).toBe(2);
  });

  it('passes subscription selling plan IDs through cart adds', async () => {
    const api = mockApi();
    const store = createCartStore(api);

    await store.addItem(variantId, 1, sellingPlanId);

    expect(api.addToCart).toHaveBeenCalledWith('gid://shopify/Cart/cart-1', variantId, 1, sellingPlanId);
  });

  it('persists and restores cart after page refresh', async () => {
    localStorage.setItem('shopify_cart_id', 'gid://shopify/Cart/cart-1');
    const api = mockApi();
    const store = createCartStore(api);

    await store.init();

    expect(api.getCart).toHaveBeenCalledWith('gid://shopify/Cart/cart-1');
    expect(store.totalQuantity).toBe(1);
  });

  it('updates cart quantity correctly', async () => {
    const api = mockApi();
    const store = createCartStore(api);
    store.applyCart(cartFixture(1));

    await store.updateItem('gid://shopify/CartLine/line-1', 3);
    expect(store.totalQuantity).toBe(3);

    await store.updateItem('gid://shopify/CartLine/line-1', 1);
    expect(store.totalQuantity).toBe(1);
  });

  it('removing an item updates cart state and empty cart state', async () => {
    const api = mockApi();
    const store = createCartStore(api);
    store.applyCart(cartFixture(1));

    await store.removeItem('gid://shopify/CartLine/line-1');

    expect(store.items).toEqual([]);
    expect(store.totalQuantity).toBe(0);
  });

  it('prevents unavailable variants from being added', async () => {
    const api = mockApi();
    const store = createCartStore(api);

    await store.addItem('', 1);

    expect(api.addToCart).not.toHaveBeenCalled();
    expect(store.errorMessage).toBe('This product is not available right now.');
  });

  it('shows a user-friendly message for API errors', async () => {
    const api = mockApi();
    api.addToCart.mockRejectedValueOnce(new Error('GraphQL unavailable'));
    const store = createCartStore(api);

    await store.addItem(variantId, 1);

    expect(store.errorMessage).toBe('We could not add that item to your cart. Please try again.');
  });
});
