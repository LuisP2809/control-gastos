# Mis Finanzas – Control de Gastos

PWA privada, responsive y completamente local para controlar ingresos, gastos, transferencias, fondos protegidos y el presupuesto mensual en soles peruanos.

## Funciones

- Panel con dinero total, disponible, protegido, balance, límite y alertas.
- Historial filtrable y operaciones editables o eliminables.
- Fondos disponibles o “No tocar”, con validaciones de saldo.
- Análisis con gráficos Canvas que no requieren servicios externos.
- Tema claro/oscuro, copias JSON, exportación CSV y datos de ejemplo opcionales.
- IndexedDB, Service Worker e instalación PWA; no se envía información a ningún servidor.

## Uso local

Los módulos ES y el Service Worker requieren un servidor HTTP:

```bash
python3 -m http.server 8080
```

Abre `http://localhost:8080`. Para instalarla, usa **Instalar aplicación** en el menú del navegador compatible. La primera visita debe estar en línea; después, los recursos quedan disponibles sin conexión.

## Publicación en GitHub Pages

1. Sube los archivos a la rama `main` en la raíz del repositorio.
2. En **Settings → Pages**, selecciona **Deploy from a branch**.
3. Elige `main`, carpeta `/ (root)`, y guarda.
4. Visita `https://luisp2809.github.io/control-gastos/`.

Todas las URLs son relativas, por lo que la aplicación funciona dentro de `/control-gastos/`. El archivo `.nojekyll` evita transformaciones de Jekyll.

## Validación

Ejecuta la comprobación automatizada del manifest, las rutas para GitHub Pages, los iconos SVG y la ausencia de archivos binarios:

```bash
node tests/validate-pwa.mjs
```

## Privacidad y respaldos

Los datos viven solamente en IndexedDB del navegador. Borrar los datos del sitio también elimina la información. Usa **Ajustes → Exportar copia JSON** con regularidad y conserva el archivo en un lugar seguro. El repositorio no contiene datos financieros.

## Estructura

- `index.html`, `styles.css`: interfaz semántica y adaptable.
- `js/db.js`: persistencia, inicialización, versionado y respaldos.
- `js/calculations.js`: saldos y KPIs.
- `js/charts.js`: gráficos Canvas offline.
- `js/app.js`: vistas, formularios y acciones.
- `sw.js`, `manifest.webmanifest`, `icons/`: PWA, iconos SVG editables y caché offline.
