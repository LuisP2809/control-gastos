import * as db from './db.js';
import { money, summary, today } from './calculations.js';

const app = document.querySelector('#app');
let enhancing = false;
let scheduled = false;

function scheduleEnhancement() {
  if (scheduled) return;
  scheduled = true;
  queueMicrotask(async () => {
    scheduled = false;
    await enhanceRegister();
  });
}

async function enhanceRegister() {
  if (!app || enhancing) return;
  const page = app.querySelector('.page');
  const title = page?.querySelector('.pagehead h2')?.textContent.trim();
  if (!page || title !== 'Registrar' || page.dataset.registerV2 === 'ready') return;

  const type = page.querySelector('#transactionForm [name=type]')?.value || 'expense';
  enhancing = true;
  try {
    const [funds, transactions, categories] = await Promise.all([
      db.all('funds'),
      db.all('transactions'),
      db.all('categories'),
    ]);
    const visible = app.querySelector('.page');
    const currentTitle = visible?.querySelector('.pagehead h2')?.textContent.trim();
    if (!visible || currentTitle !== 'Registrar') return;

    const totals = summary(funds, transactions);
    visible.outerHTML = renderRegister(type, funds, categories, totals);
    bindRegisterInteractions(funds, totals.bal || {});
  } catch (error) {
    console.error('No se pudo construir el formulario visual.', error);
  } finally {
    enhancing = false;
  }
}

function renderRegister(type, funds, categories, totals) {
  const isTransfer = type === 'transfer';
  const typeCategories = categories.filter(category => category.type === type);
  const firstFund = funds[0]?.id || '';
  const secondFund = funds[1]?.id || firstFund;
  const fundOptions = selected => funds.map(fund => option(
    fund.id,
    `${fund.name}${fund.protected || !fund.spendable ? ' · Protegido' : ''} (${money(totals.bal?.[fund.id] || 0)})`,
    fund.id === selected,
  )).join('');
  const categoryOptions = typeCategories.map(category => option(category.name, category.name, false)).join('');
  const typeName = type === 'expense' ? 'Gasto' : type === 'income' ? 'Ingreso' : 'Transferencia';
  const typeIcon = type === 'expense' ? '↘' : type === 'income' ? '↗' : '↔';

  return `<section class="page register-v2" data-register-v2="ready">
    <header class="register-header">
      <div><h2>Registrar movimiento</h2><p>Completa los datos y revisa el resumen antes de guardar.</p></div>
      <span class="register-security">♢ Guardado solo en tu dispositivo</span>
    </header>

    <div class="register-modes" role="tablist" aria-label="Tipo de movimiento">
      ${modeButton('expense','↘','Gasto','Dinero que salió',type)}
      ${modeButton('income','↗','Ingreso','Dinero que entró',type)}
      ${modeButton('transfer','↔','Transferencia','Mover entre fondos',type)}
    </div>

    <div class="register-layout">
      <form id="transactionForm" class="register-form-v2">
        <input type="hidden" name="type" value="${type}">
        <article class="register-amount-card">
          <label for="registerAmount">Monto del ${typeName.toLowerCase()}</label>
          <div class="register-amount-input"><span>S/</span><input id="registerAmount" name="amount" type="number" min="0.01" step="0.01" inputmode="decimal" placeholder="0.00" required autocomplete="off"></div>
          <div class="quick-amounts" aria-label="Montos rápidos">
            ${[10,20,50,100].map(value => `<button type="button" data-quick-amount="${value}">S/ ${value}</button>`).join('')}
          </div>
          <div class="register-preview" data-register-preview><span>${previewLabel(type)}</span><strong>${money(totals.bal?.[firstFund] || 0)}</strong></div>
        </article>

        <article class="register-details-card">
          <div class="register-section-title"><i>1</i><h3>Detalles del movimiento</h3></div>
          <div class="register-fields">
            ${isTransfer ? `
              <div class="register-field"><label for="registerFrom">Fondo de origen</label><select id="registerFrom" name="from" required>${fundOptions(firstFund)}</select></div>
              <div class="register-field"><label for="registerTo">Fondo de destino</label><select id="registerTo" name="to" required>${fundOptions(secondFund)}</select></div>
            ` : `
              <div class="register-field"><label for="registerFund">${type === 'income' ? 'Fondo de destino' : 'Fondo utilizado'}</label><select id="registerFund" name="fund" required>${fundOptions(firstFund)}</select></div>
              <div class="register-field"><label for="registerCategory">${type === 'income' ? 'Origen del ingreso' : 'Categoría'}</label><select id="registerCategory" name="category" required>${categoryOptions}</select></div>
            `}
            <div class="register-field"><label for="registerDate">Fecha</label><input id="registerDate" name="date" type="date" value="${today()}" required></div>
            ${!isTransfer ? `<div class="register-field"><label for="registerMethod">Medio de ${type === 'income' ? 'recepción' : 'pago'}</label><select id="registerMethod" name="method"><option>Efectivo</option><option>Tarjeta</option><option>Transferencia</option><option>Billetera digital</option><option>Otro</option></select></div>` : ''}
            <div class="register-field full"><label for="registerDescription">Descripción ${isTransfer ? '(opcional)' : ''}</label><input id="registerDescription" name="description" maxlength="100" placeholder="${descriptionPlaceholder(type)}" ${isTransfer ? '' : 'required'}></div>
          </div>
        </article>

        <button type="submit" class="btn register-submit"><span>${typeIcon}</span> Guardar ${typeName.toLowerCase()}</button>
      </form>

      <aside class="register-aside">
        <article class="register-summary-card">
          <h3>Resumen</h3>
          <div class="register-summary-list">
            <div class="register-summary-row"><span>Tipo</span><b data-summary-type>${typeName}</b></div>
            <div class="register-summary-row"><span>${isTransfer ? 'Origen' : 'Fondo'}</span><b data-summary-fund>${escapeHtml(funds[0]?.name || 'Sin fondo')}</b></div>
            <div class="register-summary-row"><span>Fecha</span><b data-summary-date>${formatDate(today())}</b></div>
            <div class="register-summary-row"><span>Monto</span><b data-summary-amount>${money(0)}</b></div>
          </div>
        </article>
        <div class="register-tip" data-register-tip><span>✓</span><div><strong>${tipTitle(type, funds.length)}</strong><p>${tipText(type, funds.length)}</p></div></div>
      </aside>
    </div>
  </section>`;
}

function bindRegisterInteractions(funds, balances) {
  const root = app.querySelector('.register-v2');
  const form = root?.querySelector('#transactionForm');
  if (!root || !form) return;
  const fundMap = new Map(funds.map(fund => [fund.id, fund]));

  root.addEventListener('click', event => {
    const quick = event.target.closest('[data-quick-amount]');
    if (!quick) return;
    const amount = form.querySelector('[name=amount]');
    amount.value = quick.dataset.quickAmount;
    amount.dispatchEvent(new Event('input',{bubbles:true}));
  });

  const update = () => updateRegisterPreview(form, fundMap, balances);
  form.addEventListener('input', update);
  form.addEventListener('change', update);
  update();
}

function updateRegisterPreview(form, fundMap, balances) {
  const type = form.elements.type.value;
  const amount = Math.max(0, Number(form.elements.amount.value) || 0);
  const sourceId = type === 'transfer' ? form.elements.from?.value : form.elements.fund?.value;
  const destinationId = type === 'transfer' ? form.elements.to?.value : type === 'income' ? form.elements.fund?.value : null;
  const source = fundMap.get(sourceId);
  const destination = fundMap.get(destinationId);
  const sourceBalance = Number(balances[sourceId] || 0);
  const destinationBalance = Number(balances[destinationId] || 0);
  const preview = form.querySelector('[data-register-preview]');

  let label = 'Saldo después del gasto';
  let value = sourceBalance - amount;
  if (type === 'income') {
    label = 'Saldo después del ingreso';
    value = sourceBalance + amount;
  } else if (type === 'transfer') {
    label = `${source?.name || 'Origen'} después de transferir`;
    value = sourceBalance - amount;
  }
  preview.querySelector('span').textContent = label;
  preview.querySelector('strong').textContent = money(value);
  preview.classList.toggle('is-warning', value < 0);

  const selectedName = type === 'transfer'
    ? `${source?.name || 'Origen'} → ${destination?.name || 'Destino'}`
    : source?.name || 'Sin fondo';
  const summaryFund = document.querySelector('[data-summary-fund]');
  const summaryDate = document.querySelector('[data-summary-date]');
  const summaryAmount = document.querySelector('[data-summary-amount]');
  if (summaryFund) summaryFund.textContent = selectedName;
  if (summaryDate) summaryDate.textContent = formatDate(form.elements.date.value);
  if (summaryAmount) summaryAmount.textContent = money(amount);

  const tip = document.querySelector('[data-register-tip]');
  const protectedFund = source && (source.protected || !source.spendable);
  if (tip && protectedFund && (type === 'expense' || type === 'transfer')) {
    tip.querySelector('strong').textContent = 'Fondo protegido';
    tip.querySelector('p').textContent = `La aplicación pedirá confirmación antes de retirar dinero de “${source.name}”.`;
  } else if (tip && type === 'transfer' && sourceId === destinationId) {
    tip.querySelector('strong').textContent = 'Selecciona fondos distintos';
    tip.querySelector('p').textContent = 'El origen y el destino de una transferencia no pueden ser iguales.';
  }
}

function modeButton(value, icon, label, caption, selected) {
  return `<button type="button" class="register-mode ${selected === value ? 'active' : ''}" data-reg="${value}" role="tab" aria-selected="${selected === value}"><span class="register-mode-icon">${icon}</span><span><strong>${label}</strong><small>${caption}</small></span></button>`;
}

function option(value, label, selected) {
  return `<option value="${escapeHtml(value)}" ${selected ? 'selected' : ''}>${escapeHtml(label)}</option>`;
}

function previewLabel(type) {
  return type === 'income' ? 'Saldo después del ingreso' : type === 'transfer' ? 'Saldo del origen después de transferir' : 'Saldo después del gasto';
}

function descriptionPlaceholder(type) {
  return type === 'income' ? 'Ej. Pago de trabajo' : type === 'transfer' ? 'Ej. Dinero para ahorros' : 'Ej. Compra del supermercado';
}

function tipTitle(type, fundCount) {
  if (type === 'transfer' && fundCount < 2) return 'Necesitas otro fondo';
  return type === 'income' ? 'El ingreso aumentará tu saldo' : type === 'transfer' ? 'No cuenta como ingreso ni gasto' : 'Revisa el fondo y la categoría';
}

function tipText(type, fundCount) {
  if (type === 'transfer' && fundCount < 2) return 'Crea al menos dos fondos para mover dinero entre ellos.';
  return type === 'income' ? 'El monto se añadirá al fondo de destino seleccionado.' : type === 'transfer' ? 'La transferencia solo mueve dinero entre tus propios fondos.' : 'El disponible proyectado se actualiza mientras escribes el monto.';
}

function formatDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return 'Sin fecha';
  return new Intl.DateTimeFormat('es-PE',{day:'2-digit',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(`${value}T00:00:00Z`)).replace('.','');
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
}

if (app) {
  new MutationObserver(scheduleEnhancement).observe(app,{childList:true,subtree:true});
  scheduleEnhancement();
}
