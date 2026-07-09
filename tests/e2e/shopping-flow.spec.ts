import { expect, test } from '@playwright/test';

const storefrontPattern = '**/api/2024-01/graphql.json';

function cart(quantity: number, discountCodes: Array<{ code: string; applicable: boolean }> = []) {
  return {
    id: 'gid://shopify/Cart/cart-1',
    checkoutUrl: 'https://cfcskincare.shop/cart/c/test-checkout?_s=session-id&_y=visitor-id&key=checkout-key',
    discountCodes,
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
  await page.addInitScript(() => {
    document.cookie = 'cfc_mask_modal_dismissed=1; path=/; SameSite=Lax';
  });

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
    if (query.includes('cartDiscountCodesUpdate')) {
      await route.fulfill({
        json: {
          data: {
            cartDiscountCodesUpdate: {
              cart: cart(1, variables.discountCodes.map((code: string) => ({ code, applicable: true }))),
              userErrors: [],
            },
          },
        },
      });
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

test('product buy now goes to Shopify checkout in the same tab', async ({ page }) => {
  await page.goto('/products/gentle-cleanser');

  const popupPromise = page.waitForEvent('popup', { timeout: 1000 }).catch(() => null);
  await page.getByRole('button', { name: /^Buy Now$/i }).click();

  await expect(page).toHaveURL(/cfcskincare\.myshopify\.com\/checkouts/);
  expect(await popupPromise).toBeNull();
});

test('account links go to the Shopify login page', async ({ page }) => {
  const loginUrl = 'https://www.cfcskincare.shop/account/login';

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  await page.evaluate(() => window.scrollTo(0, 200));
  await expect(page.getByRole('link', { name: 'Account' })).toHaveAttribute('href', loginUrl);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Menu' }).click();
  await expect(page.getByRole('link', { name: /^Account$/ })).toHaveAttribute('href', loginUrl);
});

test('Collabs discount links store discount and preserve tracking params', async ({ page }) => {
  let appliedDiscountCodes: string[] = [];

  await page.goto('/discount?code=COLLAB10&redirect=/shop&dt_id=0&utm_source=collabs');

  await expect(page).toHaveURL(/\/shop\?dt_id=0&utm_source=collabs$/);
  await expect.poll(async () => page.evaluate(() => localStorage.getItem('shopify_discount_code'))).toBe('COLLAB10');

  page.on('request', request => {
    if (!request.url().includes('/api/2024-01/graphql.json')) return;
    const body = request.postDataJSON();
    if (String(body.query).includes('cartDiscountCodesUpdate')) {
      appliedDiscountCodes = body.variables.discountCodes;
    }
  });

  await page.getByRole('button', { name: /Add to Cart/i }).first().click();

  await expect(page.getByRole('dialog', { name: /Shopping cart/i })).toBeVisible();
  expect(appliedDiscountCodes).toEqual(['COLLAB10']);
  await expect(page.getByRole('link', { name: /^Checkout$/i })).toHaveAttribute('href', /discount=COLLAB10/);
});

test('production Collabs QR slug RENEWEDAPPROACH redirects and stores discount', async ({ page }) => {
  await page.goto('/discount?code=RENEWEDAPPROACH&dt_id=0');

  await expect(page).toHaveURL(/\/\?dt_id=0$/);
  await expect.poll(async () => page.evaluate(() => localStorage.getItem('shopify_discount_code'))).toBe('RENEWEDAPPROACH');
});

test('production Collabs QR slug LISA redirects and stores discount', async ({ page }) => {
  await page.goto('/discount?code=LISA&utm_source=collabs');

  await expect(page.getByText('Applying discount')).toHaveCount(0);
  await expect(page).toHaveURL(/\/\?utm_source=collabs$/);
  await expect.poll(async () => page.evaluate(() => localStorage.getItem('shopify_discount_code'))).toBe('LISA');
});

test('additional production Collabs QR slugs redirect and store discounts', async ({ page }) => {
  for (const code of ['TIMELESS', 'ALAINA', 'SAINTLYSKIN']) {
    await page.goto(`/discount?code=${code}&utm_source=collabs`);

    await expect(page).toHaveURL(/\/\?utm_source=collabs$/);
    await expect.poll(async () => page.evaluate(() => localStorage.getItem('shopify_discount_code'))).toBe(code);
  }
});
