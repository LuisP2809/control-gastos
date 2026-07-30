import { test, expect } from '@playwright/test';

test('registrar gasto, ingreso y transferencia funciona sin distorsión', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');

  await page.getByRole('button',{name:/Registrar/}).click();
  await expect(page.locator('.register-v2')).toBeVisible();
  await expect(page.locator('.register-mode')).toHaveCount(3);
  await expect(page.locator('#transactionForm [name=type]')).toHaveValue('expense');
  await expect(page.locator('.register-preview')).toBeVisible();

  await page.locator('[data-quick-amount="50"]').click();
  await expect(page.locator('#transactionForm [name=amount]')).toHaveValue('50');
  await expect(page.locator('[data-summary-amount]')).toContainText('50.00');
  await expect(page.locator('.register-preview')).toContainText('Saldo después del gasto');

  await page.locator('#transactionForm [name=description]').fill('Compra desde celular');
  await page.evaluate(() => { window.confirm = () => true; });
  await page.locator('#transactionForm button[type=submit]').click();
  await expect(page.getByText('Movimiento guardado')).toBeVisible();

  await page.getByRole('button',{name:/Movimientos/}).click();
  await expect(page.getByText('Compra desde celular')).toBeVisible();

  await page.getByRole('button',{name:/Registrar/}).click();
  await page.locator('[data-reg="income"]').click();
  await expect(page.locator('.register-v2 #transactionForm [name=type]')).toHaveValue('income');
  await expect(page.locator('#transactionForm [name=category]')).toBeVisible();
  await expect(page.locator('#transactionForm [name=method]')).toBeVisible();
  await expect(page.locator('.register-preview')).toContainText('Saldo después del ingreso');

  await page.locator('[data-reg="transfer"]').click();
  await expect(page.locator('.register-v2 #transactionForm [name=type]')).toHaveValue('transfer');
  await expect(page.locator('#transactionForm [name=from]')).toBeVisible();
  await expect(page.locator('#transactionForm [name=to]')).toBeVisible();
  await expect(page.locator('#transactionForm [name=method]')).toHaveCount(0);

  const mobileOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(mobileOverflow).toBeLessThanOrEqual(1);

  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.locator('.register-aside')).toBeVisible();
  const desktop = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth - window.innerWidth,
    columns: getComputedStyle(document.querySelector('.register-layout')).gridTemplateColumns,
  }));
  expect(desktop.overflow).toBeLessThanOrEqual(1);
  expect(desktop.columns.split(' ').length).toBeGreaterThanOrEqual(2);
});
