import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { frequencies, normalize } from '../settings.js';
test('audio routing, updates, bypass and independent tab cleanup',async()=>{
  let listener;const contexts=[],tracks=[];
  const param=()=>({value:0,setTargetAtTime(v){this.value=v;}});
  const node=()=>({connections:[],connect(other){this.connections.push(other);},gain:param(),frequency:param(),Q:param(),delayTime:param(),threshold:param(),ratio:param(),knee:param(),attack:param(),release:param()});
  class Context{
    constructor(){this.nodes=[];this.currentTime=0;this.destination={};contexts.push(this);}
    make(){const n=node();this.nodes.push(n);return n;}
    createGain(){return this.make();}createBiquadFilter(){return this.make();}createMediaStreamSource(){return this.make();}createDelay(){return this.make();}createDynamicsCompressor(){return this.make();}
    async resume(){}async close(){this.closed=true;}
  }
  const scope={frequencies,normalize,AudioContext:Context,chrome:{runtime:{onMessage:{addListener(fn){listener=fn;}},sendMessage:async()=>({})}},navigator:{mediaDevices:{getUserMedia:async()=>{const track={stop(){this.stopped=true;}};tracks.push(track);return {getTracks:()=>[track],getAudioTracks:()=>[track]};}}}};
  vm.createContext(scope);vm.runInContext(fs.readFileSync(new URL('../engine.js',import.meta.url),'utf8').replace(/^import .*;\n/,''),scope);
  const send=data=>new Promise(resolve=>listener({target:'engine',...data},{},resolve));
  assert.equal((await send({type:'start',tabId:1,streamId:'one',settings:{volume:250,bands:[5],space:40}})).active,true);
  const c=contexts[0];const volume=c.nodes.at(-2),compressor=c.nodes.at(-1);
  assert.equal(volume.gain.value,2.5);assert.ok(volume.connections.includes(compressor));assert.ok(compressor.connections.includes(c.destination));
  assert.equal(c.nodes[2].gain.value,5);
  await send({type:'update',tabId:1,settings:{volume:400,bands:[12],bypass:true}});
  assert.equal(volume.gain.value,1);assert.equal(c.nodes[2].gain.value,0);
  await send({type:'start',tabId:2,streamId:'two',settings:{volume:80}});
  await send({type:'stop',tabId:1});assert.equal(c.closed,true);assert.equal(tracks[0].stopped,true);
  assert.equal((await send({type:'status',tabId:2})).active,true);assert.equal(contexts[1].closed,undefined);
  await tracks[1].onended();assert.equal((await send({type:'status',tabId:2})).active,false);
});
