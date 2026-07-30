import * as db from './db.js';
import { money, summary } from './calculations.js';

const app = document.querySelector('#app');
let enhancing = false;
let scheduled = false;

function scheduleEnhancement() {
  if (scheduled) return;
  scheduled = true;
  queueMicrotask(async () => {
    scheduled = false;
    await enhanceSettings();
  });
}

async function enhanceSettings() {
  if (!app || enhancing) return;
  const page = app.querySelector('.page');
  const title = page?.querySelector('.pagehead h2')?.textContent.trim();
  if (!page || title !== 'Ajustes' || page.dataset.settingsV2 === 'ready' || page.dataset.settingsV2 === 'loading') return;

  page.dataset.settingsV2 = 'loading';
  enhancing = true;
  try {
    const originalImport = page.querySelector('#importFile');
    const [settings, funds, transactions] = await Promise.all([
      db.get('settings','main'),
      db.all('funds'),
      db.all('transactions'),
    ]);
    if (!page.isConnected) return;

    const totals = summary(funds, transactions);
    const template = document.createElement('template');
    template.innerHTML = renderSettings(settings, funds, transactions, totals).trim();
    const next = template.content.firstElementChild;
    if (!next) throw new Error('No se pudo crear la estructura visual de Ajustes.');
    const placeholder = next.querySelector('#importFile');
    if (originalImport && placeholder) {
      originalImport.className = 'sr';
      originalImport.setAttribute('accept','application/json');
      placeholder.replaceWith(originalImport);
    }
    page.replaceWith(next);
    bindSettings(next, totals.expense);
  } catch (error) {
    if (page.isConnected) delete page.dataset.settingsV2;
    console.error('No se pudo construir la pantalla de ajustes.', error);
  } finally {
    enhancing = false;
  }
}

function renderSettings(settings, funds, transactions, totals) {
  const monthlyLimit = Math.max(0, Number(settings?.monthlyLimit) || 0);
  const warning = clamp(Number(settings?.warning) || 70, 1, 99);
  const critical = clamp(Number(settings?.critical) || 90, 1, 100);
  const theme = ['auto','light','dark'].includes(settings?.theme) ? settings.theme : 'auto';
  const usedPct = monthlyLimit > 0 ? totals.expense / monthlyLimit * 100 : 0;
  const remaining = monthlyLimit - totals.expense;

  return `<section class="page settings-v2" data-settings-v2="ready">
    <header class="settings-header">
      <div><h2>Ajustes</h2><p>Personaliza tu presupuesto y administra tus datos locales.</p></div>
      <span class="settings-local">♢ Todo se guarda en este dispositivo</span>
    </header>

    <div class="settings-stats">
      ${stat('◎','Presupuesto mensual',money(monthlyLimit),'Límite general configurado','budget')}
      ${stat('↘','Gastado este mes',money(totals.expense),`${Math.min(usedPct,999).toFixed(0)}% del presupuesto`,'spent')}
      ${stat('◷','Primera alerta',`${warning}%`,'Aviso preventivo','warning')}
      ${stat('!','Alerta crítica',`${critical}%`,`${funds.length} fondos · ${transactions.length} movimientos`,'critical')}
    </div>

    <div class="settings-layout">
      <form id="settingsForm" class="settings-main">
        <article class="settings-card">
          <header class="settings-card-head">
            <div class="settings-card-title"><span>◎</span><div><h3>Presupuesto y alertas</h3><p>Define cuánto planeas gastar y cuándo quieres recibir avisos.</p></div></div>
          </header>
          <div class="settings-fields">
            <div class="settings-field full"><label for="settingsLimit">Límite mensual general</label><input id="settingsLimit" name="monthlyLimit" type="number" min="0" step="10" inputmode="decimal" value="${monthlyLimit}"></div>
            <div class="settings-field"><label for="settingsWarning">Primera advertencia (%)</label><input id="settingsWarning" name="warning" type="number" min="1" max="99" value="${warning}"></div>
            <div class="settings-field"><label for="settingsCritical">Advertencia crítica (%)</label><input id="settingsCritical" name="critical" type="number" min="1" max="100" value="${critical}"></div>
            <div class="settings-field full"><label for="settingsCurrency">Moneda</label><select id="settingsCurrency" disabled><option>Sol peruano (PEN)</option></select></div>
          </div>
          <div class="budget-preview" data-budget-preview>
            <div class="budget-preview-top"><span>Uso actual del presupuesto</span><strong data-budget-summary>${money(totals.expense)} de ${money(monthlyLimit)}</strong></div>
            <div class="budget-track"><i data-budget-fill style="width:${Math.min(Math.max(usedPct,0),100)}%"></i><span class="budget-marker" data-warning-marker data-label="Alerta" style="left:${warning}%"></span><span class="budget-marker" data-critical-marker data-label="Crítica" style="left:${critical}%"></span></div>
            <div class="budget-caption"><span data-budget-used>${Math.min(usedPct,999).toFixed(0)}% utilizado</span><span data-budget-remaining>${remaining >= 0 ? `${money(remaining)} disponibles` : `${money(Math.abs(remaining))} excedidos`}</span></div>
            <p class="settings-validation muted" data-settings-validation>La primera advertencia debe ser menor que la crítica.</p>
          </div>
        </article>

        <article class="settings-card">
          <header class="settings-card-head">
            <div class="settings-card-title"><span>◐</span><div><h3>Apariencia</h3><p>Elige cómo quieres ver la aplicación al abrirla.</p></div></div>
          </header>
          <div class="theme-options" role="radiogroup" aria-label="Tema de la aplicación">
            ${themeOption('auto','Automático','Sigue el tema del dispositivo',theme)}
            ${themeOption('light','Claro','Fondo luminoso y limpio',theme)}
            ${themeOption('dark','Oscuro','Menor brillo y mayor contraste',theme)}
          </div>
        </article>

        <button type="submit" class="btn settings-save">Guardar ajustes</button>
      </form>

      <aside class="settings-side">
        <article class="settings-card">
          <header class="settings-card-head"><div class="settings-card-title"><span>⇩</span><div><h3>Copias y exportación</h3><p>Protege tu historial o llévalo a Excel.</p></div></div></header>
          <div class="settings-actions">
            ${actionButton('data-export','⇩','Exportar copia JSON','Incluye fondos, movimientos y configuración')}
            <label class="settings-action settings-import"><span>⇧</span><span><strong>Importar copia JSON</strong><small>Reemplaza la información actual tras confirmar</small></span><span>›</span><input class="sr" id="importFile" type="file" accept="application/json"></label>
            ${actionButton('data-csv','▤','Exportar movimientos CSV','Compatible con Excel y Power BI')}
          </div>
        </article>

        <article class="settings-card">
          <header class="settings-card-head"><div class="settings-card-title"><span>⚙</span><div><h3>Aplicación</h3><p>Mantenimiento y versión instalada.</p></div></div></header>
          <div class="settings-version"><div><strong>Mi Control de gasto v0.7.0</strong><p>Los datos locales se conservan al actualizar.</p></div><button type="button" class="btn secondary" data-update>Buscar actualización</button></div>
          <div class="settings-actions" style="margin-top:14px">${actionButton('data-demo','＋','Cargar datos de ejemplo','Añade registros para explorar los gráficos')}</div>
        </article>

        <article class="settings-card settings-privacy"><span>♢</span><div><h3>Privacidad local</h3><p>IndexedDB guarda tus datos solo en este dispositivo. No hay cuentas, servidores externos ni rastreadores.</p></div></article>

        <article class="settings-card settings-danger">
          <header class="settings-card-head"><div class="settings-card-title"><span>!</span><div><h3>Zona delicada</h3><p>Esta acción requiere dos confirmaciones y no se puede deshacer.</p></div></div></header>
          <div class="settings-actions">${actionButton('data-reset','×','Restablecer todos los datos','Elimina fondos, movimientos y ajustes','danger')}</div>
        </article>
      </aside>
    </div>
  </section>`;
}

function bindSettings(root, currentExpense) {
  const form = root.querySelector('#settingsForm');
  if (!form) return;
  const update = () => updateBudgetPreview(form, currentExpense);
  form.addEventListener('input', update);
  form.addEventListener('change', update);
  update();
}

function updateBudgetPreview(form, currentExpense) {
  const limit = Math.max(0, Number(form.elements.monthlyLimit.value) || 0);
  const warning = clamp(Number(form.elements.warning.value) || 0, 0, 100);
  const critical = clamp(Number(form.elements.critical.value) || 0, 0, 100);
  const pct = limit > 0 ? currentExpense / limit * 100 : 0;
  const remaining = limit - currentExpense;
  const root = form.closest('.settings-v2');
  if (!root) return;

  root.querySelector('[data-budget-fill]').style.width = `${Math.min(Math.max(pct,0),100)}%`;
  root.querySelector('[data-warning-marker]').style.left = `${warning}%`;
  root.querySelector('[data-critical-marker]').style.left = `${critical}%`;
  root.querySelector('[data-budget-summary]').textContent = `${money(currentExpense)} de ${money(limit)}`;
  root.querySelector('[data-budget-used]').textContent = `${Math.min(pct,999).toFixed(0)}% utilizado`;
  root.querySelector('[data-budget-remaining]').textContent = remaining >= 0 ? `${money(remaining)} disponibles` : `${money(Math.abs(remaining))} excedidos`;
  root.querySelector('[data-stat="budget"] strong').textContent = money(limit);
  root.querySelector('[data-stat="warning"] strong').textContent = `${warning}%`;
  root.querySelector('[data-stat="critical"] strong').textContent = `${critical}%`;

  const validation = root.querySelector('[data-settings-validation]');
  const valid = warning < critical;
  validation.textContent = valid ? 'Las alertas están ordenadas correctamente.' : 'La primera advertencia debe ser menor que la crítica.';
  validation.style.color = valid ? 'var(--muted)' : 'var(--danger)';
}

function stat(icon, label, value, detail, key) {
  return `<article class="settings-stat" data-stat="${key}"><div class="settings-stat-top"><small>${label}</small><span class="settings-stat-icon">${icon}</span></div><strong>${value}</strong><p>${detail}</p></article>`;
}

function themeOption(value, label, description, selected) {
  return `<label class="theme-option" data-theme="${value}"><input type="radio" name="theme" value="${value}" ${selected === value ? 'checked' : ''}><span class="theme-option-body"><span class="theme-swatch"><i></i><b></b></span><span><strong>${label}</strong><small>${description}</small></span></span></label>`;
}

function actionButton(attribute, icon, label, description, extraClass='') {
  return `<button type="button" class="settings-action ${extraClass}" ${attribute}><span>${icon}</span><span><strong>${label}</strong><small>${description}</small></span><span>›</span></button>`;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number(value) || 0));
}

if (app) {
  new MutationObserver(scheduleEnhancement).observe(app,{childList:true,subtree:true});
  document.querySelector('.bottom')?.addEventListener('click', event => {
    if (event.target.closest('[data-page="settings"]')) setTimeout(scheduleEnhancement,0);
  });
  scheduleEnhancement();
}
