const importEnv = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};
const processEnv = typeof process === 'undefined' ? {} : process.env;
const env = { ...importEnv, ...processEnv };

const USE_MOCKS = env.SHOPIFY_USE_MOCKS === 'true' || env.PUBLIC_SHOPIFY_USE_MOCKS === 'true';

export const SHOPIFY_DOMAIN = env.SHOPIFY_STORE_DOMAIN ?? env.PUBLIC_SHOPIFY_STORE_DOMAIN ?? 'cfcskincare.myshopify.com';
const STOREFRONT_TOKEN = env.SHOPIFY_STOREFRONT_TOKEN ?? env.PUBLIC_SHOPIFY_STOREFRONT_TOKEN ?? '';
const API_VERSION = env.SHOPIFY_API_VERSION ?? env.PUBLIC_SHOPIFY_API_VERSION ?? '2026-01';
export const FEATURED_COLLECTION_HANDLE = 'featured-collection';

export const STOREFRONT_URL = `https://${SHOPIFY_DOMAIN}/api/${API_VERSION}/graphql.json`;

export async function shopifyFetch<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  if (!STOREFRONT_TOKEN && !USE_MOCKS) {
    throw new Error('Missing Shopify Storefront API token');
  }

  const res = await fetch(STOREFRONT_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Storefront-Access-Token': STOREFRONT_TOKEN,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) throw new Error(`Shopify API error: ${res.status}`);
  const json = await res.json();
  if (json.errors) throw new Error(json.errors[0].message);
  return json.data as T;
}

export interface ShopifyProduct {
  id: string;
  title: string;
  handle: string;
  description: string;
  availableForSale: boolean;
  priceRange: {
    minVariantPrice: { amount: string; currencyCode: string };
  };
  images: { edges: Array<{ node: { url: string; altText: string | null } }> };
  variants: { edges: Array<{ node: { id: string; title: string; price: { amount: string } } }> };
  tags: string[];
  collections: { edges: Array<{ node: { title: string; handle: string } }> };
}

export interface ShopifyProductDetail extends Omit<ShopifyProduct, 'priceRange' | 'variants' | 'images'> {
  descriptionHtml: string;
  priceRange: {
    minVariantPrice: { amount: string; currencyCode: string };
    maxVariantPrice: { amount: string; currencyCode: string };
  };
  images: { edges: Array<{ node: { url: string; altText: string | null } }> };
  variants: {
    edges: Array<{
      node: {
        id: string;
        title: string;
        price: { amount: string };
        availableForSale: boolean;
        sellingPlanAllocations?: {
          edges: Array<{
            node: {
              sellingPlan: {
                id: string;
                name: string;
                description: string | null;
                recurringDeliveries: boolean;
                options: Array<{ name: string; value: string }>;
              };
              priceAdjustments: Array<{
                price: { amount: string; currencyCode: string };
                compareAtPrice: { amount: string; currencyCode: string } | null;
                perDeliveryPrice: { amount: string; currencyCode: string };
              }>;
            };
          }>;
        };
      };
    }>;
  };
  sellingPlanGroups?: {
    edges: Array<{
      node: {
        appName: string | null;
        name: string;
        options: Array<{ name: string; values: string[] }>;
        sellingPlans: {
          edges: Array<{
            node: {
              id: string;
              name: string;
              description: string | null;
              recurringDeliveries: boolean;
              options: Array<{ name: string; value: string }>;
            };
          }>;
        };
      };
    }>;
  };
  relatedProducts?: ShopifyProduct[];
}

// Internal-only products. These stay published in Shopify so their handle still
// resolves one at a time and a real checkout can be run against them, but they
// are dropped from every list query here — which also means no static product
// page is generated for them, so they never reach the shop grid, the sitemap,
// or a public URL. Mirrored by isHiddenProduct() in cart-client.ts, which
// filters the live search box the same way (see isWholesaleOnly() for the same
// build-time/runtime split).
// The tag is the primary switch: it travels with the product, so renaming the
// handle to something unguessable cannot accidentally un-hide it, and it keeps
// the handle out of the client bundle that ships this same list to the browser.
// The handle list is a secondary lever for a product that cannot be tagged.
const HIDDEN_PRODUCT_TAG = 'internal-test';

const HIDDEN_HANDLES = new Set(
  (env.SHOPIFY_HIDDEN_PRODUCT_HANDLES ?? env.PUBLIC_SHOPIFY_HIDDEN_PRODUCT_HANDLES ?? '')
    .split(',')
    .map((handle) => handle.trim().toLowerCase())
    .filter(Boolean)
);

// Local-only escape hatch: set this in .env and `npm run dev` renders the
// hidden products so a test product's full buy flow can be exercised on
// localhost. Netlify never sets it, so production builds always drop them.
const SHOW_HIDDEN_PRODUCTS =
  env.SHOPIFY_SHOW_HIDDEN_PRODUCTS === 'true' || env.PUBLIC_SHOPIFY_SHOW_HIDDEN_PRODUCTS === 'true';

// Products that need a real page on production but must appear in no listing —
// the storefront equivalent of Shopify's "Unlisted": reachable only if you know
// the URL. Used to run a live purchase against a test product without putting it
// in front of shoppers.
//
// Deliberately NOT prefixed PUBLIC_: it is read during the build only, so the
// handle never gets inlined into the browser bundle the way a PUBLIC_ var would.
const UNLISTED_HANDLES = new Set(
  (env.SHOPIFY_UNLISTED_PRODUCT_HANDLES ?? '')
    .split(',')
    .map((handle) => handle.trim().toLowerCase())
    .filter(Boolean)
);

export function isUnlistedProduct(handle: string): boolean {
  return UNLISTED_HANDLES.has(handle.trim().toLowerCase());
}

export function isHiddenProduct(handle: string, tags: string[] = []): boolean {
  if (SHOW_HIDDEN_PRODUCTS) return false;
  if (isUnlistedProduct(handle)) return true;
  if (HIDDEN_HANDLES.has(handle.trim().toLowerCase())) return true;
  return tags.some((tag) => tag.trim().toLowerCase() === HIDDEN_PRODUCT_TAG);
}

function isRetailProduct(product: ShopifyProduct): boolean {
  if (isHiddenProduct(product.handle, product.tags)) return false;

  const productText = [product.title, product.handle, product.description, ...product.tags]
    .join(' ')
    .toLowerCase();

  if (
    productText.includes('back bar') ||
    productText.includes('wholesale') ||
    productText.includes('whole sale')
  ) {
    return false;
  }

  const collections = product.collections.edges.map(({ node }) => `${node.title} ${node.handle}`.toLowerCase());
  if (collections.length > 0 && collections.every((c) => c.includes('wholesale') || c.includes('back bar'))) {
    return false;
  }

  return true;
}

function filterRetailProducts(products: ShopifyProduct[]): ShopifyProduct[] {
  return products.filter(isRetailProduct);
}

const PRODUCT_FIELDS = `
  id
  title
  handle
  description
  availableForSale
  tags
  priceRange {
    minVariantPrice { amount currencyCode }
  }
  images(first: 1) {
    edges { node { url altText } }
  }
  variants(first: 1) {
    edges { node { id title price { amount } } }
  }
  collections(first: 10) {
    edges { node { title handle } }
  }
`;

function getMockProducts(): ShopifyProduct[] {
  return [
    {
      id: 'gid://shopify/Product/1001',
      title: 'CFC Gentle Cleanser',
      handle: 'gentle-cleanser',
      description: 'A test-safe cleanser fixture for local and CI shopping flow tests.',
      availableForSale: true,
      tags: ['Cleanse'],
      priceRange: { minVariantPrice: { amount: '28.00', currencyCode: 'USD' } },
      images: { edges: [{ node: { url: '/favicon.png', altText: 'CFC Gentle Cleanser' } }] },
      variants: {
        edges: [{ node: { id: 'gid://shopify/ProductVariant/2001', title: 'Default Title', price: { amount: '28.00' } } }],
      },
      collections: { edges: [{ node: { title: 'Adult Skin Care', handle: 'adult-skin-care' } }] },
    },
    {
      id: 'gid://shopify/Product/1002',
      title: 'CFC Treatment Serum',
      handle: 'treatment-serum',
      description: 'A test-safe serum fixture with a named variant.',
      availableForSale: true,
      tags: ['Treat'],
      priceRange: { minVariantPrice: { amount: '46.00', currencyCode: 'USD' } },
      images: { edges: [{ node: { url: '/favicon.png', altText: 'CFC Treatment Serum' } }] },
      variants: {
        edges: [{ node: { id: 'gid://shopify/ProductVariant/2002', title: '1 oz', price: { amount: '46.00' } } }],
      },
      collections: { edges: [{ node: { title: 'Adult Skin Care', handle: 'adult-skin-care' } }] },
    },
    {
      id: 'gid://shopify/Product/1003',
      title: 'CFC Sold Out SPF',
      handle: 'sold-out-spf',
      description: 'A test-safe unavailable fixture.',
      availableForSale: false,
      tags: ['Protect'],
      priceRange: { minVariantPrice: { amount: '34.00', currencyCode: 'USD' } },
      images: { edges: [{ node: { url: '/favicon.png', altText: 'CFC Sold Out SPF' } }] },
      variants: {
        edges: [{ node: { id: 'gid://shopify/ProductVariant/2003', title: 'Default Title', price: { amount: '34.00' } } }],
      },
      collections: { edges: [{ node: { title: 'Adult Skin Care', handle: 'adult-skin-care' } }] },
    },
    {
      id: 'gid://shopify/Product/1004',
      title: 'Apple Stem Wrinkle Eraser',
      handle: 'apple-stem-wrinkle-eraser',
      description: 'Targets visible fine lines and texture.',
      availableForSale: true,
      tags: ['Treat'],
      priceRange: { minVariantPrice: { amount: '52.00', currencyCode: 'USD' } },
      images: { edges: [{ node: { url: '/favicon.png', altText: 'Apple Stem Wrinkle Eraser' } }] },
      variants: {
        edges: [{ node: { id: 'gid://shopify/ProductVariant/2004', title: 'Default Title', price: { amount: '52.00' } } }],
      },
      collections: { edges: [{ node: { title: 'Adult Skin Care', handle: 'adult-skin-care' } }] },
    },
    {
      id: 'gid://shopify/Product/1005',
      title: 'Color Correction C&E Serum',
      handle: 'color-correction-c-e-serum',
      description: 'Brightens uneven tone and supports antioxidant defense.',
      availableForSale: true,
      tags: ['Treat'],
      priceRange: { minVariantPrice: { amount: '62.00', currencyCode: 'USD' } },
      images: { edges: [{ node: { url: '/favicon.png', altText: 'Color Correction C&E Serum' } }] },
      variants: {
        edges: [{ node: { id: 'gid://shopify/ProductVariant/2005', title: 'Default Title', price: { amount: '62.00' } } }],
      },
      collections: { edges: [{ node: { title: 'Adult Skin Care', handle: 'adult-skin-care' } }] },
    },
    {
      id: 'gid://shopify/Product/1006',
      title: 'Pure Hydration Hyaluronic Acid Serum',
      handle: 'pure-hydration-ha',
      description: 'Floods skin with lightweight hydration.',
      availableForSale: true,
      tags: ['Treat'],
      priceRange: { minVariantPrice: { amount: '58.00', currencyCode: 'USD' } },
      images: { edges: [{ node: { url: '/favicon.png', altText: 'Pure Hydration Hyaluronic Acid Serum' } }] },
      variants: {
        edges: [{ node: { id: 'gid://shopify/ProductVariant/2006', title: 'Default Title', price: { amount: '58.00' } } }],
      },
      collections: { edges: [{ node: { title: 'Adult Skin Care', handle: 'adult-skin-care' } }] },
    },
    {
      id: 'gid://shopify/Product/1007',
      title: 'NAD+ Bamboo Firming Cleanser',
      handle: 'nad-bamboo-firming-cleanser',
      description: 'A refreshing NAD+ cleanser designed to leave skin clean, smooth, and supported.',
      availableForSale: true,
      tags: ['Cleanse'],
      priceRange: { minVariantPrice: { amount: '38.00', currencyCode: 'USD' } },
      images: { edges: [{ node: { url: '/favicon.png', altText: 'NAD+ Bamboo Firming Cleanser' } }] },
      variants: {
        edges: [{ node: { id: 'gid://shopify/ProductVariant/2007', title: 'Default Title', price: { amount: '38.00' } } }],
      },
      collections: { edges: [{ node: { title: 'Adult Skin Care', handle: 'adult-skin-care' } }] },
    },
  ];
}

const PRODUCTS_QUERY = `
  query GetProducts($first: Int!, $after: String, $sortKey: ProductSortKeys) {
    products(first: $first, after: $after, sortKey: $sortKey, query: "NOT tag:wholesale") {
      edges {
        cursor
        node {
          ${PRODUCT_FIELDS}
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

const COLLECTION_PRODUCTS_QUERY = `
  query GetCollectionProducts($handle: String!, $first: Int!) {
    collection(handle: $handle) {
      products(first: $first) {
        edges {
          node {
            ${PRODUCT_FIELDS}
          }
        }
      }
    }
  }
`;

const PRODUCT_BY_HANDLE_LISTING_QUERY = `
  query GetProductByHandle($handle: String!) {
    product(handle: $handle) {
      ${PRODUCT_FIELDS}
    }
  }
`;

export async function getProducts(first = 24, sortKey = 'BEST_SELLING'): Promise<ShopifyProduct[]> {
  if (USE_MOCKS) return getMockProducts().slice(0, first);

  try {
    const data = await shopifyFetch<{ products: { edges: Array<{ node: ShopifyProduct }> } }>(
      PRODUCTS_QUERY,
      { first, after: null, sortKey }
    );
    return getHiddenProductsForDev(filterRetailProducts(data.products.edges.map(e => e.node)));
  } catch {
    return getHiddenProductsForDev([]);
  }
}

export async function getAllProducts(sortKey = 'BEST_SELLING'): Promise<ShopifyProduct[]> {
  if (USE_MOCKS) return getMockProducts();

  const products: ShopifyProduct[] = [];
  let after: string | null = null;
  let hasNextPage = true;

  while (hasNextPage) {
    try {
      const data = await shopifyFetch<{
        products: {
          edges: Array<{ node: ShopifyProduct }>;
          pageInfo: { hasNextPage: boolean; endCursor: string | null };
        };
      }>(
        PRODUCTS_QUERY,
        { first: 100, after, sortKey }
      );

      products.push(...data.products.edges.map(e => e.node));
      hasNextPage = data.products.pageInfo.hasNextPage;
      after = data.products.pageInfo.endCursor;
    } catch {
      return getHiddenProductsForDev(filterRetailProducts(products));
    }
  }

  return getHiddenProductsForDev(filterRetailProducts(products));
}

export async function getCollectionProducts(handle: string, first = 24): Promise<ShopifyProduct[]> {
  if (USE_MOCKS) return getMockProducts().filter(product => {
    const text = product.collections.edges.map(({ node }) => node.title.toLowerCase()).join(' ');
    return handle === 'featured' || handle === FEATURED_COLLECTION_HANDLE || text.includes(handle.toLowerCase());
  }).slice(0, first);

  try {
    const data = await shopifyFetch<{
      collection: { products: { edges: Array<{ node: ShopifyProduct }> } } | null;
    }>(
      COLLECTION_PRODUCTS_QUERY,
      { handle, first }
    );
    return filterRetailProducts(data.collection?.products.edges.map(e => e.node) ?? []);
  } catch {
    return [];
  }
}

export async function getProductsByHandles(handles: readonly string[]): Promise<ShopifyProduct[]> {
  if (USE_MOCKS) {
    const products = getMockProducts();
    return handles
      .map(handle => products.find(product => product.handle === handle))
      .filter((product): product is ShopifyProduct => Boolean(product));
  }

  const products = await Promise.all(handles.map(async (handle) => {
    try {
      const data = await shopifyFetch<{ product: ShopifyProduct | null }>(
        PRODUCT_BY_HANDLE_LISTING_QUERY,
        { handle }
      );
      return data.product;
    } catch {
      return null;
    }
  }));

  return products
    .filter((product): product is ShopifyProduct => Boolean(product))
    .filter((product) => !isHiddenProduct(product.handle, product.tags));
}

// Local dev only. Shopify drops Unlisted products from every list query, so once
// the test product is set to Unlisted it stops coming back from getProducts()
// even with the escape hatch on. Resolve the hidden handles one at a time by
// exact handle instead — the same trick the wholesale catalog uses — and splice
// them into the listings so the dev server still builds their product routes.
async function getHiddenProductsForDev(existing: ShopifyProduct[]): Promise<ShopifyProduct[]> {
  if (!SHOW_HIDDEN_PRODUCTS) return existing;

  const seen = new Set(existing.map((product) => product.handle.toLowerCase()));
  const missing = [...HIDDEN_HANDLES].filter((handle) => !seen.has(handle));
  if (missing.length === 0) return existing;

  return [...existing, ...(await getProductsByHandles(missing))];
}

// Resolved one at a time by exact handle, because a product excluded from the
// listings cannot be found any other way. Only getStaticPaths uses this, so the
// page exists while every listing still ignores it.
export async function getUnlistedProducts(): Promise<ShopifyProduct[]> {
  if (UNLISTED_HANDLES.size === 0) return [];

  const products = await Promise.all([...UNLISTED_HANDLES].map(async (handle) => {
    try {
      const data = await shopifyFetch<{ product: ShopifyProduct | null }>(
        PRODUCT_BY_HANDLE_LISTING_QUERY,
        { handle }
      );
      return data.product;
    } catch {
      return null;
    }
  }));

  return products.filter((product): product is ShopifyProduct => Boolean(product));
}

export async function getFeaturedProducts(): Promise<ShopifyProduct[]> {
  return getCollectionProducts(FEATURED_COLLECTION_HANDLE, 24);
}

export function formatPrice(amount: string, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(parseFloat(amount));
}

const PRODUCT_DETAIL_QUERY = `
  query GetProduct($handle: String!) {
    product(handle: $handle) {
      id
      title
      handle
      description
      descriptionHtml
      availableForSale
      tags
      priceRange {
        minVariantPrice { amount currencyCode }
        maxVariantPrice { amount currencyCode }
      }
      images(first: 8) {
        edges { node { url altText } }
      }
      variants(first: 20) {
        edges {
          node {
            id
            title
            availableForSale
            price { amount }
            sellingPlanAllocations(first: 10) {
              edges {
                node {
                  sellingPlan {
                    id
                    name
                    description
                    recurringDeliveries
                    options { name value }
                  }
                  priceAdjustments {
                    price { amount currencyCode }
                    compareAtPrice { amount currencyCode }
                    perDeliveryPrice { amount currencyCode }
                  }
                }
              }
            }
          }
        }
      }
      sellingPlanGroups(first: 10) {
        edges {
          node {
            appName
            name
            options { name values }
            sellingPlans(first: 10) {
              edges {
                node {
                  id
                  name
                  description
                  recurringDeliveries
                  options { name value }
                }
              }
            }
          }
        }
      }
      metafield(namespace: "custom", key: "related_products") {
        references(first: 4) {
          edges {
            node {
              ... on Product {
                ${PRODUCT_FIELDS}
              }
            }
          }
        }
      }
      collections(first: 10) {
        edges { node { title handle } }
      }
    }
  }
`;

// Which subscription groups the storefront is allowed to offer.
//
// Shopify reports the owner of a selling plan group in `appName`. Bold puts its
// own subscription group ID there — the "ID#" shown next to each group in the
// Bold admin — so this is a list of Bold group IDs, not app names. Propel's
// leftover groups report no owner at all and are therefore excluded whenever
// this is set.
//
// Several groups can sit on one product at once: the Propel plans survived the
// migration, and Bold runs a grandfathered group alongside the one new signups
// should get. Left unfiltered a product advertises all of them at once, at
// different prices. Blank means show everything, which is only right while
// exactly one group exists.
const SUBSCRIPTION_GROUP_IDS = new Set(
  (env.SHOPIFY_SUBSCRIPTION_GROUP_IDS ?? env.PUBLIC_SHOPIFY_SUBSCRIPTION_GROUP_IDS ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean)
);

// Bold's "dynamic discount" drops the rate after the first order (30% then 15%,
// say). Shopify's Storefront API only ever exposes the first-order price, so
// without this the page would advertise an introductory rate as though it were
// the ongoing one. Percent off for renewals; 0 disables the disclosure.
export const SUBSCRIPTION_RECURRING_DISCOUNT = (() => {
  const raw = Number(
    env.SHOPIFY_SUBSCRIPTION_RECURRING_DISCOUNT ?? env.PUBLIC_SHOPIFY_SUBSCRIPTION_RECURRING_DISCOUNT ?? ''
  );
  return Number.isFinite(raw) && raw > 0 && raw < 100 ? raw : 0;
})();

// Drops plans from unlisted groups in BOTH the group list the page reads names
// from and the per-variant allocations it reads prices from — leaving one
// behind would render an offer with no price, or a price with no offer.
//
// Hiding a group only removes it from the storefront. Shopify keeps billing
// anyone already subscribed to it, which is what makes retiring the
// grandfathered group safe.
export function filterSellingPlanGroups<T extends ShopifyProductDetail>(product: T): T {
  if (SUBSCRIPTION_GROUP_IDS.size === 0) return product;

  const groups = (product.sellingPlanGroups?.edges ?? []).filter(
    ({ node }) => node.appName !== null && SUBSCRIPTION_GROUP_IDS.has(node.appName)
  );

  const allowedPlanIds = new Set(
    groups.flatMap(({ node }) => node.sellingPlans.edges.map(({ node: plan }) => plan.id))
  );

  return {
    ...product,
    sellingPlanGroups: { edges: groups },
    variants: {
      edges: product.variants.edges.map((edge) => ({
        ...edge,
        node: {
          ...edge.node,
          sellingPlanAllocations: {
            edges: (edge.node.sellingPlanAllocations?.edges ?? []).filter(
              ({ node }) => allowedPlanIds.has(node.sellingPlan.id)
            ),
          },
        },
      })),
    },
  };
}

export async function getProductByHandle(handle: string): Promise<ShopifyProductDetail | null> {
  if (USE_MOCKS) {
    const mock = getMockProducts().find(p => p.handle === handle);
    if (!mock) return null;
    return {
      ...mock,
      descriptionHtml: `<p>${mock.description}</p>`,
      priceRange: {
        ...mock.priceRange,
        maxVariantPrice: mock.priceRange.minVariantPrice,
      },
      images: mock.images,
      variants: {
        edges: mock.variants.edges.map(e => ({
          node: { ...e.node, availableForSale: mock.availableForSale },
        })),
      },
    };
  }

  try {
    const data = await shopifyFetch<{ product: ShopifyProductDetail | null }>(
      PRODUCT_DETAIL_QUERY,
      { handle }
    );
    if (!data.product) return null;
    const rawReferences = (data.product as ShopifyProductDetail & {
      metafield?: { references?: { edges: Array<{ node: ShopifyProduct }> } } | null;
    }).metafield?.references?.edges.map(({ node }) => node) ?? [];

    return filterSellingPlanGroups({
      ...data.product,
      relatedProducts: filterRetailProducts(rawReferences),
    });
  } catch {
    return null;
  }
}
