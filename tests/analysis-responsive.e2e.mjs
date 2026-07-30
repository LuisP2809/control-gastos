import { test, expect } from '@playwright/test';

test('análisis compara períodos y no se distorsiona', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.locator('.dashboard-v2')).toBeVisible();

  const dates = await page.evaluate(async () => {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(new Date());
    const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
    const today = `${values.year}-${values.month}-${values.day}`;
    const monthStart = `${values.year}-${values.month}-01`;
    const [year, month] = monthStart.split('-').map(Number);
    const previousEndDate = new Date(Date.UTC(year, month - 1, 0));
    const previousEnd = `${previousEndDate.getUTCFullYear()}-${String(previousEndDate.getUTCMonth()+1).padStart(2,'0')}-${String(previousEndDate.getUTCDate()).padStart(2,'0')}`;

    await new Promise((resolve, reject) => {
      const open = indexedDB.open('mis-finanzas', 1);
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const database = open.result;
        const transaction = database.transaction(['funds','transactions'], 'readwrite');
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
        transaction.oncomplete = resolve;
        const funds = transaction.objectStore('funds');
        const movements = transaction.objectStore('transactions');
        const request = funds.getAll();
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const fund = request.result[0];
          fund.initial = 1000;
          funds.put(fund);
          movements.add({ type:'income', fund:fund.id, amount:1200, category:'Sueldo', description:'Ingreso de prueba', method:'Transferencia', date:today, created:Date.now() });
          movements.add({ type:'expense', fund:fund.id, amount:300, category:'Alimentación', description:'Gasto actual', method:'Tarjeta', date:today, created:Date.now()+1 });
          movements.add({ type:'expense', fund:fund.id, amount:200, category:'Transporte', description:'Gasto anterior', method:'Efectivo', date:previousEnd, created:Date.now()-1 });
        };
      };
    });
    return { today, monthStart };
  });

  await page.getByRole('button', { name: /Análisis/ }).click();
  await expect(page.locator('.analysis-v2')).toBeVisible();
  await expect(page.locator('.analysis-kpi')).toHaveCount(5);
  await expect(page.locator('.cashflow-svg')).toBeVisible();
  await expect(page.locator('.analysis-donut')).toBeVisible();
  await expect(page.locator('.analysis-insight')).toHaveCount(4);
  await expect(page.locator('.analysis-kpi.tone-income strong')).toHaveText('S/ 1,200.00');
  await expect(page.locator('.analysis-kpi.tone-expense strong')).toHaveText('S/ 300.00');

  await page.locator('#analysisRange').selectOption('3');
  await expect(page.locator('#analysisRange')).toHaveValue('3');
  await expect(page.locator('.analysis-v2')).toBeVisible();

  await page.locator('#analysisRange').selectOption('custom');
  await expect(page.locator('#analysisStart')).toBeEnabled();
  await expect(page.locator('#analysisEnd')).toBeEnabled();
  await page.locator('#analysisStart').fill(dates.monthStart);
  await page.locator('#analysisStart').dispatchEvent('change');
  await page.locator('#analysisEnd').fill(dates.today);
  await page.locator('#analysisEnd').dispatchEvent('change');
  await expect(page.locator('#analysisRange')).toHaveValue('custom');

  const mobileOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(mobileOverflow).toBeLessThanOrEqual(1);

  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.locator('.analysis-panels')).toHaveCSS('grid-template-columns', /.+ .+/);
  await expect(page.locator('.analysis-period')).toBeVisible();
  const desktopOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(desktopOverflow).toBeLessThanOrEqual(1);
});
