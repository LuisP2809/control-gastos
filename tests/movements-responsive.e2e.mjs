import { test, expect } from '@playwright/test';

async function selectValueByText(select,text) {
  const value = await select.locator('option',{hasText:text}).getAttribute('value');
  expect(value).not.toBeNull();
  return value;
}

async function createFund(page,name,initial) {
  await page.getByRole('button',{name:/Fondos/}).click();
  await page.getByRole('button',{name:/Nuevo/}).click();
  await page.locator('#fundForm [name=name]').fill(name);
  await page.locator('#fundForm [name=type]').selectOption({label:'Dinero propio'});
  await page.locator('#fundForm [name=initial]').fill(String(initial));
  await page.locator('#fundForm button[type=submit]').click();
  await expect(page.getByText('Fondo guardado correctamente')).toBeVisible();
}

async function registerMovement(page,{type,amount,description,fundName}) {
  await page.getByRole('button',{name:/Registrar/}).click();
  await page.getByRole('button',{name:type === 'expense' ? 'Gasto' : 'Ingreso',exact:true}).click();
  const fund = page.locator('#transactionForm [name=fund]');
  await fund.selectOption(await selectValueByText(fund,fundName));
  await page.locator('#transactionForm [name=amount]').fill(String(amount));
  await page.locator('#transactionForm [name=description]').fill(description);
  await page.locator('#transactionForm button').click();
}

test('movimientos filtra correctamente y no se distorsiona',async({page}) => {
  await page.setViewportSize({width:390,height:844});
  await page.goto('/');
  await createFund(page,'Principal',1000);
  await registerMovement(page,{type:'expense',amount:120,description:'Compra de alimentos',fundName:'Principal'});
  await registerMovement(page,{type:'income',amount:500,description:'Pago de trabajo',fundName:'Principal'});

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
