# Security and data handling

ChatRelay is local software with an experimental website adapter. The supported trust boundary is one user on a trusted OS account; it is not an isolation layer against local malware, administrators or browser compromise.

## Local authentication

The broker binds only to `127.0.0.1`, rejects unexpected Host and browser-page Origin headers, and grants no CORS access. HTTP HMAC proofs bind port, method, target, timestamp, nonce and body digest. Nonces are retained for 90 seconds, replay is rejected and the cache is bounded without evicting unexpired entries. Responses authenticate status/body and the request identity. Oversized bodies/results are bounded before parsing. The bridge secret is never sent directly as a bearer token.

Extension WebSockets use mutual protocol-2 proofs bound to fresh nonces, port and origin. Temporary tickets are single-use, expire after 120 seconds and have a cap of five. Their persistent-credential exchange is encrypted using AES-256-GCM and HKDF-SHA256. Dispatch waits for a readiness acknowledgement. Handshake/peer limits and a 60-second activity deadline bound stale connections. Protocol 1 is not accepted.

Loopback authentication is not transport encryption for prompts/results and does not protect against processes that can read your local configuration/profile. Extension Origins are not native-process identity attestation. Do not use this as a multi-user remote service.

## Browser boundaries

Managed mode creates its own profile and headless browser. It never attaches to another browser or exports its cookies. Browser sandboxing remains enabled and certificate validation is not disabled. Only the explicit connect command opens a sign-in window; login and verification are user-controlled. There is no automatic login, account rotation, protective-check bypass or stealth patch.

The managed page receives the local DOM adapter and a narrow callback for submission events, not filesystem access, shell tools or the bridge credential. Website text and answers are untrusted. The optional extension uses an isolated-world content script and accepts results only from the tab owning the job. Its permissions are limited to ChatGPT, scripting, storage and alarms; no cookies/history permission is requested.

The adapter refuses Work or an unknown mode before writing task text. This checks visible state and does not certify provider quota accounting. Website changes or unsupported completion UI can cause failure/uncertainty. Cancel closes local background collection or aborts extension collection; it does not guarantee stopping remote generation or removing history.

## Storage and recovery

The config directory contains the local bridge credential and, in managed mode, a persistent signed-in browser profile. POSIX restrictions are requested; Windows uses inherited directory ACLs. Keep the whole directory private. Never publish profiles, test artifacts with account state, `.env` files or credentials.

Jobs/results are memory-only, capped at 100, with one-hour terminal retention. Prompts clear at termination, but ChatGPT history and profile state follow account settings. No project-controlled server receives content and no prompt/answer content is intentionally logged. The host, shell and browser can retain data independently.

Ambiguous submissions are never automatically retried. Retained request IDs deduplicate identical work only within that broker lifetime. Authenticated response-body failures preserve IDs for recovery. Do not assume exactly-once execution across restarts.

## Reporting

Until a public maintainer enables GitHub private vulnerability reporting, do not post secrets or private account data in issues. Describe the issue without sensitive details and request a private reporting channel. No contact address or disclosure endpoint has been invented for this unpublished candidate.
