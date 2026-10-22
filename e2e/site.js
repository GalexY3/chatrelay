// Entirely synthetic website: never captures or contacts a real ChatGPT account.
export function syntheticChat({ output = 'Respuesta final: España 🙂', mode = 'normal', editor = 'rich', renderMath = false } = {}) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>ChatRelay synthetic fixture</title>
  <style>body {font:16px sans-serif;} #prompt-textarea {white-space:pre-wrap;min-height:80px;border:1px solid #ccc;} .markdown {white-space:pre-wrap;}</style></head><body>
  <main id="turns"></main>
  ${mode === 'unknown-mode' ? '' : editor === 'modern' ? '<div role="group"><button aria-pressed="true">Chat</button><button aria-pressed="false">Work</button></div>' : `<div role="tablist"><span role="tab" aria-selected="${mode !== 'work'}">Chat</span><span role="tab" aria-selected="${mode === 'work'}">Work</span></div>`}
  ${mode === 'logged-out' ? '<form data-logged-out></form>' : ''}
  ${editor === 'modern' ? '<form data-chatgpt-composer><div data-composer-markdown contenteditable="true" role="textbox" aria-label="Pregunta a ChatGPT"></div><button type="submit" aria-label="Enviar" disabled>Enviar</button></form>' : (editor === 'rich' ? '<div id="prompt-textarea" contenteditable="true" role="textbox"></div>' : '<textarea id="prompt-textarea"></textarea>') + '<button data-testid="send-button" disabled>Send</button>'}
  <script>
    const config = ${JSON.stringify({ output, mode, editor, renderMath }).replace(/</g, '\\u003c')};
    const input = document.querySelector('#prompt-textarea,[data-composer-markdown]');
    const button = document.querySelector('[data-testid="send-button"],button[aria-label="Enviar"]');
    window.submissions = [];
    input.addEventListener('input', () => { button.disabled = false; });
    button.addEventListener('click', event => {
      event.preventDefault();
      const modern = config.editor === 'modern';
      const prompt = config.editor !== 'textarea' ? input.innerText : input.value;
      window.submissions.push(prompt);
      if (config.editor !== 'textarea') input.replaceChildren(); else input.value = '';
      button.disabled = true;
      const user = document.createElement('div');
      if (modern) { user.dataset.userMessageBubble = 'true'; const body = document.createElement('div'); body.setAttribute('data-search-result-target',''); body.innerText = prompt; user.append(body); }
      else { user.dataset.messageAuthorRole = 'user'; user.innerText = prompt; }
      document.querySelector('#turns').append(user);
      if (config.mode === 'alert') {
        const alert = document.createElement('p'); alert.setAttribute('role','alert'); alert.textContent = 'Usage limit reached'; document.body.append(alert); return;
      }
      const stop = document.createElement('button'); stop.dataset.testid = 'stop-button'; stop.textContent = 'Stop'; document.body.append(stop);
      const assistant = document.createElement('div');
      if (modern) assistant.setAttribute('data-markdown-text-style','assistant-message'); else assistant.dataset.messageAuthorRole = 'assistant';
      const markdown = document.createElement('div'); markdown.className = 'markdown'; markdown.textContent = 'Partial…'; assistant.append(markdown);
      document.querySelector('#turns').append(assistant);
      if (modern) { document.querySelector('[role="group"]').remove(); button.remove(); }
      if (config.mode === 'never-finishes') return;
      setTimeout(() => {
        markdown.innerText = config.output;
        if (config.renderMath) markdown.innerHTML = '<p>Objective <span class="katex"><span class="katex-mathml"><math><semantics><mi>L</mi><annotation encoding="application/x-tex">L = a + b</annotation></semantics></math></span><span class="katex-html" aria-hidden="true">L = a + b</span></span>.</p><p>End.</p>';
        stop.remove();
        if (modern) { const status = document.createElement('span'); status.setAttribute('role','status'); status.innerText = 'Respuesta completada'; document.body.append(status); }
      }, 250);
    });
  </script></body></html>`;
}
