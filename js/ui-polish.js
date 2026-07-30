const app = document.querySelector('#app');

function polishInterface() {
  const title = document.querySelector('.pagehead h2');
  if (title?.textContent.trim() === 'Tu resumen') title.textContent = 'Resumen';

  document.querySelectorAll('.setting strong').forEach(element => {
    if (element.textContent.includes('Mis Finanzas v') || element.textContent.includes('Mi Control de gasto v')) {
      element.textContent = 'Mi Control de gasto v0.7.0';
    }
  });

  document.querySelectorAll('.dashboard-link').forEach(button => {
    const panelTitle = button.closest('.dashboard-panel')?.querySelector('h3')?.textContent.trim() || 'sección';
    button.setAttribute('aria-label',`Abrir ${panelTitle}`);
  });
}

if (app) {
  new MutationObserver(polishInterface).observe(app, { childList: true, subtree: true });
  polishInterface();
}