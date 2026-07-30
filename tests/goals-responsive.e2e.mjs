import { test, expect } from '@playwright/test';

test('una meta separa ahorro sin alterar el dinero total', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');

  await page.evaluate(async () => {
    const database = await new Promise((resolve,reject) => {
      const request = indexedDB.open('mis-finanzas');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise((resolve,reject) => {
      const transaction = database.transaction(['funds'],'readwrite');
      const store = transaction.objectStore('funds');
      const all = store.getAll();
      all.onsuccess = () => {
        const main = all.result.find(fund => fund.name === 'Mi dinero');
        store.put({...main,initial:3000});
        store.put({id:'protected-example',name:'Dinero protegido',type:'Dinero reservado',initial:600,icon:'🔒',spendable:false,protected:true,created:Date.now()});
      };
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
    });
  });

  await page.locator('.bottom [data-page="goals"]').click();
  await expect(page.locator('.goals-v1')).toBeVisible();
  await page.getByRole('button', { name: /Nueva meta|Crear primera meta/ }).first().click();

  const goalForm = page.locator('#goalForm');
  await goalForm.locator('[name=name]').fill('Laptop nueva');
  await goalForm.locator('[name=targetAmount]').fill('3000');
  await goalForm.locator('[name=contributionValue]').fill('600');
  await goalForm.locator('[name=targetDate]').fill('2027-01-31');
  await goalForm.locator('button[type=submit]').click();
  await expect(page.getByText('Meta creada')).toBeVisible();

  const card = page.locator('.goal-card').filter({ hasText: 'Laptop nueva' });
  await expect(card).toBeVisible();
  await card.getByRole('button', { name: /Aportar/ }).click();
  const contribution = page.locator('#goalContributionForm');
  await expect(contribution.locator('[name=amount]')).toHaveValue('600');
  await contribution.locator('button[type=submit]').click();
  await expect(page.getByText(/Aportaste/)).toBeVisible();

  await expect(page.locator('.allocation-hero-copy h3')).toContainText('3,600.00');
  await expect(page.locator('.allocation-value.tone-available strong')).toContainText('2,400.00');
  await expect(page.locator('.allocation-value.tone-goals strong')).toContainText('600.00');
  await expect(page.locator('.allocation-value.tone-protected strong')).toContainText('600.00');
  await expect(page.locator('.allocation-formula b')).toContainText('2,400.00');
  await expect(card.locator('.goal-money strong').first()).toContainText('600.00');

  const distribution = await page.evaluate(async () => {
    const calculations = await import('/js/calculations.js');
    const database = await new Promise((resolve,reject) => {
      const request = indexedDB.open('mis-finanzas');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const read = storeName => new Promise((resolve,reject) => {
      const request = database.transaction(storeName).objectStore(storeName).getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return calculations.summary(await read('funds'),await read('transactions'));
  });
  expect(distribution.total).toBe(3600);
  expect(distribution.goalMoney).toBe(600);
  expect(distribution.protectedMoney).toBe(600);
  expect(distribution.available).toBe(2400);

  await page.reload();
  await page.locator('.bottom [data-page="goals"]').click();
  await expect(page.locator('.goal-card').filter({ hasText: 'Laptop nueva' })).toBeVisible();
  await expect(page.locator('.allocation-value.tone-available strong')).toContainText('2,400.00');

  const mobileOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(mobileOverflow).toBeLessThanOrEqual(1);

  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.locator('.goal-card-grid')).toBeVisible();
  const desktopOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(desktopOverflow).toBeLessThanOrEqual(1);
});

test('las metas aparecen separadas en resumen, fondos y análisis', async ({ page }) => {
  await page.goto('/');
  await page.locator('.bottom [data-page="goals"]').click();
  await page.getByRole('button', { name: /Nueva meta|Crear primera meta/ }).first().click();
  await page.locator('#goalForm [name=name]').fill('Fondo de emergencia');
  await page.locator('#goalForm [name=targetAmount]').fill('5000');
  await page.locator('#goalForm [name=contributionValue]').fill('300');
  await page.locator('#goalForm button[type=submit]').click();
  await expect(page.getByText('Meta creada')).toBeVisible();

  await page.locator('.bottom [data-page="home"]').click();
  await expect(page.locator('.summary-kpi.tone-goals')).toBeVisible();
  await expect(page.locator('.dashboard-goals-panel')).toBeVisible();

  await page.locator('.bottom [data-page="funds"]').click();
  await expect(page.locator('.fund-stat.tone-goals')).toBeVisible();
  await expect(page.locator('[data-fund-filter="goal"]')).toBeVisible();
  await expect(page.locator('.funds-overview-three')).toBeVisible();

  await page.locator('.bottom [data-page="analysis"]').click();
  await expect(page.locator('.fund-analysis-track.three')).toBeVisible();
  await expect(page.locator('.fund-goal-dot')).toBeVisible();
});