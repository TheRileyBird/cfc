import { parseCart, type Cart } from './cart-client';

const importEnv = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};

const SHOPIFY_DOMAIN = cleanDomain(importEnv.PUBLIC_SHOPIFY_STORE_DOMAIN ?? importEnv.SHOPIFY_STORE_DOMAIN) || 'cfcskincare.myshopify.com';
const STOREFRONT_TOKEN = importEnv.PUBLIC_SHOPIFY_STOREFRONT_TOKEN ?? importEnv.SHOPIFY_STOREFRONT_TOKEN ?? '';
const CUSTOMER_ACCOUNT_CLIENT_ID = importEnv.PUBLIC_SHOPIFY_CUSTOMER_ACCOUNT_CLIENT_ID ?? '';
const STOREFRONT_API_VERSION = importEnv.PUBLIC_SHOPIFY_B2B_STOREFRONT_API_VERSION ?? '2026-01';
const WHOLESALE_PRODUCT_QUERY = importEnv.PUBLIC_SHOPIFY_WHOLESALE_PRODUCT_QUERY ?? '';
const WHOLESALE_COLLECTION_HANDLE = importEnv.PUBLIC_SHOPIFY_WHOLESALE_COLLECTION_HANDLE ?? 'wholesale-collection';

const STOREFRONT_URL = `https://${SHOPIFY_DOMAIN}/api/${STOREFRONT_API_VERSION}/graphql.json`;
const OPENID_DISCOVERY_URL = `https://${SHOPIFY_DOMAIN}/.well-known/openid-configuration`;
const CUSTOMER_API_DISCOVERY_URL = `https://${SHOPIFY_DOMAIN}/.well-known/customer-account-api`;

const SESSION_KEY = 'cfc_wholesale_session';
const STATE_KEY = 'cfc_wholesale_oauth_state';
const VERIFIER_KEY = 'cfc_wholesale_code_verifier';
const LOCATION_KEY = 'cfc_wholesale_location_id';
const CART_KEY = 'cfc_wholesale_cart_id';

interface TokenSession {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

interface BuyerLocation {
  id: string;
  name: string;
  companyName: string;
}

interface WholesaleProduct {
  id: string;
  title: string;
  handle: string;
  description: string;
  availableForSale: boolean;
  minPrice: string;
  currencyCode: string;
  imageUrl: string;
  imageAlt: string;
  variantId: string;
  variantTitle: string;
  variantPrice: string;
  quantityRule?: {
    minimum?: number | null;
    maximum?: number | null;
    increment?: number | null;
  } | null;
}

function cleanDomain(value: string | undefined): string {
  return (value ?? '')
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .toLowerCase();
}

function formatMoney(amount: string, currencyCode = 'USD'): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: currencyCode }).format(parseFloat(amount) || 0);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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

function getSession(): TokenSession | null {
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

function clearSession(): void {
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

async function startLogin(): Promise<void> {
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

async function completeLogin(code: string, state: string): Promise<TokenSession> {
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

async function getBuyerLocations(session: TokenSession): Promise<BuyerLocation[]> {
  const data = await customerFetch<{
    customer: {
      companyContacts: {
        nodes: Array<{
          company: { name: string } | null;
          locations: { nodes: Array<{ id: string; name: string }> };
        }>;
      };
    };
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

  return data.customer.companyContacts.nodes.flatMap((contact) =>
    contact.locations.nodes.map((location) => ({
      id: location.id,
      name: location.name,
      companyName: contact.company?.name ?? 'Wholesale account',
    }))
  );
}

async function getWholesaleProducts(session: TokenSession, companyLocationId: string): Promise<WholesaleProduct[]> {
  type StorefrontProduct = {
    id: string;
    title: string;
    handle: string;
    description: string;
    availableForSale: boolean;
    priceRange: { minVariantPrice: { amount: string; currencyCode: string } };
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

  const productFields = `
    id
    title
    handle
    description
    availableForSale
    priceRange { minVariantPrice { amount currencyCode } }
    images(first: 1) { nodes { url altText } }
    variants(first: 10) {
      nodes {
        id
        title
        availableForSale
        price { amount currencyCode }
        quantityRule { minimum maximum increment }
      }
    }
  `;

  let productNodes: StorefrontProduct[] = [];

  if (WHOLESALE_COLLECTION_HANDLE) {
    const collectionData = await storefrontFetch<{
      collection: null | {
        products: { nodes: StorefrontProduct[] };
      };
    }>(
      `query WholesaleCollectionProducts($handle: String!, $first: Int!, $buyer: BuyerInput!) @inContext(buyer: $buyer) {
        collection(handle: $handle) {
          products(first: $first) {
            nodes {
              ${productFields}
            }
          }
        }
      }`,
      {
        handle: WHOLESALE_COLLECTION_HANDLE,
        first: 100,
        buyer: {
          customerAccessToken: session.accessToken,
          companyLocationId,
        },
      }
    );

    productNodes = collectionData.collection?.products.nodes ?? [];
  }

  if (productNodes.length === 0 && WHOLESALE_PRODUCT_QUERY) {
    const data = await storefrontFetch<{
      products: {
        nodes: StorefrontProduct[];
      };
    }>(
      `query WholesaleProducts($first: Int!, $query: String, $buyer: BuyerInput!) @inContext(buyer: $buyer) {
        products(first: $first, query: $query) {
          nodes {
            ${productFields}
          }
        }
      }`,
      {
        first: 100,
        query: WHOLESALE_PRODUCT_QUERY,
        buyer: {
          customerAccessToken: session.accessToken,
          companyLocationId,
        },
      }
    );
    productNodes = data.products.nodes;
  }

  return productNodes
    .map((product) => {
      const variant = product.variants.nodes.find((node) => node.availableForSale) ?? product.variants.nodes[0];
      const image = product.images.nodes[0];
      return {
        id: product.id,
        title: product.title,
        handle: product.handle,
        description: product.description,
        availableForSale: product.availableForSale,
        minPrice: product.priceRange.minVariantPrice.amount,
        currencyCode: product.priceRange.minVariantPrice.currencyCode,
        imageUrl: image?.url ?? '',
        imageAlt: image?.altText ?? product.title,
        variantId: variant?.id ?? '',
        variantTitle: variant?.title ?? '',
        variantPrice: variant?.price.amount ?? product.priceRange.minVariantPrice.amount,
        quantityRule: variant?.quantityRule ?? null,
      };
    })
    .filter((product) => product.availableForSale && product.variantId);
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

async function createWholesaleCart(session: TokenSession, companyLocationId: string, merchandiseId: string, quantity: number): Promise<Cart> {
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
        buyerIdentity: {
          customerAccessToken: session.accessToken,
          companyLocationId,
        },
        lines: [{ merchandiseId, quantity }],
      },
    }
  );

  const error = data.cartCreate.userErrors?.[0];
  if (error) throw new Error(error.message);
  return parseCart(data.cartCreate.cart);
}

async function addToWholesaleCart(cartId: string, merchandiseId: string, quantity: number): Promise<Cart> {
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
  return parseCart(data.cartLinesAdd.cart);
}

function renderProducts(products: WholesaleProduct[], container: HTMLElement): void {
  if (products.length === 0) {
    container.innerHTML = `
      <div class="border border-rule bg-white p-8 text-center">
        <p class="font-display text-[28px] text-ink">No wholesale products are available yet.</p>
        <p class="mt-3 font-sans text-[14px] leading-relaxed text-ink-soft">This login is valid, but Shopify did not return any products for the assigned company catalog.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = products.map((product) => {
    const min = product.quantityRule?.minimum ?? 1;
    const increment = product.quantityRule?.increment ?? 1;
    const quantity = Math.max(min, increment, 1);
    const title = escapeHtml(product.title);
    const description = escapeHtml(product.description);
    const imageAlt = escapeHtml(product.imageAlt);
    const variantId = escapeHtml(product.variantId);
    return `
      <article class="group flex h-full flex-col overflow-hidden border border-rule bg-white transition-colors duration-300 hover:bg-parchment-2">
        <div class="aspect-[1/1] overflow-hidden bg-parchment sm:aspect-[3/4]">
          ${product.imageUrl
            ? `<img src="${escapeHtml(product.imageUrl)}" alt="${imageAlt}" loading="lazy" class="h-full w-full object-cover transition-transform duration-[800ms] group-hover:scale-[1.06]" />`
            : '<div class="flex h-full w-full items-center justify-center"><span class="font-display text-4xl text-rule">CFC</span></div>'}
        </div>
        <div class="flex flex-1 flex-col p-5">
          <h3 class="mb-1.5 font-display text-[18px] font-normal leading-snug text-ink">${title}</h3>
          <p class="mb-4 line-clamp-2 flex-1 font-sans text-[12px] font-light leading-relaxed text-ink-soft">${description || '&nbsp;'}</p>
          <div class="mt-auto flex items-center justify-between gap-4">
            <div>
              <span class="font-display text-[20px] font-normal text-ink">${formatMoney(product.variantPrice, product.currencyCode)}</span>
              ${quantity > 1 ? `<p class="mt-1 font-mono text-[9px] uppercase tracking-[0.12em] text-ink-soft">Min ${quantity}</p>` : ''}
            </div>
            <button
              type="button"
              class="wholesale-add border border-ink bg-white px-3 py-2 font-mono text-[9px] uppercase tracking-[0.12em] text-ink transition-all duration-200 hover:bg-ink hover:text-white disabled:cursor-wait disabled:opacity-60"
              data-variant-id="${variantId}"
              data-quantity="${quantity}"
            >
              Add
            </button>
          </div>
        </div>
      </article>
    `;
  }).join('');
}

function setStatus(text: string): void {
  document.querySelectorAll<HTMLElement>('[data-wholesale-status]').forEach((status) => {
    status.textContent = text;
  });
  document.querySelectorAll<HTMLElement>('[data-wholesale-public-status]').forEach((status) => {
    status.textContent = text;
    status.classList.toggle('hidden', !text);
  });
}

function getCartStore(): any | null {
  const alpine = (window as any).Alpine;
  if (!alpine?.store) return null;
  try {
    return alpine.store('cart') ?? null;
  } catch {
    return null;
  }
}

function setCartLoading(isLoading: boolean): void {
  const cartStore = getCartStore();
  if (!cartStore) return;
  cartStore.isLoading = isLoading;
}

function setCartError(message: string): void {
  const cartStore = getCartStore();
  if (!cartStore) return;
  cartStore.errorMessage = message;
  cartStore.isOpen = true;
}

function applyWholesaleCart(cart: Cart): void {
  localStorage.setItem(CART_KEY, cart.id);
  const cartStore = getCartStore();
  if (!cartStore?.applyCart) return;
  cartStore.errorMessage = '';
  cartStore.applyCart(cart);
  cartStore.isOpen = true;
}

function setHeroMode(hero: HTMLElement | null, mode: 'login' | 'account'): void {
  if (!hero) return;
  hero.classList.toggle('min-h-[calc(85vh-96px)]', mode === 'login');
  hero.classList.toggle('flex', mode === 'login');
  hero.classList.toggle('items-center', mode === 'login');
}

function showSignedOut(hero: HTMLElement | null, gate: HTMLElement | null, storeRegions: NodeListOf<HTMLElement>, message = ''): void {
  hero?.classList.remove('hidden');
  setHeroMode(hero, 'login');
  gate?.classList.remove('hidden');
  storeRegions.forEach((region) => region.classList.add('hidden'));
  setStatus(message);
}

function showSignedIn(hero: HTMLElement | null, gate: HTMLElement | null, storeRegions: NodeListOf<HTMLElement>): void {
  setHeroMode(hero, 'account');
  hero?.classList.add('hidden');
  gate?.classList.add('hidden');
  storeRegions.forEach((region) => region.classList.remove('hidden'));
}

async function initWholesale(): Promise<void> {
  const signInButton = document.querySelector<HTMLButtonElement>('[data-wholesale-login]');
  const productGrid = document.querySelector<HTMLElement>('[data-wholesale-products]');
  const locationLabel = document.querySelector<HTMLElement>('[data-wholesale-location]');
  const gate = document.querySelector<HTMLElement>('[data-wholesale-gate]');
  const hero = document.querySelector<HTMLElement>('[data-wholesale-hero]');
  const storeRegions = document.querySelectorAll<HTMLElement>('[data-wholesale-store]');

  signInButton?.addEventListener('click', () => {
    startLogin().catch((error) => setStatus(error.message));
  });

  const params = new URLSearchParams(window.location.search);
  let session = getSession();

  if (params.has('error')) {
    setStatus(params.get('error_description') ?? params.get('error') ?? 'Wholesale login could not be completed.');
    window.history.replaceState({}, document.title, '/wholesale');
  }

  if (params.has('code')) {
    setStatus('Finishing secure sign in...');
    session = await completeLogin(params.get('code') ?? '', params.get('state') ?? '');
  }

  if (!session) {
    if (params.get('company_location_changed') === 'true') {
      setStatus('Opening your wholesale catalog...');
      await startLogin();
      return;
    }

    showSignedOut(hero, gate, storeRegions);
    return;
  }

  showSignedIn(hero, gate, storeRegions);
  setStatus('Loading wholesale account...');

  let locations: BuyerLocation[] = [];
  try {
    locations = await getBuyerLocations(session);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Wholesale is temporarily unavailable.';
    if (message.includes('session expired')) {
      showSignedOut(hero, gate, storeRegions, message);
      productGrid!.innerHTML = '';
      return;
    }
    throw error;
  }

  if (locations.length === 0) {
    setStatus('This email is signed in, but it is not assigned to a wholesale company location.');
    productGrid!.innerHTML = '';
    return;
  }

  const savedLocationId = localStorage.getItem(LOCATION_KEY);
  const location = locations.find((item) => item.id === savedLocationId) ?? locations[0];
  localStorage.setItem(LOCATION_KEY, location.id);
  if (locationLabel) locationLabel.textContent = location.companyName;

  let products: WholesaleProduct[] = [];
  try {
    products = await getWholesaleProducts(session, location.id);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Wholesale products are temporarily unavailable.';
    if (message.includes('session expired')) {
      showSignedOut(hero, gate, storeRegions, message);
      productGrid!.innerHTML = '';
      return;
    }
    throw error;
  }

  setStatus(`${products.length} wholesale product${products.length === 1 ? '' : 's'} available`);
  if (productGrid) renderProducts(products, productGrid);

  productGrid?.addEventListener('click', async (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('.wholesale-add');
    if (!button) return;
    button.disabled = true;
    button.textContent = 'Adding';
    setCartLoading(true);
    try {
      const variantId = button.dataset.variantId ?? '';
      const quantity = Number(button.dataset.quantity ?? '1') || 1;
      const cartId = localStorage.getItem(CART_KEY);
      const cart = cartId
        ? await addToWholesaleCart(cartId, variantId, quantity)
        : await createWholesaleCart(session, location.id, variantId, quantity);
      applyWholesaleCart(cart);
      button.textContent = 'Added';
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not add that product.';
      setCartError(message);
      setStatus(message);
      button.textContent = 'Try again';
    } finally {
      setCartLoading(false);
      setTimeout(() => {
        button.disabled = false;
        button.textContent = 'Add';
      }, 1500);
    }
  });
}

if (typeof window !== 'undefined') {
  initWholesale().catch((error) => setStatus(error instanceof Error ? error.message : 'Wholesale is temporarily unavailable.'));
}
