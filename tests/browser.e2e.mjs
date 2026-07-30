import { test, expect } from '@playwright/test';

test('fondos y edición de gastos persisten realmente en IndexedDB', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Mi dinero').first()).toBeVisible();
  await page.getByRole('button', { name: /Fondos/ }).click();
  await page.getByRole('button', { name: /Nuevo/ }).click();
  await page.locator('#fundForm [name=name]').fill('Deporte');
  await page.locator('#fundForm [name=type]').selectOption({ label: 'Dinero propio' });
  await page.locator('#fundForm [name=initial]').fill('500');
  await page.locator('#fundForm button[type=submit]').dblclick();
  await expect(page.getByText('Fondo guardado correctamente')).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: /Fondos/ }).click();
  await expect(page.getByText('Deporte', { exact: true })).toHaveCount(1);

  await page.getByRole('button', { name: /Registrar/ }).click();
  await page.locator('#transactionForm [name=fund]').selectOption({ label: /Deporte/ });
  await page.locator('#transactionForm [name=amount]').fill('300');
  await page.locator('#transactionForm [name=description]').fill('Compra deportiva');
  await page.locator('#transactionForm button').dblclick();
  await page.getByRole('button', { name: /Movimientos/ }).click();
  await page.getByRole('button', { name: 'Ver' }).click();
  await page.locator('#editTransaction [name=amount]').fill('30');
  await page.locator('#editTransaction button[type=submit]').dblclick();
  await expect(page.getByText('Movimiento actualizado correctamente')).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: /Movimientos/ }).click();
  await expect(page.locator('.movement .amount')).toContainText('S/ 30.00');
  await page.getByRole('button', { name: 'Ver' }).click();
  await page.locator('#editTransaction [name=category]').selectOption({ label: 'Transporte' });
  await page.locator('#editTransaction [name=fund]').selectOption({ label: /Mi dinero/ });
  await page.locator('#editTransaction [name=description]').fill('Descripción actualizada');
  await page.locator('#editTransaction button[type=submit]').click();
  await page.getByRole('button', { name: /Inicio/ }).click();
  await expect(page.getByText('S/ 30.00').first()).toBeVisible();
  await page.getByRole('button', { name: /Fondos/ }).click();
  await expect(page.locator('.fund').filter({ hasText: 'Deporte' })).toContainText('S/ 500.00');
  await expect(page.locator('.fund').filter({ hasText: 'Mi dinero' })).toContainText('-S/ 30.00');

  await page.getByRole('button', { name: /Nuevo/ }).click();
  await page.locator('#fundForm [name=name]').fill('Fallo');
  await page.locator('#fundForm [name=type]').selectOption({ label: 'Ahorros' });
  await page.evaluate(() => { const original=IDBDatabase.prototype.transaction; window.__restoreIDB=()=>IDBDatabase.prototype.transaction=original; IDBDatabase.prototype.transaction=()=>{throw new Error('Fallo IndexedDB simulado')}; });
  page.once('dialog', async dialog => { expect(dialog.message()).toContain('Fallo IndexedDB simulado'); await dialog.accept(); });
  await page.locator('#fundForm button[type=submit]').click();
  await page.evaluate(() => window.__restoreIDB());
  await expect(page.locator('#fundForm button[type=submit]')).toBeEnabled();
});
