const V="linuxlab-v2";
self.addEventListener("install",()=>self.skipWaiting());
self.addEventListener("activate",e=>e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x.startsWith("linuxlab-")&&x!==V).map(x=>caches.delete(x)))).then(()=>self.clients.claim())));
self.addEventListener("fetch",e=>{
 const u=new URL(e.request.url);if(e.request.method!=="GET"||u.origin!==location.origin)return;
 e.respondWith((async()=>{
  const c=await caches.open(V),range=e.request.headers.get("Range");
  if(range){
   const full=await c.match(u.href);
   if(full&&full.status===200){
    const buf=await full.arrayBuffer(),m=/^bytes=(\d+)-(\d*)$/.exec(range);
    if(m){const start=+m[1],end=Math.min(m[2]?+m[2]:buf.byteLength-1,buf.byteLength-1);
     if(start>=buf.byteLength)return new Response(null,{status:416});
     return new Response(buf.slice(start,end+1),{status:206,headers:{"Content-Type":"application/octet-stream","Content-Range":`bytes ${start}-${end}/${buf.byteLength}`,"Content-Length":end-start+1,"Accept-Ranges":"bytes"}});
    }
   }
   const key=new Request(u.href+"&llrange="+encodeURIComponent(range));
   const hit=await c.match(key);if(hit)return new Response(await hit.arrayBuffer(),{status:206,headers:hit.headers});
   const r=await fetch(e.request);
   if(r.status===206){const h=new Headers(r.headers);h.set("X-LL-Partial","1");const stored=new Response(await r.clone().arrayBuffer(),{status:200,headers:h});try{await c.put(key,stored)}catch(err){return new Response(String(err),{status:507})}return r}
   return r;
  }
  const heavy=/\.(wasm|bin|sqsh)$/.test(u.pathname);
  if(heavy){const hit=await c.match(e.request);if(hit)return hit;const r=await fetch(e.request);if(r.ok)await c.put(e.request,r.clone());return r}
  try{const r=await fetch(e.request);if(r.ok)await c.put(e.request,r.clone());return r}catch(err){const hit=await c.match(e.request);if(hit)return hit;throw err}
 })());
});
