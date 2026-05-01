import type { Alpine } from 'alpinejs';
import intersect from '@alpinejs/intersect';
import {
  createCart,
  getCart,
  addToCart,
  removeFromCart,
  updateCartItem,
  searchProducts,
  type CartLineItem,
  type SearchProduct,
} from './lib/cart-client';

const fmt = (amount: string) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(parseFloat(amount) || 0);

function makeCartStore() {
  const s = {
    isOpen: false,
    isLoading: false,
    id: null as string | null,
    items: [] as CartLineItem[],
    totalQuantity: 0,
    totalAmount: '0.00',
    checkoutUrl: '',

    async init() {
      const saved = localStorage.getItem('shopify_cart_id');
      if (saved) {
        try {
          const cart = await getCart(saved);
          if (cart) {
            s.id = cart.id;
            s.items = cart.items;
            s.totalQuantity = cart.totalQuantity;
            s.totalAmount = cart.totalAmount;
            s.checkoutUrl = cart.checkoutUrl;
            return;
          }
        } catch { /* stale — fall through */ }
      }
      try {
        const cart = await createCart();
        s.id = cart.id;
        s.checkoutUrl = cart.checkoutUrl;
        localStorage.setItem('shopify_cart_id', cart.id);
      } catch { /* offline */ }
    },

    async addItem(variantId: string, quantity = 1) {
      if (!s.id) await s.init();
      if (!s.id) return;
      s.isLoading = true;
      try {
        const cart = await addToCart(s.id, variantId, quantity);
        s.id = cart.id;
        s.items = cart.items;
        s.totalQuantity = cart.totalQuantity;
        s.totalAmount = cart.totalAmount;
        s.checkoutUrl = cart.checkoutUrl;
        s.isOpen = true;
      } catch (err) {
        console.error('addToCart error:', err);
      } finally {
        s.isLoading = false;
      }
    },

    async removeItem(lineId: string) {
      if (!s.id) return;
      s.isLoading = true;
      try {
        const cart = await removeFromCart(s.id, lineId);
        s.items = cart.items;
        s.totalQuantity = cart.totalQuantity;
        s.totalAmount = cart.totalAmount;
      } finally {
        s.isLoading = false;
      }
    },

    async updateItem(lineId: string, quantity: number) {
      if (quantity < 1) { await s.removeItem(lineId); return; }
      if (!s.id) return;
      s.isLoading = true;
      try {
        const cart = await updateCartItem(s.id, lineId, quantity);
        s.items = cart.items;
        s.totalQuantity = cart.totalQuantity;
        s.totalAmount = cart.totalAmount;
      } finally {
        s.isLoading = false;
      }
    },

    open() { s.isOpen = true; },
    close() { s.isOpen = false; },
    formatPrice: fmt,
  };
  return s;
}

function makeSearchStore() {
  const s = {
    isOpen: false,
    query: '',
    results: [] as SearchProduct[],
    isLoading: false,

    open() {
      s.isOpen = true;
      s.query = '';
      s.results = [];
    },
    close() { s.isOpen = false; },

    async doSearch() {
      const q = s.query.trim();
      if (!q) { s.results = []; return; }
      s.isLoading = true;
      try {
        s.results = await searchProducts(q);
      } catch {
        s.results = [];
      } finally {
        s.isLoading = false;
      }
    },

    formatPrice: fmt,
  };
  return s;
}

export default (Alpine: Alpine) => {
  Alpine.plugin(intersect);
  Alpine.store('cart', makeCartStore());
  Alpine.store('search', makeSearchStore());
};
