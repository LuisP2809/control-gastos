import { test, expect } from '@playwright/test';

async function selectValueByText(select, text) {
  const value = await select.locator('option', { hasText: text }).getAttribute('value');
  expect(value).not.toBeNull();
  return value;
}

async function createFund(page, name, initial) {
  await page.getByRole('button', { name: /Fondos/ }).click();
  await page.getByRole('button', { name: /Nuevo/ }).click();
  await page.locator('#fundForm [name=name]').fill(name);
  await page.locator('#fundForm [name=type]').selectOption({ label: 'Dinero propio' });
  await page.locator('#fundForm [name=initial]').fill(String(initial));
  await page.locator('#fundForm button[type=submit]').click();
  await expect(page.getByText('Fondo guardado correctamente')).toBeVisible();
}

test('fondos y edición de gastos persisten realmente en IndexedDB', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Fondos/ }).click();
  await expect(page.getByText('Mi dinero').first()).toBeVisible();
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
  const expenseFund = page.locator('#transactionForm [name=fund]');
  await expenseFund.selectOption(await selectValueByText(expenseFund, 'Deporte'));
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
  const editFund = page.locator('#editTransaction [name=fund]');
  await editFund.selectOption(await selectValueByText(editFund, 'Mi dinero'));
  await page.locator('#editTransaction [name=description]').fill('Descripción actualizada');
  await page.evaluate(() => { window.confirm = () => true; });
  await page.locator('#editTransaction button[type=submit]').click();
  await expect(page.getByText('Movimiento actualizado correctamente')).toBeVisible();
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

test('al invertir una transferencia no se reutiliza el saldo del movimiento antiguo', async ({ page }) => {
  await page.goto('/');
  await createFund(page, 'Fondo A', 500);
  await createFund(page, 'Fondo B', 0);

  await page.getByRole('button', { name: /Registrar/ }).click();
  await page.getByRole('button', { name: 'Transferencia', exact: true }).click();

  const from = page.locator('#transactionForm [name=from]');
  const to = page.locator('#transactionForm [name=to]');
  const fundA = await selectValueByText(from, 'Fondo A');
  const fundB = await selectValueByText(from, 'Fondo B');
  await from.selectOption(fundA);
  await to.selectOption(fundB);
  await page.locator('#transactionForm [name=amount]').fill('200');
  await page.locator('#transactionForm [name=description]').fill('Transferencia A B');
  await page.locator('#transactionForm button').click();

  await page.getByRole('button', { name: /Movimientos/ }).click();
  const originalMovement = page.locator('.movement').filter({ hasText: 'Transferencia A B' });
  await originalMovement.getByRole('button', { name: 'Ver' }).click();

  const editForm = page.locator('#editTransaction');
  await editForm.locator('[name=from]').selectOption(fundB);
  await editForm.locator('[name=to]').selectOption(fundA);
  await editForm.locator('[name=amount]').fill('100');
  await page.evaluate(() => {
    window.__confirmMessages = [];
    window.confirm = message => {
      window.__confirmMessages.push(String(message));
      return false;
    };
  });

  await editForm.locator('button[type=submit]').click();
  await expect.poll(() => page.evaluate(() => window.__confirmMessages.join('\n')))
    .toContain('El monto supera el saldo de Fondo B');

  await expect(editForm).toBeVisible();
  await page.getByRole('button', { name: 'Cerrar' }).click();
  await page.reload();
  await page.getByRole('button', { name: /Movimientos/ }).click();

  const unchangedMovement = page.locator('.movement').filter({ hasText: 'Transferencia A B' });
  await expect(unchangedMovement).toContainText('Fondo A → Fondo B');
  await expect(unchangedMovement.locator('.amount')).toContainText('S/ 200.00');
});

test('el resumen no se distorsiona en celular ni escritorio', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');

  await expect(page.locator('.dashboard-v2')).toBeVisible();
  await expect(page.locator('.summary-kpi')).toHaveCount(6);
  await expect(page.locator('.summary-panels')).toBeVisible();
  await expect(page.locator('.bottom')).toBeVisible();
  await expect(page.locator('.privacy-card')).toBeHidden();

  const mobileOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(mobileOverflow).toBeLessThanOrEqual(1);

  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.locator('.privacy-card')).toBeVisible();
  await expect(page.locator('.summary-panels')).toHaveCSS('grid-template-columns', /.+ .+/);

  const desktop = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth - window.innerWidth,
    navPosition: getComputedStyle(document.querySelector('.bottom')).position,
    navLeft: document.querySelector('.bottom').getBoundingClientRect().left,
  }));
  expect(desktop.overflow).toBeLessThanOrEqual(1);
  expect(desktop.navPosition).toBe('fixed');
  expect(desktop.navLeft).toBeLessThan(320);
});
