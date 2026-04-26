import { expect, test } from 'flowsnap/fixture';

const pages: Record<string, string> = {
  '/': `
    <main>
      <h1>Storefront</h1>
      <p>Choose an item and continue to the cart.</p>
      <a href="/cart">View cart</a>
    </main>
  `,
  '/cart': `
    <main>
      <h1>Cart</h1>
      <p>Review your order before checkout.</p>
      <a href="/checkout?step=shipping">Checkout</a>
    </main>
  `,
  '/checkout': `
    <main>
      <h1>Checkout</h1>
      <p>Shipping details are ready.</p>
    </main>
  `,
};

test('captures a checkout flow', async ({ page }) => {
  await page.route('https://flowsnap.example/**', async (route) => {
    const url = new URL(route.request().url());
    const body = pages[url.pathname] ?? pages['/'];

    await route.fulfill({
      contentType: 'text/html',
      body,
    });
  });

  await page.goto('https://flowsnap.example/');
  await expect(page.getByRole('heading', { name: 'Storefront' })).toBeVisible();

  await page.getByRole('link', { name: 'View cart' }).click();
  await expect(page.getByRole('heading', { name: 'Cart' })).toBeVisible();

  await page.getByRole('link', { name: 'Checkout' }).click();
  await expect(page.getByRole('heading', { name: 'Checkout' })).toBeVisible();
});
