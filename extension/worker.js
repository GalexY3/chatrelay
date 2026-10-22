/* ChatGPT credentials remain in the browser; only a local pairing token is stored here. */
importScripts('auth.js');
let socket, keepAlive, authenticated = false, connectFlight = null, connectionEpoch = 0;
let activityFlight = Promise.resolve();
const tasks = new Map();
const updateStatus = status => chrome.storage.session.set({ status });
function activity(id, outcome) {
  activityFlight = activityFlight.catch(() => {}).then(async () => {
    if (outcome === 'active') {
      if (tasks.has(id)) await chrome.storage.session.set({ activeJob: id });
    } else {
      const current = await chrome.storage.session.get('activeJob');
      if (current.activeJob === id) await chrome.storage.session.set({ activeJob: null, lastOutcome: outcome });
    }
  });
  return activityFlight;
}
function send(message) {
  if (socket?.readyState !== WebSocket.OPEN || !authenticated) throw new Error('Local broker disconnected.');
  socket.send(JSON.stringify(message));
}
function stopTasks(outcome = 'needs-attention') {
  for (const [id, task] of tasks) {
    if (task.tabId) chrome.tabs.sendMessage(task.tabId, { type: 'chatrelay-abort', id }).catch(() => {});
    activity(id, outcome).catch(() => {});
  }
  tasks.clear();
}
function disconnect() {
  connectionEpoch++; stopTasks(); authenticated = false;
  clearInterval(keepAlive); socket?.close(); socket = undefined;
}
function connect() {
  if (!connectFlight) connectFlight = connectOnce().finally(() => { connectFlight = null; });
  return connectFlight;
}
async function connectOnce() {
  if (socket?.readyState === WebSocket.OPEN || socket?.readyState === WebSocket.CONNECTING) return;
  const epoch = connectionEpoch;
  const config = await chrome.storage.local.get(['token', 'port', 'enabled']);
  if (epoch !== connectionEpoch) return;
  if (!config.enabled || !/^[a-f0-9]{64}$/.test(config.token || '') || !Number.isInteger(config.port) || config.port < 1024 || config.port > 65535) return;
  await updateStatus('Connecting to local broker…');
  if (epoch !== connectionEpoch) return;
  const ws = new WebSocket(`ws://127.0.0.1:${config.port}/extension`);
  socket = ws;
  let state = 'challenge', value, incoming = Promise.resolve();
  async function receive(data) {
    if (socket !== ws) return;
    const message = JSON.parse(data);
    if (state === 'challenge') {
      if (message?.type !== 'challenge' || message.protocol !== 2 || !/^[a-f0-9]{64}$/.test(message.serverNonce || '')) throw new Error('Broker requires protocol 2 mutual authentication.');
      value = { port: config.port, origin: `chrome-extension://${chrome.runtime.id}`, serverNonce: message.serverNonce, clientNonce: ChatRelayAuth.newNonce() };
      const proof = await ChatRelayAuth.clientProof(config.token, value);
      if (socket !== ws) return;
      state = 'ready'; ws.send(JSON.stringify({ type: 'hello', protocol: 2, clientNonce: value.clientNonce, proof }));
      return;
    }
    if (state === 'ready') {
      if (message?.type !== 'ready' || message.protocol !== 2 || message.credential !== undefined || !await ChatRelayAuth.verifyServerProof(config.token, value, message.proof, message.credentialBox)) throw new Error('Local broker identity could not be authenticated.');
      if (socket !== ws) return;
      if (message.credentialBox) {
        const credential = await ChatRelayAuth.decryptCredential(config.token, value, message.credentialBox);
        if (socket !== ws) return;
        await chrome.storage.local.set({ token: credential });
      }
      const proof = await ChatRelayAuth.ackProof(config.token, value);
      if (socket !== ws) return;
      state = 'authenticated'; authenticated = true;
      ws.send(JSON.stringify({ type: 'ready-ack', protocol: 2, proof }));
      clearInterval(keepAlive);
      keepAlive = setInterval(() => { try { send({ type: 'ping' }); } catch {} }, 20000);
      await updateStatus('Connected. Ready for delegated tasks.');
      return;
    }
    if (!authenticated) throw new Error('Local broker disconnected.');
    if (message?.type === 'run') {
      // Page loading must not block cancellation packets.
      run(message).catch(error => updateStatus(`Bridge error: ${error.message}`));
    } else if (message?.type === 'cancel') {
      const entry = tasks.get(message.id); tasks.delete(message.id);
      if (entry?.tabId) chrome.tabs.sendMessage(entry.tabId, { type: 'chatrelay-abort', id: message.id }).catch(() => {});
      await activity(message.id, 'cancelled');
    } else if (!['connected', 'pong'].includes(message?.type)) throw new Error('Invalid broker packet.');
  }
  ws.onmessage = ({ data }) => {
    const operation = incoming.then(() => receive(data)).catch(async error => {
      if (socket !== ws) return;
      authenticated = false; await updateStatus(`Bridge error: ${error.message}`);
      if (socket === ws) ws.close(1008, 'Mutual authentication or protocol failed.');
    });
    incoming = operation; return operation;
  };
  ws.onclose = event => {
    if (socket !== ws) return;
    clearInterval(keepAlive); authenticated = false; socket = undefined; stopTasks();
    updateStatus(event.code === 1008 ? 'Pairing rejected or another extension is connected. Check code and reconnect.' : 'Disconnected. Broker tasks may need inspection.');
    if (event.code === 1008) chrome.storage.local.set({ enabled: false });
  };
  ws.onerror = () => { if (socket === ws) updateStatus('Cannot connect. Start the local broker and check the port.'); };
}
async function waitForTab(tabId, owns) {
  const deadline = Date.now() + 45000;
  while (Date.now() < deadline && owns()) {
    const tab = await chrome.tabs.get(tabId);
    if (!owns()) return false;
    if (tab.status === 'complete') {
      if (new URL(tab.url).origin !== 'https://chatgpt.com') throw new Error('ChatGPT redirected to another origin; sign in manually.');
      return true;
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  if (!owns()) return false;
  throw new Error('ChatGPT tab did not finish loading.');
}
async function run(message) {
  if (tasks.has(message.id)) return;
  if (typeof message.prompt !== 'string' || message.prompt.length > 40000 || !/^[a-f0-9-]{36}$/.test(message.id) || !Number.isInteger(message.maxOutputChars) || message.maxOutputChars < 200 || message.maxOutputChars > 12000 || !Number.isInteger(message.timeoutSeconds) || message.timeoutSeconds < 30 || message.timeoutSeconds > 900) throw new Error('Invalid task packet.');
  const entry = { tabId: null, maxOutputChars: message.maxOutputChars, epoch: connectionEpoch };
  const owns = () => tasks.get(message.id) === entry && entry.epoch === connectionEpoch && authenticated;
  tasks.set(message.id, entry);
  try {
    await activity(message.id, 'active');
    if (!owns()) return;
    const tab = await chrome.tabs.create({ url: 'https://chatgpt.com/', active: false });
    entry.tabId = tab.id;
    if (!owns()) return;
    await chrome.storage.session.set({ lastTabId: tab.id, lastJobId: message.id });
    if (!owns() || !await waitForTab(tab.id, owns)) return;
    if (!owns()) return;
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['dom-adapter.js', 'content.js'] });
    if (!owns()) return;
    const receipt = await chrome.tabs.sendMessage(tab.id, { type: 'chatrelay-run', id: message.id, prompt: message.prompt, timeoutSeconds: message.timeoutSeconds, maxOutputChars: message.maxOutputChars });
    if (!receipt?.ok) throw new Error(receipt?.error || 'Content script did not accept task.');
  } catch (error) {
    if (owns()) {
      try { send({ type: 'job-event', id: message.id, event: { type: 'failed', error: error.message, mayHaveSubmitted: true } }); } catch {}
      tasks.delete(message.id); await activity(message.id, 'needs-attention');
    }
  }
}
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id) return;
  const popup = sender.url === chrome.runtime.getURL('popup.html');
  if (message.type === 'pair' && popup) {
    (async () => {
      let { token, port } = message;
      if (message.code) {
        const parsed = /^cr1:(\d{4,5}):([a-f0-9]{64})$/.exec(message.code.trim());
        if (!parsed) throw new Error('Use the temporary code printed by chatrelay setup --extension.');
        port = Number(parsed[1]); token = parsed[2];
      }
      if (!/^[a-f0-9]{64}$/.test(token || '') || !Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Use a valid pairing code or advanced token/port.');
      disconnect(); await chrome.storage.local.set({ token, port, enabled: true });
      if (connectFlight) await connectFlight;
      await connect(); respond({ ok: true });
    })().catch(error => respond({ error: error.message }));
    return true;
  }
  if (message.type === 'disconnect' && popup) {
    (async () => { await chrome.storage.local.set({ enabled: false }); disconnect(); await updateStatus('Disconnected by user.'); respond({ ok: true }); })().catch(error => respond({ error: error.message }));
    return true;
  }
  if (message.type === 'open-task' && popup) {
    (async () => {
      const { lastTabId } = await chrome.storage.session.get('lastTabId');
      if (!Number.isInteger(lastTabId)) throw new Error('No task tab yet.');
      await chrome.tabs.update(lastTabId, { active: true }); respond({ ok: true });
    })().catch(error => respond({ error: error.message }));
    return true;
  }
  if (message.type === 'job-event' && sender.tab && tasks.get(message.id)?.tabId === sender.tab.id) {
    try {
      let event = message.event;
      if (event?.type === 'completed' && typeof event.output === 'string') {
        const outputChars = Number.isSafeInteger(event.outputChars) && event.outputChars >= event.output.length ? event.outputChars : event.output.length;
        const output = event.output.slice(0, tasks.get(message.id).maxOutputChars).replace(/[\uD800-\uDBFF]$/, '');
        event = { type: 'completed', output, outputChars, truncated: event.truncated === true || outputChars > output.length, pageUrl: event.pageUrl };
      }
      send({ type: 'job-event', id: message.id, event });
      if (['completed', 'failed'].includes(message.event?.type)) { tasks.delete(message.id); activity(message.id, message.event.type).catch(() => {}); }
      respond({ ok: true });
    } catch (error) { respond({ error: error.message }); }
  }
});
chrome.tabs.onRemoved.addListener(tabId => {
  for (const [id, task] of tasks) {
    if (task.tabId !== tabId) continue;
    try { send({ type: 'job-event', id, event: { type: 'failed', error: 'Delegation tab was closed.', mayHaveSubmitted: true } }); } catch {}
    tasks.delete(id); activity(id, 'needs-attention').catch(() => {});
  }
});
chrome.alarms.create('reconnect', { periodInMinutes: 0.5 });
chrome.alarms.onAlarm.addListener(alarm => { if (alarm.name === 'reconnect') connect(); });
chrome.runtime.onStartup.addListener(connect);
connect();
