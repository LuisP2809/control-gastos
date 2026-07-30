const CACHE='mi-control-gasto-v20';
const CACHE_PREFIX='mi-control-gasto-';
const ASSETS=['./','./index.html','./styles.css','./dashboard-v2.css','./movements-v2.css','./funds-v2.css','./goals-v1.css','./register-v2.css','./analysis-v2.css','./settings-v2.css','./final-polish.css','./manifest.webmanifest','./js/app.js','./js/transaction-edit-fix.js','./js/ui-polish.js','./js/dashboard-v2.js','./js/movements-v2.js','./js/funds-v2.js','./js/goals-v1.js','./js/register-v2.js','./js/analysis-v2.js','./js/settings-v2.js','./js/final-polish.js','./js/db.js','./js/calculations.js','./js/charts.js','./icons/icon-192.svg','./icons/icon-512.svg','./icons/icon-maskable-512.svg'];

self.addEventListener('install',event=>event.waitUntil(
  caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting())
));

self.addEventListener('activate',event=>event.waitUntil(
  caches.keys().then(async keys=>{
    const outdated=keys.filter(key=>key.startsWith(CACHE_PREFIX)&&key!==CACHE);
    await Promise.all(outdated.map(key=>caches.delete(key)));
    if(outdated.length>0)await self.clients.claim();
  })
));

self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET'||new URL(request.url).origin!==self.location.origin)return;

  if(request.mode==='navigate'){
    event.respondWith(
      fetch(request)
        .then(response=>{
          const copy=response.clone();
          event.waitUntil(caches.open(CACHE).then(cache=>cache.put(request,copy)));
          return response;
        })
        .catch(()=>caches.match('./index.html'))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(cached=>{
      const network=fetch(request).then(response=>{
        if(response.ok){
          const copy=response.clone();
          event.waitUntil(caches.open(CACHE).then(cache=>cache.put(request,copy)));
        }
        return response;
      });
      if(cached){
        event.waitUntil(network.catch(()=>undefined));
        return cached;
      }
      return network;
    })
  );
});

self.addEventListener('message',event=>{
  if(event.data?.type==='SKIP_WAITING')self.skipWaiting();
});