const DB = 'mis-finanzas';
const VERSION = 2;
const STORES = ['funds', 'transactions', 'allocations', 'categories', 'budgets', 'settings'];
let promise;

export function openDB() {
  return promise ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, VERSION);
    request.onupgradeneeded = event => {
      const database = request.result;
      for (const storeName of STORES) {
        if (!database.objectStoreNames.contains(storeName)) {
          database.createObjectStore(storeName, {
            keyPath: 'id',
            autoIncrement: storeName === 'transactions' || storeName === 'allocations',
          });
        }
      }

      // Versión 2: el usuario autorizó limpiar la lógica anterior y comenzar desde cero.
      if (event.oldVersion > 0 && event.oldVersion < VERSION) {
        const transaction = request.transaction;
        for (const storeName of STORES) {
          if (database.objectStoreNames.contains(storeName)) {
            transaction.objectStore(storeName).clear();
          }
        }
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Cierra otras pestañas de la aplicación para actualizar la base de datos.'));
  });
}

export async function all(store) {
  const database = await openDB();
  return requestResult(database.transaction(store).objectStore(store).getAll());
}

export async function get(store, id) {
  const database = await openDB();
  return requestResult(database.transaction(store).objectStore(store).get(id));
}

export async function put(store, value) {
  return write(store, objectStore => objectStore.put(value));
}

export async function remove(store, id) {
  return write(store, objectStore => objectStore.delete(id));
}

export async function clear(store) {
  return write(store, objectStore => objectStore.clear());
}

export async function initialize() {
  const funds = await all('funds');
  if (!funds.length) {
    const now = Date.now();
    const defaults = [
      { id: 'account-yape', name: 'Yape', icon: '📱', order: 1 },
      { id: 'account-cash', name: 'Efectivo', icon: '💵', order: 2 },
      { id: 'account-bank', name: 'Cuenta bancaria', icon: '🏦', order: 3 },
    ];
    for (const account of defaults) {
      await put('funds', {
        ...account,
        kind: 'account',
        type: 'Cuenta de dinero',
        initial: 0,
        spendable: true,
        protected: false,
        created: now + account.order,
      });
    }
  }

  if (!(await all('categories')).length) {
    const expenses = ['Alimentación', 'Transporte', 'Hogar', 'Servicios', 'Salud', 'Estudios', 'Compras', 'Entretenimiento', 'Deudas', 'Otros'];
    const incomes = ['Sueldo', 'Trabajo adicional', 'Venta', 'Devolución', 'Regalo', 'Transferencia recibida', 'Otros'];
    for (const [type, names] of [['expense', expenses], ['income', incomes]]) {
      for (const name of names) await put('categories', { id: `${type}-${name}`, type, name });
    }
  }

  if (!(await get('settings', 'main'))) {
    await put('settings', {
      id: 'main',
      monthlyLimit: 1500,
      warning: 70,
      critical: 90,
      currency: 'PEN',
      theme: 'auto',
      dataModel: 2,
    });
  }
}

export async function resetAll() {
  for (const storeName of STORES) await clear(storeName);
  await initialize();
}

export async function exportData() {
  const data = {
    version: VERSION,
    model: 'simple-money-v2',
    exportedAt: new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'America/Lima',
      dateStyle: 'short',
      timeStyle: 'medium',
    }).format(new Date()),
  };
  for (const storeName of STORES) data[storeName] = await all(storeName);
  return data;
}

export async function importData(data) {
  validateBackup(data);
  const database = await openDB();
  await new Promise((resolve, reject) => {
    const transaction = database.transaction(STORES, 'readwrite');
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error || new Error('Importación cancelada'));
    for (const storeName of STORES) {
      const store = transaction.objectStore(storeName);
      store.clear();
      for (const item of data[storeName] || []) store.put(structuredClone(item));
    }
  });
  await initialize();
}

function validateBackup(data) {
  if (!data || typeof data !== 'object' || data.model !== 'simple-money-v2') {
    throw new Error('Esta copia no pertenece a la nueva versión simplificada.');
  }
  for (const storeName of STORES) {
    if (data[storeName] !== undefined && !Array.isArray(data[storeName])) {
      throw new Error(`La colección ${storeName} no es válida.`);
    }
  }
  for (const account of data.funds || []) {
    if (typeof account.id !== 'string' || typeof account.name !== 'string' || !Number.isFinite(Number(account.initial))) {
      throw new Error('Hay una cuenta no válida en la copia.');
    }
  }
  for (const movement of data.transactions || []) validateTransaction(movement);
  for (const allocation of data.allocations || []) validateAllocation(allocation);
}

function validateTransaction(transaction) {
  if (!['income', 'expense', 'transfer', 'adjustment'].includes(transaction.type)) throw new Error('Movimiento no válido en la copia.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(transaction.date || '')) throw new Error('Fecha de movimiento no válida.');
  const amount = Number(transaction.amount);
  if (!Number.isFinite(amount) || (transaction.type !== 'adjustment' && amount <= 0)) throw new Error('Monto de movimiento no válido.');
}

function validateAllocation(allocation) {
  if (!['saving', 'external'].includes(allocation.kind)) throw new Error('Separación no válida en la copia.');
  if (!['allocate', 'release'].includes(allocation.action)) throw new Error('Acción de separación no válida.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(allocation.date || '')) throw new Error('Fecha de separación no válida.');
  if (!Number.isFinite(Number(allocation.amount)) || Number(allocation.amount) <= 0) throw new Error('Monto de separación no válido.');
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function write(store, operation) {
  const database = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(store, 'readwrite');
    let result;
    transaction.oncomplete = () => resolve(result);
    transaction.onerror = () => reject(transaction.error || new Error('La transacción de IndexedDB falló.'));
    transaction.onabort = () => reject(transaction.error || new Error('La transacción de IndexedDB fue cancelada.'));
    const request = operation(transaction.objectStore(store));
    request.onsuccess = () => { result = request.result; };
  });
}

export { STORES, VERSION };
