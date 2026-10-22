const $ = selector => document.querySelector(selector);
const manifest = chrome.runtime.getManifest();
$('#version').textContent = manifest.version_name || manifest.version;
async function refresh() {
  const { status, activeJob, lastOutcome, lastTabId } = await chrome.storage.session.get(['status', 'activeJob', 'lastOutcome', 'lastTabId']);
  $('#status').textContent = status || 'Run chatrelay setup --extension, then paste its connection code.';
  $('#activity').textContent = activeJob ? 'A delegated task is in progress.' : lastOutcome ? `Last task: ${lastOutcome}.` : 'No delegated tasks yet.';
  $('#open-task').disabled = !Number.isInteger(lastTabId);
}
chrome.storage.local.get(['port', 'token']).then(config => {
  $('#port').value = config.port || 39391;
  // Never prefill the permanent credential in the popup.
});
$('#pair').addEventListener('submit', async event => {
  event.preventDefault();
  const response = await chrome.runtime.sendMessage({ type: 'pair', code: $('#code').value.trim(), port: Number($('#port').value), token: $('#token').value.trim() });
  if (response?.error) $('#status').textContent = response.error;
  else { $('#code').value = ''; $('#token').value = ''; refresh(); }
});
$('#disconnect').addEventListener('click', async () => { await chrome.runtime.sendMessage({ type: 'disconnect' }); await refresh(); });
chrome.storage.onChanged.addListener(refresh);
$('#open-task').addEventListener('click', async () => {
  const result = await chrome.runtime.sendMessage({ type: 'open-task' });
  if (result?.error) $('#activity').textContent = result.error;
});
refresh();
