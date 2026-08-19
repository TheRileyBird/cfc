import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getAllProducts,
  getFeaturedProducts,
  getProducts,
  shopifyFetch,
} from '../../src/lib/shopify';
import { productFixture, variantId } from '../fixtures/shopify';

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

  it('returns products from the featured-collection Shopify collection', async () => {
    const handles = ['apple-stem-wrinkle-eraser', 'color-correction-c-e-serum', 'nad-bamboo-firming-cleanser'];
    const featuredProducts = handles.map((handle, index) => ({
      ...productFixture,
      id: `gid://shopify/Product/featured-${index}`,
      handle,
    }));

    vi.stubGlobal('fetch', vi.fn(async (_url, init) => {
      const body = JSON.parse(String((init as RequestInit).body));
      expect(body.variables.handle).toBe('featured-collection');

      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: { collection: { products: { edges: featuredProducts.map(node => ({ node })) } } },
        }),
      };
    }));

    const products = await getFeaturedProducts();

    expect(products.map(product => product.handle)).toEqual(handles);
  });

  it('throws friendly API errors from shopifyFetch', async () => {
    mockFetch({ errors: [{ message: 'Access denied' }] });

    await expect(shopifyFetch('query Test')).rejects.toThrow('Access denied');
  });
});

describe('Internal-only products', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  // The live test product carries the internal-test tag and a deliberately
  // unguessable handle, so the tag is what has to do the work.
  const hiddenByHandle = { ...productFixture, handle: 'asdfsadgfadga', title: 'Test Product', tags: ['internal-test'] };
  const hiddenByTag = { ...productFixture, handle: 'bold-subscription-probe', tags: ['Internal-Test'] };

  it('hides any product tagged internal-test, whatever its handle is', async () => {
    mockFetch({ data: { products: { edges: [{ node: productFixture }, { node: hiddenByTag }] } } });

    const products = await getProducts();

    expect(products.map(product => product.handle)).toEqual(['gentle-cleanser']);
  });

  it('hides an untagged product listed in PUBLIC_SHOPIFY_HIDDEN_PRODUCT_HANDLES', async () => {
    vi.stubEnv('PUBLIC_SHOPIFY_HIDDEN_PRODUCT_HANDLES', 'legacy-probe , other-probe');
    vi.resetModules();

    const { getProducts: getProductsWithDenylist } = await import('../../src/lib/shopify');
    const untagged = { ...productFixture, handle: 'legacy-probe', tags: [] };
    mockFetch({ data: { products: { edges: [{ node: productFixture }, { node: untagged }] } } });

    const products = await getProductsWithDenylist();

    expect(products.map(product => product.handle)).toEqual(['gentle-cleanser']);

  });

  it('does not ship a hardcoded handle, so renaming the product cannot un-hide it', async () => {
    const untaggedOldHandle = { ...productFixture, handle: 'test-product', tags: [] };
    mockFetch({ data: { products: { edges: [{ node: untaggedOldHandle }] } } });

    // Hiding must come from the tag, never from a handle baked into the bundle.
    await expect(getProducts()).resolves.toHaveLength(1);
  });

  it('keeps hidden products out of the featured collection', async () => {
    mockFetch({ data: { collection: { products: { edges: [{ node: hiddenByHandle }] } } } });

    await expect(getFeaturedProducts()).resolves.toEqual([]);
  });

  it('generates no static product route for a hidden product', async () => {
    mockFetch({
      data: {
        products: {
          edges: [{ node: productFixture }, { node: hiddenByHandle }],
          pageInfo: { hasNextPage: false, endCursor: null },
        },
      },
    });

    const paths = (await getAllProducts()).map(product => product.handle);

    expect(paths).not.toContain('test-product');
  });

  it('renders hidden products when the local dev escape hatch is set', async () => {
    vi.stubEnv('PUBLIC_SHOPIFY_SHOW_HIDDEN_PRODUCTS', 'true');
    vi.resetModules();

    const { getProducts: getProductsWithHidden } = await import('../../src/lib/shopify');
    mockFetch({ data: { products: { edges: [{ node: productFixture }, { node: hiddenByHandle }] } } });

    const products = await getProductsWithHidden();

    expect(products.map(product => product.handle)).toContain('asdfsadgfadga');

  });

  it('resolves an Unlisted hidden product by handle in dev, when list queries omit it', async () => {
    vi.stubEnv('PUBLIC_SHOPIFY_SHOW_HIDDEN_PRODUCTS', 'true');
    vi.stubEnv('PUBLIC_SHOPIFY_HIDDEN_PRODUCT_HANDLES', 'asdfsadgfadga');
    vi.resetModules();

    const { getProducts: getProductsWithHidden } = await import('../../src/lib/shopify');

    // Mirrors Shopify's Unlisted behaviour: absent from products(), but still
    // resolvable one at a time by exact handle.
    vi.stubGlobal('fetch', vi.fn(async (_url, init) => {
      const body = JSON.parse(String((init as RequestInit).body));
      const data = body.variables?.handle === 'asdfsadgfadga'
        ? { product: hiddenByHandle }
        : { products: { edges: [{ node: productFixture }] } };

      return { ok: true, status: 200, json: async () => ({ data }) };
    }));

    const products = await getProductsWithHidden();

    expect(products.map(product => product.handle)).toEqual(['gentle-cleanser', 'asdfsadgfadga']);

  });
});

describe('Internal-only products in site search', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('drops hidden products from predictive search results', async () => {
    const { searchProducts } = await import('../../src/lib/cart-client');
    const searchNode = (handle: string, tags: string[] = []) => ({
      id: `gid://shopify/Product/${handle}`,
      title: handle,
      handle,
      tags,
      priceRange: { minVariantPrice: { amount: '1.00', currencyCode: 'USD' } },
      images: { edges: [] },
      variants: { edges: [{ node: { id: 'gid://shopify/ProductVariant/1' } }] },
    });

    mockFetch({
      data: {
        predictiveSearch: {
          products: [searchNode('gentle-cleanser'), searchNode('asdfsadgfadga', ['internal-test'])],
        },
      },
    });

    const results = await searchProducts('test');

    expect(results.map(result => result.handle)).toEqual(['gentle-cleanser']);
  });
});
