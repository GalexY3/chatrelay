import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { parseHTML } from 'linkedom';

const code = await readFile(new URL('../extension/dom-adapter.js', import.meta.url), 'utf8');

function fixture(markup) {
  const { document } = parseHTML(`<html><body>${markup}</body></html>`);
  const context = vm.createContext({ setTimeout, Date, console });
  vm.runInContext(code, context);
  return { document, element: document.body.firstElementChild, adapter: context.ChatRelayDOM };
}

function read(markup) {
  const { element, adapter } = fixture(`<div contenteditable="true">${markup}</div>`);
  return adapter.normalize(adapter.promptText(element));
}

test('promptText uses a textarea live value and preserves its internal whitespace', () => {
  const { element, adapter } = fixture('<textarea>Old default</textarea>');
  element.value = 'First  line\n\nSecond\tline';
  Object.defineProperty(element, 'innerText', { get: () => 'Stale rendered text' });
  assert.equal(adapter.promptText(element), 'First  line\n\nSecond\tline');
});

test('promptText preserves explicit BR line breaks inside inline text', () => {
  assert.equal(read('First<br>Second<br><br>Fourth'), 'First\nSecond\n\nFourth');
});

test('promptText reads inline links without visual line breaks or hidden icons', () => {
  const markup = '<p>Before <a href="https://example.test/path">https://example.test/path<span aria-hidden="true"><svg><text>External link</text></svg></span></a> after</p>';
  const { element, adapter } = fixture(`<div contenteditable="true">${markup}</div>`);
  Object.defineProperty(element, 'innerText', { get: () => 'Before\nhttps://example.test/path\nExternal link\nafter' });
  assert.equal(adapter.normalize(adapter.promptText(element)), 'Before https://example.test/path after');
});

test('promptText serializes paragraph boundaries and retains empty paragraphs', () => {
  assert.equal(read('<p>First<br>line</p><p>Second</p>'), 'First\nline\n\nSecond');
  assert.equal(read('<p>First</p><p></p><p>Third</p>'), 'First\n\n\n\nThird');
});

test('promptText serializes DIV line boundaries without adding root whitespace', () => {
  assert.equal(read('<div>First</div><div>Second</div>'), 'First\nSecond');
  assert.equal(read('Plain <span>inline</span> text'), 'Plain inline text');
});

test('promptText ignores complete aria-hidden subtrees and keeps visible siblings', () => {
  assert.equal(read('A<span aria-hidden="true">Hidden<br><p>Also hidden</p></span><span aria-hidden="false"> B</span>'), 'A B');
});

test('promptText preserves literal newlines, repeated spaces, and tabs', () => {
  assert.equal(read('<p>First  line\n\nSecond\tline</p>'), 'First  line\n\nSecond\tline');
});

test('promptText normalization continues to distinguish real whitespace edits', () => {
  const draft = read('<p>A  B<br>C</p>');
  assert.equal(draft, 'A  B\nC');
  for (const changed of ['A B\nC', 'A  B C', 'A  B\n\nC']) {
    assert.notEqual(draft, changed);
  }
});
test('answerText emits each KaTeX formula once from its DOM annotation', () => {
  const { document, adapter } = fixture('<p>Objective <span class="katex"><span class="katex-mathml"><math><semantics><mi>L</mi><annotation encoding="application/x-tex">L = a + b</annotation></semantics></math></span><span class="katex-html" aria-hidden="true">L = a + b</span></span>.</p>');
  assert.equal(adapter.answerText(document.body), 'Objective $L = a + b$.');
});

test('answerText retains paragraph, list and code structure without hidden UI', () => {
  const { document, adapter } = fixture('<h3>Result</h3><p>First paragraph.</p><ul><li>One</li><li>Two</li></ul><pre><code>if x:\n  return x</code></pre><span aria-hidden="true">copy controls</span>');
  const result = adapter.answerText(document.body);
  assert.ok(result.includes('Result\n\nFirst paragraph.\n\n'));
  assert.ok(result.includes('- One\n- Two\n'));
  assert.ok(result.includes('if x:\n  return x'));
  assert.ok(!result.includes('copy controls'));
});
