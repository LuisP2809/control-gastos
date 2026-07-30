import { test, expect } from '@playwright/test';

const sections = [
  { page: 'home', selector: '.dashboard-v2', title: 'Resumen' },
  { page: 'moves', selector: '.movements-v2', title: 'Movimientos' },
  { page: 'register', selector: '.register-v2', title: 'Registrar' },
  { page: 'funds', selector: '.funds-v2', title: 'Fondos' },
  { page: 'analysis', selector: '.analysis-v2', title: 'Análisis' },
  { page: 'settings', selector: '.settings-v2', title: 'Ajustes' },
];

test('revisión final de navegación, accesibilidad y funcionamiento offline', async ({ page, context }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.locator('.dashboard-v2')).toBeVisible();

  for (const section of sections) {
    await page.locator(`.bottom button[data-page="${section.page}"]`).click();
    await expect(page.locator(section.selector)).toBeVisible();
    await expect(page.locator('.bottom button[aria-current="page"]')).toHaveCount(1);
    await expect(page.locator('.bottom button[aria-current="page"]')).toContainText(section.title);
    await expect(page).toHaveTitle(new RegExp(`^${section.title} · Mi Control de gasto$`));

    const audit = await page.evaluate(() => {
      const ids = [...document.querySelectorAll('[id]')].map(element => element.id);
      const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
      return {
        duplicates: [...new Set(duplicates)],
        overflow: document.documentElement.scrollWidth - window.innerWidth,
        pageLabel: document.querySelector('main')?.getAttribute('aria-labelledby'),
      };
    });
    expect(audit.duplicates).toEqual([]);
    expect(audit.overflow).toBeLessThanOrEqual(1);
    expect(audit.pageLabel).toBe('page-title');
  }

  const themeButton = page.locator('#themeQuick');
  const beforeTheme = await themeButton.getAttribute('aria-pressed');
  await themeButton.click();
  await expect(themeButton).not.toHaveAttribute('aria-pressed', beforeTheme || 'false');
  const themeState = await page.evaluate(() => ({
    dark: document.documentElement.classList.contains('dark'),
    color: document.querySelector('#themeColor')?.getAttribute('content'),
  }));
  expect(themeState.color).toBe(themeState.dark ? '#090d18' : '#f3f5fb');

  await page.locator('.bottom button[data-page="home"]').click();
  await expect(page.locator('.dashboard-v2')).toBeVisible();
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBeTruthy();

  await context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('.dashboard-v2')).toBeVisible();
  await expect(page.getByText('Mi Control de gasto', { exact: true }).first()).toBeVisible();
  await context.setOffline(false);

  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.locator('.privacy-card')).toBeVisible();
  await expect(page.locator('.bottom button[aria-current="page"]')).toHaveCount(1);
  const desktopOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(desktopOverflow).toBeLessThanOrEqual(1);
});
