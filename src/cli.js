#!/usr/bin/env node
import { initConfig, loadConfig, updateConfig, configDir } from './config.js';
import { startBroker } from './broker.js';
import { request } from './client.js';
import { serveMcp } from './mcp.js';
import { ensureBroker, probe } from './lifecycle.js';
import { resolve } from 'node:path';

const [command = 'help', ...args] = process.argv.slice(2);
const printMcp = () => console.log('Add this MCP entry to your host configuration:\n' + JSON.stringify({ mcpServers: { chatrelay: { command: process.execPath, args: [resolve(process.argv[1]), 'mcp'] } } }, null, 2));
async function stopForConfiguration(config) {
  const status = await probe(config);
  if (!status) return;
  if (status.jobs.some(job => ['queued', 'dispatched', 'running'].includes(job.state))) throw new Error('Finish or cancel queued/running work before reconnecting or switching backends.');
  await request(config, '/shutdown', {});
  for (let i = 0; i < 50 && await probe(config); i++) await new Promise(resolve => setTimeout(resolve, 100));
  if (await probe(config)) throw new Error('The previous service has not stopped yet. Retry configuration after it exits.');
}
try {
  if (command === 'init') {
    const config = await initConfig();
    console.log(`Pair the extension with port ${config.port} and this local token:\n${config.token}\nKeep the token private. It only authenticates your local bridge.`);
  } else if (command === 'serve') {
    const config = await loadConfig();
    let broker;
    const shutdown = async () => { await broker.close(); process.exit(0); };
    let runner;
    if (config.backend === 'managed') {
      const { ManagedBrowser } = await import('./managed-browser.js');
      const { browserExecutable } = await import('./browser-runtime.js');
      runner = new ManagedBrowser({ home: configDir(), ready: config.managedReady === true, executablePath: browserExecutable(configDir()) });
    }
    broker = await startBroker(config, { onShutdown: shutdown, runner });
    console.error(`ChatRelay listening on 127.0.0.1:${broker.port}. Backend: ${config.backend || 'extension'}.`);
    for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await broker.close(); process.exit(0); });
  } else if (command === 'mcp') {
    const config = await initConfig();
    await ensureBroker(config);
    await serveMcp(config);
  } else if (command === 'setup') {
    let config = await initConfig();
    if (args.includes('--extension') && config.backend !== 'extension') {
      await stopForConfiguration(config); config = await updateConfig({ backend: 'extension' });
    }
    await ensureBroker(config);
    if (config.backend === 'managed') console.log(config.managedReady ? 'ChatRelay background mode is connected. Normal tasks open no visible windows or tabs.' : 'Background mode is configured. Run chatrelay connect once to sign in; normal tasks stay invisible.');
    else {
      const pairing = await request(config, '/pairing', {});
      console.log(`Paste this single-use code in the extension (expires in two minutes):\n\n${pairing.code}\n`);
    }
    printMcp();
  } else if (command === 'connect') {
    const config = await initConfig();
    await stopForConfiguration(config);
    const { prepareBrowser, connectBrowser } = await import('./browser-runtime.js');
    const executable = await prepareBrowser(configDir());
    await connectBrowser(configDir(), executable);
    const connected = await updateConfig({ backend: 'managed', managedReady: true });
    await ensureBroker(connected);
    console.log('ChatRelay connected. From now on tasks run in the background without visible tabs.'); printMcp();
  } else if (command === 'stop') {
    const config = await loadConfig();
    if (!await probe(config)) console.log('ChatRelay is already stopped.');
    else console.log(JSON.stringify(await request(config, '/shutdown', {})));
  } else if (command === 'status' || command === 'doctor') {
    const status = await request(await loadConfig(), '/status');
    console.log(JSON.stringify(status, null, 2));
    if (command === 'doctor' && !status.connected) process.exitCode = 1;
  } else if (command === 'submit') {
    console.log(JSON.stringify(await request(await loadConfig(), '/jobs', { task: args.join(' ') }), null, 2));
  } else if (command === 'result' || command === 'cancel') {
    if (!/^[a-f0-9-]{36}$/.test(args[0] || '')) throw new Error('Expected a job UUID.');
    console.log(JSON.stringify(await request(await loadConfig(), `/jobs/${args[0]}${command === 'cancel' ? '/cancel' : ''}`, command === 'cancel' ? {} : undefined), null, 2));
  } else {
    console.log('ChatRelay: setup [--extension] | connect | mcp | status | doctor | stop | init | serve | submit <task> | result <id> | cancel <id>');
    if (command !== 'help') process.exitCode = 1;
  }
} catch (error) { console.error(`ChatRelay: ${error.message}`); process.exitCode = 1; }
