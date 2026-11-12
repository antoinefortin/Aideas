importScripts('vendor/lame.min.js');
let encoder, chunks;
self.onmessage = ({ data }) => {
  try {
    if (data.type === 'init') {
      encoder = new lamejs.Mp3Encoder(2, data.sampleRate, 192);
      chunks = [];
      self.postMessage({ type: 'ready' });
    }
    if (data.type === 'samples') {
      const pcm = data.channels.map(channel => Int16Array.from(channel, sample => Math.round(Math.max(-1, Math.min(1, sample)) * (sample < 0 ? 32768 : 32767))));
      const bytes = encoder.encodeBuffer(pcm[0], pcm[1]);
      if (bytes.length) chunks.push(new Uint8Array(bytes));
    }
    if (data.type === 'finish') {
      const bytes = encoder.flush();
      if (bytes.length) chunks.push(new Uint8Array(bytes));
      self.postMessage({ type: 'finished', blob: new Blob(chunks, { type: 'audio/mpeg' }) });
      chunks = [];
    }
  } catch (error) { self.postMessage({ type: 'error', error: error.message }); }
};
