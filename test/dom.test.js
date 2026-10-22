import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { parseHTML } from 'linkedom';

const code = await readFile(new URL('../extension/dom-adapter.js', import.meta.url), 'utf8');
function fixture(body) {
  const { document, window } = parseHTML(`<html><body>${body}</body></html>`);
  // The fixture implements the editor event contract, not ChatGPT itself.
  const context = vm.createContext({ setTimeout, Date, console });
  vm.runInContext(code, context);
  document.execCommand = (_, __, value) => { document.querySelector('#prompt-textarea').textContent = value; return true; };
  window.getSelection = () => ({ removeAllRanges() {}, addRange() {} });
  document.createRange = () => ({ selectNodeContents() {} });
  return { document, adapter: context.ChatRelayDOM };
}
const modeToggle = '<div role="tablist"><span role="tab" aria-selected="true">Chat</span><span role="tab" aria-selected="false">Work</span></div>';
const base = modeToggle + '<div id="prompt-textarea" contenteditable="true"></div><button data-testid="send-button">Send</button>';
test('capture only the new assistant turn after generation ends', async () => {
  const { document, adapter } = fixture(base);
  let submitted = 0;
  document.querySelector('button').addEventListener('click', () => {
    document.querySelector('#prompt-textarea').textContent = '';
    const user = document.createElement('div');
    user.setAttribute('data-message-author-role', 'user'); user.textContent = 'Question';
    document.body.append(user);
    const answer = document.createElement('div');
    answer.setAttribute('data-message-author-role', 'assistant');
    answer.innerHTML = '<div class="markdown">Partial answer</div><button>Copy</button>';
    document.body.append(answer);
    const stop = document.createElement('button'); stop.dataset.testid = 'stop-button'; document.body.append(stop);
    setTimeout(() => { answer.querySelector('.markdown').textContent = 'Final answer'; stop.remove(); }, 350);
  });
  const output = await adapter.run({ document, prompt: 'Question', timeoutSeconds: 3, stableMs: 100, onSubmitted: async () => { submitted++; } });
  assert.equal(output, 'Final answer');
  assert.equal(submitted, 1);
});

test('existing conversation and drafts are never overwritten', async () => {
  for (const body of [base + '<div data-message-author-role="user">Private old message</div>', base.replace('contenteditable="true"></div>', 'contenteditable="true">Draft</div>')]) {
    const { document, adapter } = fixture(body);
    let clicks = 0; document.querySelector('button').addEventListener('click', () => clicks++);
    await assert.rejects(adapter.run({ document, prompt: 'Question', timeoutSeconds: 1, onSubmitted: async () => {} }));
    assert.equal(clicks, 0);
  }
});

test('failed submission has an ambiguous outcome and is not retried', async () => {
  const { document, adapter } = fixture(base);
  let count = 0;
  document.querySelector('button').addEventListener('click', () => { count++; });
  await assert.rejects(adapter.run({ document, prompt: 'Question', timeoutSeconds: 1, onSubmitted: async () => { throw new Error('Disconnected'); } }), error => error.mayHaveSubmitted === true);
  assert.equal(count, 1);
});

test('cancellation before submission sends nothing', async () => {
  const { document, adapter } = fixture(base);
  const controller = new AbortController(); controller.abort();
  let count = 0; document.querySelector('button').addEventListener('click', () => count++);
  await assert.rejects(adapter.run({ document, prompt: 'Question', timeoutSeconds: 1, signal: controller.signal, onSubmitted: async () => {} }));
  assert.equal(count, 0);
});

test('an edit while the send button becomes ready cannot submit a different question', async () => {
  const { document, adapter } = fixture(base);
  const button = document.querySelector('button');
  button.disabled = true;
  let clicks = 0; button.addEventListener('click', () => clicks++);
  setTimeout(() => {
    document.querySelector('#prompt-textarea').textContent = 'A different question';
    button.disabled = false;
  }, 30);
  await assert.rejects(adapter.run({ document, prompt: 'Original question', timeoutSeconds: 2, onSubmitted: async () => {} }), /draft changed/);
  assert.equal(clicks, 0);
});

test('a mismatched user turn after click is uncertain, never reported as the delegated answer', async () => {
  const { document, adapter } = fixture(base);
  document.querySelector('button').addEventListener('click', () => {
    document.querySelector('#prompt-textarea').textContent = '';
    const user = document.createElement('div');
    user.setAttribute('data-message-author-role', 'user'); user.textContent = 'Another question';
    document.body.append(user);
  });
  await assert.rejects(adapter.run({ document, prompt: 'Question', timeoutSeconds: 1, onSubmitted: async () => {} }), error => error.mayHaveSubmitted && /does not match/.test(error.message));
});

for (const [state, markup, expected] of [
  ['signed out', '<form data-logged-out></form>', /signed out/],
  ['usage blocked', '<div role="alert">Usage limit reached</div>', /reached a limit/],
]) {
  test(`becoming ${state} while the send button is disabled prevents submission`, async () => {
    const { document, adapter } = fixture(base);
    const button = document.querySelector('button'); button.disabled = true;
    let clicks = 0; button.addEventListener('click', () => clicks++);
    setTimeout(() => {
      document.body.insertAdjacentHTML('beforeend', markup);
      button.disabled = false;
    }, 30);
    await assert.rejects(adapter.run({ document, prompt: 'Private context', timeoutSeconds: 2, onSubmitted: async () => {} }), error => error.mayHaveSubmitted === false && expected.test(error.message));
    assert.equal(clicks, 0);
  });

  test(`becoming ${state} after submission never produces a completed answer`, async () => {
    const { document, adapter } = fixture(base);
    let clicks = 0;
    document.querySelector('button').addEventListener('click', () => {
      clicks++;
      document.querySelector('#prompt-textarea').textContent = '';
      document.body.insertAdjacentHTML('beforeend', '<div data-message-author-role="user">Question</div><div data-message-author-role="assistant"><div class="markdown">Apparent answer</div></div>');
      setTimeout(() => document.body.insertAdjacentHTML('beforeend', markup), 30);
    });
    await assert.rejects(adapter.run({ document, prompt: 'Question', timeoutSeconds: 2, stableMs: 100, onSubmitted: async () => {} }), error => error.mayHaveSubmitted === true && expected.test(error.message));
    assert.equal(clicks, 1);
  });
}

test('textarea readiness uses its live value and waits for an unsent draft to clear', async t => {
  const { document, adapter } = fixture(modeToggle + '<textarea id="prompt-textarea"></textarea><button data-testid="send-button">Send</button>');
  const input = document.querySelector('textarea');
  // Real textarea innerText can stay empty while its live value contains a draft.
  Object.defineProperty(input, 'innerText', { get: () => '' });
  let cleared = false, timer;
  document.querySelector('button').addEventListener('click', () => {
    input.value = 'Unsent draft';
    document.body.insertAdjacentHTML('beforeend', '<div data-message-author-role="user">Question</div><div data-message-author-role="assistant"><div class="markdown">Answer</div></div>');
    timer = setTimeout(() => { cleared = true; input.value = ''; }, 350);
  });
  t.after(() => clearTimeout(timer));
  const output = await adapter.run({ document, prompt: 'Question', timeoutSeconds: 2, stableMs: 100, onSubmitted: async () => {} });
  assert.equal(output, 'Answer');
  assert.equal(cleared, true);
});

for (const state of ['work', 'unknown']) {
  test(`${state} mode cannot send a delegated task`, async () => {
    const body = state === 'unknown' ? base.replace(modeToggle, '') : base.replace('aria-selected="true">Chat', 'aria-selected="false">Chat').replace('aria-selected="false">Work', 'aria-selected="true">Work');
    const { document, adapter } = fixture(body); let clicks = 0;
    document.querySelector('button').addEventListener('click', () => clicks++);
    await assert.rejects(adapter.run({ document, prompt: 'Do not use Work quota.', timeoutSeconds: 1, onSubmitted: async () => {} }), error => !error.mayHaveSubmitted && /Chat mode/.test(error.message));
    assert.equal(clicks, 0); assert.equal(document.querySelector('#prompt-textarea').textContent, '');
  });
}

test('switching to Work before send is blocked even when a conflicting Chat selection remains', async () => {
  const { document, adapter } = fixture(base), button = document.querySelector('button'); button.disabled = true;
  let clicks = 0; button.addEventListener('click', () => clicks++);
  setTimeout(() => { document.querySelectorAll('[role="tab"]')[1].setAttribute('aria-selected', 'true'); button.disabled = false; }, 30);
  await assert.rejects(adapter.run({ document, prompt: 'Do not route to Work.', timeoutSeconds: 1, onSubmitted: async () => {} }), error => !error.mayHaveSubmitted && /Chat mode/.test(error.message));
  assert.equal(clicks, 0);
});

test('observed 2026 composer and rendered turn complete only after the live completion announcement', async () => {
  const toggle = '<div role="group"><button aria-pressed="true">Chat</button><button aria-pressed="false">Work</button></div>';
  const { document, adapter } = fixture(toggle + '<form data-chatgpt-composer><div role="textbox" data-composer-markdown contenteditable="true"></div><button type="submit" aria-label="Enviar">Enviar</button></form>');
  document.execCommand = (command, _, value) => { if (command === 'insertText') document.querySelector('[data-composer-markdown]').textContent = value; return true; };
  let submissions = 0;
  document.querySelector('button[aria-label="Enviar"]').addEventListener('click', () => {
    submissions++;
    document.querySelector('[data-composer-markdown]').textContent = '';
    document.querySelector('[role="group"]').remove();
    document.querySelector('button[aria-label="Enviar"]').remove();
    document.body.insertAdjacentHTML('beforeend', '<div data-user-message-bubble="true"><div data-search-result-target>Question</div></div><div data-markdown-text-style="assistant-message">Final answer</div><span role="status"></span>');
    setTimeout(() => { document.querySelector('[role="status"]').textContent = 'Respuesta completada'; }, 350);
  });
  const result = await adapter.run({ document, prompt: 'Question', timeoutSeconds: 2, stableMs: 100, onSubmitted: async () => {} });
  assert.equal(result, 'Final answer'); assert.equal(submissions, 1);
});

test('a controlled editor paste preserves exact multiline text, escapes HTML and ignores rich-link layout', async () => {
  const { document, adapter } = fixture(base), window = document.defaultView;
  window.DataTransfer = class {
    values = new Map();
    setData(type, value) { this.values.set(type, value); }
    getData(type) { return this.values.get(type) || ''; }
  };
  window.ClipboardEvent = function(type, options) {
    const event = new window.Event(type, options); event.clipboardData = options.clipboardData; return event;
  };
  const prompt = 'Keep <literal> & text.\n\nReference: https://example.com/paper\n  Indented line.';
  const input = document.querySelector('#prompt-textarea');
  let plain, html, clicks = 0;
  input.addEventListener('paste', event => {
    event.preventDefault(); plain = event.clipboardData.getData('text/plain'); html = event.clipboardData.getData('text/html');
    input.innerHTML = html;
    // Mirrors the observed inline URL decoration without using page internals.
    setTimeout(() => { input.innerHTML = html.replace('https://example.com/paper', '<span><span aria-hidden="true">icon</span>https://example.com/paper</span>'); }, 30);
  });
  document.querySelector('button').addEventListener('click', () => {
    clicks++; input.textContent = '';
    const user = document.createElement('div'); user.setAttribute('data-message-author-role', 'user'); user.innerHTML = html;
    document.body.append(user);
    document.body.insertAdjacentHTML('beforeend', '<div data-message-author-role="assistant"><div class="markdown">Verified</div></div>');
  });
  const output = await adapter.run({ document, prompt, timeoutSeconds: 2, stableMs: 50, onSubmitted: async () => {} });
  assert.equal(output, 'Verified'); assert.equal(clicks, 1); assert.equal(plain, prompt);
  assert.ok(html.includes('&lt;literal&gt; &amp;')); assert.ok(!input.querySelector('literal'));
});

test('whitespace-only textarea drafts are never overwritten', async () => {
  for (const draft of ['   ', '\n']) {
    const { document, adapter } = fixture(modeToggle + '<textarea id="prompt-textarea"></textarea><button data-testid="send-button">Send</button>');
    const input = document.querySelector('textarea'); input.value = draft;
    let clicks = 0; document.querySelector('button').addEventListener('click', () => clicks++);
    await assert.rejects(adapter.run({ document, prompt: 'Question', timeoutSeconds: 1, onSubmitted: async () => {} }), /not empty/);
    assert.equal(input.value, draft); assert.equal(clicks, 0);
  }
});
