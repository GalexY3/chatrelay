# ChatRelay privacy information

ChatRelay is a local, MIT-licensed tool. The project operates no relay server, account system, analytics or telemetry service. This document describes the source implementation; browser stores and package registries have their own policies.

## Data flow

An MCP host sends the task and selected context to a service on `127.0.0.1`. The default managed backend submits through a headless Chromium page in its dedicated local profile and returns a bounded answer. The optional extension backend uses inactive tabs in the paired browser instead. ChatGPT handles the submitted text under the user's account settings and applicable policies. The tool does not automatically read workspace files or forward the whole main conversation.

## Local storage

- The service keeps job data in memory, with at most 100 retained jobs and terminal-job retention of one hour. Prompt/context fields are removed when a job ends. Restarting the service loses its jobs and deduplication records.
- A random bridge credential and port are stored in `~/.chatrelay/config.json` (or `CHATRELAY_HOME`). They authenticate local transport; they are not ChatGPT passwords, cookies or API keys.
- Managed mode stores a dedicated Chromium profile under that directory, including session state normally retained by the browser. ChatRelay does not export cookies/tokens or copy another browser profile. Storage can outlive the service; keep the entire directory private. The runtime download/copy is separate from the profile.
- The extension stores the paired credential, port and enabled flag in local extension storage. Connection status and the most recent task/tab IDs use session storage.
- ChatRelay does not write prompt or answer content to its own logs. The receiving host, terminal commands and browser can retain data independently.
- Managed task pages close after collection; extension-mode tabs remain for inspection. Conversations may remain in ChatGPT history according to account settings. Fresh conversations do not disable memory or personalization.

## Permissions and control

The extension requests access only to `https://chatgpt.com/*`, plus scripting, storage and alarms. It uses no cookie permission and does not export account sessions. The host permission is needed to create and automate fresh task tabs. It does not grant access to other website origins.

Run `chatrelay stop` to stop the service and its managed browser. Only the explicit `connect` command opens a connection window; normal MCP tasks never open one automatically. In extension mode, Disconnect disables reconnection. To remove local sessions, stop the service, remove its configuration/profile directory and uninstall the extension if used. Delete conversations separately in ChatGPT if desired. Cancellation does not guarantee stopping a generation or deleting history.

This is a release candidate with an experimental website integration. See [security](SECURITY.md) and [validation](docs/VALIDATION.md) for the tested scope.
