(() => {
  if (globalThis.chatRelayInstalled) return;
  globalThis.chatRelayInstalled = true;
  let running = null;
  const seen = new Set();
  async function event(id, value) {
    const response = await chrome.runtime.sendMessage({ type: 'job-event', id, event: value });
    if (!response?.ok) throw new Error(response?.error || 'Local bridge unavailable.');
  }
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (sender.id !== chrome.runtime.id) return;
    if (message.type === 'chatrelay-abort') {
      if (running?.id === message.id) running.controller.abort();
      respond({ ok: true }); return;
    }
    if (message.type !== 'chatrelay-run') return;
    if (running || seen.has(message.id)) { respond({ error: 'Duplicate or busy task.' }); return; }
    seen.add(message.id);
    const controller = new AbortController();
    running = { id: message.id, controller };
    respond({ ok: true });
    (async () => {
      try {
        const output = await globalThis.ChatRelayDOM.run({
          document, prompt: message.prompt, timeoutSeconds: message.timeoutSeconds,
          signal: controller.signal,
          onSubmitted: () => event(message.id, { type: 'submitted', pageUrl: location.href }),
        });
        const bounded = output.slice(0, message.maxOutputChars).replace(/[\uD800-\uDBFF]$/, '');
        await event(message.id, { type: 'completed', output: bounded, outputChars: output.length, truncated: output.length > bounded.length, pageUrl: location.href });
      } catch (error) {
        try { await event(message.id, { type: 'failed', error: error.message, mayHaveSubmitted: Boolean(error.mayHaveSubmitted), pageUrl: location.href }); } catch {}
      } finally { running = null; }
    })();
  });
})();
