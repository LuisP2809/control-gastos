const app = document.querySelector('#app');
const VERSION_LABEL = 'Mi Control de gasto v1.1.1';

function polishInterface() {
  const title = document.querySelector('.pagehead h2');
  if (title?.textContent.trim() === 'Tu resumen') title.textContent = 'Resumen';

  document.querySelectorAll('strong').forEach(element => {
    const text = element.textContent.trim();
    const isVersion = text.includes('Mis Finanzas v') || text.includes('Mi Control de gasto v');
    if (isVersion && text !== VERSION_LABEL) element.textContent = VERSION_LABEL;
  });

  document.querySelectorAll('.dashboard-link').forEach(button => {
    const panelTitle = button.closest('.dashboard-panel')?.querySelector('h3')?.textContent.trim() || 'sección';
    const label = `Abrir ${panelTitle}`;
    if (button.getAttribute('aria-label') !== label) button.setAttribute('aria-label',label);
  });
}

if (app) {
  new MutationObserver(polishInterface).observe(app, { childList: true, subtree: true });
  polishInterface();
}