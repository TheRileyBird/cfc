import type { Cart } from './cart-client';
import {
  addLinesToCart,
  addToCart,
  createCart,
  getCart,
  removeFromCart,
  updateCartDiscountCodes,
  updateCartItem,
} from './cart-client';

const CART_STORAGE_KEY = 'shopify_cart_id';
const DISCOUNT_STORAGE_KEY = 'shopify_discount_code';

const fmt = (amount: string) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(parseFloat(amount) || 0);

function appendDiscountToCheckoutUrl(checkoutUrl: string, discountCode: string) {
  if (!checkoutUrl || !discountCode) return checkoutUrl;

  try {
    const url = new URL(checkoutUrl);
    url.searchParams.set('discount', discountCode);
    return url.href;
  } catch {
    return checkoutUrl;
  }
}

export interface CartApi {
  createCart: typeof createCart;
  getCart: typeof getCart;
  addToCart: typeof addToCart;
  addLinesToCart: typeof addLinesToCart;
  removeFromCart: typeof removeFromCart;
  updateCartItem: typeof updateCartItem;
  updateCartDiscountCodes: typeof updateCartDiscountCodes;
}

export function createCartStore(api: CartApi = {
  createCart,
  getCart,
  addToCart,
  addLinesToCart,
  removeFromCart,
  updateCartItem,
  updateCartDiscountCodes,
}) {
  return {
    isOpen: false,
    isLoading: false,
    id: null as string | null,
    items: [] as Cart['items'],
    totalQuantity: 0,
    totalAmount: '0.00',
    checkoutUrl: '',
    errorMessage: '',

    getPendingDiscountCode() {
      return localStorage.getItem(DISCOUNT_STORAGE_KEY)?.trim() || '';
    },

    async applyPendingDiscountCode() {
      const discountCode = this.getPendingDiscountCode();
      if (!this.id || !discountCode) return;

      try {
        const cart = await api.updateCartDiscountCodes(this.id, [discountCode]);
        const accepted = cart.discountCodes.some(
          (code) => code.code.toLowerCase() === discountCode.toLowerCase() && code.applicable
        );
        if (!accepted) throw new Error('Discount code is not applicable to this cart.');
        cart.checkoutUrl = appendDiscountToCheckoutUrl(cart.checkoutUrl, discountCode);
        this.applyCart(cart);
      } catch {
        localStorage.removeItem(DISCOUNT_STORAGE_KEY);
      }
    },

    applyCart(cart: Cart) {
      this.id = cart.id;
      this.items = cart.items;
      this.totalQuantity = cart.totalQuantity;
      this.totalAmount = cart.totalAmount;
      this.checkoutUrl = cart.checkoutUrl;
    },

    async init() {
      this.errorMessage = '';
      const saved = localStorage.getItem(CART_STORAGE_KEY);
      if (saved) {
        try {
          const cart = await api.getCart(saved);
          if (cart) {
            this.applyCart(cart);
            await this.applyPendingDiscountCode();
            return;
          }
        } catch {
          localStorage.removeItem(CART_STORAGE_KEY);
        }
      }
      try {
        const cart = await api.createCart();
        this.applyCart(cart);
        localStorage.setItem(CART_STORAGE_KEY, cart.id);
        await this.applyPendingDiscountCode();
      } catch {
        this.errorMessage = 'Cart is temporarily unavailable. Please try again.';
      }
    },

    async addItem(variantId: string, quantity = 1, sellingPlanId?: string) {
      this.errorMessage = '';
      if (!variantId || quantity < 1) {
        this.errorMessage = 'This product is not available right now.';
        return;
      }
      if (!this.id) await this.init();
      if (!this.id) return;
      this.isLoading = true;
      try {
        const cart = sellingPlanId
          ? await api.addToCart(this.id, variantId, quantity, sellingPlanId)
          : await api.addToCart(this.id, variantId, quantity);
        this.applyCart(cart);
        await this.applyPendingDiscountCode();
        this.isOpen = true;
      } catch {
        this.errorMessage = 'We could not add that item to your cart. Please try again.';
      } finally {
        this.isLoading = false;
      }
    },

    async addItems(
      lines: Array<{ merchandiseId: string; quantity?: number; sellingPlanId?: string }>,
      options: { openCart?: boolean } = {}
    ) {
      this.errorMessage = '';
      const validLines = lines.filter((line) => line.merchandiseId && (line.quantity ?? 1) > 0);
      if (validLines.length === 0) {
        this.errorMessage = 'These products are not available right now.';
        return;
      }
      if (!this.id) await this.init();
      if (!this.id) return;
      this.isLoading = true;
      try {
        const cart = await api.addLinesToCart(this.id, validLines);
        this.applyCart(cart);
        await this.applyPendingDiscountCode();
        this.isOpen = options.openCart ?? true;
      } catch {
        this.errorMessage = 'We could not add those items to your cart. Please try again.';
      } finally {
        this.isLoading = false;
      }
    },

    async removeItem(lineId: string) {
      this.errorMessage = '';
      if (!this.id) return;
      this.isLoading = true;
      try {
        const cart = await api.removeFromCart(this.id, lineId);
        this.applyCart(cart);
      } catch {
        this.errorMessage = 'We could not remove that item. Please try again.';
      } finally {
        this.isLoading = false;
      }
    },

    async updateItem(lineId: string, quantity: number) {
      this.errorMessage = '';
      if (quantity < 1) {
        await this.removeItem(lineId);
        return;
      }
      if (!this.id) return;
      this.isLoading = true;
      try {
        const cart = await api.updateCartItem(this.id, lineId, quantity);
        this.applyCart(cart);
      } catch {
        this.errorMessage = 'We could not update your cart. Please try again.';
      } finally {
        this.isLoading = false;
      }
    },

    open() { this.isOpen = true; },
    close() { this.isOpen = false; },
    formatPrice: fmt,
  };
}
