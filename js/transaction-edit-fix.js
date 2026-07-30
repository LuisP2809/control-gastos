import * as db from './db.js';
import { balances, money } from './calculations.js';

const savingForms = new WeakSet();

document.addEventListener('submit', event => {
  const form = event.target instanceof HTMLFormElement ? event.target : null;
  const isTransferEdit = form?.id === 'editTransaction' && form.querySelector('[name="from"]') && form.querySelector('[name="to"]');
  if (!isTransferEdit) return;

  event.preventDefault();
  event.stopImmediatePropagation();
  void saveTransferEdit(form);
}, true);

async function saveTransferEdit(form) {
  if (savingForms.has(form) || !form.reportValidity()) return;

  const button = form.querySelector('[type="submit"]');
  const originalLabel = button?.textContent || 'Guardar cambios';
  savingForms.add(form);
  if (button) {
    button.disabled = true;
    button.textContent = 'Guardando…';
  }

  try {
    const data = Object.fromEntries(new FormData(form));
    const id = Number(data.id);
    const amount = Number(data.amount);
    const old = await db.get('transactions', id);

    if (!old || old.type !== 'transfer') throw new Error('La transferencia ya no existe.');
    if (!Number.isFinite(amount) || amount <= 0) throw new Error('El monto debe ser mayor que cero.');
    if (data.from === data.to) throw new Error('Selecciona fondos de origen y destino diferentes.');

    const [funds, transactions] = await Promise.all([
      db.all('funds'),
      db.all('transactions'),
    ]);
    const source = funds.find(fund => fund.id === data.from);
    const destination = funds.find(fund => fund.id === data.to);
    if (!source || !destination) throw new Error('Uno de los fondos seleccionados ya no existe.');

    const transactionsWithoutOld = transactions.filter(
      transaction => Number(transaction.id) !== Number(old.id),
    );
    const balancesWithoutOld = balances(funds, transactionsWithoutOld);
    const available = Number(balancesWithoutOld[source.id] || 0);

    if (amount > available && !confirm(`El monto supera el saldo de ${source.name} (${money(available)}). ¿Continuar?`)) return;
    if ((source.protected || !source.spendable) && !confirm(`⚠ El fondo “${source.name}” está protegido. ¿Confirmas que deseas retirar este dinero?`)) return;

    const updated = {
      ...old,
      id: old.id,
      type: old.type,
      date: data.date,
      amount,
      from: data.from,
      to: data.to,
      description: data.description || '',
      created: old.created,
      updatedAt: Date.now(),
    };

    await db.put('transactions', updated);
    const saved = await db.get('transactions', old.id);
    if (!saved) throw new Error('IndexedDB no confirmó la transferencia actualizada.');

    for (const key of ['date', 'amount', 'from', 'to', 'description']) {
      if (String(saved[key] ?? '') !== String(updated[key] ?? '')) {
        throw new Error(`IndexedDB no confirmó el cambio de ${key}.`);
      }
    }

    document.querySelector('#modal')?.close();
    showToast('Movimiento actualizado correctamente');
    setTimeout(() => location.reload(), 350);
  } catch (error) {
    alert(`No se pudo actualizar el movimiento: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    savingForms.delete(form);
    if (button?.isConnected) {
      button.disabled = false;
      button.textContent = originalLabel;
    }
  }
}

function showToast(message) {
  const toast = document.querySelector('#toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('show');
}
