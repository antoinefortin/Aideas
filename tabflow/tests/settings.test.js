import test from 'node:test';
import assert from 'node:assert/strict';
import { normalize,defaults,presets,frequencies } from '../settings.js';
test('neutral settings preserve unity gain and independent bands',()=>{
  const a=normalize(defaults),b=normalize(defaults);a.bands[0]=9;
  assert.equal(b.bands[0],0);assert.equal(b.volume/100,1);assert.equal(b.bypass,false);
});
test('persisted values cannot exceed supported ranges or inject NaN',()=>{
  assert.deepEqual(normalize({volume:999,bands:[-99,99,'bad'],bass:-4,clarity:NaN,space:100,mono:'false'}),{volume:400,bands:[-12,12,0,0,0,0],bass:0,clarity:0,space:60,mono:false,night:false,bypass:false});
});
test('all presets have valid gains for every EQ frequency',()=>{
  for(const bands of Object.values(presets)){assert.equal(bands.length,frequencies.length);assert.deepEqual(normalize({bands}).bands,bands);}
});
