import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../js/app.js', import.meta.url), 'utf8');

function declaration(name, nextName) {
  const start = source.indexOf(`${name === 'submit' || name === 'saveFund' ? 'async ' : ''}function ${name}`);
  const end = source.indexOf(`${nextName.startsWith('async ') ? '' : ''}${nextName}`, start);
  assert.ok(start >= 0 && end > start, `No se encontró ${name}`);
  return source.slice(start, end);
}

const createIdSource = declaration('createId', 'async function saveFund');
const saveFundSource = declaration('saveFund', 'async function deleteFund');

function fundHarness({ rejectPut = false, id = 'fund-test' } = {}) {
  const funds = [];
  const events = [];
  const db = {
    async get(store, id) { return funds.find(fund => fund.id === id); },
    async put(store, value) {
      assert.equal(store, 'funds');
      if (rejectPut) throw new Error('IndexedDB no disponible');
      funds.push(value);
    },
  };
  const saveFund = Function('db', 'modal', 'toast', 'render', 'createId',
    `${saveFundSource};return saveFund`)(
    db,
    { close: () => events.push('close') },
    message => events.push(message),
    async () => events.push('render'),
    () => id,
  );
  return { funds, events, saveFund };
}

test('crea un segundo fondo y actualiza la interfaz inmediatamente', async () => {
  const { funds, events, saveFund } = fundHarness();
  funds.push({ id: 'existing', name: 'Mi dinero' });
  await saveFund({ name: 'Viaje', type: 'Ahorros', initial: '250', spendable: 'on' });
  assert.equal(funds.length, 2);
  assert.equal(funds[1].name, 'Viaje');
  assert.deepEqual(events, ['close', 'Fondo guardado correctamente', 'render']);
});

test('crea fondos protegidos y no gastables conservando ambas opciones', async () => {
  const protectedHarness = fundHarness({ id: 'protected' });
  await protectedHarness.saveFund({ name: 'Emergencia', type: 'Emergencias', initial: '500', protected: 'on', spendable: 'on' });
  assert.equal(protectedHarness.funds[0].protected, true);

  const lockedHarness = fundHarness({ id: 'locked' });
  await lockedHarness.saveFund({ name: 'Reserva', type: 'Dinero reservado', initial: '100' });
  assert.equal(lockedHarness.funds[0].spendable, false);
});

test('genera un identificador alternativo sin randomUUID', () => {
  const createId = Function('globalThis', 'crypto', 'Date', 'Math', `${createIdSource};return createId`)(
    { crypto: {} }, {}, { now: () => 1234 }, { random: () => 0.5 },
  );
  assert.match(createId(), /^fund-1234-[0-9a-f]+$/);
});

test('el formulario de fondo confirma la persistencia antes de cerrar', async () => {
  const harness = fundHarness();
  await harness.saveFund({ name: 'Confirmado', type: 'Ahorros', initial: '10' });
  assert.equal(harness.funds[0].name, 'Confirmado');
  assert.equal(harness.events[0], 'close');
});

test('un rechazo de IndexedDB no cierra el diálogo', async () => {
  const harness = fundHarness({ rejectPut: true });
  await assert.rejects(harness.saveFund({ name: 'Viaje', type: 'Ahorros', initial: '10' }), /IndexedDB no disponible/);
  assert.deepEqual(harness.events, []);
});
