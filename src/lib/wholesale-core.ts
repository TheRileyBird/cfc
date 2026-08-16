import type { Cart } from './cart-client';

const importEnv = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};

const SHOPIFY_DOMAIN = cleanDomain(importEnv.PUBLIC_SHOPIFY_STORE_DOMAIN ?? importEnv.SHOPIFY_STORE_DOMAIN) || 'cfcskincare.myshopify.com';
const STOREFRONT_TOKEN = importEnv.PUBLIC_SHOPIFY_STOREFRONT_TOKEN ?? importEnv.SHOPIFY_STOREFRONT_TOKEN ?? '';
const CUSTOMER_ACCOUNT_CLIENT_ID = importEnv.PUBLIC_SHOPIFY_CUSTOMER_ACCOUNT_CLIENT_ID ?? '';
const STOREFRONT_API_VERSION = importEnv.PUBLIC_SHOPIFY_B2B_STOREFRONT_API_VERSION ?? '2026-01';
// The Wholesale Collection in Shopify is the single source of truth for what
// appears on the wholesale tab: add a product to the collection and it shows up,
// remove it and it disappears. No handle list to keep in sync here.
//
// These products stay out of the retail storefront through isRetailProduct() in
// shopify.ts (static listings) and isWholesaleOnly() in cart-client.ts (search),
// and no static product page is generated for them — the wholesale tab renders
// them client-side only after the company check below passes.
const WHOLESALE_COLLECTION_HANDLE =
  importEnv.PUBLIC_SHOPIFY_WHOLESALE_COLLECTION_HANDLE ?? 'wholesale-collection';

const STOREFRONT_URL = `https://${SHOPIFY_DOMAIN}/api/${STOREFRONT_API_VERSION}/graphql.json`;
const OPENID_DISCOVERY_URL = `https://${SHOPIFY_DOMAIN}/.well-known/openid-configuration`;
const CUSTOMER_API_DISCOVERY_URL = `https://${SHOPIFY_DOMAIN}/.well-known/customer-account-api`;

const SESSION_KEY = 'cfc_wholesale_session';
const STATE_KEY = 'cfc_wholesale_oauth_state';
const VERIFIER_KEY = 'cfc_wholesale_code_verifier';
export const LOCATION_KEY = 'cfc_wholesale_location_id';
export const CART_KEY = 'cfc_wholesale_cart_id';

export interface TokenSession {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

export interface BuyerLocation {
  id: string;
  name: string;
  companyName: string;
}

export interface WholesaleVariant {
  id: string;
  title: string;
  price: string;
  currencyCode: string;
  availableForSale: boolean;
  quantityRule?: {
    minimum?: number | null;
    maximum?: number | null;
    increment?: number | null;
  } | null;
}

export interface WholesaleProduct {
  id: string;
  title: string;
  handle: string;
  description: string;
  availableForSale: boolean;
  imageUrl: string;
  imageAlt: string;
  variants: WholesaleVariant[];
}

function cleanDomain(value: string | undefined): string {
  return (value ?? '')
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .toLowerCase();
}

function base64UrlEncode(bytes: ArrayBuffer | Uint8Array): string {
  const array = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = '';
  array.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function randomToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

async function codeChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64UrlEncode(digest);
}

async function getOpenIdConfig(): Promise<{ authorization_endpoint: string; token_endpoint: string; end_session_endpoint?: string }> {
  const response = await fetch(OPENID_DISCOVERY_URL);
  if (!response.ok) throw new Error('Could not load Shopify customer login settings.');
  return response.json();
}

async function getCustomerApiConfig(): Promise<{ graphql_api: string; graphql_endpoint?: string }> {
  const response = await fetch(CUSTOMER_API_DISCOVERY_URL);
  if (!response.ok) throw new Error('Could not load Shopify customer API settings.');
  return response.json();
}

function getRedirectUri(): string {
  return `${window.location.origin}/wholesale`;
}

export function getSession(): TokenSession | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(SESSION_KEY) ?? 'null') as TokenSession | null;
    if (!parsed?.accessToken || Date.now() > parsed.expiresAt) return null;
    return parsed;
  } catch {
    return null;
  }
}

function setSession(session: TokenSession): void {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearSession(): void {
  localStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(LOCATION_KEY);
  localStorage.removeItem(CART_KEY);
}

function getApiErrorMessage(json: any, fallback: string): string {
  return json?.errors?.[0]?.message ?? json?.errors?.[0]?.extensions?.message ?? fallback;
}

function isTokenError(message: string, status?: number): boolean {
  return status === 401 || /access token|token is invalid|invalid or revoked|unauthorized|forbidden/i.test(message);
}

export async function startLogin(): Promise<void> {
  if (!CUSTOMER_ACCOUNT_CLIENT_ID) {
    throw new Error('Missing PUBLIC_SHOPIFY_CUSTOMER_ACCOUNT_CLIENT_ID.');
  }

  const config = await getOpenIdConfig();
  const state = randomToken();
  const nonce = randomToken();
  const verifier = randomToken();
  const challenge = await codeChallenge(verifier);
  localStorage.setItem(STATE_KEY, state);
  localStorage.setItem(VERIFIER_KEY, verifier);

  const url = new URL(config.authorization_endpoint);
  url.searchParams.set('scope', 'openid email customer-account-api:full');
  url.searchParams.set('client_id', CUSTOMER_ACCOUNT_CLIENT_ID);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('redirect_uri', getRedirectUri());
  url.searchParams.set('state', state);
  url.searchParams.set('nonce', nonce);
  url.searchParams.set('code_challenge', challenge);
  url.searchParams.set('code_challenge_method', 'S256');

  window.location.href = url.href;
}

export async function completeLogin(code: string, state: string): Promise<TokenSession> {
  const savedState = localStorage.getItem(STATE_KEY);
  const verifier = localStorage.getItem(VERIFIER_KEY);
  if (!savedState || savedState !== state || !verifier) {
    throw new Error('Wholesale login could not be verified. Please try signing in again.');
  }

  const config = await getOpenIdConfig();
  const body = new URLSearchParams();
  body.set('grant_type', 'authorization_code');
  body.set('client_id', CUSTOMER_ACCOUNT_CLIENT_ID);
  body.set('redirect_uri', getRedirectUri());
  body.set('code', code);
  body.set('code_verifier', verifier);

  const response = await fetch(config.token_endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!response.ok) throw new Error('Shopify could not complete wholesale login.');
  const json = await response.json();
  const session = {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: Date.now() + Math.max((json.expires_in ?? 3600) - 60, 60) * 1000,
  };

  setSession(session);
  localStorage.removeItem(STATE_KEY);
  localStorage.removeItem(VERIFIER_KEY);
  window.history.replaceState({}, document.title, '/wholesale');
  return session;
}

async function customerFetch<T>(query: string, variables: Record<string, unknown>, session: TokenSession): Promise<T> {
  const config = await getCustomerApiConfig();
  const endpoint = config.graphql_api ?? config.graphql_endpoint;
  if (!endpoint) throw new Error('Shopify customer API endpoint is unavailable.');

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      Authorization: session.accessToken,
    },
    body: JSON.stringify({ query, variables }),
  });

  const json = await response.json();
  if (!response.ok || json.errors) {
    const message = getApiErrorMessage(json, 'Shopify customer API request failed.');
    if (isTokenError(message, response.status)) {
      clearSession();
      throw new Error('Your wholesale session expired. Please sign in again.');
    }
    throw new Error(message);
  }
  return json.data as T;
}

async function storefrontFetch<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  if (!STOREFRONT_TOKEN) throw new Error('Missing PUBLIC_SHOPIFY_STOREFRONT_TOKEN.');

  const response = await fetch(STOREFRONT_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'X-Shopify-Storefront-Access-Token': STOREFRONT_TOKEN,
    },
    body: JSON.stringify({ query, variables }),
  });

  const json = await response.json();
  if (!response.ok || json.errors) {
    const message = getApiErrorMessage(json, 'Shopify Storefront API request failed.');
    if (isTokenError(message, response.status)) {
      clearSession();
      throw new Error('Your wholesale session expired. Please sign in again.');
    }
    throw new Error(message);
  }
  return json.data as T;
}

type CompanyContact = {
  company: { name: string } | null;
  locations: { nodes: Array<{ id: string; name: string }> };
};

async function getCompanyContacts(session: TokenSession): Promise<CompanyContact[]> {
  const data = await customerFetch<{
    customer: { companyContacts: { nodes: CompanyContact[] } };
  }>(
    `query WholesaleCustomer {
      customer {
        companyContacts(first: 10) {
          nodes {
            company { name }
            locations(first: 25) {
              nodes { id name }
            }
          }
        }
      }
    }`,
    {},
    session
  );

  return data.customer.companyContacts.nodes;
}

// The whole wholesale gate: belonging to a company is what grants access. A
// company with no locations still counts — locations only drive the picker on
// the /wholesale page, they no longer affect pricing or purchase eligibility.
export async function hasCompanyAccess(session: TokenSession): Promise<boolean> {
  const contacts = await getCompanyContacts(session);
  return contacts.length > 0;
}

export async function getBuyerLocations(session: TokenSession): Promise<BuyerLocation[]> {
  const contacts = await getCompanyContacts(session);
  return contacts.flatMap((contact) =>
    contact.locations.nodes.map((location) => ({
      id: location.id,
      name: location.name,
      companyName: contact.company?.name ?? 'Wholesale account',
    }))
  );
}

// Read without @inContext(buyer:). Buyer context asks Shopify to resolve the
// products against the B2B catalog assigned to a company location; with no
// catalog in place that resolution returns empty variants for some products and
// blocks checkout on the rest. Prices here are the product's own Shopify prices,
// which is what wholesale is priced at now.
export async function getWholesaleProducts(): Promise<WholesaleProduct[]> {
  type StorefrontProduct = {
    id: string;
    title: string;
    handle: string;
    description: string;
    availableForSale: boolean;
    images: { nodes: Array<{ url: string; altText: string | null }> };
    variants: {
      nodes: Array<{
        id: string;
        title: string;
        availableForSale: boolean;
        price: { amount: string; currencyCode: string };
        quantityRule?: { minimum?: number | null; maximum?: number | null; increment?: number | null } | null;
      }>;
    };
  };

  const data = await storefrontFetch<{ collection: { products: { nodes: StorefrontProduct[] } } | null }>(
    `query WholesaleCollection($handle: String!) {
      collection(handle: $handle) {
        products(first: 100) {
          nodes {
            id
            title
            handle
            description
            availableForSale
            images(first: 1) { nodes { url altText } }
            variants(first: 50) {
              nodes {
                id
                title
                availableForSale
                price { amount currencyCode }
                quantityRule { minimum maximum increment }
              }
            }
          }
        }
      }
    }`,
    { handle: WHOLESALE_COLLECTION_HANDLE }
  );

  const productNodes = data.collection?.products.nodes ?? [];

  return productNodes
    .map((product) => {
      const image = product.images.nodes[0];
      return {
        id: product.id,
        title: product.title,
        handle: product.handle,
        description: product.description,
        availableForSale: product.availableForSale,
        imageUrl: image?.url ?? '',
        imageAlt: image?.altText ?? product.title,
        variants: product.variants.nodes.map((variant) => ({
          id: variant.id,
          title: variant.title,
          price: variant.price.amount,
          currencyCode: variant.price.currencyCode,
          availableForSale: variant.availableForSale,
          quantityRule: variant.quantityRule ?? null,
        })),
      };
    })
    .filter((product) => product.variants.length > 0);
}

const WHOLESALE_CART_FRAGMENT = `
  id
  checkoutUrl
  discountCodes { code applicable }
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

// Keep the checkout URL on the myshopify.com host and on the original
// /cart/c/{token} path Shopify handed back. normalizeCheckoutUrl() rewrites retail
// carts to the /checkouts/cn/{token} shorthand to dodge a custom-domain redirect
// loop; that shorthand isn't needed here and has historically dropped wholesale
// shoppers into the store's native theme instead of checkout.
function toWholesaleCheckoutUrl(checkoutUrl: string): string {
  try {
    const url = new URL(checkoutUrl);
    url.protocol = 'https:';
    url.host = SHOPIFY_DOMAIN;
    return url.href;
  } catch {
    return checkoutUrl;
  }
}

function parseWholesaleCart(raw: any): Cart {
  const items = raw.lines.edges.map(({ node }: any) => ({
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
  }));

  return {
    id: raw.id,
    checkoutUrl: toWholesaleCheckoutUrl(raw.checkoutUrl),
    discountCodes: raw.discountCodes ?? [],
    totalQuantity: raw.totalQuantity,
    totalAmount: raw.cost.totalAmount.amount,
    items,
  };
}

// A plain cart, deliberately without buyerIdentity.companyLocationId. Attaching a
// company location makes Shopify allocate the line against that location's B2B
// catalog; with no catalog it silently clamps the line quantity to 0 and then
// fails checkout with "no longer available".
export async function createWholesaleCart(merchandiseId: string, quantity: number): Promise<Cart> {
  const data = await storefrontFetch<any>(
    `mutation WholesaleCartCreate($input: CartInput!) {
      cartCreate(input: $input) {
        cart {
          ${WHOLESALE_CART_FRAGMENT}
        }
        userErrors { field message }
      }
    }`,
    {
      input: {
        lines: [{ merchandiseId, quantity }],
      },
    }
  );

  const error = data.cartCreate.userErrors?.[0];
  if (error) throw new Error(error.message);
  return parseWholesaleCart(data.cartCreate.cart);
}

export async function addToWholesaleCart(cartId: string, merchandiseId: string, quantity: number): Promise<Cart> {
  const data = await storefrontFetch<any>(
    `mutation WholesaleCartLinesAdd($cartId: ID!, $lines: [CartLineInput!]!) {
      cartLinesAdd(cartId: $cartId, lines: $lines) {
        cart {
          ${WHOLESALE_CART_FRAGMENT}
        }
        userErrors { field message }
      }
    }`,
    { cartId, lines: [{ merchandiseId, quantity }] }
  );

  const error = data.cartLinesAdd.userErrors?.[0];
  if (error) throw new Error(error.message);
  return parseWholesaleCart(data.cartLinesAdd.cart);
}

export async function getWholesaleCart(cartId: string): Promise<Cart | null> {
  const data = await storefrontFetch<any>(
    `query WholesaleCart($cartId: ID!) {
      cart(id: $cartId) {
        ${WHOLESALE_CART_FRAGMENT}
      }
    }`,
    { cartId }
  );

  return data.cart ? parseWholesaleCart(data.cart) : null;
}
