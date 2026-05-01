const SHOPIFY_DOMAIN = 'cfcskincare.myshopify.com';
const STOREFRONT_TOKEN = '1aeb21fd7bfa3d087439e773d0422e12';
const API_VERSION = '2024-01';
const STOREFRONT_URL = `https://${SHOPIFY_DOMAIN}/api/${API_VERSION}/graphql.json`;

async function gql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(STOREFRONT_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Storefront-Access-Token': STOREFRONT_TOKEN,
    },
    body: JSON.stringify({ query, variables }),
  });
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

function parseCart(raw: any): Cart {
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

export async function addToCart(cartId: string, variantId: string, quantity = 1): Promise<Cart> {
  const data = await gql<any>(
    `mutation cartLinesAdd($cartId: ID!, $lines: [CartLineInput!]!) {
      cartLinesAdd(cartId: $cartId, lines: $lines) { cart { ${CART_FRAGMENT} } }
    }`,
    { cartId, lines: [{ merchandiseId: variantId, quantity }] }
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
