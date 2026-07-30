import { test, expect } from '@playwright/test';

async function seedMovements(page) {
  await page.evaluate(async () => {
    const database = await new Promise((resolve,reject) => {
      const request = indexedDB.open('mis-finanzas',1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    const parts = new Intl.DateTimeFormat('en-CA',{
      timeZone:'America/Lima',year:'numeric',month:'2-digit',day:'2-digit'
    }).formatToParts(new Date());
    const values = Object.fromEntries(parts.map(part => [part.type,part.value]));
    const date = `${values.year}-${values.month}-${values.day}`;

    await new Promise((resolve,reject) => {
      const transaction = database.transaction(['funds','transactions'],'readwrite');
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
      transaction.objectStore('funds').put({
        id:'principal-movements-test',name:'Principal',type:'Dinero propio',initial:1000,
        icon:'💰',spendable:true,protected:false,created:Date.now()
      });
      transaction.objectStore('transactions').add({
        type:'expense',amount:120,description:'Compra de alimentos',category:'Alimentación',
        method:'Tarjeta',fund:'principal-movements-test',date,created:Date.now()
      });
      transaction.objectStore('transactions').add({
        type:'income',amount:500,description:'Pago de trabajo',category:'Trabajo adicional',
        method:'Transferencia',fund:'principal-movements-test',date,created:Date.now()+1
      });
    });
    database.close();
  });
}

test('movimientos filtra correctamente y no se distorsiona',async({page}) => {
  await page.setViewportSize({width:390,height:844});
  await page.goto('/');
  await seedMovements(page);
  await page.reload();

  await page.getByRole('button',{name:/Movimientos/}).click();
  await expect(page.locator('.movements-v2')).toBeVisible();
  await expect(page.locator('.movement-stat')).toHaveCount(4);
  await expect(page.locator('.movement')).toHaveCount(2);
  await expect(page.getByRole('button',{name:/Nuevo movimiento/})).toBeVisible();

  await page.getByRole('button',{name:'Gastos',exact:true}).click();
  await expect(page.locator('.movement')).toHaveCount(1);
  await expect(page.locator('.movement')).toContainText('Compra de alimentos');

  await page.getByRole('button',{name:'Todos',exact:true}).click();
  await page.getByLabel('Buscar').fill('Pago de trabajo');
  await expect(page.locator('.movement')).toHaveCount(1);
  await expect(page.locator('.movement')).toContainText('Pago de trabajo');

  await page.getByRole('button',{name:'Limpiar filtros'}).click();
  await expect(page.locator('.movement')).toHaveCount(2);

  const mobileOverflow = await page.evaluate(() => document.documentElement.scrollWidth-window.innerWidth);
  expect(mobileOverflow).toBeLessThanOrEqual(1);

  await page.setViewportSize({width:1440,height:900});
  await expect(page.locator('.movement-filter-grid')).toBeVisible();
  await expect(page.locator('.movement-stats')).toHaveCSS('grid-template-columns',/.+ .+ .+ .+/);
  const desktopOverflow = await page.evaluate(() => document.documentElement.scrollWidth-window.innerWidth);
  expect(desktopOverflow).toBeLessThanOrEqual(1);
});
