import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { recordingFilename } from '../naming.js';
test('filename uses page title, site and local timestamp, stripping unsafe characters', () => {
  assert.equal(recordingFilename(' A: great / song? ', 'https://www.example.com/watch', new Date(2026, 10, 11, 9, 2, 3)), 'Tabtone/A great song — example.com — 2026-11-11 09-02-03.mp3');
  assert.match(recordingFilename('', 'bad url'), /^Tabtone\/Untitled recording — .*\.mp3$/);
  assert.ok(recordingFilename('x'.repeat(500), 'https://example.com').length < 200);
});
test('bundled encoder produces a real MP3 from stereo PCM', async () => {
  const messages = [];
  const scope = { Blob, self: { postMessage: data => messages.push(data) } };
  vm.createContext(scope);
  scope.importScripts = path => vm.runInContext(fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'), scope);
  vm.runInContext(fs.readFileSync(new URL('../encoder-worker.js', import.meta.url), 'utf8'), scope);
  scope.self.onmessage({ data: { type: 'init', sampleRate: 44100 } });
  assert.equal(messages[0].type, 'ready');
  for (let n = 0; n < 345; n++) {
    const samples = Float32Array.from({ length: 128 }, (_, i) => .3 * Math.sin(2 * Math.PI * 440 * (n * 128 + i) / 44100));
    scope.self.onmessage({ data: { type: 'samples', channels: [samples, samples] } });
  }
  scope.self.onmessage({ data: { type: 'finish' } });
  const output = messages.at(-1);
  assert.equal(output.type, 'finished');
  assert.equal(output.blob.type, 'audio/mpeg');
  const bytes = new Uint8Array(await output.blob.arrayBuffer());
  assert.ok(bytes.length > 20000);
  assert.equal(bytes[0], 255);
  assert.equal(bytes[1] & 224, 224);
});
