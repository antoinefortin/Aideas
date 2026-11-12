let phase = 'idle', stream, context, source, capture, silent, worker, filename, latest;
const notify = data => chrome.runtime.sendMessage({ target: 'background', ...data });
async function cleanup() {
  if (capture) { capture.port.onmessage = null; capture.disconnect(); }
  source?.disconnect(); silent?.disconnect();
  stream?.getTracks().forEach(track => track.stop());
  if (context && context.state !== 'closed') await context.close();
  capture = source = silent = context = stream = null;
}
async function start(message) {
  phase = 'starting'; filename = message.filename;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: message.streamId } }, video: false });
    context = new AudioContext({ sampleRate: 44100 });
    await context.audioWorklet.addModule('capture-worklet.js');
    worker = new Worker('encoder-worker.js');
    await new Promise((resolve, reject) => {
      worker.onerror = event => reject(new Error(event.message));
      worker.onmessage = ({ data }) => data.type === 'ready' ? resolve() : reject(new Error(data.error));
      worker.postMessage({ type: 'init', sampleRate: context.sampleRate });
    });
    worker.onmessage = async ({ data }) => {
      if (data.type === 'finished') {
        worker.terminate(); worker = null;
        if (latest) URL.revokeObjectURL(latest.url);
        latest = { url: URL.createObjectURL(data.blob), filename };
        phase = 'idle';
        await notify({ type: 'save', ...latest });
      } else if (data.type === 'error') {
        await cleanup(); worker?.terminate(); worker = null; phase = 'idle';
        await notify({ type: 'error', error: data.error });
      }
    };
    source = context.createMediaStreamSource(stream);
    source.connect(context.destination); // Preserve normal tab playback during capture.
    capture = new AudioWorkletNode(context, 'tabtone-capture');
    capture.port.onmessage = ({ data }) => worker?.postMessage({ type: 'samples', channels: data });
    silent = context.createGain(); silent.gain.value = 0;
    source.connect(capture); capture.connect(silent); silent.connect(context.destination);
    await context.resume();
    phase = 'recording';
    stream.getAudioTracks()[0].onended = () => { if (phase === 'recording') stop(); };
    return { ok: true };
  } catch (error) { await cleanup(); worker?.terminate(); worker = null; phase = 'idle'; throw error; }
}
async function stop() {
  if (phase !== 'recording') return { ok: true };
  phase = 'finishing';
  await notify({ type: 'finishing' });
  // Close the worklet port before flushing so no samples arrive after finish.
  await cleanup();
  worker.postMessage({ type: 'finish' });
  return { ok: true };
}
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message.target !== 'recorder') return;
  (async () => {
    if (message.type === 'status') return { phase };
    if (message.type === 'start') return start(message);
    if (message.type === 'stop') return stop();
    if (message.type === 'retry') return latest ? notify({ type: 'save', ...latest }) : { error: 'No recording is available to retry. Start a new recording from the toolbar.' };
    return { ok: true };
  })().then(respond, error => respond({ error: error.message }));
  return true;
});
