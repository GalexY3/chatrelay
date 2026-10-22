# ChatRelay

Delegate bounded reasoning tasks from an MCP agent to ordinary ChatGPT Chat, then collect concise answers in the original workflow.

**1.0.0-rc.1 — release candidate, independent experimental integration.** Free, MIT-licensed, local software. No OpenAI API key, hosted relay, private ChatGPT endpoint or exported session cookie. Each user supplies their own ChatGPT account and remains subject to its limits and terms. Credit savings have not been measured.

[Español](LEEME.es.md) · **[Install on another PC / Instalar en otro PC](OTRO-PC.md)** · [Validation evidence](docs/VALIDATION.md) · [Integration research](docs/INTEGRATION-RESEARCH.md) · [Privacy](PRIVACY.md)

For the tested extension route in your ordinary signed-in Chrome/Edge, follow the [quick-start guide](OTRO-PC.md). It uses `node src/cli.js setup --extension`; no automated-browser login is required.

**Cost finding:** the [three-task pilot](docs/COST-PILOT-2026-10-20.md) produced correct answers but increased estimated Codex credit equivalents by about 90.6% and latency by 7.0x versus its matching direct control. Use direct execution for short tasks. Savings for long reasoning and included account allowance remain unmeasured.

## Background operation

The default backend uses a dedicated Chromium profile **without visible windows or tabs during normal tasks**. It does not attach to your everyday browser. The agent submits and collects jobs through MCP; browser interaction happens in local code, without screenshot/click tool calls from the main model.

Sign in once through the explicit `connect` command. Thereafter, the local service starts on demand, runs its browser headlessly and releases the browser after 60 idle seconds. It never opens a login window automatically. An expired session, verification screen, Work mode or an unrecognized mode stops the task and requires user action.

The Chat-only guard requires positive evidence from the selected Chat/Work control **before putting task context in the editor**. It also rejects explicit Work routes/selections. This checks visible UI state, not provider billing telemetry or backend identity. The tool does not add quota or guarantee zero main-agent usage: coordination and verification still cost usage in the host.

## Install and connect

Requirements: Node.js 22+; pnpm 11 for source development. Browser/runtime support is currently validated locally on Windows/Node 24. Linux and Node 22 checks are configured in CI but have not run remotely. The integration depends on the ChatGPT website and account features being compatible.

From source:

```sh
pnpm install --frozen-lockfile
node src/cli.js setup
node src/cli.js connect
```

`setup` prints an MCP configuration with exact executable and file paths; it opens no browser. `connect` prepares a matching Chromium runtime if needed, opens **one explicit connection window**, and waits for you to sign in manually and select Chat. It closes that window when the profile is ready. Your login remains in that local profile; ChatRelay never imports another browser's cookies or profile.

**Observed login limitation:** Google rejected sign-in in the automated connection browser during the 2026-10-20 test. The working route for that account was the optional extension in the user's ordinary signed-in Chrome, configured with `setup --extension`. It opens inactive task tabs and is not fully invisible. Do not assume a different password or another automated browser will resolve a social-login restriction.

For a downloaded runtime archive:

```sh
npm install --global ./chatrelay-local-1.0.0-rc.1.tgz
chatrelay setup
chatrelay connect
```

Use the MCP entry printed by `setup` in your host settings. For Codex the equivalent format is:

```toml
[mcp_servers.chatrelay]
command = "ABSOLUTE/PATH/TO/node"
args = ["ABSOLUTE/PATH/TO/ChatRelay/src/cli.js", "mcp"]
```

Reload the host after adding the entry. `chatrelay doctor` checks local readiness without sending a prompt. `chatrelay stop` stops the service and its managed browser. No OS startup service is installed. The next MCP connection starts the broker again.

Configuration and the managed profile live under `~/.chatrelay/` or `CHATRELAY_HOME`. The default broker port is `127.0.0.1:39391`. Keep that directory private and outside a public repository. The first connection may download several hundred megabytes of browser files; runtime dependencies are separate from the source archive.

## MCP tools

| Tool | Purpose |
| --- | --- |
| `chatrelay_status` | Local connection, backend and job states; no prompt is sent. |
| `chatrelay_delegate` | Submit one bounded task; return its recovery ID immediately. |
| `chatrelay_delegate_batch` | Submit 1–8 independent tasks with shared context atomically. |
| `chatrelay_result` | Collect one result, optionally waiting up to 30 seconds. |
| `chatrelay_results` | Collect 1–8 results with one bounded wait. |
| `chatrelay_cancel` | Cancel queued work or stop local collection. |

Task text is limited to 12000 characters and context to 24000. Shared and per-task context must fit that same combined limit. Output defaults to 4000 characters, capped at 12000; oversize answers are truncated **before leaving the browser**, with original-length metadata. Counts use UTF-16 code units, not tokens or credits. Timeouts are 30–900 seconds from dispatch, including browser startup and page loading.

Jobs run serially. A batch reduces coordination calls; each independent ChatGPT conversation still receives its own copy of the reference context. The main agent retains file access, editing, execution and responsibility for verification. ChatRelay does not replace the host's native subagent implementation. See [delegation guidance](docs/DELEGATION.md).

Example user request:

> Use ChatRelay to critique this function's assumptions. Send only the function and intended behavior, request a short answer, and verify the suggestions before editing.

Once connected, these CLI commands also send and collect a real task:

```sh
chatrelay submit "Give one counterexample to this assumption. Keep it concise."
chatrelay result JOB_UUID
```

## Recovery and data

States are `queued`, `dispatched`, `running`, `completed`, `failed`, `cancelled` and `uncertain`. `uncertain` means the prompt may already have run. Inspect the recorded conversation URL before any retry. The tool never automatically resubmits ambiguous work. Cancel does not guarantee stopping a generation or deleting its history at ChatGPT.

Every client submission receives a version-4 UUID before transmission. Lost acknowledgement errors preserve those IDs. Explicitly reusing an identical task's `requestId` returns its retained job rather than submitting twice; conflicting reuse is rejected. Deduplication is memory-only and ends after restart or retention expiry.

The broker retains at most 100 jobs and terminal results for one hour. Task/context fields are cleared when a job ends; responses disappear on restart. The dedicated browser profile retains the account session, and ChatGPT may retain conversations according to account settings. Fresh chats do not disable account memory/personalization.

Local HTTP requests and responses are authenticated with HMAC, timestamps, request nonces and body digests. An unrelated service cannot learn the bridge credential from its authorization header. Extension mode also uses mutual challenge/proof authentication and encrypts the pairing credential exchange. Loopback transport is not an encrypted channel or protection against a compromised OS account. See [security](SECURITY.md) and [privacy](PRIVACY.md).

## Optional extension backend

`chatrelay setup --extension` retains the original Chrome/Edge adapter. Load `extension/` unpacked and paste its two-minute, single-use setup code into the popup. Its credential is saved for reconnects. This mode opens an inactive tab in that browser per task and leaves it for inspection; use the default managed backend if you want no visible tabs. Switching backends requires no queued/running jobs.

No extension is required for background mode. No account, browser profile or host configuration is modified merely by installing the runtime package.

## Tested scope and release status

Local checks and installed-package evidence are recorded in [VALIDATION](docs/VALIDATION.md). On 2026-10-20, a real MCP → broker → ordinary Chrome extension → ChatGPT Chat → MCP task completed in about 134 seconds. Two preceding attempts stopped before submission; only one query was generated. The answer exceeded its return budget and was explicitly truncated. This test exposed and fixed controlled-editor paste, rich-link text and duplicate math extraction. Final local checks: 86 Node checks and 14 synthetic Chromium scenarios. **Live headless compatibility and actual quota savings remain unverified.** No protective-check bypass or stealth adapter is implemented.

The Europe Terms of Use prohibit automated extraction of data/output; automated collection raises a direct terms concern. This project does not claim provider approval or account safety. [OpenAI Europe Terms](https://openai.com/policies/eu-terms-of-use/). The official Sign in with ChatGPT inference route uses Work/Codex allowance and is deliberately not substituted for Chat. [Usage documentation](https://learn.chatgpt.com/docs/sign-in-with-chatgpt).

Version 1.0 final is not declared or published. The release candidate makes the implemented contracts reviewable while live/account and platform checks remain outstanding. [Release gates](docs/RELEASE.md), [benchmark protocol](docs/BENCHMARK.md), [distribution](docs/DISTRIBUTION.md).

## Development and packaging

```sh
pnpm install --frozen-lockfile
pnpm run check
pnpm test
pnpm exec playwright install chromium --no-shell
pnpm run test:browser
pnpm pack --pack-destination artifacts/release
node scripts/prepare-release.js
node scripts/verify-release-install.js
```

Browser fixtures block external requests and use isolated profiles; they never sign in or send live prompts. On Windows, if browser-cache activation fails, run `node scripts/prepare-browser-runtime.js` and set its printed path as `CHATRELAY_E2E_BROWSER_EXECUTABLE` before browser tests. This copies the installed payload without changing the cache or OS settings.

Packaging inspects the source archive, checks byte-for-byte parity with the extension ZIP, and creates `SHA256SUMS` and a release manifest. CI checks Windows/Linux and Node 22/24, browser fixtures, dependency advisories and package installation. A separate manual candidate workflow can generate provenance on a public repository. Building local files does not publish, tag, submit to stores or dispatch remote workflows.

License: [MIT](LICENSE). Independent project; not affiliated with or endorsed by OpenAI.
