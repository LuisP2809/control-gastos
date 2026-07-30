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
console.log('Validación PWA completada: rutas relativas, SVG y archivos de texto correctos.');
