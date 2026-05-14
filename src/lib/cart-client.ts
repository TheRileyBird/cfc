const importEnv = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};
const processEnv = typeof process === 'undefined' ? {} : process.env;
const env = { ...processEnv, ...importEnv };
const SHOPIFY_DOMAIN = env.PUBLIC_SHOPIFY_STORE_DOMAIN ?? env.SHOPIFY_STORE_DOMAIN ?? 'cfcskincare.myshopify.com';
const STOREFRONT_TOKEN = env.PUBLIC_SHOPIFY_STOREFRONT_TOKEN ?? env.SHOPIFY_STOREFRONT_TOKEN ?? '';
const API_VERSION = env.PUBLIC_SHOPIFY_API_VERSION ?? env.SHOPIFY_API_VERSION ?? '2024-01';
const STOREFRONT_URL = `https://${SHOPIFY_DOMAIN}/api/${API_VERSION}/graphql.json`;
const USE_MOCKS = env.PUBLIC_SHOPIFY_USE_MOCKS === 'true' || env.SHOPIFY_USE_MOCKS === 'true';

async function gql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
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

const CART_FRAGMENT = `
  id
  checkoutUrl
  totalQuantity
  lines(first: 100) {
    edges {
      node {
        id
        quantity
        sellingPlanAllocation {
          sellingPlan { id name }
        }
        merchandise {
          ... on ProductVariant {
            id
            title
            price { amount currencyCode }
            product {
              title
              handle
              images(first: 1) { edges { node { url altText } } }
            }
          }
        }
      }
    }
  }
  cost { totalAmount { amount currencyCode } }
`;

export interface CartLineItem {
  id: string;
  quantity: number;
  variantId: string;
  variantTitle: string;
  price: string;
  productTitle: string;
  productHandle: string;
  imageUrl: string;
  imageAlt: string;
  sellingPlanId: string;
  sellingPlanName: string;
}

export interface Cart {
  id: string;
  checkoutUrl: string;
  totalQuantity: number;
  totalAmount: string;
  items: CartLineItem[];
}

export interface SearchProduct {
  id: string;
  title: string;
  handle: string;
  price: string;
  imageUrl: string;
  imageAlt: string;
  variantId: string;
}

export function parseCart(raw: any): Cart {
  return {
    id: raw.id,
    checkoutUrl: raw.checkoutUrl,
    totalQuantity: raw.totalQuantity,
    totalAmount: raw.cost.totalAmount.amount,
    items: raw.lines.edges.map(({ node }: any) => ({
      id: node.id,
      quantity: node.quantity,
      variantId: node.merchandise.id,
      variantTitle: node.merchandise.title,
      price: node.merchandise.price.amount,
      productTitle: node.merchandise.product.title,
      productHandle: node.merchandise.product.handle,
      imageUrl: node.merchandise.product.images.edges[0]?.node.url ?? '',
      imageAlt: node.merchandise.product.images.edges[0]?.node.altText ?? '',
      sellingPlanId: node.sellingPlanAllocation?.sellingPlan?.id ?? '',
      sellingPlanName: node.sellingPlanAllocation?.sellingPlan?.name ?? '',
    })),
  };
}

export async function createCart(): Promise<Cart> {
  const data = await gql<any>(`mutation { cartCreate(input: {}) { cart { ${CART_FRAGMENT} } } }`);
  return parseCart(data.cartCreate.cart);
}

export async function getCart(cartId: string): Promise<Cart | null> {
  const data = await gql<any>(
    `query getCart($cartId: ID!) { cart(id: $cartId) { ${CART_FRAGMENT} } }`,
    { cartId }
  );
  return data.cart ? parseCart(data.cart) : null;
}

export async function addToCart(cartId: string, variantId: string, quantity = 1, sellingPlanId?: string): Promise<Cart> {
  const line: { merchandiseId: string; quantity: number; sellingPlanId?: string } = { merchandiseId: variantId, quantity };
  if (sellingPlanId) line.sellingPlanId = sellingPlanId;

  const data = await gql<any>(
    `mutation cartLinesAdd($cartId: ID!, $lines: [CartLineInput!]!) {
      cartLinesAdd(cartId: $cartId, lines: $lines) { cart { ${CART_FRAGMENT} } }
    }`,
    { cartId, lines: [line] }
  );
  return parseCart(data.cartLinesAdd.cart);
}

export interface CartLineInput {
  merchandiseId: string;
  quantity?: number;
  sellingPlanId?: string;
}

export async function addLinesToCart(cartId: string, lines: CartLineInput[]): Promise<Cart> {
  const cartLines = lines
    .filter((line) => line.merchandiseId)
    .map((line) => ({
      merchandiseId: line.merchandiseId,
      quantity: line.quantity ?? 1,
      ...(line.sellingPlanId ? { sellingPlanId: line.sellingPlanId } : {}),
    }));

  if (cartLines.length === 0) {
    const cart = await getCart(cartId);
    if (!cart) throw new Error('Cart unavailable');
    return cart;
  }

  const data = await gql<any>(
    `mutation cartLinesAdd($cartId: ID!, $lines: [CartLineInput!]!) {
      cartLinesAdd(cartId: $cartId, lines: $lines) { cart { ${CART_FRAGMENT} } }
    }`,
    { cartId, lines: cartLines }
  );
  return parseCart(data.cartLinesAdd.cart);
}

export async function removeFromCart(cartId: string, lineId: string): Promise<Cart> {
  const data = await gql<any>(
    `mutation cartLinesRemove($cartId: ID!, $lineIds: [ID!]!) {
      cartLinesRemove(cartId: $cartId, lineIds: $lineIds) { cart { ${CART_FRAGMENT} } }
    }`,
    { cartId, lineIds: [lineId] }
  );
  return parseCart(data.cartLinesRemove.cart);
}

export async function updateCartItem(cartId: string, lineId: string, quantity: number): Promise<Cart> {
  const data = await gql<any>(
    `mutation cartLinesUpdate($cartId: ID!, $lines: [CartLineUpdateInput!]!) {
      cartLinesUpdate(cartId: $cartId, lines: $lines) { cart { ${CART_FRAGMENT} } }
    }`,
    { cartId, lines: [{ id: lineId, quantity }] }
  );
  return parseCart(data.cartLinesUpdate.cart);
}

export async function searchProducts(query: string): Promise<SearchProduct[]> {
  const data = await gql<any>(
    `query predictiveSearch($query: String!) {
      predictiveSearch(query: $query, types: [PRODUCT], limit: 8) {
        products {
          id title handle
          priceRange { minVariantPrice { amount currencyCode } }
          images(first: 1) { edges { node { url altText } } }
          variants(first: 1) { edges { node { id } } }
        }
      }
    }`,
    { query }
  );
  return (data.predictiveSearch?.products ?? []).map((p: any) => ({
    id: p.id,
    title: p.title,
    handle: p.handle,
    price: p.priceRange.minVariantPrice.amount,
    imageUrl: p.images.edges[0]?.node.url ?? '',
    imageAlt: p.images.edges[0]?.node.altText ?? '',
    variantId: p.variants.edges[0]?.node.id ?? '',
  }));
}
