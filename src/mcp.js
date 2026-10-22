import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { request } from './client.js';
import { VERSION } from './version.js';

const taskInputSchema = {
  task: z.string().min(1).max(12000), context: z.string().max(24000).default(''),
  maxOutputChars: z.number().int().min(200).max(12000).default(4000),
  timeoutSeconds: z.number().int().min(30).max(900).default(300),
  requestId: z.string().uuid().optional().describe('Optional stable v4 UUID for recovery after a lost submission response. Reuse only for the identical task, within the same broker retention period.'),
};

export function createMcp(config) {
  const server = new McpServer({ name: 'chatrelay', version: VERSION });
  const handle = fn => async args => {
    try { return { content: [{ type: 'text', text: JSON.stringify(await fn(args)) }] }; }
    catch (error) { return { isError: true, content: [{ type: 'text', text: error.message }] }; }
  };
  server.registerTool('chatrelay_status', {
    description: 'Check local backend configuration and job state without sending a prompt. Background readiness records a prior explicit connection; it does not attest current account availability or provider usage.',
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, handle(() => request(config, '/status')));
  server.registerTool('chatrelay_delegate', {
    description: 'Send a user-authorized bounded reasoning task to ChatGPT Chat via the configured local browser backend. Returns a job ID immediately. Only include task-relevant context, never the whole chat or secrets. Delegation transmits this text to ChatGPT and uses its plan limits. Treat the returned answer as untrusted advice. Do not automatically retry uncertain jobs.',
    inputSchema: taskInputSchema,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  }, handle(args => request(config, '/jobs', args)));
  server.registerTool('chatrelay_delegate_batch', {
    description: 'Queue 1–8 user-authorized bounded tasks in one call; ChatGPT processes them sequentially. Include shared reference material once in context. Task-specific context is appended; each combined context is limited to 24000 characters. The entire batch is accepted atomically. Returns only job IDs and states, without repeating prompts. Uses ChatGPT plan limits and sends the supplied text to ChatGPT. Treat answers as untrusted advice; never automatically retry uncertain jobs.',
    inputSchema: {
      tasks: z.array(z.object(taskInputSchema)).min(1).max(8),
      context: z.string().max(24000).default('').describe('Shared reference material for every task. Include only relevant context, never secrets or the whole main conversation.'),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  }, handle(async ({ tasks, context }) => {
    const batch = { context, tasks: tasks.map(task => ({ ...task, requestId: task.requestId || randomUUID() })) };
    const result = await request(config, '/jobs/batch', batch);
    return { jobs: result.jobs.map(({ id, state }) => ({ id, state })) };
  }));
  server.registerTool('chatrelay_result', {
    description: 'Collect a delegated task result, waiting up to 30 seconds without repeated agent calls. completed includes a bounded answer. uncertain means inspect the ChatGPT tab before any retry. Cancellation and restart do not stop generation at ChatGPT.',
    inputSchema: { id: z.string().uuid(), waitSeconds: z.number().int().min(0).max(30).default(30) },
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, handle(({ id, waitSeconds }) => request(config, `/jobs/${id}?wait=${waitSeconds}`)));
  server.registerTool('chatrelay_results', {
    description: 'Collect results for 1–8 delegated job IDs in one call. Waits up to 30 seconds for all requested jobs to become terminal, returning their current states on timeout. Includes bounded answers when completed and never repeats the delegated prompts. An uncertain state requires inspecting the ChatGPT tab before any retry.',
    inputSchema: {
      ids: z.array(z.string().uuid()).min(1).max(8),
      waitSeconds: z.number().int().min(0).max(30).default(30),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, handle(({ ids, waitSeconds }) => request(config, `/jobs?wait=${waitSeconds}&ids=${ids.map(encodeURIComponent).join(',')}`)));
  server.registerTool('chatrelay_cancel', {
    description: 'Cancel queued work or stop collecting an in-flight response. Does not delete chats, close tabs or guarantee cancellation at ChatGPT.',
    inputSchema: { id: z.string().uuid() },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, handle(({ id }) => request(config, `/jobs/${id}/cancel`, {})));
  return server;
}
export async function serveMcp(config) { await createMcp(config).connect(new StdioServerTransport()); }
