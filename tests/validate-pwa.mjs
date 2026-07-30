import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { extname, join } from 'node:path';

const root = new URL('../', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('manifest.webmanifest', root), 'utf8'));

assert.equal(manifest.start_url, './', 'start_url debe ser relativo');
assert.equal(manifest.scope, './', 'scope debe ser relativo');
assert.equal(manifest.display, 'standalone');
assert.equal(manifest.icons.length, 3);

for (const icon of manifest.icons) {
  assert.match(icon.src, /^\.\/icons\/.+\.svg$/);
  assert.equal(icon.type, 'image/svg+xml');

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
assert.match(html, /dashboard-v2\.css/, 'La página debe cargar los estilos del nuevo resumen');
assert.match(html, /js\/dashboard-v2\.js/, 'La página debe cargar el módulo del nuevo resumen');
assert.match(html, /movements-v2\.css/, 'La página debe cargar los estilos del historial moderno');
assert.match(html, /js\/movements-v2\.js/, 'La página debe cargar el módulo del historial moderno');
assert.match(html, /funds-v2\.css/, 'La página debe cargar los estilos modernos de fondos');
assert.match(html, /js\/funds-v2\.js/, 'La página debe cargar el módulo moderno de fondos');

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

const serviceWorker = await readFile(new URL('sw.js', root), 'utf8');
assert.match(serviceWorker, /mi-control-gasto-v14/);
assert.match(serviceWorker, /dashboard-v2\.css/);
assert.match(serviceWorker, /js\/dashboard-v2\.js/);
assert.match(serviceWorker, /movements-v2\.css/);
assert.match(serviceWorker, /js\/movements-v2\.js/);
assert.match(serviceWorker, /funds-v2\.css/);
assert.match(serviceWorker, /js\/funds-v2\.js/);

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
console.log('Validación PWA completada: rutas, dashboard, movimientos, fondos responsive, SVG y archivos de texto correctos.');