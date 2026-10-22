# Keeping delegated reasoning in ChatGPT Chat

Reviewed on **2026-10-20**. Goal: send bounded reasoning tasks to ordinary ChatGPT **Chat** and return concise answers to the main MCP workflow, without substituting Work/Codex inference. Transport does not prove billing. The host still spends usage coordinating and verifying; Chat has its own limits. No credit-saving percentage has been measured.

## Integration choice

| Route | Benefit | Cost or limit | Decision |
| --- | --- | --- | --- |
| Dedicated persistent Chromium, headless after explicit login | No ordinary browser tabs, extension installation or visible task windows | Browser runtime and private authenticated profile; UI changes and login challenges can interrupt work | Default for new configurations in 1.0.0-rc.1 |
| Chrome/Edge extension with DOM adapter | Reuses a manually signed-in browser and has explicit task inspection | Extension installation; creates inactive task tabs | Optional compatibility backend |
| Native Messaging | Replaces the extension's local WebSocket link | Per-OS host installation/registration; still needs browser UI | Does not solve the requested invisible UX |
| WebMCP / site tools | Potentially structured page interaction with less selector dependence | Availability depends on browser, site and session | Research only; unavailable in the authenticated test session |
| Direct private website HTTP | Could avoid page rendering | Undocumented protocol, sensitive sessions and protective checks | Not implemented or used as fallback |
| Official plan-use OAuth | Documented direct inference after consent | Eligible inference uses Work/Codex allowance | Excluded by the user's usage requirement |

These are engineering decisions, not provider permission or billing guarantees.

## Why a dedicated background browser

Playwright supports a persistent user-data directory and Chromium's newer headless mode. ChatRelay launches a dedicated profile, keeps the Chromium sandbox enabled, closes each owned job page, and releases the process after idle time. Only the explicit `connect` command launches a visible login window. It never imports ordinary browser cookies or opens a visible browser as an automatic fallback. [Persistent contexts](https://playwright.dev/docs/api/class-browsertype#browser-type-launch-persistent-context), [headless Chromium](https://playwright.dev/docs/browsers#chromium-new-headless-mode).

This still uses a browser internally. Headless authentication compatibility has not yet been tested with the user's account. A challenge, expired login or unknown mode produces a failure; it is not bypassed. Synthetic browser tests establish local orchestration and cleanup, not account availability or usage routing.

The extension remains useful where a separately authenticated background profile is undesirable. `activeTab` is gesture-scoped and cannot grant unattended access to fresh inactive task tabs. Native Messaging changes only the local transport and adds host installation work. [Chrome activeTab](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab), [Native Messaging](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging).

Attaching debugging access to an ordinary browser profile adds avoidable exposure. Chrome's debugging changes require a nondefault data directory for remote-debugging switches; ChatRelay owns its separate directory and never attaches to the user's normal profile. [Chrome remote debugging](https://developer.chrome.com/blog/remote-debugging-port).

## WebMCP findings

The in-app browser exposed site tools on a signed-out ChatGPT page. A read-only state call reported that it was not authenticated. After the user signed in, those tools were no longer exposed in the observed session. That observation cannot support a production authenticated adapter.

Chrome documents an imperative WebMCP API, and its experimental tooling has browser/version/flag requirements. OpenAI also documents site tools in its desktop app. Neither establishes that a standalone Chromium profile currently exposes the same tools. ChatRelay does not change browser flags to enable them and does not invoke undocumented website APIs. [Chrome WebMCP](https://developer.chrome.com/docs/ai/webmcp/imperative-api), [Chrome tooling example](https://github.com/GoogleChromeLabs/webmcp-extension/), [OpenAI site tools](https://help.openai.com/en/articles/20001423-using-site-tools-in-the-chatgpt-desktop-app).

## Mode and observed UI evidence

On 2026-10-20, a user-authorized manual browser check observed Chat selected, submitted one nonsensitive arithmetic marker, and received the expected answer. It identified the current composer, rendered turns and completion announcement used to update the DOM adapter and fixtures. This was a manual UI check, not an end-to-end ChatRelay background run.

Before entering a prompt, the adapter requires an explicit selected Chat control alongside the Work alternative. Work, unknown modes, logged-out pages and usage-block messages stop submission. Collection also checks for explicit transitions to Work or blocked/login states. The guard observes UI; it cannot attest the actual model, provider accounting or account allowance.

## OAuth and private transports

Official Sign in with ChatGPT supports direct inference for open-source integrations, but eligible plan-use inference is charged against included Codex / ChatGPT Work usage. It does not satisfy the requested ordinary-Chat route. ChatRelay does not silently substitute it when the page adapter fails. [Sign in with ChatGPT](https://learn.chatgpt.com/docs/sign-in-with-chatgpt), [OSS integration](https://developers.openai.com/siwc/token-sharing-open-source).

Private website HTTP clients would require maintaining undocumented protocols and sensitive session handling. No such client was installed, copied or tested as ChatRelay's transport. Avoiding browser rendering alone is insufficient evidence of reliability, permission or a different usage route.

## Provider conditions and remaining evidence

The Europe Terms prohibit automated extraction of data or Output and circumvention of restrictions or protective measures. Returning page answers automatically creates a direct terms concern. DOM automation, headless mode, site tools or private HTTP do not establish permission. ChatRelay is an independent experimental integration, with no provider approval or account-safety claim. [Europe Terms of Use](https://openai.com/policies/eu-terms-of-use/).

Do not implement account rotation, rate-limit bypasses, protective-check bypasses or automatic retries of uncertain submissions. Free MIT source does not remove provider limits and conditions.

The next release evidence is a voluntary end-to-end run using an explicitly connected dedicated profile, followed by the [benchmark protocol](BENCHMARK.md) comparing quality, latency and actual host/provider usage. The user declined the separate visible extension test window; it was closed without sending a prompt. No new login window will open unless `connect` is explicitly invoked.
