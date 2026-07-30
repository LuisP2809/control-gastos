const app = document.querySelector('#app');
const navigation = document.querySelector('.bottom');
const themeButton = document.querySelector('#themeQuick');
const themeColor = document.querySelector('#themeColor');
const modal = document.querySelector('#modal');

const pageNames = {
  home: 'Resumen',
  moves: 'Movimientos',
  register: 'Registrar',
  funds: 'Fondos',
  analysis: 'Análisis',
  settings: 'Ajustes',
};

let scheduled = false;

function scheduleChromeSync() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    syncChrome();
  });
}

function syncChrome() {
  const heading = app?.querySelector('h2');
  const activeButton = navigation?.querySelector('button[data-page].active');
  const pageTitle = pageNames[activeButton?.dataset.page] || heading?.textContent.trim() || 'Mi Control de gasto';
  if (heading) {
    heading.id = 'page-title';
    app.setAttribute('aria-labelledby', heading.id);
  }
  document.title = `${pageTitle} · Mi Control de gasto`;

  navigation?.querySelectorAll('button[data-page]').forEach(button => {
    button.type = 'button';
    const active = button.classList.contains('active');
    button.toggleAttribute('aria-current', active);
    if (active) button.setAttribute('aria-current', 'page');
    const label = pageNames[button.dataset.page] || button.textContent.trim();
    if (!button.hasAttribute('aria-label')) button.setAttribute('aria-label', label);
  });

  const dark = document.documentElement.classList.contains('dark');
  if (themeButton) {
    themeButton.type = 'button';
    themeButton.setAttribute('aria-pressed', String(dark));
    themeButton.title = dark ? 'Usando tema oscuro' : 'Usando tema claro';
  }
  if (themeColor) themeColor.content = dark ? '#090d18' : '#f3f5fb';

  if (modal?.open) {
    modal.setAttribute('aria-modal', 'true');
  } else {
    modal?.removeAttribute('aria-modal');
  }
}

if (app && navigation) {
  new MutationObserver(scheduleChromeSync).observe(app, { childList: true, subtree: true });
  new MutationObserver(scheduleChromeSync).observe(navigation, { attributes: true, subtree: true, attributeFilter: ['class'] });
  new MutationObserver(scheduleChromeSync).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  navigation.addEventListener('click', scheduleChromeSync);
  themeButton?.addEventListener('click', scheduleChromeSync);
  modal?.addEventListener('close', scheduleChromeSync);
  modal?.addEventListener('cancel', scheduleChromeSync);
  addEventListener('pageshow', scheduleChromeSync);
  scheduleChromeSync();
}
