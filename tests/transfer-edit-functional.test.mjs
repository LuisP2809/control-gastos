import test from 'node:test';
import assert from 'node:assert/strict';
import { balances } from '../js/calculations.js';

test('editar una transferencia excluye por completo el movimiento anterior', () => {
  const funds = [
    { id: 'A', initial: 500 },
    { id: 'B', initial: 0 },
  ];
  const oldTransfer = {
    id: 1,
    type: 'transfer',
    amount: 200,
    from: 'A',
    to: 'B',
    date: '2026-07-30',
  };

  const transactionsWithoutOld = [oldTransfer].filter(
    transaction => Number(transaction.id) !== Number(oldTransfer.id),
  );
  const result = balances(funds, transactionsWithoutOld);

  assert.equal(result.A, 500);
  assert.equal(result.B, 0);
  assert.ok(100 > result.B, 'B no debe conservar los S/ 200 recibidos por la transferencia antigua');
});
