import { test, expect } from '@playwright/test';

async function configureCurrentMoney(page, { yape = 2000, cash = 1000, bank = 1000 } = {}) {
  await page.getByRole('button', { name: 'Configurar mi dinero actual' }).click();
  const form = page.locator('#balanceSetupForm');
  const entries = [
    ['#balance-account-yape', yape],
    ['#balance-account-cash', cash],
    ['#balance-account-bank', bank],
  ];
  for (const [selector, value] of entries) {
    const input = form.locator(selector);
    await input.clear();
    await input.fill(String(value));
    await expect(input).toHaveValue(String(value));
  }
  await form.getByRole('button', { name: 'Guardar saldos actuales' }).click();
  await expect(page.getByText('Saldos actuales configurados')).toBeVisible();
  await expect(form).toBeHidden();
}

async function go(page, name) {
  await page.locator('.bottom').getByRole('button', { name, exact: true }).click();
}

async function separateExternal(page, amount = 600, owner = 'Mamá', account = 'account-yape') {
  await go(page, 'Registrar');
  await page.getByRole('tab', { name: /Separar/ }).click();
  const form = page.locator('#separateForm');
  await form.locator('[name="accountId"]').selectOption(account);
  await form.locator('[name="amount"]').fill(String(amount));
  await form.locator('label').filter({ hasText: 'Dinero ajeno' }).click();
  await expect(form.locator('[name="kind"][value="external"]')).toBeChecked();
  await form.locator('[name="owner"]').fill(owner);
  await form.getByRole('button', { name: 'Separar dinero' }).click();
}

async function addSaving(page, amount = 500, account = 'account-cash') {
  await go(page, 'Ahorro');
  await page.getByRole('button', { name: '＋ Ahorrar' }).click();
  const form = page.locator('#savingContributionForm');
  await form.locator('[name="accountId"]').selectOption(account);
  await form.locator('[name="amount"]').fill(String(amount));
  await form.getByRole('button', { name: 'Confirmar ahorro' }).click();
}

test('flujo simple: total, dinero ajeno, ahorro, ingreso y gasto cuadran', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.locator('[data-page-ready="home"]')).toBeVisible();
  await configureCurrentMoney(page);
  await expect(page.locator('[data-testid="available-total"]')).toContainText('4,000.00');

  await page.getByRole('button', { name: /Marcar dinero ajeno/ }).click();
  const separateForm = page.locator('#separateForm');
  await separateForm.locator('[name="accountId"]').selectOption('account-yape');
  await separateForm.locator('[name="amount"]').fill('600');
  await separateForm.locator('[name="owner"]').fill('Mamá');
  await separateForm.getByRole('button', { name: 'Separar dinero' }).click();
  await expect(page.getByText(/marcados como dinero ajeno/)).toBeVisible();

  await addSaving(page);
  await expect(page.locator('[data-testid="saving-total"]')).toContainText('500.00');

  await go(page, 'Resumen');
  await expect(page.locator('.simple-kpi.tone-total strong')).toContainText('4,000.00');
  await expect(page.locator('.simple-kpi.tone-external strong')).toContainText('600.00');
  await expect(page.locator('.simple-kpi.tone-saving strong')).toContainText('500.00');
  await expect(page.locator('[data-testid="available-total"]')).toContainText('2,900.00');

  await go(page, 'Registrar');
  await page.getByRole('tab', { name: /Ingreso/ }).click();
  const incomeForm = page.locator('#incomeForm');
  await incomeForm.locator('[name="fund"]').selectOption('account-bank');
  await incomeForm.locator('[name="amount"]').fill('1000');
  await incomeForm.locator('[name="description"]').fill('Sueldo');
  await incomeForm.getByRole('button', { name: 'Guardar ingreso' }).click();

  await page.getByRole('tab', { name: /Gasto/ }).click();
  const expenseForm = page.locator('#expenseForm');
  await expenseForm.locator('[name="fund"]').selectOption('account-yape');
  await expenseForm.locator('[name="amount"]').fill('400');
  await expenseForm.locator('[name="description"]').fill('Compra');
  await expenseForm.getByRole('button', { name: 'Guardar gasto' }).click();

  await go(page, 'Resumen');
  await expect(page.locator('.simple-kpi.tone-total strong')).toContainText('4,600.00');
  await expect(page.locator('[data-testid="available-total"]')).toContainText('3,500.00');
  await expect(page.locator('.simple-kpi.tone-saving strong')).toContainText('500.00');
  await expect(page.locator('.simple-kpi.tone-external strong')).toContainText('600.00');
});

test('transferir no cambia el total ni el disponible', async ({ page }) => {
  await page.goto('/');
  await configureCurrentMoney(page, { yape: 1500, cash: 500, bank: 1000 });
  await go(page, 'Registrar');
  await page.getByRole('tab', { name: /Transferir/ }).click();
  const form = page.locator('#transferForm');
  await form.locator('[name="from"]').selectOption('account-yape');
  await form.locator('[name="to"]').selectOption('account-cash');
  await form.locator('[name="amount"]').fill('300');
  await form.getByRole('button', { name: 'Guardar transferencia' }).click();
  await go(page, 'Mi dinero');
  await expect(page.locator('[data-testid="money-total"]')).toContainText('3,000.00');
  await expect(page.locator('.formula-result strong')).toContainText('3,000.00');
  await expect(page.locator('[data-testid="account-card"]').filter({ hasText: 'Yape' })).toContainText('S/ 1,200.00');
  await expect(page.locator('[data-testid="account-card"]').filter({ hasText: 'Efectivo' })).toContainText('S/ 800.00');
});

test('retirar ahorro libera disponible y devolver dinero ajeno conserva el disponible', async ({ page }) => {
  await page.goto('/');
  await configureCurrentMoney(page, { yape: 2000, cash: 1000, bank: 0 });
  await separateExternal(page);
  await addSaving(page);

  await page.getByRole('button', { name: 'Retirar del ahorro' }).click();
  let form = page.locator('#savingWithdrawalForm');
  await form.locator('[name="amount"]').fill('200');
  page.once('dialog', dialog => dialog.accept());
  await form.getByRole('button', { name: 'Retirar del ahorro' }).click();
  await expect(page.locator('[data-testid="saving-total"]')).toContainText('300.00');

  await go(page, 'Mi dinero');
  await expect(page.locator('.formula-result strong')).toContainText('2,100.00');
  await page.getByRole('button', { name: 'Devolver dinero ajeno' }).click();
  form = page.locator('#externalReturnForm');
  await form.locator('[name="amount"]').fill('200');
  page.once('dialog', dialog => dialog.accept());
  await form.getByRole('button', { name: 'Confirmar devolución' }).click();
  await expect(page.locator('[data-testid="money-total"]')).toContainText('2,800.00');
  await expect(page.locator('.formula-result strong')).toContainText('2,100.00');
  await expect(page.locator('.external-total strong')).toContainText('400.00');
});

test('la vista móvil de Mi dinero no se comprime ni se desborda', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await configureCurrentMoney(page);
  await go(page, 'Mi dinero');
  await expect(page.locator('[data-testid="account-card"]')).toHaveCount(3);
  const geometry = await page.evaluate(() => ({
    viewport: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    columns: getComputedStyle(document.querySelector('[data-testid="account-card-grid"]')).gridTemplateColumns,
    widths: [...document.querySelectorAll('[data-testid="account-card"]')].map(card => card.getBoundingClientRect().width),
  }));
  expect(geometry.scrollWidth - geometry.viewport).toBeLessThanOrEqual(1);
  expect(geometry.columns.trim().split(/\s+/)).toHaveLength(1);
  for (const width of geometry.widths) expect(width).toBeGreaterThan(340);
});

test('la PWA vuelve a abrir sin conexión después de instalar el caché', async ({ page, context }) => {
  await page.goto('/');
  await expect(page.locator('[data-page-ready="home"]')).toBeVisible();
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect(page.locator('[data-page-ready="home"]')).toBeVisible();
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('[data-page-ready="home"]')).toBeVisible();
  await context.setOffline(false);
});
