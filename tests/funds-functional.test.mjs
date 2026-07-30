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
const submitSource = declaration('submit', 'async function saveTransaction');

function fundHarness({ rejectPut = false, id = 'fund-test' } = {}) {
  const funds = [];
  const events = [];
  const db = {
    async get() { return undefined; },
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

function submitHarness({ saveFund }) {
  const alerts = [];
  const savingForms = new WeakSet();
  const submit = Function(
    'savingForms', 'FormData', 'saveTransaction', 'saveFund', 'db', 'applyTheme', 'toast', 'render', 'saveEdit', 'alert',
    `${submitSource};return submit`,
  )(
    savingForms,
    class { constructor(form) { return form.data; } },
    async () => {}, saveFund,
    { get: async () => ({}), put: async () => {} },
    () => {}, () => {}, async () => {}, async () => {},
    message => alerts.push(message),
  );
  const button = { disabled: false, textContent: 'Guardar fondo' };
  const form = { id: 'fundForm', data: new Map([['name', 'Viaje']]), isConnected: true, querySelector: () => button };
  const event = { target: form, preventDefault() {} };
  return { alerts, button, event, submit };
}

test('muestra el rechazo de IndexedDB y vuelve a habilitar el botón', async () => {
  const { saveFund } = fundHarness({ rejectPut: true });
  const harness = submitHarness({ saveFund: () => saveFund({ name: 'Viaje', type: 'Ahorros', initial: '10' }) });
  await harness.submit(harness.event);
  assert.deepEqual(harness.alerts, ['No se pudo guardar el fondo: IndexedDB no disponible']);
  assert.equal(harness.button.disabled, false);
  assert.equal(harness.button.textContent, 'Guardar fondo');
});

test('impide el doble envío mientras el primero sigue guardándose', async () => {
  let saves = 0;
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  const harness = submitHarness({ saveFund: async () => { saves += 1; await pending; } });
  const first = harness.submit(harness.event);
  const second = harness.submit(harness.event);
  assert.equal(harness.button.disabled, true);
  assert.equal(harness.button.textContent, 'Guardando…');
  assert.equal(saves, 1);
  release();
  await Promise.all([first, second]);
  assert.equal(saves, 1);
});
