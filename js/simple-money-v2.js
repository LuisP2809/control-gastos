import * as db from './db.js';
import {
  availableInAccount,
  combinedMovements,
  currentMonth,
  externalOwners,
  money,
  monthlySavingsSeries,
  summary,
  today,
} from './calculations.js';

const app = document.querySelector('#app');
const navigation = document.querySelector('.bottom');
const modal = document.querySelector('#modal');
const modalBody = document.querySelector('#modalBody');
const modalClose = document.querySelector('#modalClose');
const toast = document.querySelector('#toast');
const themeButton = document.querySelector('#themeQuick');

const state = {
  page: 'home',
  registerMode: 'expense',
  movementFilter: 'all',
  movementSearch: '',
  data: null,
  rendering: false,
};

const PAGE_LABELS = {
  home: 'Resumen',
  moves: 'Movimientos',
  register: 'Registrar',
  money: 'Mi dinero',
  savings: 'Ahorro',
  settings: 'Ajustes',
};

bootstrap().catch(error => {
  console.error(error);
  if (app) app.innerHTML = `<section class="page simple-page"><article class="simple-empty"><span>!</span><h2>No se pudo iniciar la aplicación</h2><p>${escapeHtml(error.message || String(error))}</p><button class="btn" type="button" onclick="location.reload()">Reintentar</button></article></section>`;
});

async function bootstrap() {
  await db.initialize();
  await applyTheme();
  bindGlobalEvents();
  await render();
  registerServiceWorker();
  window.setTimeout(() => document.querySelector('#splash')?.classList.add('hide'), 550);
}

function bindGlobalEvents() {
  navigation?.addEventListener('click', event => {
    const button = event.target.closest('button[data-page]');
    if (!button) return;
    state.page = button.dataset.page;
    render();
  });

  modalClose?.addEventListener('click', () => modal?.close());
  modal?.addEventListener('click', event => {
    if (event.target === modal) modal.close();
  });

  themeButton?.addEventListener('click', async () => {
    const settings = await db.get('settings', 'main');
    const current = document.documentElement.classList.contains('dark') ? 'dark' : 'light';
    const next = current === 'dark' ? 'light' : 'dark';
    await db.put('settings', { ...settings, theme: next });
    await applyTheme();
  });

  app?.addEventListener('click', handleAppClick);
  app?.addEventListener('submit', handleAppSubmit);
  app?.addEventListener('input', handleAppInput);
  app?.addEventListener('change', handleAppInput);
}

async function loadData() {
  const [funds, transactions, allocations, budgets, categories, settings] = await Promise.all([
    db.all('funds'),
    db.all('transactions'),
    db.all('allocations'),
    db.all('budgets'),
    db.all('categories'),
    db.get('settings', 'main'),
  ]);
  return {
    funds,
    transactions,
    allocations,
    budgets,
    categories,
    settings,
    totals: summary(funds, transactions, allocations),
  };
}

async function render() {
  if (!app || state.rendering) return;
  state.rendering = true;
  try {
    state.data = await loadData();
    setActiveNavigation(state.page);
    app.innerHTML = renderPage(state.page, state.data);
    document.title = `${PAGE_LABELS[state.page] || 'Mi Control'} · Mi Control de gasto`;
    app.focus({ preventScroll: true });
  } finally {
    state.rendering = false;
  }
}

function renderPage(page, data) {
  if (page === 'moves') return renderMovements(data);
  if (page === 'register') return renderRegister(data);
  if (page === 'money') return renderMoney(data);
  if (page === 'savings') return renderSavings(data);
  if (page === 'settings') return renderSettings(data);
  return renderHome(data);
}

function renderHome(data) {
  const { totals } = data;
  const target = savingTarget(data.budgets, currentMonth());
  const targetPercent = target > 0 ? Math.min(100, Math.max(0, totals.savingThisMonth / target * 100)) : 0;
  const recent = combinedMovements(data.transactions, data.allocations).slice(0, 5);
  const needsSetup = totals.total === 0 && data.transactions.length === 0 && data.allocations.length === 0;

  return `<section class="page simple-page" data-page-ready="home">
    <header class="simple-pagehead">
      <div><span class="simple-eyebrow">Tu situación real</span><h2>Resumen</h2><p>Primero mira cuánto puedes gastar sin tocar lo separado.</p></div>
      <span class="simple-date">${formatDate(today())}</span>
    </header>

    ${needsSetup ? `<article class="setup-banner" data-testid="setup-banner">
      <span>👋</span><div><strong>Empieza registrando cuánto tienes hoy</strong><p>Indica tu saldo en Yape, efectivo y banco. Esto será tu punto de partida, no un ingreso.</p></div>
      <button type="button" class="btn" data-action="setup-balances">Configurar mi dinero actual</button>
    </article>` : ''}

    <article class="available-hero" data-testid="available-hero">
      <div class="available-copy"><small>Disponible real para gastar</small><strong data-testid="available-total">${money(totals.available)}</strong><p>${money(totals.total)} en tus cuentas − ${money(totals.saving)} de ahorro − ${money(totals.external)} de dinero ajeno</p></div>
      <div class="available-ring" style="--free:${distributionPercent(totals.available, totals.total)}%"><span>${distributionPercent(totals.available, totals.total).toFixed(0)}%</span><small>libre</small></div>
    </article>

    <div class="simple-kpi-grid">
      ${simpleKpi('💰', 'Dinero total', totals.total, 'Todo lo que tienes físicamente', 'total')}
      ${simpleKpi('🌱', 'Ahorro acumulado', totals.saving, `${money(totals.savingThisMonth)} separado este mes`, 'saving')}
      ${simpleKpi('🤝', 'Dinero ajeno', totals.external, 'Está contigo, pero no es tuyo', 'external')}
      ${simpleKpi(totals.net >= 0 ? '↗' : '↘', 'Balance del mes', totals.net, `${money(totals.income)} ingresos · ${money(totals.expense)} gastos`, totals.net >= 0 ? 'positive' : 'negative')}
    </div>

    <div class="simple-home-grid">
      <article class="simple-panel account-overview-panel">
        <header class="panel-title"><div><span class="simple-eyebrow">Dónde está</span><h3>Tu dinero por cuenta</h3></div><button type="button" class="text-button" data-go-page="money">Ver y ajustar</button></header>
        <div class="account-mini-list">${data.totals.accountRows.map(accountMiniRow).join('')}</div>
      </article>

      <article class="simple-panel saving-month-panel">
        <header class="panel-title"><div><span class="simple-eyebrow">Este mes</span><h3>Tu ahorro</h3></div><button type="button" class="text-button" data-go-page="savings">Abrir ahorro</button></header>
        <div class="saving-month-values"><div><small>Ahorrado</small><strong>${money(totals.savingThisMonth)}</strong></div><div><small>Objetivo mensual</small><strong>${target ? money(target) : 'Sin definir'}</strong></div></div>
        <div class="simple-progress"><i style="width:${targetPercent}%"></i></div>
        <p>${target ? `${targetPercent.toFixed(0)}% del objetivo mensual` : 'Define una cantidad que quieras separar este mes.'}</p>
        <button type="button" class="btn secondary full-button" data-action="contribute-saving">＋ Separar dinero para ahorro</button>
      </article>

      <article class="simple-panel recent-panel">
        <header class="panel-title"><div><span class="simple-eyebrow">Actividad</span><h3>Últimos movimientos</h3></div><button type="button" class="text-button" data-go-page="moves">Ver todos</button></header>
        ${recent.length ? `<div class="simple-movement-list">${recent.map(item => movementRow(item, data)).join('')}</div>` : emptyInline('Todavía no registraste movimientos.')}
      </article>

      <article class="simple-panel quick-panel">
        <header class="panel-title"><div><span class="simple-eyebrow">Acciones rápidas</span><h3>¿Qué quieres hacer?</h3></div></header>
        <div class="quick-grid">
          <button type="button" data-quick="expense"><span>−</span><strong>Registrar gasto</strong><small>Disminuye tu dinero</small></button>
          <button type="button" data-quick="income"><span>＋</span><strong>Registrar ingreso</strong><small>Aumenta tu dinero</small></button>
          <button type="button" data-quick="saving"><span>🌱</span><strong>Separar ahorro</strong><small>Reduce lo disponible</small></button>
          <button type="button" data-quick="external"><span>🤝</span><strong>Marcar dinero ajeno</strong><small>No cambia tu total</small></button>
        </div>
      </article>
    </div>
  </section>`;
}

function renderMoney(data) {
  const owners = externalOwners(data.allocations);
  return `<section class="page simple-page" data-page-ready="money">
    <header class="simple-pagehead action-head">
      <div><span class="simple-eyebrow">Ubicación del dinero</span><h2>Mi dinero</h2><p>Yape, efectivo y banco muestran cuánto tienes físicamente.</p></div>
      <button type="button" class="btn" data-action="setup-balances">Configurar saldos actuales</button>
    </header>

    <article class="money-formula-card">
      <div><small>Dinero total</small><strong data-testid="money-total">${money(data.totals.total)}</strong></div><span>−</span>
      <div><small>Ahorro</small><strong>${money(data.totals.saving)}</strong></div><span>−</span>
      <div><small>Dinero ajeno</small><strong>${money(data.totals.external)}</strong></div><span>=</span>
      <div class="formula-result"><small>Disponible real</small><strong>${money(data.totals.available)}</strong></div>
    </article>

    <div class="account-card-grid" data-testid="account-card-grid">
      ${data.totals.accountRows.map(accountCard).join('')}
    </div>

    <div class="simple-two-columns">
      <article class="simple-panel external-panel">
        <header class="panel-title"><div><span class="simple-eyebrow">No te pertenece</span><h3>Dinero ajeno</h3></div><button type="button" class="text-button" data-action="allocate-external">＋ Separar</button></header>
        <div class="external-total"><small>Total separado</small><strong>${money(data.totals.external)}</strong></div>
        ${owners.length ? `<div class="owner-list">${owners.map(owner => `<div><span>🤝</span><div><strong>${escapeHtml(owner.owner)}</strong><small>Saldo pendiente</small></div><b>${money(owner.amount)}</b></div>`).join('')}</div><button type="button" class="btn secondary full-button" data-action="return-external">Devolver dinero ajeno</button>` : emptyInline('No tienes dinero ajeno separado.')}
      </article>

      <article class="simple-panel help-panel">
        <span class="help-icon">✓</span><h3>Cómo se calcula</h3>
        <p>Registrar ahorro o dinero ajeno no crea dinero nuevo. Solo aparta una parte de lo que ya existe en una de tus cuentas.</p>
        <ul><li>Un ingreso aumenta el total.</li><li>Un gasto disminuye el total.</li><li>Una transferencia solo cambia de ubicación.</li><li>Una separación reduce el disponible.</li></ul>
      </article>
    </div>
  </section>`;
}

function renderSavings(data) {
  const month = currentMonth();
  const target = savingTarget(data.budgets, month);
  const saved = data.totals.savingThisMonth;
  const progress = target > 0 ? Math.min(100, Math.max(0, saved / target * 100)) : 0;
  const series = monthlySavingsSeries(data.allocations, 12);
  const max = Math.max(1, ...series.map(item => Math.max(0, item.value)));

  return `<section class="page simple-page" data-page-ready="savings">
    <header class="simple-pagehead action-head">
      <div><span class="simple-eyebrow">Ahorro simple</span><h2>Ahorro</h2><p>Cada aporte se acumula con lo ahorrado en meses anteriores.</p></div>
      <button type="button" class="btn" data-action="contribute-saving">＋ Ahorrar</button>
    </header>

    <article class="saving-hero">
      <div><small>Ahorro acumulado</small><strong data-testid="saving-total">${money(data.totals.saving)}</strong><p>Este dinero sigue en tus cuentas, pero está separado para no gastarlo.</p></div>
      <div class="saving-actions"><button type="button" class="btn secondary" data-action="withdraw-saving">Retirar del ahorro</button><button type="button" class="btn secondary" data-action="set-saving-target">Objetivo del mes</button></div>
    </article>

    <div class="simple-two-columns">
      <article class="simple-panel month-goal-card">
        <header class="panel-title"><div><span class="simple-eyebrow">${monthLabel(month)}</span><h3>Ahorro del mes</h3></div><b>${progress.toFixed(0)}%</b></header>
        <div class="month-goal-numbers"><div><small>Ahorrado</small><strong>${money(saved)}</strong></div><div><small>Objetivo</small><strong>${target ? money(target) : 'Sin definir'}</strong></div></div>
        <div class="simple-progress large"><i style="width:${progress}%"></i></div>
        <p>${target ? (saved >= target ? '¡Cumpliste el objetivo de este mes!' : `Te faltan ${money(Math.max(0, target - saved))}.`) : 'Define un objetivo mensual para medir tu avance.'}</p>
      </article>

      <article class="simple-panel saving-history-card">
        <header class="panel-title"><div><span class="simple-eyebrow">Acumulación</span><h3>Ahorro por mes</h3></div></header>
        ${series.length ? `<div class="saving-bars">${series.map(item => `<div class="saving-bar"><b>${money(item.value)}</b><span><i style="height:${Math.max(4, Math.max(0, item.value) / max * 100)}%"></i></span><small>${shortMonth(item.month)}</small></div>`).join('')}</div>` : emptyInline('Tus aportes mensuales aparecerán aquí.')}
      </article>
    </div>

    <article class="simple-panel saving-explanation"><span>🌱</span><div><h3>El ahorro no aumenta tu dinero total</h3><p>Cuando separas S/ 100, tu total se mantiene igual; el disponible disminuye S/ 100 y el ahorro acumulado aumenta S/ 100.</p></div></article>
  </section>`;
}

function renderRegister(data) {
  const modes = [
    ['expense', 'Gasto', '−'],
    ['income', 'Ingreso', '＋'],
    ['transfer', 'Transferir', '↔'],
    ['separate', 'Separar', '◇'],
  ];
  return `<section class="page simple-page" data-page-ready="register">
    <header class="simple-pagehead"><div><span class="simple-eyebrow">Movimiento nuevo</span><h2>Registrar</h2><p>Todo parte de una cuenta real: Yape, efectivo o banco.</p></div></header>
    <div class="register-layout">
      <article class="simple-panel register-main-card">
        <div class="simple-tabs" role="tablist">${modes.map(([id, label, icon]) => `<button type="button" role="tab" aria-selected="${state.registerMode === id}" class="${state.registerMode === id ? 'active' : ''}" data-register-mode="${id}"><span>${icon}</span>${label}</button>`).join('')}</div>
        ${registerForm(state.registerMode, data)}
      </article>
      <aside class="register-side">
        <article class="register-available-card"><small>Disponible real</small><strong>${money(data.totals.available)}</strong><p>Después de descontar ahorro y dinero ajeno.</p></article>
        <article class="simple-panel register-account-list"><h3>Disponible por cuenta</h3>${data.totals.accountRows.map(row => `<div><span>${row.icon} ${escapeHtml(row.name)}</span><strong>${money(row.available)}</strong></div>`).join('')}</article>
      </aside>
    </div>
  </section>`;
}

function registerForm(mode, data) {
  const accountOptions = data.totals.accountRows.map(row => `<option value="${escapeHtml(row.id)}">${escapeHtml(row.name)} · disponible ${money(row.available)}</option>`).join('');
  const physicalOptions = data.totals.accountRows.map(row => `<option value="${escapeHtml(row.id)}">${escapeHtml(row.name)} · saldo ${money(row.balance)}</option>`).join('');
  const expenseCategories = data.categories.filter(item => item.type === 'expense');
  const incomeCategories = data.categories.filter(item => item.type === 'income');

  if (mode === 'income') return `<form id="incomeForm" class="simple-form" data-form="income">
    <div class="form-intro tone-income"><span>＋</span><div><strong>Registrar un ingreso</strong><p>Aumentará el saldo de la cuenta seleccionada y tu disponible real.</p></div></div>
    <div class="simple-form-grid">
      ${fieldSelect('incomeAccount', '¿Dónde ingresó?', 'fund', physicalOptions)}
      ${fieldMoney('incomeAmount', 'Monto recibido', 'amount')}
      ${fieldSelect('incomeCategory', 'Origen del ingreso', 'category', incomeCategories.map(item => `<option>${escapeHtml(item.name)}</option>`).join(''))}
      ${fieldDate('incomeDate', 'Fecha', 'date')}
      ${fieldText('incomeDescription', 'Descripción', 'description', 'Ej. Sueldo de julio', true)}
    </div><button class="btn submit-button" type="submit">Guardar ingreso</button>
  </form>`;

  if (mode === 'transfer') return `<form id="transferForm" class="simple-form" data-form="transfer">
    <div class="form-intro tone-transfer"><span>↔</span><div><strong>Mover entre tus cuentas</strong><p>No cambia tu total ni tu disponible; solo cambia dónde está el dinero.</p></div></div>
    <div class="simple-form-grid">
      ${fieldSelect('transferFrom', 'Desde', 'from', accountOptions)}
      ${fieldSelect('transferTo', 'Hacia', 'to', physicalOptions)}
      ${fieldMoney('transferAmount', 'Monto', 'amount')}
      ${fieldDate('transferDate', 'Fecha', 'date')}
      ${fieldText('transferDescription', 'Descripción', 'description', 'Ej. Retiro de Yape a efectivo', true)}
    </div><button class="btn submit-button" type="submit">Guardar transferencia</button>
  </form>`;

  if (mode === 'separate') return `<form id="separateForm" class="simple-form" data-form="separate">
    <div class="form-intro tone-separate"><span>◇</span><div><strong>Separar dinero existente</strong><p>No se suma al total. Solo dejará de estar disponible para gastar.</p></div></div>
    <div class="separation-choice">
      <label><input type="radio" name="kind" value="saving" checked><span>🌱</span><div><strong>Ahorro</strong><small>Dinero tuyo que no quieres tocar</small></div></label>
      <label><input type="radio" name="kind" value="external"><span>🤝</span><div><strong>Dinero ajeno</strong><small>Dinero que tienes, pero no es tuyo</small></div></label>
    </div>
    <div class="simple-form-grid">
      ${fieldSelect('separateAccount', '¿Dónde está?', 'accountId', accountOptions)}
      ${fieldMoney('separateAmount', 'Monto a separar', 'amount')}
      <div class="field external-owner-field" hidden><label for="separateOwner">¿De quién es?</label><input id="separateOwner" name="owner" maxlength="60" placeholder="Ej. Mamá, empresa, amigo"></div>
      ${fieldDate('separateDate', 'Fecha', 'date')}
      ${fieldText('separateNote', 'Nota', 'note', 'Opcional', true)}
    </div><div class="separation-preview" data-separation-preview>El total se mantendrá en ${money(data.totals.total)}.</div><button class="btn submit-button" type="submit">Separar dinero</button>
  </form>`;

  return `<form id="expenseForm" class="simple-form" data-form="expense">
    <div class="form-intro tone-expense"><span>−</span><div><strong>Registrar un gasto</strong><p>Disminuirá el saldo de la cuenta y tu disponible real.</p></div></div>
    <div class="simple-form-grid">
      ${fieldSelect('expenseAccount', '¿De dónde salió?', 'fund', accountOptions)}
      ${fieldMoney('expenseAmount', 'Monto gastado', 'amount')}
      ${fieldSelect('expenseCategory', 'Categoría', 'category', expenseCategories.map(item => `<option>${escapeHtml(item.name)}</option>`).join(''))}
      ${fieldDate('expenseDate', 'Fecha', 'date')}
      ${fieldText('expenseDescription', 'Descripción', 'description', 'Ej. Almuerzo', true)}
    </div><button class="btn submit-button" type="submit">Guardar gasto</button>
  </form>`;
}

function renderMovements(data) {
  const allMovements = combinedMovements(data.transactions, data.allocations);
  const search = state.movementSearch.trim().toLocaleLowerCase('es');
  const filtered = allMovements.filter(item => {
    if (state.movementFilter !== 'all' && movementGroup(item.type) !== state.movementFilter) return false;
    if (!search) return true;
    return movementSearchText(item, data).toLocaleLowerCase('es').includes(search);
  });

  return `<section class="page simple-page" data-page-ready="moves">
    <header class="simple-pagehead"><div><span class="simple-eyebrow">Historial único</span><h2>Movimientos</h2><p>Ingresos, gastos, transferencias y dinero separado.</p></div><button type="button" class="btn secondary" data-action="export-csv">Exportar CSV</button></header>
    <article class="movement-toolbar simple-panel">
      <label class="movement-search"><span>⌕</span><input type="search" value="${escapeHtml(state.movementSearch)}" placeholder="Buscar movimiento..." aria-label="Buscar movimiento" data-movement-search></label>
      <div class="movement-filters">${[['all','Todos'],['cash','Ingresos y gastos'],['saving','Ahorro'],['external','Dinero ajeno']].map(([id,label]) => `<button type="button" class="${state.movementFilter===id?'active':''}" data-movement-filter="${id}">${label}</button>`).join('')}</div>
    </article>
    <article class="simple-panel movement-history-panel">${filtered.length ? `<div class="simple-movement-list full">${filtered.map(item => movementRow(item, data, true)).join('')}</div>` : emptyInline('No encontramos movimientos con esos filtros.')}</article>
  </section>`;
}

function renderSettings(data) {
  return `<section class="page simple-page" data-page-ready="settings">
    <header class="simple-pagehead"><div><span class="simple-eyebrow">Preferencias y respaldo</span><h2>Ajustes</h2><p>La información continúa guardada únicamente en este dispositivo.</p></div></header>
    <div class="settings-simple-grid">
      <article class="simple-panel">
        <header class="panel-title"><div><span class="simple-eyebrow">Apariencia</span><h3>Tema</h3></div></header>
        <div class="theme-options">${['auto','light','dark'].map(value => `<label><input type="radio" name="theme-setting" value="${value}" ${data.settings.theme===value?'checked':''}><span>${value==='auto'?'◐':value==='light'?'☀':'☾'}</span><strong>${value==='auto'?'Automático':value==='light'?'Claro':'Oscuro'}</strong></label>`).join('')}</div>
      </article>
      <article class="simple-panel">
        <header class="panel-title"><div><span class="simple-eyebrow">Presupuesto</span><h3>Límite mensual de gastos</h3></div></header>
        <form class="simple-form compact" data-form="settings-budget"><div class="field"><label for="monthlyLimit">Monto límite</label><input id="monthlyLimit" name="monthlyLimit" type="number" min="0" step="0.01" value="${Number(data.settings.monthlyLimit)||0}"></div><button class="btn" type="submit">Guardar límite</button></form>
      </article>
      <article class="simple-panel">
        <header class="panel-title"><div><span class="simple-eyebrow">Copia de seguridad</span><h3>Exportar o importar</h3></div></header>
        <p class="muted">La copia incluye cuentas, movimientos, ahorro y dinero ajeno de esta nueva versión.</p>
        <div class="settings-actions"><button type="button" class="btn secondary" data-action="export-json">Exportar copia JSON</button><label class="btn secondary file-button">Importar copia<input type="file" accept="application/json,.json" data-import-json></label><button type="button" class="btn secondary" data-action="export-csv">Exportar CSV</button></div>
      </article>
      <article class="simple-panel privacy-simple-card"><span>♢</span><div><h3>Datos privados y locales</h3><p>La aplicación no sube tus montos a GitHub. Cada navegador conserva su propia información.</p></div></article>
      <article class="simple-panel danger-simple-card">
        <header class="panel-title"><div><span class="simple-eyebrow">Zona de reinicio</span><h3>Empezar nuevamente</h3></div></header>
        <p>Elimina cuentas, movimientos, ahorro y dinero ajeno de este dispositivo.</p><button type="button" class="btn danger" data-action="reset-all">Limpiar todos los datos</button>
      </article>
      <article class="simple-panel version-card"><small>Versión</small><strong>Mi Control de gasto v2.0.0</strong><p>Lógica simplificada: cuentas reales, ahorro y dinero ajeno.</p><button type="button" class="btn secondary" data-action="update-app">Buscar actualización</button></article>
    </div>
  </section>`;
}

async function handleAppClick(event) {
  const pageButton = event.target.closest('[data-go-page]');
  if (pageButton) {
    state.page = pageButton.dataset.goPage;
    return render();
  }

  const modeButton = event.target.closest('[data-register-mode]');
  if (modeButton) {
    state.registerMode = modeButton.dataset.registerMode;
    return render();
  }

  const quickButton = event.target.closest('[data-quick]');
  if (quickButton) {
    const quick = quickButton.dataset.quick;
    state.page = 'register';
    state.registerMode = quick === 'saving' || quick === 'external' ? 'separate' : quick;
    await render();
    if (quick === 'external') {
      const externalRadio = app.querySelector('input[name="kind"][value="external"]');
      if (externalRadio) { externalRadio.checked = true; toggleExternalOwner(); }
    }
    return;
  }

  const filterButton = event.target.closest('[data-movement-filter]');
  if (filterButton) {
    state.movementFilter = filterButton.dataset.movementFilter;
    return render();
  }

  const action = event.target.closest('[data-action]')?.dataset.action;
  if (!action) return;
  if (action === 'setup-balances') return openBalanceSetup();
  if (action === 'contribute-saving') return openSavingContribution();
  if (action === 'withdraw-saving') return openSavingWithdrawal();
  if (action === 'set-saving-target') return openSavingTarget();
  if (action === 'allocate-external') return openExternalAllocation();
  if (action === 'return-external') return openExternalReturn();
  if (action === 'export-json') return exportJson();
  if (action === 'export-csv') return exportCsv();
  if (action === 'reset-all') return resetAllData();
  if (action === 'update-app') return updateApplication();
}

async function handleAppSubmit(event) {
  const form = event.target.closest('form[data-form]');
  if (!form) return;
  event.preventDefault();
  const type = form.dataset.form;
  if (type === 'expense') return saveExpense(form);
  if (type === 'income') return saveIncome(form);
  if (type === 'transfer') return saveTransfer(form);
  if (type === 'separate') return saveSeparation(form);
  if (type === 'settings-budget') return saveBudgetSetting(form);
}

function handleAppInput(event) {
  if (event.target.matches('[data-movement-search]')) {
    state.movementSearch = event.target.value;
    window.clearTimeout(handleAppInput.searchTimer);
    handleAppInput.searchTimer = window.setTimeout(updateMovementResults, 120);
  }
  if (event.target.matches('input[name="kind"]')) toggleExternalOwner();
  if (event.target.matches('[data-import-json]') && event.target.files?.[0]) importJson(event.target.files[0]);
  if (event.target.matches('input[name="theme-setting"]')) saveTheme(event.target.value);
}

function updateMovementResults() {
  if (state.page !== 'moves' || !state.data) return;
  const allMovements = combinedMovements(state.data.transactions, state.data.allocations);
  const search = state.movementSearch.trim().toLocaleLowerCase('es');
  const filtered = allMovements.filter(item => {
    if (state.movementFilter !== 'all' && movementGroup(item.type) !== state.movementFilter) return false;
    if (!search) return true;
    return movementSearchText(item, state.data).toLocaleLowerCase('es').includes(search);
  });
  const panel = app.querySelector('.movement-history-panel');
  if (panel) panel.innerHTML = filtered.length
    ? `<div class="simple-movement-list full">${filtered.map(item => movementRow(item, state.data, true)).join('')}</div>`
    : emptyInline('No encontramos movimientos con esos filtros.');
}

async function saveExpense(form) {
  const values = formValues(form);
  const amount = positiveAmount(values.amount, 'Escribe un monto de gasto válido.');
  const available = availableInAccount(values.fund, state.data.funds, state.data.transactions, state.data.allocations);
  if (amount > available + 0.0001) return alert(`En esa cuenta solo tienes ${money(available)} disponibles para gastar.`);
  await db.put('transactions', {
    type: 'expense', amount, fund: values.fund, category: values.category,
    description: values.description.trim() || values.category,
    date: values.date || today(), created: Date.now(),
  });
  showToast(`Gasto de ${money(amount)} registrado`);
  form.reset();
  await render();
}

async function saveIncome(form) {
  const values = formValues(form);
  const amount = positiveAmount(values.amount, 'Escribe un monto de ingreso válido.');
  await db.put('transactions', {
    type: 'income', amount, fund: values.fund, category: values.category,
    description: values.description.trim() || values.category,
    date: values.date || today(), created: Date.now(),
  });
  showToast(`Ingreso de ${money(amount)} registrado`);
  form.reset();
  await render();
}

async function saveTransfer(form) {
  const values = formValues(form);
  const amount = positiveAmount(values.amount, 'Escribe un monto de transferencia válido.');
  if (values.from === values.to) return alert('Selecciona dos cuentas diferentes.');
  const available = availableInAccount(values.from, state.data.funds, state.data.transactions, state.data.allocations);
  if (amount > available + 0.0001) return alert(`Solo puedes mover ${money(available)} desde esa cuenta sin tocar dinero separado.`);
  await db.put('transactions', {
    type: 'transfer', amount, from: values.from, to: values.to,
    description: values.description.trim() || 'Transferencia entre cuentas',
    date: values.date || today(), created: Date.now(),
  });
  showToast(`Transferencia de ${money(amount)} registrada`);
  form.reset();
  await render();
}

async function saveSeparation(form) {
  const values = formValues(form);
  const amount = positiveAmount(values.amount, 'Escribe un monto válido para separar.');
  const available = availableInAccount(values.accountId, state.data.funds, state.data.transactions, state.data.allocations);
  if (amount > available + 0.0001) return alert(`En esa cuenta solo hay ${money(available)} disponibles para separar.`);
  if (values.kind === 'external' && !values.owner.trim()) return alert('Escribe a quién pertenece el dinero.');
  await db.put('allocations', {
    kind: values.kind === 'external' ? 'external' : 'saving',
    action: 'allocate', amount, accountId: values.accountId,
    owner: values.kind === 'external' ? values.owner.trim() : '',
    note: values.note.trim(), date: values.date || today(), created: Date.now(),
  });
  showToast(values.kind === 'external' ? `${money(amount)} marcados como dinero ajeno` : `${money(amount)} agregados al ahorro`);
  form.reset();
  await render();
}

async function saveBudgetSetting(form) {
  const settings = await db.get('settings', 'main');
  const value = Math.max(0, Number(new FormData(form).get('monthlyLimit')) || 0);
  await db.put('settings', { ...settings, monthlyLimit: value });
  state.data.settings = { ...settings, monthlyLimit: value };
  showToast('Límite mensual actualizado');
}

function openBalanceSetup() {
  const rows = state.data.totals.accountRows;
  openModal(`<h2 id="modalTitle">Configurar mi dinero actual</h2>
    <p class="modal-lead">Indica cuánto tienes físicamente ahora. No se registrará como ingreso.</p>
    <form id="balanceSetupForm" class="simple-form modal-form">
      ${rows.map(row => `<div class="balance-setup-row"><span>${row.icon}</span><div><label for="balance-${escapeHtml(row.id)}">${escapeHtml(row.name)}</label><small>Actual: ${money(row.balance)} · separado: ${money(row.reserved)}</small></div><input id="balance-${escapeHtml(row.id)}" name="${escapeHtml(row.id)}" type="number" min="${Math.max(0,row.reserved)}" step="0.01" value="${Math.max(0,row.balance).toFixed(2)}" inputmode="decimal"></div>`).join('')}
      <div class="modal-note"><span>i</span><p>Si ya tienes movimientos, la app creará un ajuste neutral para que el saldo coincida con la realidad.</p></div>
      <button type="submit" class="btn submit-button">Guardar saldos actuales</button>
    </form>`);
  modalBody.querySelector('#balanceSetupForm').addEventListener('submit', saveCurrentBalances);
}

async function saveCurrentBalances(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const values = Object.fromEntries(new FormData(form));
  const freshData = await loadData();
  for (const row of freshData.totals.accountRows) {
    const desired = Number(values[row.id]);
    if (!Number.isFinite(desired) || desired < -0.0001) return alert(`El saldo de ${row.name} no es válido.`);
    if (desired + 0.0001 < row.reserved) return alert(`${row.name} tiene ${money(row.reserved)} separados. Su saldo no puede quedar por debajo de ese monto.`);
  }

  for (const row of freshData.totals.accountRows) {
    const desired = Math.max(0, Number(values[row.id]) || 0);
    const delta = desired - row.balance;
    if (Math.abs(delta) < 0.005) continue;
    const activity = freshData.transactions.some(item => item.fund === row.id || item.from === row.id || item.to === row.id);
    const separated = freshData.allocations.some(item => item.accountId === row.id);
    if (!activity && !separated) {
      const account = await db.get('funds', row.id);
      await db.put('funds', { ...account, initial: desired, updatedAt: Date.now() });
    } else {
      await db.put('transactions', {
        type: 'adjustment', amount: delta, fund: row.id,
        description: 'Ajuste de saldo actual', date: today(), created: Date.now(),
      });
    }
  }
  modal.close();
  showToast('Saldos actuales configurados');
  await render();
}

function openSavingContribution() {
  const options = state.data.totals.accountRows.filter(row => row.available > 0.005);
  if (!options.length) return alert('No tienes dinero disponible para separar como ahorro.');
  openModal(`<h2 id="modalTitle">Agregar al ahorro</h2><p class="modal-lead">El dinero seguirá en la cuenta elegida, pero dejará de estar disponible para gastos.</p>
    <form id="savingContributionForm" class="simple-form modal-form">
      ${fieldSelect('savingAccount', '¿Dónde está el dinero?', 'accountId', options.map(row => `<option value="${escapeHtml(row.id)}">${escapeHtml(row.name)} · ${money(row.available)} disponible</option>`).join(''))}
      ${fieldMoney('savingAmount', 'Monto a ahorrar', 'amount')}
      ${fieldDate('savingDate', 'Fecha', 'date')}
      ${fieldText('savingNote', 'Nota', 'note', 'Ej. Ahorro de sueldo', false)}
      <button type="submit" class="btn submit-button">Confirmar ahorro</button>
    </form>`);
  modalBody.querySelector('#savingContributionForm').addEventListener('submit', async event => {
    event.preventDefault();
    const values = formValues(event.currentTarget);
    const amount = positiveAmount(values.amount, 'Escribe un monto válido.');
    const fresh = await loadData();
    const available = availableInAccount(values.accountId, fresh.funds, fresh.transactions, fresh.allocations);
    if (amount > available + 0.0001) return alert(`Solo tienes ${money(available)} disponibles en esa cuenta.`);
    await db.put('allocations', { kind:'saving', action:'allocate', amount, accountId:values.accountId, note:values.note.trim(), date:values.date||today(), created:Date.now() });
    modal.close(); showToast(`${money(amount)} agregados al ahorro`); await render();
  });
}

function openSavingWithdrawal() {
  const options = state.data.totals.accountRows.filter(row => row.saving > 0.005);
  if (!options.length) return alert('Aún no tienes ahorro para retirar.');
  openModal(`<h2 id="modalTitle">Retirar del ahorro</h2><p class="modal-lead">El dinero volverá a estar disponible para gastar. Tu total no cambiará.</p>
    <form id="savingWithdrawalForm" class="simple-form modal-form">
      ${fieldSelect('savingWithdrawAccount', 'Cuenta donde está', 'accountId', options.map(row => `<option value="${escapeHtml(row.id)}">${escapeHtml(row.name)} · ${money(row.saving)} ahorrados</option>`).join(''))}
      ${fieldMoney('savingWithdrawAmount', 'Monto a liberar', 'amount')}
      ${fieldDate('savingWithdrawDate', 'Fecha', 'date')}
      ${fieldText('savingWithdrawNote', 'Motivo', 'note', 'Ej. Emergencia', false)}
      <button type="submit" class="btn danger submit-button">Retirar del ahorro</button>
    </form>`);
  modalBody.querySelector('#savingWithdrawalForm').addEventListener('submit', async event => {
    event.preventDefault();
    const values = formValues(event.currentTarget);
    const amount = positiveAmount(values.amount, 'Escribe un monto válido.');
    const fresh = await loadData();
    const account = fresh.totals.accountRows.find(row => row.id === values.accountId);
    if (!account || amount > account.saving + 0.0001) return alert(`Puedes retirar como máximo ${money(account?.saving || 0)}.`);
    if (!confirm(`¿Liberar ${money(amount)} del ahorro?`)) return;
    await db.put('allocations', { kind:'saving', action:'release', amount, accountId:values.accountId, note:values.note.trim(), date:values.date||today(), created:Date.now() });
    modal.close(); showToast(`${money(amount)} volvieron a estar disponibles`); await render();
  });
}

function openSavingTarget() {
  const month = currentMonth();
  const current = savingTarget(state.data.budgets, month);
  openModal(`<h2 id="modalTitle">Objetivo de ahorro del mes</h2><p class="modal-lead">Este objetivo sirve para medir tu avance; no mueve dinero automáticamente.</p>
    <form id="savingTargetForm" class="simple-form modal-form">
      <div class="field"><label for="savingTargetMonth">Mes</label><input id="savingTargetMonth" name="month" type="month" value="${month}" required></div>
      ${fieldMoney('savingTargetAmount', 'Cantidad que quieres ahorrar', 'amount', current)}
      <button type="submit" class="btn submit-button">Guardar objetivo</button>
    </form>`);
  const form = modalBody.querySelector('#savingTargetForm');
  form.elements.month.addEventListener('change', () => {
    form.elements.amount.value = savingTarget(state.data.budgets, form.elements.month.value) || '';
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const values = formValues(event.currentTarget);
    const amount = Math.max(0, Number(values.amount) || 0);
    await db.put('budgets', { id:`saving-target-${values.month}`, kind:'monthly-saving-target', month:values.month, amount, updatedAt:Date.now() });
    modal.close(); showToast('Objetivo mensual guardado'); await render();
  });
}

function openExternalAllocation() {
  const options = state.data.totals.accountRows.filter(row => row.available > 0.005);
  if (!options.length) return alert('No tienes dinero disponible que puedas marcar como ajeno.');
  openModal(`<h2 id="modalTitle">Separar dinero ajeno</h2><p class="modal-lead">Selecciona una parte del dinero que ya tienes. El total no aumentará.</p>
    <form id="externalAllocationForm" class="simple-form modal-form">
      ${fieldSelect('externalAccount', '¿Dónde está?', 'accountId', options.map(row => `<option value="${escapeHtml(row.id)}">${escapeHtml(row.name)} · ${money(row.available)} disponible</option>`).join(''))}
      ${fieldMoney('externalAmount', 'Monto ajeno', 'amount')}
      ${fieldText('externalOwner', '¿De quién es?', 'owner', 'Ej. Mamá, empresa, amigo', false, true)}
      ${fieldDate('externalDate', 'Fecha', 'date')}
      ${fieldText('externalNote', 'Nota', 'note', 'Opcional', false)}
      <button type="submit" class="btn submit-button">Separar dinero ajeno</button>
    </form>`);
  modalBody.querySelector('#externalAllocationForm').addEventListener('submit', async event => {
    event.preventDefault();
    const values = formValues(event.currentTarget);
    const amount = positiveAmount(values.amount, 'Escribe un monto válido.');
    if (!values.owner.trim()) return alert('Escribe a quién pertenece el dinero.');
    const fresh = await loadData();
    const available = availableInAccount(values.accountId, fresh.funds, fresh.transactions, fresh.allocations);
    if (amount > available + 0.0001) return alert(`Solo tienes ${money(available)} disponibles en esa cuenta.`);
    await db.put('allocations', { kind:'external', action:'allocate', amount, accountId:values.accountId, owner:values.owner.trim(), note:values.note.trim(), date:values.date||today(), created:Date.now() });
    modal.close(); showToast(`${money(amount)} separados como dinero ajeno`); await render();
  });
}

function openExternalReturn() {
  const options = externalAccountOwnerBalances(state.data.allocations, state.data.funds).filter(item => item.amount > 0.005);
  if (!options.length) return alert('No tienes dinero ajeno pendiente para devolver.');
  openModal(`<h2 id="modalTitle">Devolver dinero ajeno</h2><p class="modal-lead">Al devolverlo, bajarán el dinero total y el dinero ajeno por el mismo monto. Tu disponible real no cambiará.</p>
    <form id="externalReturnForm" class="simple-form modal-form">
      ${fieldSelect('externalReturnSource', 'Persona y cuenta', 'source', options.map(item => `<option value="${escapeHtml(`${item.accountId}|||${item.owner}`)}">${escapeHtml(item.owner)} · ${escapeHtml(item.accountName)} · ${money(item.amount)}</option>`).join(''))}
      ${fieldMoney('externalReturnAmount', 'Monto a devolver', 'amount')}
      ${fieldDate('externalReturnDate', 'Fecha', 'date')}
      ${fieldText('externalReturnNote', 'Nota', 'note', 'Opcional', false)}
      <button type="submit" class="btn danger submit-button">Confirmar devolución</button>
    </form>`);
  modalBody.querySelector('#externalReturnForm').addEventListener('submit', async event => {
    event.preventDefault();
    const values = formValues(event.currentTarget);
    const amount = positiveAmount(values.amount, 'Escribe un monto válido.');
    const [accountId, owner] = values.source.split('|||');
    const fresh = await loadData();
    const current = externalAccountOwnerBalances(fresh.allocations, fresh.funds).find(item => item.accountId === accountId && item.owner === owner);
    if (!current || amount > current.amount + 0.0001) return alert(`Puedes devolver como máximo ${money(current?.amount || 0)}.`);
    if (amount > (fresh.totals.bal[accountId] || 0) + 0.0001) return alert('La cuenta seleccionada ya no tiene suficiente saldo físico.');
    if (!confirm(`¿Confirmas que devolverás ${money(amount)} a ${owner}?`)) return;
    const stamp = Date.now();
    await db.put('allocations', { kind:'external', action:'release', amount, accountId, owner, note:values.note.trim(), date:values.date||today(), created:stamp });
    await db.put('transactions', { type:'expense', amount, fund:accountId, category:'Dinero ajeno devuelto', description:`Devolución a ${owner}`, date:values.date||today(), created:stamp+1, linkedExternalReturn:true });
    modal.close(); showToast(`${money(amount)} devueltos a ${owner}`); await render();
  });
}

async function saveTheme(theme) {
  const settings = await db.get('settings', 'main');
  await db.put('settings', { ...settings, theme });
  await applyTheme();
}

async function applyTheme() {
  const settings = await db.get('settings', 'main') || { theme:'auto' };
  const dark = settings.theme === 'dark' || (settings.theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
  document.querySelector('#themeColor')?.setAttribute('content', dark ? '#070b14' : '#f3f5fb');
  themeButton?.setAttribute('aria-pressed', String(dark));
}

async function exportJson() {
  const payload = await db.exportData();
  downloadFile('mi-control-gasto-copia-v2.json', JSON.stringify(payload, null, 2), 'application/json');
  showToast('Copia JSON exportada');
}

async function importJson(file) {
  try {
    const payload = JSON.parse(await file.text());
    if (!confirm('La importación reemplazará los datos actuales de este dispositivo. ¿Continuar?')) return;
    await db.importData(payload);
    showToast('Copia importada correctamente');
    state.page = 'home';
    await render();
  } catch (error) {
    alert(`No se pudo importar la copia: ${error.message || error}`);
  }
}

async function exportCsv() {
  const data = await loadData();
  const rows = [['Fecha','Tipo','Descripción','Cuenta','Monto','Persona']];
  const accountNames = Object.fromEntries(data.funds.map(item => [item.id,item.name]));
  for (const item of combinedMovements(data.transactions, data.allocations).reverse()) {
    rows.push([
      item.date,
      movementLabel(item.type),
      item.description || item.note || item.category || '',
      accountNames[item.fund || item.accountId || item.from] || '',
      Number(item.amount || 0).toFixed(2),
      item.owner || '',
    ]);
  }
  const csv = rows.map(row => row.map(value => `"${String(value).replaceAll('"','""')}"`).join(',')).join('\n');
  downloadFile('movimientos-mi-control.csv', `\ufeff${csv}`, 'text/csv;charset=utf-8');
  showToast('CSV exportado');
}

async function resetAllData() {
  if (!confirm('Se eliminarán todos los datos financieros de este dispositivo. ¿Continuar?')) return;
  if (!confirm('Esta acción no se puede deshacer. ¿Realmente deseas empezar desde cero?')) return;
  await db.resetAll();
  state.page = 'home';
  state.registerMode = 'expense';
  showToast('Datos limpiados. Puedes configurar tu dinero actual.');
  await render();
}

async function updateApplication() {
  try {
    const registration = await navigator.serviceWorker?.getRegistration();
    if (!registration) return showToast('La aplicación todavía no está instalada en caché.');
    await registration.update();
    if (registration.waiting) registration.waiting.postMessage({ type:'SKIP_WAITING' });
    showToast('Actualización comprobada');
  } catch (error) {
    alert(`No se pudo buscar la actualización: ${error.message || error}`);
  }
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  const register = () => navigator.serviceWorker.register('./sw.js').catch(error => console.warn('Service Worker:', error));
  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once:true });
}

function setActiveNavigation(page) {
  navigation?.querySelectorAll('button[data-page]').forEach(button => {
    const active = button.dataset.page === page;
    button.classList.toggle('active', active);
    button.toggleAttribute('aria-current', active);
    if (active) button.setAttribute('aria-current', 'page');
  });
}

function toggleExternalOwner() {
  const external = app.querySelector('input[name="kind"][value="external"]')?.checked;
  const ownerField = app.querySelector('.external-owner-field');
  if (!ownerField) return;
  ownerField.hidden = !external;
  ownerField.querySelector('input').required = Boolean(external);
}

function accountCard(row) {
  const reservedPercent = row.balance > 0 ? Math.min(100, Math.max(0, row.reserved / row.balance * 100)) : 0;
  return `<article class="account-card" data-testid="account-card">
    <header><span>${row.icon}</span><div><small>Cuenta</small><h3>${escapeHtml(row.name)}</h3></div><b>${money(row.balance)}</b></header>
    <div class="account-balance-main"><small>Disponible en esta cuenta</small><strong>${money(row.available)}</strong></div>
    <div class="account-reserved-track"><i style="width:${reservedPercent}%"></i></div>
    <div class="account-split"><div><span class="dot saving"></span><small>Ahorro</small><strong>${money(row.saving)}</strong></div><div><span class="dot external"></span><small>Ajeno</small><strong>${money(row.external)}</strong></div></div>
    <p>Saldo físico ${money(row.balance)} · separado ${money(row.reserved)}</p>
  </article>`;
}

function accountMiniRow(row) {
  return `<div class="account-mini-row"><span>${row.icon}</span><div><strong>${escapeHtml(row.name)}</strong><small>${money(row.reserved)} separados</small></div><b>${money(row.balance)}</b></div>`;
}

function simpleKpi(icon, label, value, detail, tone) {
  return `<article class="simple-kpi tone-${tone}"><span>${icon}</span><div><small>${label}</small><strong>${money(value)}</strong><p>${detail}</p></div></article>`;
}

function movementRow(item, data, detailed = false) {
  const info = movementInfo(item, data);
  return `<div class="simple-movement-row ${info.tone}"><span>${info.icon}</span><div><strong>${escapeHtml(info.title)}</strong><small>${escapeHtml(info.subtitle)}</small>${detailed ? `<em>${formatDate(item.date)}</em>` : ''}</div><b>${info.sign}${money(Math.abs(Number(item.amount)||0))}</b></div>`;
}

function movementInfo(item, data) {
  const accounts = Object.fromEntries(data.funds.map(account => [account.id, account.name]));
  if (item.type === 'income') return { icon:'＋', tone:'income', title:item.description || item.category || 'Ingreso', subtitle:`Ingresó a ${accounts[item.fund] || 'una cuenta'}`, sign:'+' };
  if (item.type === 'expense') return { icon:'−', tone:'expense', title:item.description || item.category || 'Gasto', subtitle:`Salió de ${accounts[item.fund] || 'una cuenta'}`, sign:'−' };
  if (item.type === 'transfer') return { icon:'↔', tone:'transfer', title:item.description || 'Transferencia', subtitle:`${accounts[item.from] || 'Cuenta'} → ${accounts[item.to] || 'Cuenta'}`, sign:'' };
  if (item.type === 'adjustment') return { icon:'≋', tone:'adjustment', title:item.description || 'Ajuste de saldo', subtitle:accounts[item.fund] || 'Cuenta', sign:Number(item.amount)>=0?'+':'−' };
  if (item.type === 'saving') return { icon:'🌱', tone:'saving', title:'Aporte al ahorro', subtitle:`Separado en ${accounts[item.accountId] || 'una cuenta'}`, sign:'' };
  if (item.type === 'saving-release') return { icon:'↩', tone:'saving', title:'Retiro del ahorro', subtitle:`Liberado en ${accounts[item.accountId] || 'una cuenta'}`, sign:'−' };
  if (item.type === 'external') return { icon:'🤝', tone:'external', title:`Dinero de ${item.owner || 'otra persona'}`, subtitle:`Separado en ${accounts[item.accountId] || 'una cuenta'}`, sign:'' };
  return { icon:'↩', tone:'external', title:`Devolución a ${item.owner || 'otra persona'}`, subtitle:`Liberado de ${accounts[item.accountId] || 'una cuenta'}`, sign:'−' };
}

function movementGroup(type) {
  if (['saving','saving-release'].includes(type)) return 'saving';
  if (['external','external-release'].includes(type)) return 'external';
  return 'cash';
}

function movementSearchText(item, data) {
  const info = movementInfo(item, data);
  return `${info.title} ${info.subtitle} ${item.owner || ''} ${item.category || ''}`;
}

function externalAccountOwnerBalances(allocations, funds) {
  const map = new Map();
  for (const item of allocations.filter(allocation => allocation.kind === 'external')) {
    const owner = String(item.owner || 'Sin nombre').trim() || 'Sin nombre';
    const key = `${item.accountId}|||${owner}`;
    const signed = (item.action === 'release' ? -1 : 1) * Number(item.amount || 0);
    map.set(key, (map.get(key) || 0) + signed);
  }
  const names = Object.fromEntries(funds.map(item => [item.id,item.name]));
  return [...map.entries()].map(([key,amount]) => {
    const [accountId, owner] = key.split('|||');
    return { accountId, owner, accountName:names[accountId] || 'Cuenta', amount };
  });
}

function savingTarget(budgets, month) {
  return Number(budgets.find(item => item.kind === 'monthly-saving-target' && item.month === month)?.amount) || 0;
}

function openModal(content) {
  if (!modal || !modalBody) return;
  modalBody.innerHTML = content;
  modal.showModal();
  window.setTimeout(() => modalBody.querySelector('input:not([type="hidden"]),select,button')?.focus(), 30);
}

function fieldSelect(id, label, name, options) {
  return `<div class="field"><label for="${id}">${label}</label><select id="${id}" name="${name}" required>${options}</select></div>`;
}

function fieldMoney(id, label, name, value = '') {
  return `<div class="field"><label for="${id}">${label}</label><div class="money-input"><span>S/</span><input id="${id}" name="${name}" type="number" min="0.01" step="0.01" inputmode="decimal" value="${value || ''}" required></div></div>`;
}

function fieldDate(id, label, name) {
  return `<div class="field"><label for="${id}">${label}</label><input id="${id}" name="${name}" type="date" value="${today()}" required></div>`;
}

function fieldText(id, label, name, placeholder, full = false, required = false) {
  return `<div class="field ${full ? 'full' : ''}"><label for="${id}">${label}</label><input id="${id}" name="${name}" maxlength="100" placeholder="${escapeHtml(placeholder)}" ${required ? 'required' : ''}></div>`;
}

function formValues(form) {
  return Object.fromEntries(new FormData(form));
}

function positiveAmount(value, message) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) throwUser(message);
  return amount;
}

function throwUser(message) {
  alert(message);
  throw new Error(message);
}

function emptyInline(message) {
  return `<div class="simple-inline-empty"><span>○</span><p>${escapeHtml(message)}</p></div>`;
}

function distributionPercent(value, total) {
  if (!(total > 0)) return 0;
  return Math.max(0, Math.min(100, Number(value || 0) / Number(total) * 100));
}

function movementLabel(type) {
  return ({ income:'Ingreso', expense:'Gasto', transfer:'Transferencia', adjustment:'Ajuste', saving:'Ahorro', 'saving-release':'Retiro de ahorro', external:'Dinero ajeno', 'external-release':'Devolución de dinero ajeno' })[type] || type;
}

function formatDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return '';
  return new Intl.DateTimeFormat('es-PE', { day:'2-digit', month:'short', year:'numeric', timeZone:'UTC' }).format(new Date(`${value}T00:00:00Z`)).replace('.', '');
}

function monthLabel(value) {
  if (!/^\d{4}-\d{2}$/.test(value || '')) return value;
  const [year,month] = value.split('-').map(Number);
  const label = new Intl.DateTimeFormat('es-PE',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(Date.UTC(year,month-1,1)));
  return label.charAt(0).toUpperCase()+label.slice(1);
}

function shortMonth(value) {
  return monthLabel(value).split(' ')[0].slice(0,3);
}

function downloadFile(filename, contents, type) {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([contents], { type }));
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

function showToast(message) {
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('show');
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove('show'), 2600);
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, character => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' })[character]);
}
