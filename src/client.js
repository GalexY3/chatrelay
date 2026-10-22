import { randomUUID } from 'node:crypto';
import { signRequest, verifyResponse } from './http-auth.js';

const operationId = value => typeof value === 'string' ? value.toLowerCase() : value || randomUUID();

async function responseText(response) {
  const chunks = []; let bytes = 0;
  for await (const chunk of response.body || []) {
    bytes += chunk.length;
    if (bytes > 1000000) {
      const error = new Error('Local service response is larger than the protocol limit.');
      error.code = 'CHATRELAY_IDENTITY'; throw error;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

export async function request(config, path, data, { timeoutMs } = {}) {
  const submission = ['/jobs', '/jobs/batch'].includes(path) && data !== undefined;
  if (submission) data = path === '/jobs/batch'
    ? { ...data, tasks: data.tasks.map(task => ({ ...task, requestId: operationId(task.requestId) })) }
    : { ...data, requestId: operationId(data.requestId) };
  let response, result;
  const method = data === undefined ? 'GET' : 'POST';
  const body = data === undefined ? '' : JSON.stringify(data);
  const auth = signRequest(config, method, path, body);
  try {
    response = await fetch(`http://127.0.0.1:${config.port}${path}`, {
      method, redirect: 'error',
      headers: { Authorization: auth.authorization, 'Content-Type': 'application/json' },
      body: data === undefined ? undefined : body,
      signal: AbortSignal.timeout(timeoutMs ?? (new URL(path, 'http://127.0.0.1').searchParams.has('wait') ? 35000 : 10000)),
    });
    // Acknowledgement bodies can fail after fetch has already received headers.
    // Keep the assigned operation IDs recoverable in that case as well.
    const raw = await responseText(response);
    if (!verifyResponse(config.token, auth, response.status, raw, response.headers.get('x-chatrelay-response'))) {
      const error = new Error('Local service identity could not be verified. Check for different credentials, an outdated broker or another service on this port.');
      error.code = 'CHATRELAY_IDENTITY'; throw error;
    }
    result = JSON.parse(raw);
  } catch (cause) {
    if (submission) {
      const ids = path === '/jobs/batch' ? data.tasks.map(task => task.requestId).join(', ') : data.requestId;
      throw new Error(`Submission outcome unknown. Recover job(s) ${ids} using chatrelay_result/chatrelay_results before any retry. If resubmitting the same task, reuse its requestId. Dedupe lasts while retained; do not retry blindly after a broker restart.`);
    }
    if (cause.code === 'CHATRELAY_IDENTITY') throw cause;
    const error = new Error('Cannot reach local broker. Run: node src/cli.js serve', { cause });
    error.code = 'CHATRELAY_UNREACHABLE'; throw error;
  }
  if (!response.ok) throw new Error(result.error || `Broker returned ${response.status}`);
  return result;
}
