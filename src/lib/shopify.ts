const SHOPIFY_DOMAIN = 'cfcskincare.myshopify.com';
const STOREFRONT_TOKEN = '1aeb21fd7bfa3d087439e773d0422e12';
const API_VERSION = '2024-01';

export const STOREFRONT_URL = `https://${SHOPIFY_DOMAIN}/api/${API_VERSION}/graphql.json`;

export async function shopifyFetch<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
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
  priceRange: {
    minVariantPrice: { amount: string; currencyCode: string };
  };
  images: { edges: Array<{ node: { url: string; altText: string | null } }> };
  variants: { edges: Array<{ node: { id: string; title: string; price: { amount: string } } }> };
  tags: string[];
  collections: { edges: Array<{ node: { title: string } }> };
}

const PRODUCT_FIELDS = `
  id
  title
  handle
  description
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
  collections(first: 3) {
    edges { node { title } }
  }
`;

const PRODUCTS_QUERY = `
  query GetProducts($first: Int!, $after: String) {
    products(first: $first, after: $after) {
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

export async function getProducts(first = 24): Promise<ShopifyProduct[]> {
  try {
    const data = await shopifyFetch<{ products: { edges: Array<{ node: ShopifyProduct }> } }>(
      PRODUCTS_QUERY,
      { first, after: null }
    );
    return data.products.edges.map(e => e.node);
  } catch {
    return [];
  }
}

export async function getAllProducts(): Promise<ShopifyProduct[]> {
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
        { first: 100, after }
      );

      products.push(...data.products.edges.map(e => e.node));
      hasNextPage = data.products.pageInfo.hasNextPage;
      after = data.products.pageInfo.endCursor;
    } catch {
      return products;
    }
  }

  return products;
}

export async function getCollectionProducts(handle: string, first = 24): Promise<ShopifyProduct[]> {
  try {
    const data = await shopifyFetch<{
      collection: { products: { edges: Array<{ node: ShopifyProduct }> } } | null;
    }>(
      COLLECTION_PRODUCTS_QUERY,
      { handle, first }
    );
    return data.collection?.products.edges.map(e => e.node) ?? [];
  } catch {
    return [];
  }
}

export async function getFeaturedProducts(): Promise<ShopifyProduct[]> {
  return getCollectionProducts('featured', 4);
}

export function formatPrice(amount: string, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(parseFloat(amount));
}

export function getCheckoutUrl(variantId: string): string {
  return `https://${SHOPIFY_DOMAIN}/cart/${variantId.replace('gid://shopify/ProductVariant/', '')}:1`;
}
