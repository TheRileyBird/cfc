import {
  getSession,
  hasCompanyAccess,
  getWholesaleProducts,
  createWholesaleCart,
  addToWholesaleCart,
  getWholesaleCart,
  CART_KEY,
  type TokenSession,
} from './wholesale-core';

interface WholesaleTabProduct {
  id: string;
  title: string;
  description: string;
  imageUrl: string;
  imageAlt: string;
  variantId: string;
  price: number;
  priceLabel: string;
  minQuantityLabel: string;
  quantity: number;
  category: 'wholesale';
  available: boolean;
  bestSellingRank: number;
}

function formatMoney(amount: string, currencyCode = 'USD'): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: currencyCode }).format(parseFloat(amount) || 0);
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

function setCartError(message: string): void {
  const cartStore = getCartStore();
  if (!cartStore) return;
  cartStore.errorMessage = message;
  cartStore.isOpen = true;
}

function syncCartStore(cartId: string, cart: Awaited<ReturnType<typeof getWholesaleCart>>): void {
  if (!cart) return;
  localStorage.setItem(CART_KEY, cartId);
  const cartStore = getCartStore();
  if (!cartStore) return;
  cartStore.applyCart?.(cart);
}

function applyWholesaleCart(cart: NonNullable<Awaited<ReturnType<typeof getWholesaleCart>>>): void {
  localStorage.setItem(CART_KEY, cart.id);
  const cartStore = getCartStore();
  if (!cartStore) return;
  cartStore.applyCart?.(cart);
  cartStore.errorMessage = '';
  cartStore.isOpen = true;
}

async function restoreWholesaleCart(): Promise<void> {
  const cartId = localStorage.getItem(CART_KEY);
  if (!cartId) return;
  const cart = await getWholesaleCart(cartId);
  if (cart) {
    syncCartStore(cartId, cart);
  } else {
    localStorage.removeItem(CART_KEY);
  }
}

let activeSession: TokenSession | null = null;

async function addToCart(variantId: string, quantity: number): Promise<void> {
  if (!activeSession) {
    setCartError('Your wholesale session expired. Please sign in again.');
    return;
  }

  try {
    const cartId = localStorage.getItem(CART_KEY);
    const cart = cartId
      ? await addToWholesaleCart(cartId, variantId, quantity)
      : await createWholesaleCart(variantId, quantity);
    applyWholesaleCart(cart);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not add that product.';
    setCartError(message);
  }
}

async function refreshWholesaleCheckoutUrl(): Promise<string> {
  const cartId = localStorage.getItem(CART_KEY);
  if (!cartId) throw new Error('Your wholesale cart is empty.');

  const cart = await getWholesaleCart(cartId);
  if (!cart) {
    localStorage.removeItem(CART_KEY);
    throw new Error('Your wholesale cart expired. Please add the product again.');
  }

  applyWholesaleCart(cart);
  return cart.checkoutUrl;
}

function wireCheckoutInterception(): void {
  document.addEventListener('click', async (event) => {
    const checkoutLink = (event.target as HTMLElement).closest<HTMLAnchorElement>('a[href]');
    const cartStore = getCartStore();
    const wholesaleCartId = localStorage.getItem(CART_KEY);
    if (!checkoutLink || !cartStore?.checkoutUrl || !wholesaleCartId) return;
    if (checkoutLink.href !== cartStore.checkoutUrl) return;

    event.preventDefault();
    cartStore.isLoading = true;
    try {
      window.location.href = await refreshWholesaleCheckoutUrl();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Checkout is temporarily unavailable.';
      setCartError(message);
    } finally {
      cartStore.isLoading = false;
    }
  });
}

async function checkWholesaleAccess(): Promise<void> {
  const session = getSession();
  if (!session) return;

  try {
    await restoreWholesaleCart();
  } catch {
    // Cart badge stays stale; it resyncs on the next add or checkout click.
  }

  // Belonging to a company is the entire gate. Nothing below renders without it.
  let unlocked = false;
  try {
    unlocked = await hasCompanyAccess(session);
  } catch {
    // Session expired or Shopify unavailable — leave the tab hidden quietly.
    return;
  }

  if (!unlocked) return;

  let products;
  try {
    products = await getWholesaleProducts();
  } catch {
    return;
  }

  activeSession = session;

  // One card per variant: a product with 20/10/5/2 oz sizes needs four
  // purchasable entries, and the shared grid renders a flat list of cards.
  const tabProducts: WholesaleTabProduct[] = products.flatMap((product) =>
    product.variants
      .filter((variant) => variant.availableForSale)
      .map((variant) => {
        const min = variant.quantityRule?.minimum ?? 1;
        const increment = variant.quantityRule?.increment ?? 1;
        const quantity = Math.max(min, increment, 1);
        const hasVariantName = variant.title && variant.title !== 'Default Title';
        return {
          id: variant.id,
          title: hasVariantName ? `${product.title} — ${variant.title}` : product.title,
          description: product.description,
          imageUrl: product.imageUrl,
          imageAlt: product.imageAlt,
          variantId: variant.id,
          price: Number(variant.price) || 0,
          priceLabel: formatMoney(variant.price, variant.currencyCode),
          minQuantityLabel: quantity > 1 ? `Min ${quantity}` : '',
          quantity,
          category: 'wholesale' as const,
          available: true,
          bestSellingRank: 0,
        };
      })
  ).map((product, index) => ({ ...product, bestSellingRank: index }));

  window.dispatchEvent(new CustomEvent('wholesale:ready', { detail: { products: tabProducts } }));
}

if (typeof window !== 'undefined') {
  (window as any).cfcWholesaleAddToCart = addToCart;
  wireCheckoutInterception();
  checkWholesaleAccess().catch(() => {
    // Quiet failure — the wholesale tab simply doesn't appear.
  });
}
