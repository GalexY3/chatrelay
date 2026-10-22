import { test } from 'node:test';
import assert from 'node:assert/strict';
import { creditEquivalent, summarizeEvents, trialPrompt } from './benchmark-costs.js';

test('credit equivalents use uncached, cached and output tokens separately', () => {
  assert.equal(creditEquivalent({ input_tokens: 1000000, cached_input_tokens: 400000, output_tokens: 100000 }), 56);
  for (const invalid of [null, {}, { input_tokens: 10, output_tokens: 5 }, { input_tokens: 10, cached_input_tokens: 11, output_tokens: 0 }, { input_tokens: -1, cached_input_tokens: 0, output_tokens: 1 }]) assert.equal(creditEquivalent(invalid), null);
});

test('CLI evidence counts tool calls once and keeps failures without inventing usage', () => {
  const item = { id: 'one', type: 'mcp_tool_call', server: 'chatrelay', tool: 'chatrelay_delegate_batch' };
  const summary = summarizeEvents([{ type: 'item.started', item: { ...item, status: 'in_progress' } }, { type: 'item.completed', item: { ...item, status: 'completed' } }, { type: 'turn.failed', error: 'Example failure' }]);
  assert.equal(summary.tools.length, 1); assert.equal(summary.tools[0].status, 'completed');
  assert.equal(summary.completed, false); assert.equal(summary.estimatedStandardCreditEquivalent, null); assert.equal(summary.errors.length, 1);
});

test('both experiment arms get identical frozen tasks, without revealing their oracles', () => {
  const fixtures = [{ id: 'a', task: 'Example fixed task', expected: { secretOracle: 123 } }];
  for (const condition of ['direct', 'relay']) {
    const prompt = trialPrompt(fixtures, condition);
    assert.ok(prompt.includes('Example fixed task')); assert.ok(!prompt.includes('secretOracle'));
  }
});
