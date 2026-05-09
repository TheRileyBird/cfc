import type { Cart } from '../../src/lib/cart-client';
import type { ShopifyProduct } from '../../src/lib/shopify';

export const variantId = 'gid://shopify/ProductVariant/2001';
export const alternateVariantId = 'gid://shopify/ProductVariant/2002';
export const sellingPlanId = 'gid://shopify/SellingPlan/3001';

export const productFixture: ShopifyProduct = {
  id: 'gid://shopify/Product/1001',
  title: 'CFC Gentle Cleanser',
  handle: 'gentle-cleanser',
  description: 'Gentle cleanser fixture',
  availableForSale: true,
  tags: ['Cleanse'],
  priceRange: { minVariantPrice: { amount: '28.00', currencyCode: 'USD' } },
  images: { edges: [{ node: { url: 'https://cdn.example.com/cleanser.jpg', altText: 'Cleanser bottle' } }] },
  variants: { edges: [{ node: { id: variantId, title: 'Default Title', price: { amount: '28.00' } } }] },
  collections: { edges: [{ node: { title: 'Cleanse' } }] },
};

export function rawCart(quantity = 1, id = 'gid://shopify/Cart/cart-1') {
  return {
    id,
    checkoutUrl: 'https://cfcskincare.myshopify.com/checkouts/cn/test',
    totalQuantity: quantity,
    lines: {
      edges: quantity > 0 ? [{
        node: {
          id: 'gid://shopify/CartLine/line-1',
          quantity,
          sellingPlanAllocation: null,
          merchandise: {
            id: variantId,
            title: 'Default Title',
            price: { amount: '28.00', currencyCode: 'USD' },
            product: {
              title: 'CFC Gentle Cleanser',
              handle: 'gentle-cleanser',
              images: { edges: [{ node: { url: 'https://cdn.example.com/cleanser.jpg', altText: 'Cleanser bottle' } }] },
            },
          },
        },
      }] : [],
    },
    cost: { totalAmount: { amount: (28 * quantity).toFixed(2), currencyCode: 'USD' } },
  };
}

export function cartFixture(quantity = 1): Cart {
  return {
    id: 'gid://shopify/Cart/cart-1',
    checkoutUrl: 'https://cfcskincare.myshopify.com/checkouts/cn/test',
    totalQuantity: quantity,
    totalAmount: (28 * quantity).toFixed(2),
    items: quantity > 0 ? [{
      id: 'gid://shopify/CartLine/line-1',
      quantity,
      variantId,
      variantTitle: 'Default Title',
      price: '28.00',
      productTitle: 'CFC Gentle Cleanser',
      productHandle: 'gentle-cleanser',
      imageUrl: 'https://cdn.example.com/cleanser.jpg',
      imageAlt: 'Cleanser bottle',
      sellingPlanId: '',
      sellingPlanName: '',
    }] : [],
  };
}
