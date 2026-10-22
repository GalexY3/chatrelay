// Isolated browser DOM tests. Serves synthetic pages only; no ChatGPT account or extension.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { syntheticChat } from '../e2e/site.js';

const server = http.createServer(async (req, res) => {
  if (req.headers.host !== `127.0.0.1:${server.address().port}`) { res.writeHead(403); res.end(); return; }
  const url = new URL(req.url, 'http://127.0.0.1');
  res.setHeader('Cache-Control', 'no-store');
  if (url.pathname === '/dom-adapter.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(await readFile(new URL('../extension/dom-adapter.js', import.meta.url), 'utf8')); }
  else if (url.pathname === '/smoke.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(await readFile(new URL('../e2e/smoke.js', import.meta.url), 'utf8')); }
  else if (url.pathname === '/fixture') {
    const options = { mode: url.searchParams.get('mode') || 'normal', editor: url.searchParams.get('editor') || 'rich' };
    if (url.searchParams.has('large')) options.output = '🙂'.repeat(110000);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(syntheticChat(options).replace('</head>', '<script src="/dom-adapter.js"></script></head>'));
  } else if (url.pathname === '/') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(await readFile(new URL('../e2e/smoke.html', import.meta.url), 'utf8')); }
  else { res.writeHead(404); res.end(); }
});
server.listen(0, '127.0.0.1', () => console.log(`DOM browser fixture: http://127.0.0.1:${server.address().port}`));
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => server.close());
