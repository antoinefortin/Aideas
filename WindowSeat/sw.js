'use strict';
const CACHE='windowseat-offline-v2';
const FILES=['./','./index.html','./style.css','./app.js','./core.js','./world.js','./icon.svg'];
self.addEventListener('install',event=>event.waitUntil((async()=>{const cache=await caches.open(CACHE);await cache.addAll(FILES);await self.skipWaiting()})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{for(const name of await caches.keys())if(name.startsWith('windowseat-offline-')&&name!==CACHE)await caches.delete(name);await self.clients.claim()})()));
// Once prepared, all page assets are cache-only. Unknown requests never fall back to the network.
self.addEventListener('fetch',event=>{if(event.request.method!=='GET')return;event.respondWith((async()=>{const cache=await caches.open(CACHE);const hit=await cache.match(event.request,{ignoreSearch:true});if(hit)return hit;if(event.request.mode==='navigate'&&new URL(event.request.url).pathname.startsWith(new URL(self.registration.scope).pathname))return (await cache.match('./index.html'))||Response.error();return new Response('Not bundled for offline use',{status:503,headers:{'Content-Type':'text/plain'}})})())});
self.addEventListener('message',event=>{if(event.data==='CHECK_OFFLINE')event.waitUntil((async()=>{const cache=await caches.open(CACHE);const checks=await Promise.all(FILES.map(f=>cache.match(new URL(f,self.registration.scope).href)));event.ports[0]?.postMessage({ready:checks.every(Boolean),files:FILES.length,version:CACHE})})())});
