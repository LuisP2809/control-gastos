import * as db from './db.js';
import { money, summary } from './calculations.js';

const app = document.querySelector('#app');
let enhancing = false;
let scheduled = false;
let activeFilter = 'all';
let searchText = '';
let sortMode = 'balance-desc';

function scheduleEnhancement() {
  if (scheduled) return;
  scheduled = true;
  queueMicrotask(async () => {
    scheduled = false;
    await enhanceFunds();
  });
}

async function enhanceFunds() {
  if (!app || enhancing) return;
  const page = app.querySelector('.page');
  const title = page?.querySelector('.pagehead h2')?.textContent.trim();
  if (!page || title !== 'Fondos' || page.dataset.fundsV2 === 'ready') return;

  enhancing = true;
  try {
    const [funds, transactions] = await Promise.all([
      db.all('funds'),
      db.all('transactions'),
    ]);
    const visiblePage = app.querySelector('.page');
    if (visiblePage?.querySelector('.pagehead h2')?.textContent.trim() !== 'Fondos') return;
    visiblePage.outerHTML = renderFunds(funds, transactions);
    bindFundsControls();
    applyFundFilters();
  } catch (error) {
    console.error('No se pudo construir la vista visual de fondos.', error);
  } finally {
    enhancing = false;
  }
}

function renderFunds(funds, transactions) {
  const totals = summary(funds, transactions);
  const positiveTotal = funds.reduce((total, fund) => total + Math.max(0, Number(totals.bal[fund.id]) || 0), 0);
  const protectedFunds = funds.filter(isLocked);
  const availableFunds = funds.filter(fund => !isLocked(fund));
  const protectedPositive = protectedFunds.reduce((total, fund) => total + Math.max(0, Number(totals.bal[fund.id]) || 0), 0);
  const availablePositive = availableFunds.reduce((total, fund) => total + Math.max(0, Number(totals.bal[fund.id]) || 0), 0);
  const protectedShare = protectedPositive + availablePositive > 0
    ? protectedPositive / (protectedPositive + availablePositive) * 100
    : 0;

  const cards = funds.map(fund => fundCard(fund, totals.bal[fund.id] || 0, positiveTotal, transactions)).join('');

  return `<section class="page funds-v2" data-funds-v2="ready">
    <header class="funds-header">
      <div><h2>Fondos</h2><p>Organiza tu dinero y distingue lo disponible de lo que prefieres proteger</p></div>
      <button type="button" class="btn funds-new" data-newfund>＋ Nuevo fondo</button>
    </header>

    <div class="fund-stat-grid">
      ${statCard('◉','Fondos',funds.length,'Cuentas y bolsillos')}
      ${statCard('✓','Disponible',totals.available,'Dinero que puedes utilizar','available')}
      ${statCard('▣','Protegido',totals.protectedMoney,'Marcado como no tocar','protected')}
      ${statCard('▤','Dinero total',totals.total,'Saldo de todos tus fondos','total')}
    </div>

    <article class="funds-overview">
      <div class="funds-donut" style="--protected-share:${clamp(protectedShare)}%" role="img" aria-label="Distribución entre dinero disponible y protegido">
        <div><strong>${money(totals.total)}</strong><span>Total</span></div>
      </div>
      <div class="funds-overview-copy">
        <span class="eyebrow">Distribución del dinero</span>
        <h3>Disponible frente a protegido</h3>
        <p>Esta vista separa lo que puedes usar de los fondos que marcaste como reservados o no gastables.</p>
        <div class="funds-split-row available"><i></i><span>Disponible</span><strong>${money(totals.available)}</strong><b>${percentage(availablePositive, availablePositive + protectedPositive)}%</b></div>
        <div class="funds-split-row protected"><i></i><span>Protegido</span><strong>${money(totals.protectedMoney)}</strong><b>${percentage(protectedPositive, availablePositive + protectedPositive)}%</b></div>
      </div>
    </article>

    <div class="funds-toolbar">
      <div class="fund-filter-tabs" role="group" aria-label="Filtrar fondos">
        <button type="button" class="active" data-fund-filter="all">Todos <span>${funds.length}</span></button>
        <button type="button" data-fund-filter="available">Disponibles <span>${availableFunds.length}</span></button>
        <button type="button" data-fund-filter="protected">Protegidos <span>${protectedFunds.length}</span></button>
      </div>
      <label class="fund-search"><span aria-hidden="true">⌕</span><input id="fundSearch" aria-label="Buscar fondo" placeholder="Buscar fondo…" autocomplete="off"></label>
      <select id="fundSort" aria-label="Ordenar fondos">
        <option value="balance-desc">Mayor saldo</option>
        <option value="balance-asc">Menor saldo</option>
        <option value="name">Nombre</option>
        <option value="newest">Más reciente</option>
      </select>
    </div>

    <div id="fundCards" class="fund-card-grid">${cards}</div>
    <div id="fundEmpty" class="funds-empty" hidden><span>◎</span><h3>No encontramos fondos</h3><p>Prueba otro filtro o crea un fondo nuevo.</p><button type="button" class="btn secondary" data-fund-clear>Limpiar filtros</button></div>
  </section>`;
}

function statCard(icon, label, value, caption, tone = '') {
  const formatted = typeof value === 'number' && label !== 'Fondos' ? money(value) : value;
  return `<article class="fund-stat ${tone ? `tone-${tone}` : ''}"><span class="fund-stat-icon">${icon}</span><div><small>${label}</small><strong>${formatted}</strong><p>${caption}</p></div></article>`;
}

function fundCard(fund, balance, positiveTotal, transactions) {
  const locked = isLocked(fund);
  const share = positiveTotal > 0 ? Math.max(0, Number(balance)) / positiveTotal * 100 : 0;
  const related = transactions.filter(transaction => transaction.fund === fund.id || transaction.from === fund.id || transaction.to === fund.id);
  const latest = [...related].sort((a,b) => String(b.date || '').localeCompare(String(a.date || '')) || Number(b.created || 0) - Number(a.created || 0))[0];
  const status = locked ? 'protected' : 'available';
  const statusText = fund.protected ? 'Protegido' : fund.spendable === false ? 'No gastable' : 'Disponible';
  const balanceClass = Number(balance) < 0 ? 'negative' : '';

  return `<article class="fund fund-v2-card" data-fund-status="${status}" data-fund-name="${escapeHtml(fund.name).toLowerCase()}" data-fund-type="${escapeHtml(fund.type).toLowerCase()}" data-fund-balance="${Number(balance) || 0}" data-fund-created="${Number(fund.created) || 0}">
    <header class="fund-card-head">
      <span class="fund-card-icon" aria-hidden="true">${escapeHtml(fund.icon || '💰')}</span>
      <div><h3>${escapeHtml(fund.name)}</h3><p>${escapeHtml(fund.type || 'Fondo personal')}</p></div>
      <span class="fund-status ${status}">${locked ? '▣' : '✓'} ${statusText}</span>
    </header>

    <div class="fund-balance-block">
      <small>Saldo actual</small>
      <strong class="${balanceClass}">${money(balance)}</strong>
      <span>Saldo inicial: ${money(Number(fund.initial) || 0)}</span>
    </div>

    <div class="fund-share-head"><span>Participación del dinero positivo</span><b>${share.toFixed(1)}%</b></div>
    <div class="fund-share-track"><i style="width:${clamp(share)}%"></i></div>

    <div class="fund-details">
      <div><small>Movimientos</small><strong>${related.length}</strong></div>
      <div><small>Último movimiento</small><strong>${latest ? formatDate(latest.date) : 'Sin movimientos'}</strong></div>
    </div>

    <footer class="fund-card-actions">
      <button type="button" class="btn secondary" data-editfund="${escapeHtml(fund.id)}" aria-label="Editar fondo ${escapeHtml(fund.name)}">✎ Editar</button>
      <button type="button" class="btn fund-delete" data-delfund="${escapeHtml(fund.id)}" aria-label="Eliminar fondo ${escapeHtml(fund.name)}">Eliminar</button>
    </footer>
  </article>`;
}

function bindFundsControls() {
  const page = app.querySelector('.funds-v2');
  if (!page) return;
  page.querySelectorAll('[data-fund-filter]').forEach(button => button.addEventListener('click', () => {
    activeFilter = button.dataset.fundFilter;
    page.querySelectorAll('[data-fund-filter]').forEach(item => item.classList.toggle('active', item === button));
    applyFundFilters();
  }));
  page.querySelector('#fundSearch')?.addEventListener('input', event => {
    searchText = event.target.value.trim().toLowerCase();
    applyFundFilters();
  });
  page.querySelector('#fundSort')?.addEventListener('change', event => {
    sortMode = event.target.value;
    applyFundFilters();
  });
  page.querySelector('[data-fund-clear]')?.addEventListener('click', () => {
    activeFilter = 'all';
    searchText = '';
    sortMode = 'balance-desc';
    const search = page.querySelector('#fundSearch');
    const sort = page.querySelector('#fundSort');
    if (search) search.value = '';
    if (sort) sort.value = sortMode;
    page.querySelectorAll('[data-fund-filter]').forEach(button => button.classList.toggle('active', button.dataset.fundFilter === 'all'));
    applyFundFilters();
  });
}

function applyFundFilters() {
  const page = app?.querySelector('.funds-v2');
  const grid = page?.querySelector('#fundCards');
  if (!grid) return;
  const cards = [...grid.querySelectorAll('.fund-v2-card')];
  cards.sort((a,b) => {
    if (sortMode === 'balance-asc') return Number(a.dataset.fundBalance) - Number(b.dataset.fundBalance);
    if (sortMode === 'name') return a.dataset.fundName.localeCompare(b.dataset.fundName, 'es');
    if (sortMode === 'newest') return Number(b.dataset.fundCreated) - Number(a.dataset.fundCreated);
    return Number(b.dataset.fundBalance) - Number(a.dataset.fundBalance);
  }).forEach(card => grid.append(card));

  let visible = 0;
  for (const card of cards) {
    const filterMatch = activeFilter === 'all' || card.dataset.fundStatus === activeFilter;
    const textMatch = !searchText || `${card.dataset.fundName} ${card.dataset.fundType}`.includes(searchText);
    card.hidden = !(filterMatch && textMatch);
    if (!card.hidden) visible += 1;
  }
  const empty = page.querySelector('#fundEmpty');
  if (empty) empty.hidden = visible > 0;
  grid.hidden = visible === 0;
}

function isLocked(fund) { return Boolean(fund.protected || fund.spendable === false); }
function percentage(value,total) { return total > 0 ? Math.round(value / total * 100) : 0; }
function clamp(value) { return Math.max(0, Math.min(100, Number(value) || 0)); }
function formatDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return 'Sin fecha';
  return new Intl.DateTimeFormat('es-PE',{day:'2-digit',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(`${value}T00:00:00Z`)).replace('.','');
}
function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character])); }

if (app) {
  new MutationObserver(scheduleEnhancement).observe(app,{childList:true,subtree:true});
  scheduleEnhancement();
}
