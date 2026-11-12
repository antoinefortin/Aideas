async function refresh() {
  const { lastError, lastRecording } = await chrome.storage.local.get(['lastError', 'lastRecording']);
  document.querySelector('#error').hidden = !lastError;
  document.querySelector('#error-text').textContent = lastError || '';
  document.querySelector('#latest').hidden = !lastRecording;
  document.querySelector('#filename').textContent = lastRecording?.filename || '';
}
document.querySelector('#downloads').onclick = () => chrome.tabs.create({ url: 'chrome://downloads' });
document.querySelector('#retry').onclick = async () => {
  const response = await chrome.runtime.sendMessage({ target: 'recorder', type: 'retry' }).catch(() => null);
  if (!response || response.error) document.querySelector('#error-text').textContent = response?.error || 'No recording is available to retry. Start a new recording from the toolbar.';
};
chrome.storage.onChanged.addListener(refresh);
refresh();
