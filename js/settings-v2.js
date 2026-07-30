const app = document.querySelector('#app');
let scheduled = false;

function scheduleEnhancement() {
  if (scheduled) return;
  scheduled = true;
  queueMicrotask(() => {
    scheduled = false;
    enhanceSettings();
  });
}

function enhanceSettings() {
  if (!app) return false;
  const page = app.querySelector('.page');
  const title = page?.querySelector('.pagehead h2')?.textContent.trim();
  if (!page || title !== 'Ajustes' || page.dataset.settingsV2 === 'ready') return false;

  const originalForm = page.querySelector('#settingsForm');
  if (!originalForm) return false;
  const originalImport = page.querySelector('#importFile');
  const monthlyLimit = Math.max(0, Number(originalForm.elements.monthlyLimit?.value) || 0);
  const warning = clamp(Number(originalForm.elements.warning?.value) || 70, 1, 99);
  const critical = clamp(Number(originalForm.elements.critical?.value) || 90, 1, 100);
  const theme = ['auto','light','dark'].includes(originalForm.elements.theme?.value) ? originalForm.elements.theme.value : 'auto';

  const template = document.createElement('template');
  template.innerHTML = renderSettings({ monthlyLimit, warning, critical, theme }).trim();
  const next = template.content.firstElementChild;
  if (!next) return false;

  const placeholder = next.querySelector('#importFile');
  if (originalImport && placeholder) {
    originalImport.className = 'sr';
    originalImport.setAttribute('accept','application/json');
    placeholder.replaceWith(originalImport);
  }

  page.replaceWith(next);
  bindSettings(next);
  return true;
}

function waitForSettings(attempt = 0) {
  if (enhanceSettings()) return;
  if (attempt < 40) setTimeout(() => waitForSettings(attempt + 1), 25);
}

function renderSettings({ monthlyLimit, warning, critical, theme }) {
  return `<section class="page settings-v2" data-settings-v2="ready">
    <header class="settings-header">
      <div><h2>Ajustes</h2><p>Personaliza tu presupuesto y administra tus datos locales.</p></div>
      <span class="settings-local">♢ Todo se guarda en este dispositivo</span>
    </header>

    <div class="settings-stats">
      ${stat('◎','Presupuesto mensual',money(monthlyLimit),'Límite general configurado','budget')}
      ${stat('◷','Primera alerta',`${warning}%`,'Aviso preventivo','warning')}
      ${stat('!','Alerta crítica',`${critical}%`,'Aviso antes de superar el límite','critical')}
      ${stat('S/','Moneda','PEN','Sol peruano','currency')}
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
            <div class="budget-preview-top"><span>Configuración de alertas</span><strong data-budget-summary>${money(monthlyLimit)} al mes</strong></div>
            <div class="budget-track"><i data-budget-fill style="width:${warning}%"></i><span class="budget-marker" data-warning-marker data-label="Alerta" style="left:${warning}%"></span><span class="budget-marker" data-critical-marker data-label="Crítica" style="left:${critical}%"></span></div>
            <div class="budget-caption"><span data-budget-used>Aviso al ${warning}%</span><span data-budget-remaining>Crítica al ${critical}%</span></div>
            <p class="settings-validation muted" data-settings-validation>Las alertas están ordenadas correctamente.</p>
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

function bindSettings(root) {
  const form = root.querySelector('#settingsForm');
  if (!form) return;
  const update = () => updateBudgetPreview(form);
  form.addEventListener('input', update);
  form.addEventListener('change', update);
  update();
}

function updateBudgetPreview(form) {
  const limit = Math.max(0, Number(form.elements.monthlyLimit.value) || 0);
  const warning = clamp(Number(form.elements.warning.value) || 0, 0, 100);
  const critical = clamp(Number(form.elements.critical.value) || 0, 0, 100);
  const root = form.closest('.settings-v2');
  if (!root) return;

  root.querySelector('[data-budget-fill]').style.width = `${warning}%`;
  root.querySelector('[data-warning-marker]').style.left = `${warning}%`;
  root.querySelector('[data-critical-marker]').style.left = `${critical}%`;
  root.querySelector('[data-budget-summary]').textContent = `${money(limit)} al mes`;
  root.querySelector('[data-budget-used]').textContent = `Aviso al ${warning}%`;
  root.querySelector('[data-budget-remaining]').textContent = `Crítica al ${critical}%`;
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

function money(value) {
  return new Intl.NumberFormat('es-PE',{style:'currency',currency:'PEN',minimumFractionDigits:2}).format(Number(value)||0).replace('PEN','S/');
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number(value) || 0));
}

if (app) {
  new MutationObserver(scheduleEnhancement).observe(app,{childList:true,subtree:true});
  document.querySelector('.bottom')?.addEventListener('click', event => {
    if (event.target.closest('[data-page="settings"]')) setTimeout(() => waitForSettings(), 0);
  });
  scheduleEnhancement();
}
