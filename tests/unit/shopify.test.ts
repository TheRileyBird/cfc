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

describe('Subscription group filtering', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  const plan = (id: string) => ({
    node: { id, name: 'Monthly', description: null, recurringDeliveries: true, options: [{ name: 'Delivery frequency', value: 'Monthly' }] },
  });

  const productWithTwoApps = {
    ...productFixture,
    descriptionHtml: '<p>x</p>',
    priceRange: { minVariantPrice: { amount: '48.00', currencyCode: 'USD' }, maxVariantPrice: { amount: '48.00', currencyCode: 'USD' } },
    sellingPlanGroups: {
      edges: [
        { node: { appName: '60442', name: 'Subscribe and save', options: [], sellingPlans: { edges: [plan('gid://shopify/SellingPlan/26788724954')] } } },
        { node: { appName: '60315', name: 'Subscribe and save', options: [], sellingPlans: { edges: [plan('gid://shopify/SellingPlan/26788692186')] } } },
      ],
    },
    variants: {
      edges: [{
        node: {
          id: variantId,
          title: 'Default Title',
          availableForSale: true,
          price: { amount: '48.00' },
          sellingPlanAllocations: {
            edges: [
              { node: { sellingPlan: { id: 'gid://shopify/SellingPlan/26788724954', name: 'Monthly', description: null, recurringDeliveries: true, options: [] }, priceAdjustments: [] } },
              { node: { sellingPlan: { id: 'gid://shopify/SellingPlan/26788692186', name: 'Monthly', description: null, recurringDeliveries: true, options: [] }, priceAdjustments: [] } },
            ],
          },
        },
      }],
    },
  };

  it('shows every group when no subscription group is configured', async () => {
    const { filterSellingPlanGroups } = await import('../../src/lib/shopify');

    const result = filterSellingPlanGroups(productWithTwoApps as never) as typeof productWithTwoApps;

    expect(result.sellingPlanGroups.edges).toHaveLength(2);
  });

  it('keeps only the configured Bold group, dropping the grandfathered one', async () => {
    vi.stubEnv('PUBLIC_SHOPIFY_SUBSCRIPTION_GROUP_IDS', '60442');
    vi.resetModules();

    const { filterSellingPlanGroups } = await import('../../src/lib/shopify');
    const result = filterSellingPlanGroups(productWithTwoApps as never) as typeof productWithTwoApps;

    expect(result.sellingPlanGroups.edges.map(e => e.node.appName)).toEqual(['60442']);
  });

  it('drops the other group\'s variant allocations too, so no offer is left priceless', async () => {
    vi.stubEnv('PUBLIC_SHOPIFY_SUBSCRIPTION_GROUP_IDS', '60442');
    vi.resetModules();

    const { filterSellingPlanGroups } = await import('../../src/lib/shopify');
    const result = filterSellingPlanGroups(productWithTwoApps as never) as typeof productWithTwoApps;
    const planIds = result.variants.edges[0].node.sellingPlanAllocations.edges.map(e => e.node.sellingPlan.id);

    expect(planIds).toEqual(['gid://shopify/SellingPlan/26788724954']);
  });

  it('hides subscriptions entirely when no group matches', async () => {
    vi.stubEnv('PUBLIC_SHOPIFY_SUBSCRIPTION_GROUP_IDS', '99999');
    vi.resetModules();

    const { filterSellingPlanGroups } = await import('../../src/lib/shopify');
    const result = filterSellingPlanGroups(productWithTwoApps as never) as typeof productWithTwoApps;

    expect(result.sellingPlanGroups.edges).toEqual([]);
    expect(result.variants.edges[0].node.sellingPlanAllocations.edges).toEqual([]);
  });
  it('excludes Propel\'s leftover groups, which report no owner at all', async () => {
    vi.stubEnv('PUBLIC_SHOPIFY_SUBSCRIPTION_GROUP_IDS', '60442');
    vi.resetModules();

    const { filterSellingPlanGroups } = await import('../../src/lib/shopify');
    const withPropel = {
      ...productWithTwoApps,
      sellingPlanGroups: {
        edges: [
          ...productWithTwoApps.sellingPlanGroups.edges,
          { node: { appName: null, name: 'New sign up Subscription for skincare', options: [], sellingPlans: { edges: [plan('gid://shopify/SellingPlan/26328826074')] } } },
        ],
      },
    };

    const result = filterSellingPlanGroups(withPropel as never) as typeof productWithTwoApps;

    expect(result.sellingPlanGroups.edges.map(e => e.node.appName)).toEqual(['60442']);
  });
});

describe('Unlisted products', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('keeps an unlisted product out of the listings that build the shop grid', async () => {
    vi.stubEnv('SHOPIFY_UNLISTED_PRODUCT_HANDLES', 'secret-handle');
    vi.resetModules();

    const { getProducts: get } = await import('../../src/lib/shopify');
    const unlisted = { ...productFixture, handle: 'secret-handle', tags: [] };
    mockFetch({ data: { products: { edges: [{ node: productFixture }, { node: unlisted }] } } });

    const products = await get();

    expect(products.map(p => p.handle)).toEqual(['gentle-cleanser']);
  });

  it('still resolves the unlisted product by handle so a page can be built for it', async () => {
    vi.stubEnv('SHOPIFY_UNLISTED_PRODUCT_HANDLES', 'secret-handle');
    vi.resetModules();

    const { getUnlistedProducts, isUnlistedProduct } = await import('../../src/lib/shopify');
    mockFetch({ data: { product: { ...productFixture, handle: 'secret-handle' } } });

    expect(isUnlistedProduct('secret-handle')).toBe(true);
    await expect(getUnlistedProducts()).resolves.toHaveLength(1);
  });

  it('has no unlisted products when the env var is blank', async () => {
    const { getUnlistedProducts, isUnlistedProduct } = await import('../../src/lib/shopify');

    expect(isUnlistedProduct('anything')).toBe(false);
    await expect(getUnlistedProducts()).resolves.toEqual([]);
  });
});
