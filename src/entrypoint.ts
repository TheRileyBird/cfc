// @ts-nocheck  — Alpine store methods use `this` bound to the reactive proxy at runtime;
// TypeScript cannot infer that type from object literals in strict mode.
import type { Alpine } from 'alpinejs';
import intersect from '@alpinejs/intersect';
import {
  createCart,
  getCart,
  addToCart,
  removeFromCart,
  updateCartItem,
  searchProducts,
} from './lib/cart-client';

const fmt = (amount: string) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(parseFloat(amount) || 0);

export default (Alpine: Alpine) => {
  Alpine.plugin(intersect);

  Alpine.store('cart', {
    isOpen: false,
    isLoading: false,
    id: null,
    items: [],
    totalQuantity: 0,
    totalAmount: '0.00',
    checkoutUrl: '',

    async init() {
      const saved = localStorage.getItem('shopify_cart_id');
      if (saved) {
        try {
          const cart = await getCart(saved);
          if (cart) {
            this.id = cart.id;
            this.items = cart.items;
            this.totalQuantity = cart.totalQuantity;
            this.totalAmount = cart.totalAmount;
            this.checkoutUrl = cart.checkoutUrl;
            return;
          }
        } catch { /* stale, fall through */ }
      }
      try {
        const cart = await createCart();
        this.id = cart.id;
        this.checkoutUrl = cart.checkoutUrl;
        localStorage.setItem('shopify_cart_id', cart.id);
      } catch { /* offline */ }
    },

    async addItem(variantId, quantity = 1) {
      if (!this.id) await this.init();
      if (!this.id) return;
      this.isLoading = true;
      try {
        const cart = await addToCart(this.id, variantId, quantity);
        this.id = cart.id;
        this.items = cart.items;
        this.totalQuantity = cart.totalQuantity;
        this.totalAmount = cart.totalAmount;
        this.checkoutUrl = cart.checkoutUrl;
        this.isOpen = true;
      } catch (err) {
        console.error('addToCart error:', err);
      } finally {
        this.isLoading = false;
      }
    },

    async removeItem(lineId) {
      if (!this.id) return;
      this.isLoading = true;
      try {
        const cart = await removeFromCart(this.id, lineId);
        this.items = cart.items;
        this.totalQuantity = cart.totalQuantity;
        this.totalAmount = cart.totalAmount;
      } finally {
        this.isLoading = false;
      }
    },

    async updateItem(lineId, quantity) {
      if (quantity < 1) { await this.removeItem(lineId); return; }
      if (!this.id) return;
      this.isLoading = true;
      try {
        const cart = await updateCartItem(this.id, lineId, quantity);
        this.items = cart.items;
        this.totalQuantity = cart.totalQuantity;
        this.totalAmount = cart.totalAmount;
      } finally {
        this.isLoading = false;
      }
    },

    open() { this.isOpen = true; },
    close() { this.isOpen = false; },
    formatPrice: fmt,
  });

  Alpine.store('search', {
    isOpen: false,
    query: '',
    results: [],
    isLoading: false,

    open() {
      this.isOpen = true;
      this.query = '';
      this.results = [];
    },
    close() { this.isOpen = false; },

    async doSearch() {
      const q = this.query.trim();
      if (!q) { this.results = []; return; }
      this.isLoading = true;
      try {
        this.results = await searchProducts(q);
      } catch {
        this.results = [];
      } finally {
        this.isLoading = false;
      }
    },

    formatPrice: fmt,
  });
};
