import * as db from './db.js';
import { money, today } from './calculations.js';

const app = document.querySelector('#app');
let enhancing = false;
let scheduled = false;

function scheduleEnhancement() {
  if (scheduled) return;
  scheduled = true;
  queueMicrotask(async () => {
    scheduled = false;
    await enhanceMovements();
  });
}

async function enhanceMovements() {
  if (!app || enhancing) return;
  const page = app.querySelector('.page');
  const title = page?.querySelector('.pagehead h2')?.textContent.trim();
  if (!page || title !== 'Movimientos' || page.dataset.movementsV2 === 'ready') return;

  enhancing = true;
  try {
    const [funds, transactions, categories] = await Promise.all([
      db.all('funds'),
      db.all('transactions'),
      db.all('categories'),
    ]);

    const visiblePage = app.querySelector('.page');
    if (!visiblePage || visiblePage.querySelector('.pagehead h2')?.textContent.trim() !== 'Movimientos') return;

    const data = {
      funds,
      transactions: [...transactions].sort(sortTransactions),
      categories,
      fundNames: Object.fromEntries(funds.map(fund => [fund.id, fund.name])),
    };

    visiblePage.outerHTML = renderPage(data);
    bindFilters(data);
  } catch (error) {
    console.error('No se pudo construir la vista de movimientos.', error);
  } finally {
    enhancing = false;
  }
}

function renderPage(data) {
  const categoryOptions = [...new Set(data.categories.map(category => category.name))]
    .sort((a,b) => a.localeCompare(b,'es'))
    .map(name => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`)
    .join('');
  const fundOptions = data.funds
    .map(fund => `<option value="${escapeHtml(fund.id)}">${escapeHtml(fund.name)}</option>`)
    .join('');

  return `<section class="page movements-v2" data-movements-v2="ready">
    <header class="movements-header">
      <div>
        <h2>Movimientos</h2>
        <p>Consulta, filtra y administra todo tu historial financiero</p>
      </div>
      <div class="movements-header-actions">
        <button type="button" class="btn secondary movements-export" data-csv>⇩ Exportar</button>
        <button type="button" class="btn movements-new" data-go="register" data-type="expense">＋ Nuevo movimiento</button>
      </div>
    </header>

    <div id="movementStats" class="movement-stats" aria-live="polite"></div>

    <section class="movement-filter-card" aria-label="Filtros de movimientos">
      <div class="movement-type-tabs" role="group" aria-label="Filtrar por tipo">
        <button type="button" class="active" data-filter-type="">Todos</button>
        <button type="button" data-filter-type="expense">Gastos</button>
        <button type="button" data-filter-type="income">Ingresos</button>
        <button type="button" data-filter-type="transfer">Transferencias</button>
      </div>

      <div class="movement-filter-grid">
        <label class="movement-search">
          <span>Buscar</span>
          <input id="mvSearch" type="search" placeholder="Descripción, categoría o fondo…" autocomplete="off">
        </label>
        <label>
          <span>Mes</span>
          <input id="mvMonth" type="month">
        </label>
        <label>
          <span>Fecha exacta</span>
          <input id="mvDate" type="date">
        </label>
        <label>
          <span>Categoría</span>
          <select id="mvCategory"><option value="">Todas las categorías</option>${categoryOptions}</select>
        </label>
        <label>
          <span>Fondo</span>
          <select id="mvFund"><option value="">Todos los fondos</option>${fundOptions}</select>
        </label>
        <button type="button" id="mvClear" class="movement-clear">Limpiar filtros</button>
      </div>
    </section>

    <div class="movement-history-heading">
      <div><h3>Historial</h3><p id="movementCount"></p></div>
      <select id="mvSort" aria-label="Ordenar movimientos">
        <option value="recent">Más recientes</option>
        <option value="oldest">Más antiguos</option>
        <option value="highest">Mayor monto</option>
        <option value="lowest">Menor monto</option>
      </select>
    </div>

    <div id="moveList" class="movement-history"></div>
  </section>`;
}

function bindFilters(data) {
  const root = app.querySelector('.movements-v2');
  if (!root) return;

  const filters = {
    type: '',
    search: '',
    month: '',
    date: '',
    category: '',
    fund: '',
    sort: 'recent',
  };

  const controls = {
    search: root.querySelector('#mvSearch'),
    month: root.querySelector('#mvMonth'),
    date: root.querySelector('#mvDate'),
    category: root.querySelector('#mvCategory'),
    fund: root.querySelector('#mvFund'),
    sort: root.querySelector('#mvSort'),
  };

  const refresh = () => renderResults(root,data,filters);

  root.querySelectorAll('[data-filter-type]').forEach(button => {
    button.addEventListener('click',() => {
      filters.type = button.dataset.filterType || '';
      root.querySelectorAll('[data-filter-type]').forEach(item => item.classList.toggle('active',item === button));
      refresh();
    });
  });

  controls.search.addEventListener('input',() => { filters.search = controls.search.value.trim().toLowerCase(); refresh(); });
  controls.month.addEventListener('change',() => { filters.month = controls.month.value; refresh(); });
  controls.date.addEventListener('change',() => { filters.date = controls.date.value; refresh(); });
  controls.category.addEventListener('change',() => { filters.category = controls.category.value; refresh(); });
  controls.fund.addEventListener('change',() => { filters.fund = controls.fund.value; refresh(); });
  controls.sort.addEventListener('change',() => { filters.sort = controls.sort.value; refresh(); });

  root.querySelector('#mvClear').addEventListener('click',() => {
    Object.assign(filters,{type:'',search:'',month:'',date:'',category:'',fund:'',sort:'recent'});
    for (const control of Object.values(controls)) control.value = control === controls.sort ? 'recent' : '';
    root.querySelectorAll('[data-filter-type]').forEach(button => button.classList.toggle('active',button.dataset.filterType === ''));
    refresh();
  });

  refresh();
}

function renderResults(root,data,filters) {
  const filtered = data.transactions.filter(transaction => matches(transaction,data,filters));
  const ordered = sortFiltered(filtered,filters.sort);
  const income = ordered.filter(transaction => transaction.type === 'income').reduce(sumAmount,0);
  const expense = ordered.filter(transaction => transaction.type === 'expense').reduce(sumAmount,0);
  const balance = income-expense;

  root.querySelector('#movementStats').innerHTML = [
    statCard('count','▤','Movimientos',ordered.length,'registros visibles'),
    statCard('income','↗','Ingresos',income,'según los filtros'),
    statCard('expense','↘','Gastos',expense,'según los filtros'),
    statCard('balance','＝','Balance',balance,balance >= 0 ? 'resultado positivo' : 'resultado negativo'),
  ].join('');

  root.querySelector('#movementCount').textContent = `${ordered.length} ${ordered.length === 1 ? 'movimiento encontrado' : 'movimientos encontrados'}`;
  root.querySelector('#moveList').innerHTML = ordered.length
    ? groupedMovements(ordered,data.fundNames)
    : `<div class="movement-empty"><span>⌕</span><h3>No encontramos movimientos</h3><p>Prueba cambiando o limpiando los filtros.</p><button type="button" class="btn secondary" id="mvEmptyClear">Limpiar filtros</button></div>`;

  root.querySelector('#mvEmptyClear')?.addEventListener('click',() => root.querySelector('#mvClear').click());
}

function statCard(tone,icon,label,value,caption) {
  const formatted = tone === 'count' ? String(value) : money(value);
  return `<article class="movement-stat tone-${tone}"><span class="movement-stat-icon">${icon}</span><div><small>${label}</small><strong>${formatted}</strong><p>${caption}</p></div></article>`;
}

function groupedMovements(transactions,fundNames) {
  const groups = new Map();
  for (const transaction of transactions) {
    const date = transaction.date || 'Sin fecha';
    if (!groups.has(date)) groups.set(date,[]);
    groups.get(date).push(transaction);
  }

  return [...groups.entries()].map(([date,items]) => `<section class="movement-day-group">
    <header><div><h4>${dateLabel(date)}</h4><span>${formatLongDate(date)}</span></div><b>${items.length}</b></header>
    <div class="movement-day-list">${items.map(transaction => movementCard(transaction,fundNames)).join('')}</div>
  </section>`).join('');
}

function movementCard(transaction,fundNames) {
  const kind = {income:'Ingreso',expense:'Gasto',transfer:'Transferencia'}[transaction.type] || 'Movimiento';
  const icon = transaction.type === 'income' ? '↓' : transaction.type === 'expense' ? '↑' : '↔';
  const sign = transaction.type === 'income' ? '+' : transaction.type === 'expense' ? '-' : '';
  const source = transaction.type === 'transfer'
    ? `${escapeHtml(fundNames[transaction.from] || 'Fondo eliminado')} → ${escapeHtml(fundNames[transaction.to] || 'Fondo eliminado')}`
    : `${escapeHtml(transaction.category || 'Sin categoría')} · ${escapeHtml(fundNames[transaction.fund] || 'Fondo eliminado')}`;
  const method = transaction.type === 'transfer' ? 'Entre fondos' : transaction.method || kind;

  return `<article class="movement transaction-row movement-${transaction.type}">
    <span class="transaction-icon" aria-hidden="true">${icon}</span>
    <div class="transaction-main">
      <div class="transaction-title"><h4>${escapeHtml(transaction.description || kind)}</h4><span>${kind}</span></div>
      <p>${source}</p>
      <small>${escapeHtml(method)}</small>
    </div>
    <div class="transaction-value">
      <strong class="amount ${transaction.type === 'income' ? 'positive' : transaction.type === 'expense' ? 'negative' : ''}">${sign}${money(transaction.amount)}</strong>
      <button type="button" class="transaction-detail" data-detail="${Number(transaction.id)}">Ver</button>
    </div>
  </article>`;
}

function matches(transaction,data,filters) {
  const fundText = transaction.type === 'transfer'
    ? `${data.fundNames[transaction.from] || ''} ${data.fundNames[transaction.to] || ''}`
    : data.fundNames[transaction.fund] || '';
  const haystack = `${transaction.description || ''} ${transaction.category || ''} ${fundText} ${transaction.method || ''}`.toLowerCase();
  return (!filters.type || transaction.type === filters.type)
    && (!filters.search || haystack.includes(filters.search))
    && (!filters.month || transaction.date?.startsWith(filters.month))
    && (!filters.date || transaction.date === filters.date)
    && (!filters.category || transaction.category === filters.category)
    && (!filters.fund || transaction.fund === filters.fund || transaction.from === filters.fund || transaction.to === filters.fund);
}

function sortFiltered(transactions,mode) {
  const copy = [...transactions];
  if (mode === 'oldest') return copy.sort((a,b) => -sortTransactions(a,b));
  if (mode === 'highest') return copy.sort((a,b) => Number(b.amount || 0)-Number(a.amount || 0));
  if (mode === 'lowest') return copy.sort((a,b) => Number(a.amount || 0)-Number(b.amount || 0));
  return copy.sort(sortTransactions);
}

function sortTransactions(a,b) {
  return String(b.date || '').localeCompare(String(a.date || '')) || Number(b.created || 0)-Number(a.created || 0);
}

function sumAmount(total,transaction) { return total+Number(transaction.amount || 0); }

function dateLabel(value) {
  if (value === today()) return 'Hoy';
  const current = dayNumber(today());
  const target = dayNumber(value);
  if (Number.isFinite(current) && Number.isFinite(target) && current-target === 1) return 'Ayer';
  return formatLongDate(value);
}

function dayNumber(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return NaN;
  const [year,month,day] = value.split('-').map(Number);
  return Math.floor(Date.UTC(year,month-1,day)/86400000);
}

function formatLongDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return value || 'Sin fecha';
  return new Intl.DateTimeFormat('es-PE',{day:'2-digit',month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(`${value}T00:00:00Z`));
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g,character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
}

if (app) {
  new MutationObserver(scheduleEnhancement).observe(app,{childList:true,subtree:true});
  scheduleEnhancement();
}
