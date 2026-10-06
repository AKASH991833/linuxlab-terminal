const V="linuxlab-v1";
self.addEventListener("install",e=>{self.skipWaiting()});
self.addEventListener("activate",e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==V).map(x=>caches.delete(x)))).then(()=>self.clients.claim()))});
self.addEventListener("fetch",e=>{
  const u=new URL(e.request.url);if(e.request.method!=="GET"||u.origin!==location.origin)return;
  const heavy=u.pathname.includes("/root.part")||u.pathname.endsWith(".wasm")||u.pathname.endsWith("kernel.bin");
  if(heavy){e.respondWith(caches.open(V).then(async c=>{const m=await c.match(e.request,{ignoreSearch:false});if(m)return m;const r=await fetch(e.request);if(r.ok)c.put(e.request,r.clone());return r}))}
  else{e.respondWith(fetch(e.request).then(r=>{const cl=r.clone();caches.open(V).then(c=>c.put(e.request,cl));return r}).catch(()=>caches.match(e.request)))}
});
