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
  goals: 'Metas de ahorro',
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

function showToast(message) {
  const toast = document.querySelector('#toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2400);
}

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return null;
  const current = await navigator.serviceWorker.getRegistration();
  return current || navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'});
}

const serviceWorkerRegistration = document.readyState === 'complete'
  ? registerServiceWorker()
  : new Promise((resolve,reject) => {
      addEventListener('load',() => registerServiceWorker().then(resolve,reject),{once:true});
    });

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

document.addEventListener('click',async event => {
  const button = event.target.closest('button[data-update]');
  if (!button) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  button.disabled = true;
  const label = button.textContent;
  button.textContent = 'Buscando…';
  try {
    const registration = await serviceWorkerRegistration;
    if (!registration) throw new Error('El navegador no admite modo sin conexión.');
    await registration.update();
    if (registration.waiting) registration.waiting.postMessage({type:'SKIP_WAITING'});
    else showToast('Búsqueda de actualización completada');
  } catch (error) {
    alert(`No se pudo buscar la actualización: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    button.disabled = false;
    button.textContent = label;
  }
},true);