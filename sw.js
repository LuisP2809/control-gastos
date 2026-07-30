const CACHE='mi-control-gasto-v12';
const ASSETS=['./','./index.html','./styles.css','./dashboard-v2.css','./manifest.webmanifest','./js/app.js','./js/transaction-edit-fix.js','./js/ui-polish.js','./js/dashboard-v2.js','./js/db.js','./js/calculations.js','./js/charts.js','./icons/icon-192.svg','./icons/icon-512.svg','./icons/icon-maskable-512.svg'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{if(event.request.method!=='GET')return;event.respondWith(fetch(event.request).then(response=>{const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy));return response}).catch(()=>caches.match(event.request).then(response=>response||caches.match('./index.html'))))});
self.addEventListener('message',event=>{if(event.data?.type==='SKIP_WAITING')self.skipWaiting()});
