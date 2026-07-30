import test from 'node:test';
import assert from 'node:assert/strict';
import {
  balanceEvolution,
  balances,
  byCategory,
  dateRange,
  inRange,
  localDate,
  monthlySeries,
  summary,
} from '../js/calculations.js';

const funds = [
  { id: 'daily', initial: 1000, spendable: true, protected: false },
  { id: 'savings', initial: 200, spendable: false, protected: false },
];

const transactions = [
  { id: 1, type: 'income', fund: 'daily', amount: 500, date: '2026-05-03', category: 'Sueldo' },
  { id: 2, type: 'expense', fund: 'daily', amount: 100, date: '2026-05-05', category: 'Alimentación' },
  { id: 3, type: 'transfer', from: 'daily', to: 'savings', amount: 250, date: '2026-05-06' },
  { id: 4, type: 'expense', fund: 'daily', amount: 50, date: '2026-06-02', category: 'Transporte' },
  { id: 5, type: 'income', fund: 'daily', amount: 300, date: '2026-06-10', category: 'Venta' },
];

test('usa la fecha civil de Perú y no la fecha UTC', () => {
  const instant = new Date('2026-07-30T03:30:00Z');
  assert.equal(localDate(instant), '2026-07-29');
});

test('calcula saldos y protege fondos no gastables', () => {
  const result = summary(funds, transactions, '2026-06-20');
  assert.deepEqual(balances(funds, transactions), { daily: 1400, savings: 450 });
  assert.equal(result.protectedMoney, 450);
  assert.equal(result.available, 1400);
  assert.equal(result.income, 300);
  assert.equal(result.expense, 50);
});

test('las transferencias cambian fondos pero no ingresos ni gastos', () => {
  const may = summary(funds, transactions, '2026-05-31');
  assert.equal(may.income, 500);
  assert.equal(may.expense, 100);
  assert.equal(may.balance, 400);
});

test('aplica rangos actual, anterior, múltiples meses y personalizado', () => {
  assert.deepEqual(dateRange('previous', '2026-07-15'), { start: '2026-06-01', end: '2026-06-30' });
  assert.deepEqual(dateRange('3', '2026-07-15'), { start: '2026-04-01', end: '2026-07-15' });
  const custom = dateRange('custom', '2026-07-15', { start: '2026-05-05', end: '2026-06-02' });
  assert.deepEqual(inRange(transactions, custom).map(t => t.id), [2, 3, 4]);
});

test('31 de marzo calcula febrero completo como mes anterior', () => {
  assert.deepEqual(dateRange('previous', '2025-03-31'), {
    start: '2025-02-01',
    end: '2025-02-28',
  });
});

test('seis meses desde 31 de agosto comienzan el 1 de febrero', () => {
  assert.deepEqual(dateRange('6', '2026-08-31'), {
    start: '2026-02-01',
    end: '2026-08-31',
  });
});

test('genera series mensuales reales y categorías filtradas', () => {
  const range = { start: '2026-05-01', end: '2026-06-30' };
  assert.deepEqual(monthlySeries(transactions, range), [
    { month: '2026-05', income: 500, expense: 100 },
    { month: '2026-06', income: 300, expense: 50 },
  ]);
  assert.deepEqual(byCategory(inRange(transactions, range)), [['Alimentación', 100], ['Transporte', 50]]);
});

test('la serie mensual respeta los días exactos de un rango parcial', () => {
  const range = { start: '2026-05-05', end: '2026-06-02' };
  assert.deepEqual(monthlySeries(transactions, range), [
    { month: '2026-05', income: 0, expense: 100 },
    { month: '2026-06', income: 0, expense: 50 },
  ]);
});

test('genera evolución del saldo y omite transferencias del total', () => {
  const evolution = balanceEvolution(funds, transactions, { start: '2026-05-01', end: '2026-06-30' });
  assert.deepEqual(evolution.map(point => point.balance), [1700, 1600, 1550, 1850]);
  assert.ok(evolution.every(point => point.date !== '2026-05-06'));
});
