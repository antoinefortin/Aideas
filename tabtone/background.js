import { recordingFilename } from './naming.js';
let busy = false;
const downloads = new Map();
async function badge(text, title, color = '#eb465b') {
  await Promise.all([chrome.action.setBadgeText({ text }), chrome.action.setBadgeBackgroundColor({ color }), chrome.action.setTitle({ title })]);
}
async function ensureOffscreen() {
  const contexts = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
  if (!contexts.length) await chrome.offscreen.createDocument({ url: 'offscreen.html', reasons: ['USER_MEDIA', 'BLOBS'], justification: 'Capture tab audio and encode a local MP3 download.' });
}
chrome.action.onClicked.addListener(async tab => {
  if (busy) return;
  busy = true;
  try {
    await ensureOffscreen();
    const state = await chrome.runtime.sendMessage({ target: 'recorder', type: 'status' });
    if (state.phase === 'recording') {
      await badge('…', 'Finishing your MP3', '#7367f0');
      const result = await chrome.runtime.sendMessage({ target: 'recorder', type: 'stop' });
      if (result.error) throw new Error(result.error);
    } else if (state.phase === 'idle') {
      if (!/^https?:|^file:/.test(tab.url || '')) throw new Error('Open a regular website with audio, then click Tabtone again.');
      const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tab.id });
      const filename = recordingFilename(tab.title, tab.url);
      const result = await chrome.runtime.sendMessage({ target: 'recorder', type: 'start', streamId, filename });
      if (result.error) throw new Error(result.error);
      await badge('REC', `Recording: ${tab.title || 'this tab'} — click to stop & save MP3`);
    }
  } catch (error) { await showError(error.message); }
  finally { busy = false; }
});
async function showError(message) {
  await chrome.storage.local.set({ lastError: message });
  await badge('!', message, '#da8b22');
  await chrome.runtime.openOptionsPage();
}
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message.target !== 'background') return;
  (async () => {
    if (message.type === 'save') {
      try {
        const id = await chrome.downloads.download({ url: message.url, filename: message.filename, saveAs: false, conflictAction: 'uniquify' });
        downloads.set(id, message.url);
        await chrome.storage.local.set({ lastRecording: { filename: message.filename, savedAt: Date.now() }, lastError: null });
        await badge('', 'Start recording this tab');
        return { ok: true };
      } catch (error) { await showError(`Could not download your MP3: ${error.message}`); return { error: error.message }; }
    }
    if (message.type === 'error') await showError(message.error);
    if (message.type === 'finishing') await badge('…', 'Finishing your MP3', '#7367f0');
    return { ok: true };
  })().then(respond, error => respond({ error: error.message }));
  return true;
});
chrome.downloads.onChanged.addListener(async delta => {
  if (!delta.state || !['complete', 'interrupted'].includes(delta.state.current)) return;
  // The offscreen document owns blob URLs, including across worker restarts.
  await chrome.runtime.sendMessage({ target: 'recorder', type: 'download-finished', url: downloads.get(delta.id) }).catch(() => {});
  downloads.delete(delta.id);
  if (delta.state.current === 'interrupted') await showError('The download was interrupted. Open Tabtone settings to retry saving the MP3.');
});
chrome.runtime.onInstalled.addListener(() => chrome.runtime.openOptionsPage());
