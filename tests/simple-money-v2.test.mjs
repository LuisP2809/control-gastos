import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  allocationBalances,
  balances,
  externalOwners,
  monthlySavingsSeries,
  summary,
} from '../js/calculations.js';

const funds = [
  {id:'yape',name:'Yape',kind:'account',initial:2000,order:1},
  {id:'cash',name:'Efectivo',kind:'account',initial:1000,order:2},
  {id:'bank',name:'Banco',kind:'account',initial:1000,order:3},
];

test('el dinero separado no aumenta el total físico', () => {
  const allocations = [
    {kind:'external',action:'allocate',amount:600,accountId:'yape',owner:'Mamá',date:'2026-07-01'},
    {kind:'saving',action:'allocate',amount:500,accountId:'cash',date:'2026-07-02'},
  ];
  const result = summary(funds, [], allocations, '2026-07-31');
  assert.equal(result.total, 4000);
  assert.equal(result.external, 600);
  assert.equal(result.saving, 500);
  assert.equal(result.available, 2900);
  assert.equal(result.accountRows.find(row => row.id === 'yape').available, 1400);
  assert.equal(result.accountRows.find(row => row.id === 'cash').available, 500);
});

test('ingresos suman, gastos restan y transferencias conservan el total', () => {
  const transactions = [
    {type:'income',fund:'bank',amount:1000,date:'2026-07-03'},
    {type:'expense',fund:'yape',amount:400,date:'2026-07-04'},
    {type:'transfer',from:'bank',to:'cash',amount:200,date:'2026-07-05'},
  ];
  const result = balances(funds, transactions);
  assert.deepEqual(result, {yape:1600,cash:1200,bank:1800});
  assert.equal(Object.values(result).reduce((a,b)=>a+b,0),4600);
});

test('retirar ahorro aumenta disponible sin cambiar total', () => {
  const allocations = [
    {kind:'saving',action:'allocate',amount:500,accountId:'cash',date:'2026-06-10'},
    {kind:'saving',action:'allocate',amount:300,accountId:'cash',date:'2026-07-10'},
    {kind:'saving',action:'release',amount:100,accountId:'cash',date:'2026-07-20'},
  ];
  const result = summary(funds, [], allocations, '2026-07-31');
  assert.equal(result.total,4000);
  assert.equal(result.saving,700);
  assert.equal(result.savingThisMonth,200);
  assert.equal(result.available,3300);
  assert.deepEqual(monthlySavingsSeries(allocations),[
    {month:'2026-06',value:500},
    {month:'2026-07',value:200},
  ]);
});

test('el dinero ajeno se mantiene separado por persona', () => {
  const allocations = [
    {kind:'external',action:'allocate',amount:600,accountId:'yape',owner:'Mamá',date:'2026-07-01'},
    {kind:'external',action:'allocate',amount:300,accountId:'bank',owner:'Empresa',date:'2026-07-01'},
    {kind:'external',action:'release',amount:100,accountId:'yape',owner:'Mamá',date:'2026-07-02'},
  ];
  assert.deepEqual(externalOwners(allocations),[
    {owner:'Mamá',amount:500},
    {owner:'Empresa',amount:300},
  ]);
  assert.equal(allocationBalances(allocations).byKind.external,800);
});

const root = new URL('../', import.meta.url);

test('la nueva versión elimina Metas y carga solo la aplicación simplificada', async () => {
  const html = await readFile(new URL('index.html', root), 'utf8');
  assert.match(html, /data-page="money"/);
  assert.match(html, /data-page="savings"/);
  assert.doesNotMatch(html, /data-page="goals"/);
  assert.doesNotMatch(html, /goals-v1/);
  assert.match(html, /simple-money-v2\.css/);
  assert.match(html, /js\/simple-money-v2\.js/);
});

test('la migración v2 limpia una sola vez la lógica anterior', async () => {
  const database = await readFile(new URL('js/db.js', root), 'utf8');
  assert.match(database, /const VERSION = 2/);
  assert.match(database, /event\.oldVersion > 0 && event\.oldVersion < VERSION/);
  assert.match(database, /transaction\.objectStore\(storeName\)\.clear\(\)/);
  assert.match(database, /allocations/);
});

test('el service worker usa únicamente los recursos de v2', async () => {
  const worker = await readFile(new URL('sw.js', root), 'utf8');
  assert.match(worker, /mi-control-gasto-v21/);
  assert.match(worker, /simple-money-v2\.css/);
  assert.match(worker, /js\/simple-money-v2\.js/);
  assert.doesNotMatch(worker, /goals-v1/);
});
