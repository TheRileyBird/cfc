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

const PRODUCTS_QUERY = `
  query GetProducts($first: Int!) {
    products(first: $first) {
      edges {
        node {
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
        }
      }
    }
  }
`;

export async function getProducts(first = 24): Promise<ShopifyProduct[]> {
  try {
    const data = await shopifyFetch<{ products: { edges: Array<{ node: ShopifyProduct }> } }>(
      PRODUCTS_QUERY,
      { first }
    );
    return data.products.edges.map(e => e.node);
  } catch {
    return [];
  }
}

export async function getFeaturedProducts(): Promise<ShopifyProduct[]> {
  const all = await getProducts(30);
  const featuredProducts = [
    { title: 'Apple Stem Wrinkle Eraser', handles: ['apple-stem-wrinkle-eraser'] },
    { title: 'Color Correction C&E Serum', handles: ['color-correction-ce-serum', 'color-correction-c-e-serum'] },
    { title: 'Pure Hydration Hyaluronic Acid Serum', handles: ['pure-hydration-hyaluronic-acid-serum'] },
    { title: 'NAD+ Bamboo Firming Cleanser', handles: ['nad-bamboo-firming-cleanser', 'nad-plus-bamboo-firming-cleanser'] },
  ];

  const featured = featuredProducts
    .map(({ title, handles }) => all.find(p => handles.includes(p.handle) || p.title === title))
    .filter(Boolean) as ShopifyProduct[];
  return featured;
}

export function formatPrice(amount: string, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(parseFloat(amount));
}

export function getCheckoutUrl(variantId: string): string {
  return `https://${SHOPIFY_DOMAIN}/cart/${variantId.replace('gid://shopify/ProductVariant/', '')}:1`;
}
