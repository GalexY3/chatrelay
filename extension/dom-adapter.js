/* Isolated-world adapter. No cookies, storage tokens, private APIs or page script execution. */
(() => {
  if (globalThis.ChatRelayDOM) return;
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const text = element => (element?.innerText ?? element?.textContent ?? '').trim();
  const normalize = value => value.replace(/\r\n/g, '\n').replace(/\u00a0/g, ' ').trim();
  // Read editor content, not CSS layout: rich-link icons introduce visual line
  // breaks in innerText. Keep authored line breaks and paragraph boundaries.
  function promptText(element) {
    if (!element) return '';
    if (element.tagName === 'TEXTAREA') return element.value;
    const read = node => {
      if (node.nodeType === 3) return node.textContent;
      if (node.nodeType !== 1 || node.getAttribute('aria-hidden') === 'true') return '';
      if (node.tagName === 'BR') return '\n';
      const content = [...node.childNodes].map(read).join('');
      return content + (node !== element && node.tagName === 'P' ? '\n\n' : node !== element && node.tagName === 'DIV' ? '\n' : '');
    };
    return read(element);
  }
  function answerText(element) {
    if (!element) return '';
    const read = node => {
      if (node.nodeType === 3) return node.textContent;
      if (node.nodeType !== 1 || node.getAttribute('aria-hidden') === 'true' || /^(SCRIPT|STYLE)$/.test(node.tagName)) return '';
      if (node.matches('.katex')) {
        const tex = node.querySelector('annotation[encoding="application/x-tex"]')?.textContent;
        // KaTeX exposes MathML and visual glyphs for one formula. Return its
        // published DOM annotation once, without touching the rendered page.
        if (tex) return `$${tex}$`;
      }
      if (node.tagName === 'BR') return '\n';
      const content = [...node.childNodes].map(read).join('');
      if (node === element) return content;
      if (node.tagName === 'LI') return `- ${content}\n`;
      if (/^(P|PRE|H[1-6]|UL|OL)$/.test(node.tagName)) return content + '\n\n';
      return content + (/^(DIV|BLOCKQUOTE|TR)$/.test(node.tagName) ? '\n' : node.tagName === 'TD' || node.tagName === 'TH' ? '\t' : '');
    };
    return read(element).trim();
  }
  const editor = doc => doc.querySelector('#prompt-textarea[contenteditable="true"], textarea#prompt-textarea, [data-chatgpt-composer] [data-composer-markdown][contenteditable="true"][role="textbox"]');
  const assistants = doc => {
    const legacy = [...doc.querySelectorAll('[data-message-author-role="assistant"]')];
    return legacy.length ? legacy : [...doc.querySelectorAll('[data-markdown-text-style="assistant-message"]')];
  };
  const users = doc => {
    const legacy = [...doc.querySelectorAll('[data-message-author-role="user"]')];
    return legacy.length ? legacy : [...doc.querySelectorAll('[data-user-message-bubble="true"] [data-search-result-target]')];
  };
  const stopButton = doc => doc.querySelector('button[data-testid="stop-button"], button[aria-label="Stop generating"], button[aria-label="Stop"], button[aria-label="Detener"]');
  const sendButton = doc => doc.querySelector('button[data-testid="send-button"], [data-chatgpt-composer] button[type="submit"][aria-label="Send"], [data-chatgpt-composer] button[type="submit"][aria-label="Enviar"]');
  const responseComplete = doc => [...doc.querySelectorAll('[role="status"]')].some(element => /^(Response completed|Respuesta completada)$/i.test(text(element)));
  function blocked(doc) {
    const alert = [...doc.querySelectorAll('[role="alert"]')].map(text).join(' ');
    return /rate limit|usage limit|too many requests|verify you are human|unusual activity|límite de uso|demasiadas solicitudes/i.test(alert);
  }
  function chatMode(doc) {
    const path = doc.defaultView?.location?.pathname || '/';
    if (/^\/(work|codex|agents|tasks)(\/|$)/i.test(path)) return 'work';
    // Positive, selected UI controls only. A generic Chat label in navigation
    // or the URL alone cannot prove which usage route the composer will use.
    let confirmed = false;
    for (const control of doc.querySelectorAll('[role="tab"][aria-selected="true"], button[aria-pressed="true"]')) {
      const label = text(control).toLowerCase();
      if (/^(work|trabajo)$/.test(label)) return 'work';
      if (label === 'chat') {
        const peers = [...(control.parentElement?.querySelectorAll('[role="tab"], button') || [])];
        if (peers.some(peer => /^(work|trabajo)$/i.test(text(peer)))) confirmed = true;
      }
    }
    return confirmed ? 'chat' : 'unknown';
  }
  function requireAvailableAccount(doc, checkMode = true) {
    if (doc.querySelector('form[data-logged-out]')) throw new Error('ChatGPT is signed out. Sign in manually before delegating; anonymous fallback is disabled.');
    if (blocked(doc)) throw new Error('ChatGPT requires user action or has reached a limit.');
    const mode = chatMode(doc);
    if (mode === 'work' || checkMode && mode !== 'chat') throw new Error('Cannot confirm ordinary Chat mode. Select Chat; Work/Codex delegation is disabled.');
  }
  async function waitFor(check, { deadline, signal }) {
    while (Date.now() < deadline) {
      if (signal?.aborted) throw new Error('Collection cancelled.');
      const result = check();
      if (result) return result;
      await sleep(250);
    }
    throw new Error('Timed out waiting for ChatGPT UI. Inspect the tab before retrying.');
  }
  function putPrompt(doc, element, prompt) {
    let pasted = false;
    if (element.tagName === 'TEXTAREA') {
      const setter = Object.getOwnPropertyDescriptor(doc.defaultView.HTMLTextAreaElement.prototype, 'value')?.set;
      if (!setter) throw new Error('Textarea setter unavailable.');
      setter.call(element, prompt);
    } else {
      element.focus();
      const selection = doc.defaultView.getSelection();
      const range = doc.createRange(); range.selectNodeContents(element);
      selection.removeAllRanges(); selection.addRange(range);
      // Give a controlled editor its normal paste transaction. No system
      // clipboard access, permissions or editor internals are involved.
      if (doc.defaultView.DataTransfer && doc.defaultView.ClipboardEvent) {
        const data = new doc.defaultView.DataTransfer();
        data.setData('text/plain', prompt);
        const escaped = prompt.replace(/\r\n/g, '\n').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
        data.setData('text/html', `<p>${escaped}</p>`);
        pasted = !element.dispatchEvent(new doc.defaultView.ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: data }));
      }
      if (!pasted) {
        // Simple contenteditables have no paste handler. Insert hard breaks
        // explicitly instead of Chromium's mixed text/DIV paragraph layout.
        let inserted = Boolean(doc.execCommand);
        for (const [index, line] of prompt.replace(/\r\n/g, '\n').split('\n').entries()) {
          if (!inserted) break;
          if (index > 0) inserted = doc.execCommand('insertLineBreak', false);
          if (inserted && line) inserted = doc.execCommand('insertText', false, line);
        }
        if (!inserted) element.textContent = prompt;
      }
    }
    if (!pasted) element.dispatchEvent(new doc.defaultView.Event('input', { bubbles: true }));
    if (normalize(promptText(element)) !== normalize(prompt)) throw new Error('Composer did not accept the exact prompt. Nothing submitted.');
  }

  async function run({ document: doc, prompt, timeoutSeconds, signal, onSubmitted, stableMs = 5000 }) {
    let mayHaveSubmitted = false;
    try {
      const deadline = Date.now() + timeoutSeconds * 1000;
      const input = await waitFor(() => {
        requireAvailableAccount(doc, false);
        return editor(doc);
      }, { deadline: Math.min(deadline, Date.now() + 30000), signal });
      if (assistants(doc).length || doc.querySelector('[data-message-author-role="user"]')) throw new Error('Expected a new empty conversation; refusing to append to existing chat.');
      if (normalize(promptText(input)) || input.value || stopButton(doc)) throw new Error('Composer is not empty or ChatGPT is generating.');
      requireAvailableAccount(doc);
      putPrompt(doc, input, prompt);
      // Validate again after the editor has reconciled its DOM/model.
      await sleep(250);
      const submit = await waitFor(() => {
        requireAvailableAccount(doc);
        const button = sendButton(doc);
        return button && !button.disabled && button.getAttribute('aria-disabled') !== 'true' ? button : null;
      }, { deadline: Math.min(deadline, Date.now() + 10000), signal });
      if (signal?.aborted) throw new Error('Cancelled before submission.');
      requireAvailableAccount(doc);
      // The editor can change while React enables the button, or the user may edit it.
      if (editor(doc) !== input || sendButton(doc) !== submit ||
          normalize(promptText(input)) !== normalize(prompt) ||
          users(doc).length || assistants(doc).length || stopButton(doc)) {
        throw new Error('Conversation or draft changed before submission. Nothing submitted.');
      }
      mayHaveSubmitted = true; // Set before click: an error must never cause a retry.
      submit.click();
      await onSubmitted();
      const verifyTurn = () => {
        // The home-mode selector disappears on a submitted Chat conversation.
        // Reading an already-sent answer needs no new generation: remember the
        // positive pre-send check, but still reject an explicit Work selection.
        requireAvailableAccount(doc, false);
        const turns = users(doc);
        if (!turns.length) return null;
        if (turns.length !== 1 || normalize(promptText(turns[0])) !== normalize(prompt)) {
          throw new Error('Submitted conversation does not match the delegated task. Inspect the tab.');
        }
        return true;
      };
      await waitFor(verifyTurn, { deadline: Math.min(deadline, Date.now() + 10000), signal });
      let previous = '', changedAt = Date.now();
      return await waitFor(() => {
        if (!verifyTurn()) throw new Error('Submitted turn disappeared. Inspect the tab.');
        const answer = assistants(doc).at(-1);
        // Use message body, excluding toolbars and message controls when present.
        const output = answerText(answer?.querySelector('.markdown') || answer);
        if (output !== previous) { previous = output; changedAt = Date.now(); }
        const streaming = stopButton(doc) || doc.querySelector('[data-is-streaming="true"]');
        const currentInput = editor(doc);
        const modern = answer?.matches('[data-markdown-text-style="assistant-message"]');
        const ready = currentInput && !currentInput.value && !normalize(promptText(currentInput)) && (modern ? responseComplete(doc) : sendButton(doc));
        if (output && !streaming && ready && Date.now() - changedAt >= stableMs) return output;
        return null;
      }, { deadline, signal });
    } catch (error) { error.mayHaveSubmitted = mayHaveSubmitted; throw error; }
  }
  globalThis.ChatRelayDOM = { run, normalize, chatMode, promptText, answerText };
})();
