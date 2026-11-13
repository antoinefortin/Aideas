const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
test('offline worker serves every bundled asset without a network fallback',async()=>{
 const handlers={},entries=new Map(),base='https://example.test/Aideas/WindowSeat/';
 const cache={async addAll(files){for(const f of files){const file=f==='./'?'index.html':f.slice(2);assert.ok(fs.existsSync(require('node:path').join(__dirname,'..',file)));entries.set(new URL(f,base).href,new Response(fs.readFileSync(require('node:path').join(__dirname,'..',file))))}},async match(req){const u=new URL(typeof req==='string'?req:req.url,base);u.search='';return entries.get(u.href)?.clone()}};
 const caches={async open(){return cache},async keys(){return ['unrelated-site-cache','windowseat-offline-v0']},async delete(name){assert.equal(name,'windowseat-offline-v0')}};
 let networkCalls=0;
 const self={registration:{scope:base},clients:{async claim(){}},async skipWaiting(){},addEventListener(name,handler){handlers[name]=handler}};
 vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname,'..','sw.js'),'utf8'),{self,caches,URL,Response,fetch(){networkCalls++;throw Error('Network forbidden')}});
 let task;handlers.install({waitUntil(p){task=p}});await task;handlers.activate({waitUntil(p){task=p}});await task;
 for(const url of [base,base+'index.html',base+'style.css',base+'app.js',base+'core.js',base+'world.js',base+'icon.svg',base+'?offline=1']){let response;handlers.fetch({request:{url,method:'GET',mode:'navigate'},respondWith(p){response=p}});assert.equal((await response).status,200)}
 let response;handlers.fetch({request:{url:'https://example.test/not-bundled.json',method:'GET',mode:'cors'},respondWith(p){response=p}});assert.equal((await response).status,503);assert.equal(networkCalls,0);
 let result;handlers.message({data:'CHECK_OFFLINE',ports:[{postMessage(r){result=r}}],waitUntil(p){task=p}});await task;assert.equal(result.ready,true);assert.equal(result.files,7);
 entries.delete(base+'world.js');handlers.message({data:'CHECK_OFFLINE',ports:[{postMessage(r){result=r}}],waitUntil(p){task=p}});await task;assert.equal(result.ready,false);
});
