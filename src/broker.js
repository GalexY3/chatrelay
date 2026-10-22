import http from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { Jobs, packet, publicJob, TERMINAL } from './jobs.js';
import { Pairing } from './pairing.js';
import { setTimeout as sleep } from 'node:timers/promises';
import { verifyRequest, verifyBody, signResponse, ReplayGuard } from './http-auth.js';
import { newNonce, verifyClientProof, serverProof, encryptCredential, verifyAckProof } from './ws-auth.js';
import { VERSION } from './version.js';

export function allowedOrigin(origin) { return typeof origin === 'string' && /^chrome-extension:\/\/[a-p]{32}$/.test(origin); }

export async function startBroker({ port, token, backend = 'extension' }, { jobs = new Jobs(), pairing = new Pairing(), onShutdown, runner,
  authTimeoutMs = 10000, heartbeatTimeoutMs = 60000, heartbeatIntervalMs = 1000, maxPendingPeers = 8,
} = {}) {
  let browser = null, closing = false;
  const peers = new Set();
  const replay = new ReplayGuard();
  const wss = new WebSocketServer({ noServer: true, maxPayload: 200000 });
  function send(value) { if (browser?.readyState === WebSocket.OPEN) browser.send(JSON.stringify(value)); }
  function dispatch() {
    if (closing || (!browser || browser.readyState !== WebSocket.OPEN) && !runner?.ready) return;
    const job = jobs.next();
    if (!job) return;
    const prompt = packet(job);
    job.inputChars = prompt.length;
    const message = { type: 'run', id: job.id, prompt, timeoutSeconds: job.timeoutSeconds, maxOutputChars: job.maxOutputChars };
    if (browser) send(message);
    else Promise.resolve().then(() => runner.run(message, event => {
      if (jobs.jobs.has(job.id) && jobs.event(job.id, event)) dispatch();
    })).catch(error => {
      if (jobs.jobs.has(job.id) && jobs.event(job.id, { type: 'failed', error: error.message, mayHaveSubmitted: true })) dispatch();
    });
  }
  function json(res, status, value) {
    const body = JSON.stringify(value);
    res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store',
      ...(res.chatrelayAuth ? { 'X-ChatRelay-Response': signResponse(token, res.chatrelayAuth, status, body) } : {}),
    });
    res.end(body);
  }
  const server = http.createServer(async (req, res) => {
    // No browser-page origins or remote Host headers; auth is never passed in a URL.
    if (req.headers.host !== `127.0.0.1:${server.address()?.port}` || req.headers.origin !== undefined) return json(res, 403, { error: 'Local CLI clients only.' });
    const auth = verifyRequest({ token, port: server.address().port }, req.method, req.url, req.headers.authorization);
    if (!auth) return json(res, 401, { error: 'Unauthorized or incompatible local client.' });
    res.chatrelayAuth = auth;
    try {
      if (!replay.accept(auth.nonce)) return json(res, 401, { error: 'Request nonce has already been used.' });
      const url = new URL(req.url, 'http://127.0.0.1');
      const chunks = [];
      let bytes = 0;
      for await (const chunk of req) {
        bytes += chunk.length;
        if (bytes > (url.pathname === '/jobs/batch' ? 1000000 : 160000)) return json(res, 413, { error: 'Request too large.' });
        chunks.push(chunk);
      }
      const body = Buffer.concat(chunks);
      if (!verifyBody(auth, body)) return json(res, 401, { error: 'Request body does not match its signature.' });
      if (req.method === 'GET' && url.pathname === '/status') return json(res, 200, {
        service: 'chatrelay', version: VERSION, protocol: 2, backend, connected: Boolean(browser) || Boolean(runner?.ready), activeJob: jobs.active,
        capabilities: ['batch', 'temporary-pairing', 'on-demand-service', 'chat-only', ...(runner ? ['background-browser'] : [])],
        jobs: [...jobs.jobs.values()].map(j => ({ id: j.id, state: j.state })),
      });
      if (req.method === 'POST' && url.pathname === '/pairing') return json(res, 201, pairing.issue(server.address().port));
      if (req.method === 'POST' && url.pathname === '/shutdown' && onShutdown) {
        res.once('finish', () => { onShutdown(); });
        return json(res, 200, { stopped: true });
      }
      if (req.method === 'POST' && ['/jobs', '/jobs/batch'].includes(url.pathname)) {
        // Fail before accepting work when there is no browser transport.
        if (!browser && !runner?.ready) return json(res, 409, { error: backend === 'managed' ? 'Background browser is not connected. Run chatrelay connect once before delegating.' : 'No paired extension. Connect it before delegating.' });
        const input = JSON.parse(body.toString('utf8'));
        const batch = url.pathname === '/jobs/batch';
        const accepted = batch ? jobs.createMany(input) : [jobs.create(input)];
        dispatch();
        return json(res, 202, batch ? { jobs: accepted.map(publicJob) } : publicJob(accepted[0]));
      }
      if (req.method === 'GET' && url.pathname === '/jobs') {
        const ids = (url.searchParams.get('ids') || '').toLowerCase().split(',');
        if (ids.length < 1 || ids.length > 8 || ids.some(id => !/^[a-f0-9-]{36}$/.test(id))) throw new Error('Expected 1–8 job UUIDs.');
        const wait = Number(url.searchParams.get('wait') || 0);
        if (!Number.isInteger(wait) || wait < 0 || wait > 30) throw new Error('Wait must be 0–30 seconds.');
        const end = Date.now() + wait * 1000;
        while (Date.now() < end && !ids.every(id => TERMINAL.has(jobs.get(id).state))) {
          if (res.destroyed) return;
          await sleep(100);
        }
        return json(res, 200, { jobs: ids.map(id => publicJob(jobs.get(id))) });
      }
      const match = /^\/jobs\/([a-f0-9-]{36})(\/cancel)?$/i.exec(url.pathname);
      if (match) match[1] = match[1].toLowerCase();
      if (match && req.method === 'GET' && !match[2]) {
        const wait = Number(url.searchParams.get('wait') || 0);
        if (!Number.isInteger(wait) || wait < 0 || wait > 30) throw new Error('Wait must be 0–30 seconds.');
        const end = Date.now() + wait * 1000;
        while (Date.now() < end && !['completed', 'failed', 'cancelled', 'uncertain'].includes(jobs.get(match[1]).state)) {
          if (res.destroyed) return;
          await sleep(100);
        }
        return json(res, 200, publicJob(jobs.get(match[1])));
      }
      if (match && req.method === 'POST' && match[2]) {
        const cancelled = jobs.cancel(match[1]);
        if (cancelled) { send({ type: 'cancel', id: match[1] }); runner?.cancel(match[1]); }
        dispatch();
        return json(res, 200, publicJob(jobs.get(match[1])));
      }
      return json(res, 404, { error: 'Not found.' });
    } catch (error) { return json(res, 400, { error: error.message }); }
  });
  server.requestTimeout = 10000;
  server.headersTimeout = 10000;
  server.on('upgrade', (req, socket, head) => {
    if (backend !== 'extension' || req.url !== '/extension' || !allowedOrigin(req.headers.origin) || req.headers.host !== `127.0.0.1:${server.address()?.port}`) {
      socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); return;
    }
    if (peers.size - (browser ? 1 : 0) >= maxPendingPeers) {
      socket.end('HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n'); return;
    }
    wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req));
  });
  wss.on('connection', (ws, req) => {
    peers.add(ws);
    let state = 'challenge', secret, value, lastSeen = Date.now();
    const serverNonce = newNonce();
    const deadline = setTimeout(() => ws.terminate(), authTimeoutMs);
    ws.chatrelayLastSeen = () => lastSeen;
    ws.send(JSON.stringify({ type: 'challenge', protocol: 2, serverNonce }));
    ws.on('error', () => {});
    ws.on('message', data => {
      try {
        const event = JSON.parse(data.toString());
        if (state === 'challenge') {
          if (event?.type !== 'hello' || event.protocol !== 2 || event.token !== undefined || browser) { ws.close(1008, 'Protocol 2 mutual pairing required or extension already connected.'); return; }
          value = { port: server.address().port, origin: req.headers.origin, serverNonce, clientNonce: event.clientNonce };
          secret = verifyClientProof(token, value, event.proof) ? token : pairing.candidates().find(ticket => verifyClientProof(ticket, value, event.proof));
          if (!secret) { ws.close(1008, 'Invalid or expired pairing proof.'); return; }
          const temporary = secret !== token;
          if (temporary && !pairing.consume(secret)) { ws.close(1008, 'Expired pairing code.'); return; }
          const credentialBox = temporary ? encryptCredential(secret, value, token) : undefined;
          state = 'ack';
          ws.send(JSON.stringify({ type: 'ready', protocol: 2, proof: serverProof(secret, value, credentialBox), ...(credentialBox ? { credentialBox } : {}) }));
          return;
        }
        if (state === 'ack') {
          if (event?.type !== 'ready-ack' || event.protocol !== 2 || browser || !verifyAckProof(secret, value, event.proof)) { ws.close(1008, 'Invalid pairing acknowledgement.'); return; }
          state = 'authenticated'; secret = undefined; clearTimeout(deadline); browser = ws; lastSeen = Date.now();
          send({ type: 'connected', protocol: 2 }); dispatch(); return;
        }
        if (state !== 'authenticated' || browser !== ws) { ws.close(1008, 'Invalid protocol state.'); return; }
        lastSeen = Date.now();
        if (event.type === 'ping') { send({ type: 'pong' }); return; }
        if (event.type === 'job-event' && typeof event.id === 'string') {
          if (jobs.event(event.id, event.event)) dispatch();
          return;
        }
        ws.close(1008, 'Invalid message');
      } catch { ws.close(1008, 'Invalid protocol'); }
    });
    ws.on('close', () => {
      clearTimeout(deadline); peers.delete(ws);
      if (browser === ws) { browser = null; jobs.disconnect(); }
    });
  });
  const timer = setInterval(() => {
    if (browser && Date.now() - browser.chatrelayLastSeen() > heartbeatTimeoutMs) browser.terminate();
    const expired = jobs.expire();
    if (expired) { send({ type: 'cancel', id: expired }); runner?.cancel(expired); dispatch(); }
    jobs.prune();
  }, heartbeatIntervalMs);
  timer.unref();
  await new Promise((resolve, reject) => {
    server.once('error', reject); server.listen(port, '127.0.0.1', resolve);
  }).catch(error => { clearInterval(timer); wss.close(); throw error; });
  return {
    port: server.address().port, jobs,
    async close() {
      closing = true;
      clearInterval(timer);
      await runner?.close();
      for (const ws of peers) ws.terminate();
      await new Promise(resolve => wss.close(resolve));
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
    },
  };
}
