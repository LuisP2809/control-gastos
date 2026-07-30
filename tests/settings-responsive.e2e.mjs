import { test, expect } from '@playwright/test';

test('ajustes persisten, exportan y no se distorsionan', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');

  await page.getByRole('button', { name: /Ajustes/ }).click();
  await expect(page.locator('.settings-v2')).toBeVisible();
  await expect(page.locator('.settings-stat')).toHaveCount(4);
  await expect(page.locator('#settingsForm')).toBeVisible();
  await expect(page.locator('#importFile')).toHaveCount(1);

  const form = page.locator('#settingsForm');
  await form.locator('[name=monthlyLimit]').fill('2200');
  await form.locator('[name=warning]').fill('65');
  await form.locator('[name=critical]').fill('85');
  await form.locator('[name=theme][value=dark]').check({ force: true });

  await expect(page.locator('[data-stat=budget] strong')).toContainText('2,200.00');
  await expect(page.locator('[data-stat=warning] strong')).toHaveText('65%');
  await expect(page.locator('[data-stat=critical] strong')).toHaveText('85%');
  await expect(page.locator('[data-settings-validation]')).toContainText('ordenadas correctamente');

  await form.locator('button[type=submit]').click();
  await expect(page.getByText('Ajustes guardados')).toBeVisible();
  await expect(page.locator('.settings-v2')).toBeVisible();
  await expect(page.locator('#settingsForm [name=monthlyLimit]')).toHaveValue('2200');
  await expect(page.locator('#settingsForm [name=warning]')).toHaveValue('65');
  await expect(page.locator('#settingsForm [name=critical]')).toHaveValue('85');
  await expect(page.locator('#settingsForm [name=theme][value=dark]')).toBeChecked();

  const [backup] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('button[data-export]').click(),
  ]);
  expect(backup.suggestedFilename()).toBe('mis-finanzas-backup.json');

  const [csv] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('button[data-csv]').click(),
  ]);
  expect(csv.suggestedFilename()).toBe('movimientos.csv');

  const mobileOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(mobileOverflow).toBeLessThanOrEqual(1);

  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.locator('.settings-layout')).toHaveCSS('grid-template-columns', /.+ .+/);
  await expect(page.locator('.settings-side')).toBeVisible();
  const desktopOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(desktopOverflow).toBeLessThanOrEqual(1);
});
