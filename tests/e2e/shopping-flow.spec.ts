import { expect, test } from '@playwright/test';

const storefrontPattern = '**/api/2024-01/graphql.json';

function cart(quantity: number) {
  return {
    id: 'gid://shopify/Cart/cart-1',
    checkoutUrl: 'https://cfcskincare.myshopify.com/checkouts/cn/test-checkout',
    totalQuantity: quantity,
    lines: {
      edges: quantity > 0 ? [{
        node: {
          id: 'gid://shopify/CartLine/line-1',
          quantity,
          merchandise: {
            id: 'gid://shopify/ProductVariant/2001',
            title: 'Default Title',
            price: { amount: '28.00', currencyCode: 'USD' },
            product: {
              title: 'CFC Gentle Cleanser',
              handle: 'gentle-cleanser',
              images: { edges: [{ node: { url: '/favicon.png', altText: 'CFC Gentle Cleanser' } }] },
            },
          },
        },
      }] : [],
    },
    cost: { totalAmount: { amount: (28 * quantity).toFixed(2), currencyCode: 'USD' } },
  };
}

test.beforeEach(async ({ page }) => {
  await page.route('https://cfcskincare.myshopify.com/checkouts/**', async route => {
    await route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><title>Mock Shopify Checkout</title><h1>Mock Shopify Checkout</h1>',
    });
  });

  await page.route(storefrontPattern, async route => {
    const body = route.request().postDataJSON();
    const query = String(body.query);
    const variables = body.variables ?? {};

    if (query.includes('cartCreate')) {
      await route.fulfill({ json: { data: { cartCreate: { cart: cart(0) } } } });
      return;
    }
    if (query.includes('cartLinesAdd')) {
      await route.fulfill({ json: { data: { cartLinesAdd: { cart: cart(variables.lines?.[0]?.quantity ?? 1) } } } });
      return;
    }
    if (query.includes('cartLinesUpdate')) {
      await route.fulfill({ json: { data: { cartLinesUpdate: { cart: cart(variables.lines?.[0]?.quantity ?? 1) } } } });
      return;
    }
    if (query.includes('cartLinesRemove')) {
      await route.fulfill({ json: { data: { cartLinesRemove: { cart: cart(0) } } } });
      return;
    }
    if (query.includes('getCart')) {
      await route.fulfill({ json: { data: { cart: cart(1) } } });
      return;
    }

    await route.fulfill({ json: { data: {} } });
  });
});

test('customer can shop through checkout handoff without payment', async ({ page }) => {
  await page.addInitScript(() => {
    document.cookie = 'cfc_mask_modal_dismissed=1; path=/; SameSite=Lax';
  });

  await page.goto('/');
  await expect(page).toHaveTitle(/CFC Skincare/);

  await page.getByRole('link', { name: /Shop Complete System/i }).click();
  await expect(page).toHaveURL(/\/shop/);

  const productLink = page.getByRole('link', { name: /CFC Gentle Cleanser/i }).first();
  await expect(productLink).toHaveAttribute('href', /gentle-cleanser/);

  await page.getByRole('button', { name: /Add to Cart/i }).first().click();
  const dialog = page.getByRole('dialog', { name: /Shopping cart/i });
  await expect(dialog).toBeVisible();
  await expect(page.getByText('CFC Gentle Cleanser').last()).toBeVisible();

  await dialog.getByRole('button', { name: /Increase quantity/i }).click();
  await expect(dialog.locator('span.w-8')).toHaveText('2');

  await dialog.getByRole('button', { name: /Remove item/i }).click();
  await expect(page.getByText(/Your cart is empty/i)).toBeVisible();

  await page.getByRole('button', { name: /Continue Shopping/i }).click();
  await page.getByRole('button', { name: /Add to Cart/i }).first().click();

  const checkout = page.getByRole('link', { name: /^Checkout$/i });
  await expect(checkout).toHaveAttribute('href', /cfcskincare\.myshopify\.com\/checkouts/);
  await page.getByRole('link', { name: /^Checkout$/i }).click();
  await expect(page).toHaveURL(/cfcskincare\.myshopify\.com\/checkouts/);
});
