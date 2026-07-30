import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { extname, join } from 'node:path';

const root = new URL('../', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('manifest.webmanifest', root), 'utf8'));

assert.equal(manifest.id, './', 'La PWA debe conservar un identificador estable');
assert.equal(manifest.start_url, './', 'start_url debe ser relativo');
assert.equal(manifest.scope, './', 'scope debe ser relativo');
assert.equal(manifest.display, 'standalone');
assert.equal(manifest.lang, 'es-PE');
assert.equal(manifest.prefer_related_applications, false);
assert.ok(manifest.categories.includes('finance'));
assert.equal(manifest.icons.length, 3);

for (const icon of manifest.icons) {
  assert.match(icon.src, /^\.\/icons\/.+\.svg$/);
  assert.equal(icon.type, 'image/svg+xml');
  assert.ok(icon.purpose === 'any' || icon.purpose === 'maskable');

  const svg = await readFile(new URL(icon.src.slice(2), root), 'utf8');
  assert.match(svg, /^<svg[\s>]/);
  assert.match(svg, new RegExp(`width="${icon.sizes.split('x')[0]}"`));
  assert.match(svg, new RegExp(`height="${icon.sizes.split('x')[1]}"`));
}

const referencedFiles = ['index.html', 'manifest.webmanifest', 'sw.js'];
for (const file of referencedFiles) {
  const contents = await readFile(new URL(file, root), 'utf8');
  assert.doesNotMatch(contents, /\.(?:png|jpe?g|ico|zip)\b/i);
  assert.doesNotMatch(contents, /(?:href|src)="\//i, `${file} contiene una ruta absoluta`);
}

const html = await readFile(new URL('index.html', root), 'utf8');
assert.doesNotMatch(html, /<dialog[^>]*>\s*<form/i, 'El diálogo no debe envolver otros formularios');
assert.match(html, /interactive-widget=resizes-content/, 'El viewport debe adaptarse al teclado móvil');
assert.match(html, /apple-mobile-web-app-capable/, 'Debe incluir metadatos para instalación en iPhone');
assert.match(html, /mobile-web-app-capable/, 'Debe incluir metadatos para instalación móvil');
assert.match(html, /aria-current="page"/, 'La navegación inicial debe indicar la sección activa');
assert.match(html, /dashboard-v2\.css/, 'La página debe cargar los estilos del nuevo resumen');
assert.match(html, /js\/dashboard-v2\.js/, 'La página debe cargar el módulo del nuevo resumen');
assert.match(html, /movements-v2\.css/, 'La página debe cargar los estilos del historial moderno');
assert.match(html, /js\/movements-v2\.js/, 'La página debe cargar el módulo del historial moderno');
assert.match(html, /funds-v2\.css/, 'La página debe cargar los estilos modernos de fondos');
assert.match(html, /js\/funds-v2\.js/, 'La página debe cargar el módulo moderno de fondos');
assert.match(html, /goals-v1\.css/, 'La página debe cargar los estilos de metas');
assert.match(html, /js\/goals-v1\.js/, 'La página debe cargar el módulo de metas');
assert.match(html, /data-page="goals"/, 'La navegación debe incluir metas de ahorro');
assert.match(html, /register-v2\.css/, 'La página debe cargar los estilos modernos de registro');
assert.match(html, /js\/register-v2\.js/, 'La página debe cargar el módulo moderno de registro');
assert.match(html, /analysis-v2\.css/, 'La página debe cargar los estilos modernos de análisis');
assert.match(html, /js\/analysis-v2\.js/, 'La página debe cargar el módulo moderno de análisis');
assert.match(html, /settings-v2\.css/, 'La página debe cargar los estilos modernos de ajustes');
assert.match(html, /js\/settings-v2\.js/, 'La página debe cargar el módulo moderno de ajustes');
assert.match(html, /final-polish\.css/, 'La página debe cargar los ajustes finales móviles');
assert.match(html, /js\/final-polish\.js/, 'La página debe cargar la sincronización accesible final');

const dashboard = await readFile(new URL('js/dashboard-v2.js', root), 'utf8');
assert.match(dashboard, /data-dashboard-v2="ready"/);
assert.match(dashboard, /summary-kpis/);
assert.match(dashboard, /summary-panels/);

const movements = await readFile(new URL('js/movements-v2.js', root), 'utf8');
assert.match(movements, /data-movements-v2="ready"/);
assert.match(movements, /movement-filter-grid/);
assert.match(movements, /groupedMovements/);
assert.match(movements, /data-detail/);

const funds = await readFile(new URL('js/funds-v2.js', root), 'utf8');
assert.match(funds, /data-funds-v2="ready"/);
assert.match(funds, /fund-stat-grid/);
assert.match(funds, /fund-card-grid/);
assert.match(funds, /data-editfund/);
assert.match(funds, /data-delfund/);

const goals = await readFile(new URL('js/goals-v1.js', root), 'utf8');
assert.match(goals, /data-goals-v1="ready"/);
assert.match(goals, /kind:GOAL_KIND/);
assert.match(goals, /reserveKind:'goal'/);
assert.match(goals, /goalAction:'contribution'/);
assert.match(goals, /goalAction:'withdrawal'/);
assert.match(goals, /data-new-goal/);
assert.match(goals, /data-contribute-goal/);
assert.match(goals, /data-withdraw-goal/);
assert.match(goals, /Disponible real/);

const register = await readFile(new URL('js/register-v2.js', root), 'utf8');
assert.match(register, /data-register-v2="ready"/);
assert.match(register, /id="transactionForm"/);
assert.match(register, /data-quick-amount/);
assert.match(register, /data-register-preview/);
assert.match(register, /name="from"/);
assert.match(register, /name="to"/);

const analysis = await readFile(new URL('js/analysis-v2.js', root), 'utf8');
assert.match(analysis, /data-analysis-v2="ready"/);
assert.match(analysis, /analysis-kpis/);
assert.match(analysis, /analysis-panels/);
assert.match(analysis, /previousRange\(range\)/);
assert.match(analysis, /fundsAt\(funds, transactions, range\.end\)/);
assert.match(analysis, /id="analysisRange"/);
assert.match(analysis, /id="analysisStart"/);
assert.match(analysis, /id="analysisEnd"/);

const settings = await readFile(new URL('js/settings-v2.js', root), 'utf8');
assert.match(settings, /data-settings-v2="ready"/);
assert.match(settings, /id="settingsForm"/);
assert.match(settings, /name="monthlyLimit"/);
assert.match(settings, /name="warning"/);
assert.match(settings, /name="critical"/);
assert.match(settings, /name="theme"/);
assert.match(settings, /id="importFile"/);
assert.match(settings, /data-export/);
assert.match(settings, /data-csv/);
assert.match(settings, /data-reset/);

const calculations = await readFile(new URL('js/calculations.js', root), 'utf8');
assert.match(calculations, /isGoalFund/);
assert.match(calculations, /goalMoney/);
assert.match(calculations, /available:total-reservedMoney/);
assert.match(calculations, /!isGoalFund\(f\)/, 'Las metas no deben mezclarse con el protegido general');

const finalPolish = await readFile(new URL('js/final-polish.js', root), 'utf8');
assert.match(finalPolish, /goals: 'Metas de ahorro'/);
assert.match(finalPolish, /aria-current/);
assert.match(finalPolish, /aria-labelledby/);
assert.match(finalPolish, /themeColor/);
assert.match(finalPolish, /registerServiceWorker/);
const finalStyles = await readFile(new URL('final-polish.css', root), 'utf8');
assert.match(finalStyles, /font-size:16px/, 'Los campos móviles deben evitar zoom automático');
assert.match(finalStyles, /\.bottom \.primary\{order:0\}/, 'Registrar debe conservar su posición en escritorio');

const uiPolish = await readFile(new URL('js/ui-polish.js', root), 'utf8');
assert.match(uiPolish, /Mi Control de gasto v1\.1\.0/);
assert.match(uiPolish, /text !== VERSION_LABEL/, 'La versión no debe provocar un ciclo de renderizado');

const serviceWorker = await readFile(new URL('sw.js', root), 'utf8');
assert.match(serviceWorker, /mi-control-gasto-v19/);
assert.match(serviceWorker, /request\.mode==='navigate'/);
assert.match(serviceWorker, /self\.location\.origin/);
assert.match(serviceWorker, /outdated\.length>0/, 'La primera instalación no debe recargar la página actual');
assert.match(serviceWorker, /dashboard-v2\.css/);
assert.match(serviceWorker, /js\/dashboard-v2\.js/);
assert.match(serviceWorker, /movements-v2\.css/);
assert.match(serviceWorker, /js\/movements-v2\.js/);
assert.match(serviceWorker, /funds-v2\.css/);
assert.match(serviceWorker, /js\/funds-v2\.js/);
assert.match(serviceWorker, /goals-v1\.css/);
assert.match(serviceWorker, /js\/goals-v1\.js/);
assert.match(serviceWorker, /register-v2\.css/);
assert.match(serviceWorker, /js\/register-v2\.js/);
assert.match(serviceWorker, /analysis-v2\.css/);
assert.match(serviceWorker, /js\/analysis-v2\.js/);
assert.match(serviceWorker, /settings-v2\.css/);
assert.match(serviceWorker, /js\/settings-v2\.js/);
assert.match(serviceWorker, /final-polish\.css/);
assert.match(serviceWorker, /js\/final-polish\.js/);

const app = await readFile(new URL('js/app.js', root), 'utf8');
assert.doesNotMatch(app, /toISOString\s*\(/, 'Las fechas de la aplicación no deben depender de UTC');
assert.match(app, /fund\.protected\s*\|\|\s*!fund\.spendable/);
assert.match(app, /warning\s*>=\s*critical/);
assert.match(app, /previousRange\(rangeValue\)/, 'Análisis debe comparar períodos de igual duración');
assert.match(app, /fundsAt\(d\.funds,d\.txs,rangeValue\.end\)/, 'El gráfico de fondos debe usar el cierre del período');

async function assertTextOnly(directory = '.') {
  const entries = await readdir(new URL(`${directory}/`, root), { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === '.git') continue;
    const relative = join(directory, entry.name);
    if (entry.isDirectory()) await assertTextOnly(relative);
    else {
      assert.ok(!['.png', '.jpg', '.jpeg', '.ico', '.zip'].includes(extname(entry.name).toLowerCase()));
      const contents = await readFile(new URL(relative, root));
      assert.ok(!contents.includes(0), `${relative} parece binario`);
    }
  }
}

await assertTextOnly();
console.log('Validación PWA completada: versión 1.1.0, metas de ahorro, disponible real y caché offline correctos.');