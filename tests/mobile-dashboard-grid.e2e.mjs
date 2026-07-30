import { test, expect } from '@playwright/test';

test('los paneles del resumen ocupan todo el ancho en celular', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.locator('.dashboard-v2')).toBeVisible();
  await expect(page.locator('.summary-panels')).toBeVisible();

  const layout = await page.evaluate(() => {
    const container = document.querySelector('.summary-panels');
    const panels = [...container.querySelectorAll(':scope > .dashboard-panel')].filter(panel => !panel.hidden);
    const containerRect = container.getBoundingClientRect();
    return {
      viewport: window.innerWidth,
      overflow: document.documentElement.scrollWidth - window.innerWidth,
      columns: getComputedStyle(container).gridTemplateColumns.trim().split(/\s+/).filter(Boolean),
      containerWidth: containerRect.width,
      panelWidths: panels.map(panel => panel.getBoundingClientRect().width),
      goalColumn: getComputedStyle(document.querySelector('.dashboard-goals-panel')).gridColumn,
    };
  });

  expect(layout.overflow).toBeLessThanOrEqual(1);
  expect(layout.columns).toHaveLength(1);
  expect(layout.panelWidths.length).toBeGreaterThanOrEqual(4);
  for (const width of layout.panelWidths) {
    expect(width).toBeGreaterThanOrEqual(layout.containerWidth * 0.98);
  }
  expect(layout.goalColumn).toMatch(/1\s*\/\s*-1|1\s*\/\s*auto/);
});
