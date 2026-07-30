import test from 'node:test';
import assert from 'node:assert/strict';

const storeNames = ['funds', 'transactions', 'categories', 'budgets', 'settings'];
const backing = Object.fromEntries(storeNames.map(name => [name, new Map()]));
backing.funds.set('old', { id: 'old', name: 'Anterior', initial: 10 });

function request(action) {
  const req = {};
  queueMicrotask(() => {
    try { req.result = action(); req.onsuccess?.(); }
    catch (error) { req.error = error; req.onerror?.(); }
  });
  return req;
}

function transaction(names) {
  const selected = Array.isArray(names) ? names : [names];
  const staged = Object.fromEntries(selected.map(name => [name, new Map(backing[name])]));
  const tx = { failed: false };
  tx.objectStore = name => ({
    clear() { staged[name].clear(); return request(() => undefined); },
    getAll() { return request(() => [...staged[name].values()]); },
    get(id) { return request(() => staged[name].get(id)); },
    delete(id) { staged[name].delete(id); return request(() => undefined); },
    put(value) {
      if (value.description === 'FORZAR_ABORTO') tx.failed = true;
      else staged[name].set(value.id ?? staged[name].size + 1, structuredClone(value));
      return request(() => undefined);
    },
  });
  queueMicrotask(() => {
    if (tx.failed) { tx.error = Error('Fallo simulado'); tx.onerror?.(); }
    else { for (const name of selected) backing[name] = staged[name]; tx.oncomplete?.(); }
  });
  return tx;
}

globalThis.indexedDB = {
  open() {
    const req = {};
    queueMicrotask(() => {
      req.result = {
        objectStoreNames: { contains: name => storeNames.includes(name) },
        transaction,
      };
      req.onsuccess?.();
    });
    return req;
  },
};

const db = await import('../js/db.js');
const backup = {
  funds: [{ id: 'new', name: '<img src=x onerror=alert(1)>', initial: 500, spendable: true }],
  transactions: [{ id: 1, type: 'income', fund: 'new', amount: 100, date: '2026-07-29' }],
  categories: [], budgets: [], settings: [{ id: 'main', monthlyLimit: 1000, warning: 70, critical: 90 }],
};

test('la restauración reemplaza todas las colecciones en una transacción', async () => {
  await db.importData(backup);
  assert.equal(backing.funds.has('old'), false);
  assert.equal(backing.funds.get('new').name, '<img src=x onerror=alert(1)>');
  assert.equal(backing.transactions.get(1).amount, 100);
});

test('un fallo aborta toda la restauración sin dejar datos parciales', async () => {
  const previousFunds = structuredClone([...backing.funds]);
  const broken = structuredClone(backup);
  broken.transactions[0].description = 'FORZAR_ABORTO';
  await assert.rejects(db.importData(broken), /Fallo simulado/);
  assert.deepEqual([...backing.funds], previousFunds);
  assert.equal(backing.transactions.get(1).description, undefined);
});

test('rechaza copias inválidas antes de modificar IndexedDB', async () => {
  await assert.rejects(db.importData({ funds: [], transactions: [{ type: 'hack' }] }), /Movimiento no válido/);
  assert.equal(backing.funds.has('new'), true);
});
