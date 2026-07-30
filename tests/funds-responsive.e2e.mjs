import { test, expect } from '@playwright/test';

async function seedFunds(page) {
  await page.evaluate(async () => {
    const database = await new Promise((resolve,reject) => {
      const request = indexedDB.open('mis-finanzas',1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    await new Promise((resolve,reject) => {
      const transaction = database.transaction(['funds','transactions'],'readwrite');
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
      const funds = transaction.objectStore('funds');
      const movements = transaction.objectStore('transactions');
      funds.put({id:'fund-principal',name:'Principal',type:'Dinero propio',initial:1000,icon:'💳',spendable:true,protected:false,created:100});
      funds.put({id:'fund-ahorro',name:'Ahorro protegido',type:'Ahorros',initial:500,icon:'🌱',spendable:false,protected:true,created:200});
      movements.put({type:'expense',amount:120,category:'Alimentación',description:'Compra semanal',fund:'fund-principal',method:'Tarjeta',date:'2026-07-30',created:300});
      movements.put({type:'transfer',amount:100,description:'Separar ahorro',from:'fund-principal',to:'fund-ahorro',date:'2026-07-30',created:301});
    });
    database.close();
  });
}

test('fondos muestra saldos, filtros y acciones sin distorsión', async ({ page }) => {
  await page.setViewportSize({width:390,height:844});
  await page.goto('/');
  await seedFunds(page);
  await page.reload();
  await page.getByRole('button',{name:/Fondos/}).click();

  await expect(page.locator('.funds-v2')).toBeVisible();
  await expect(page.locator('.fund-stat')).toHaveCount(5);
  await expect(page.locator('.fund-v2-card')).toHaveCount(3);
  await expect(page.locator('.fund-v2-card').filter({hasText:'Principal'})).toContainText('S/ 780.00');
  await expect(page.locator('.fund-v2-card').filter({hasText:'Ahorro protegido'})).toContainText('S/ 600.00');

  await page.getByRole('button',{name:/Protegidos/}).click();
  await expect(page.locator('.fund-v2-card:visible')).toHaveCount(1);
  await expect(page.locator('.fund-v2-card:visible')).toContainText('Ahorro protegido');

  await page.getByLabel('Buscar fondo').fill('principal');
  await expect(page.locator('#fundEmpty')).toBeVisible();
  await page.getByRole('button',{name:'Limpiar filtros'}).click();
  await expect(page.locator('.fund-v2-card:visible')).toHaveCount(3);

  await page.getByLabel('Ordenar fondos').selectOption('name');
  await expect(page.locator('.fund-v2-card').first()).toContainText('Ahorro protegido');

  await page.getByRole('button',{name:'Editar fondo Ahorro protegido'}).click();
  await expect(page.locator('#fundForm')).toBeVisible();
  await expect(page.locator('#fundForm [name=name]')).toHaveValue('Ahorro protegido');
  await page.getByRole('button',{name:'Cerrar'}).click();

  const mobileOverflow = await page.evaluate(() => document.documentElement.scrollWidth-window.innerWidth);
  expect(mobileOverflow).toBeLessThanOrEqual(1);

  await page.setViewportSize({width:1440,height:900});
  await expect(page.locator('.fund-card-grid')).toHaveCSS('grid-template-columns',/.+ .+ .+/);
  const desktopOverflow = await page.evaluate(() => document.documentElement.scrollWidth-window.innerWidth);
  expect(desktopOverflow).toBeLessThanOrEqual(1);
});