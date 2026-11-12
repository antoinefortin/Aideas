let queue = Promise.resolve();
async function send(message) {
  const result = await chrome.runtime.sendMessage({ ...message, target: 'engine' });
  if (!result || result.error) throw new Error(result?.error || 'Le moteur audio ne répond pas.');
  return result;
}
async function ensure() {
  if (!(await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] })).length)
    await chrome.offscreen.createDocument({ url: 'engine.html', reasons: ['USER_MEDIA'], justification: 'Apply local equalization and audio effects to the user-selected tabs.' });
}
async function badge(tabId, active) {
  await chrome.action.setBadgeBackgroundColor({ tabId, color: '#b5f36e' });
  await chrome.action.setBadgeText({ tabId, text: active ? 'ON' : '' });
}
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message.target !== 'background') return;
  queue = queue.catch(()=>{}).then(async () => {
    await ensure();
    if (message.type === 'start') {
      const state = await send({ type: 'status', tabId: message.tabId });
      if (state.active) return state;
      const tab = await chrome.tabs.get(message.tabId);
      if (!/^(https?:|file:)/.test(tab.url || '')) throw new Error('Ouvre un site web avec du son pour activer Tabflow.');
      const { settings = {} } = await chrome.storage.local.get('settings');
      const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tab.id });
      const result = await send({ type: 'start', tabId: tab.id, streamId, settings });
      await badge(tab.id, true);
      return result;
    }
    if (message.type === 'ended') { await badge(message.tabId, false).catch(()=>{}); return { ok:true }; }
    const result = await send(message);
    if (message.type === 'stop') await badge(message.tabId, false);
    if (message.type === 'update') await chrome.storage.local.set({ settings: result.settings });
    return result;
  });
  queue.then(respond, error => respond({ error: error.message }));
  return true;
});
