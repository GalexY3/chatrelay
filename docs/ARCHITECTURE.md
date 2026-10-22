# Architecture — 1.0 candidate

The default path is: MCP host → stdio MCP process → authenticated loopback HTTP → broker/job state machine → managed headless Chromium → ordinary ChatGPT Chat. Returned text follows the reverse path. Browser interaction is local code rather than model-driven screenshots or clicks.

## Managed backend

`src/managed-browser.js` owns a dedicated persistent profile and serial execution chain. It launches only headless contexts for normal tasks, opens private pages, runs the local DOM adapter, bounds the result inside the browser and closes each page. After 60 idle seconds it closes the context. Profile/session files persist locally. No normal-browser tab, cookie export or profile attachment is used.

`src/browser-runtime.js` prepares the matching Playwright Chromium build. On Windows an independent copy avoids the cache-location activation problem observed locally. It never changes OS security settings or the original cache. Chromium sandboxing is enabled; downloads are disabled. Only `chatrelay connect` launches a visible window for manual account sign-in and Chat selection. Session expiry never opens a window automatically.

The broker receives in-process submission/result events from this runner. Cancellation closes its owned background page; queued execution and shutdown are coordinated so a late browser launch cannot outlive service shutdown. No files/tools or bridge credentials are exposed to the page; its only Node binding records submission. Page output remains untrusted advice.

## Optional extension backend

`setup --extension` uses `extension/worker.js`, `content.js`, `auth.js` and the same DOM adapter. This mode opens fresh inactive tabs in a normal Chrome/Edge profile and retains them for inspection. Only messages from the owning extension tab are accepted. Popup commands require the exact extension popup URL and extension ID.

WebSocket protocol 2 uses server/client nonces and domain-separated HMAC proofs bound to port and extension origin. Single-use tickets expire after 120 seconds, with at most five retained. Temporary pairing delivers the permanent bridge credential in an AES-GCM box using an HKDF-derived key. Dispatch begins only after the extension saves the credential and acknowledges readiness. Incomplete handshakes expire; missing heartbeat activity disconnects the owner after 60 seconds. Running work becomes uncertain; queued work remains queued.

## Local HTTP and jobs

The broker binds only to `127.0.0.1`, rejects unexpected Host/Origin headers and authenticates method, target, port, timestamp, request nonce and body digest with HMAC. A bounded 90-second nonce cache rejects replay; signed responses bind status and raw body to the originating request. The permanent secret is not sent in authorization headers. These checks provide authentication/integrity, not encryption of loopback content.

`src/jobs.js` owns bounded validation, serial dispatch, timestamps, cancellation, retention and request-ID deduplication. Atomic batches accept 1–8 tasks; shared context is combined with each task within the 24000-character limit. Job results are collected singly or in groups with at most 30 seconds of waiting per MCP call. At most 100 jobs are retained, terminal results expire after one hour and prompts clear when jobs finish.

Request UUIDs are generated before submission and normalized consistently. Lost acknowledgement errors retain recovery IDs, including interrupted response bodies. Deduplication is in-memory; restart/expiry ends it. Dispatch loss, timeout, tab closure or ambiguous submission never triggers an automatic resend.

## Website contract and limits

Before writing context, the adapter requires a positively selected Chat control and refuses Work, unknown modes, existing conversations and drafts. It verifies the submitted user turn. The observed 2026 composer/response markup uses a final assistant body and a completion announcement; legacy markup uses generation controls and a five-second stability heuristic. The home mode toggle may disappear after submission, so collection retains the pre-send confirmation while still rejecting explicit Work signals.

The adapter does not attest backend identity, provider accounting, memory isolation or universal website compatibility. The official plan-use OAuth route is not implemented because it uses Work/Codex allowance. WebMCP was visible only on the signed-out in-app page during research and was absent after sign-in; it is not assumed available to the public adapter.
