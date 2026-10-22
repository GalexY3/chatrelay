# Historical product decisions for 0.2.0

Update, 2026-10-20: 1.0.0-rc.1 defaults new configurations to a dedicated headless browser after an explicit manual connection. This addresses the user's request to avoid visible task windows and ordinary browser tabs. The extension remains optional. The decisions below describe the earlier alpha; see [current integration research](INTEGRATION-RESEARCH.md) and [distribution](DISTRIBUTION.md).

Research reviewed on 2026-10-19. These decisions concern the local alpha. They do not establish live-account compatibility or credit savings; see [release validation](RELEASE.md) and the [measurement protocol](BENCHMARK.md).

## Keep the extension and local WebSocket

The current transport remains an MCP process, a broker bound to loopback, and a Chrome/Edge extension using the ChatGPT page. This keeps ChatGPT credentials in the browser and exposes an inspectable adapter without a hosted service. The extension still requires a running browser, a signed-in account and a compatible website. DOM automation can break when the website changes.

The 0.2.0 onboarding work removes the need to keep a separate broker terminal open and replaces copying a permanent local token with a short-lived, single-use pairing code. Those changes reduce setup work; they do not change which provider usage allowance pays for a delegated answer. Refer to the current CLI setup instructions in [README](../README.md).

Chrome supports WebSocket traffic in an extension service worker, including the keepalive pattern used by this project. This makes loopback WebSocket a practical transport for this phase. [Chrome WebSocket guidance](https://developer.chrome.com/docs/extensions/how-to/web-platform/websockets).

## Native Messaging is a future installer option

Native Messaging can start a local host and restrict access to listed extension IDs. However, it requires an additional host manifest, platform-specific installation paths and, on Windows, a registry entry. It also requires the `nativeMessaging` extension permission. Our decision is to defer that installation and support burden until a native installer has enough benefit to justify it. It would replace local transport, not the ChatGPT browser adapter. [Chrome Native Messaging](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging).

## Keep website access narrow

Background delegation creates a new inactive ChatGPT tab. `activeTab` grants temporary access to the active tab following a user gesture, so it cannot replace the website permission for this workflow. Access remains limited to `https://chatgpt.com/*`; permissions for cookies, browser history and unrelated websites are unnecessary. A future onboarding revision can request this host permission on demand through an explicit Connect action. [Chrome activeTab](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab), [permission declarations](https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions).

## Do not silently switch usage routes

An official browser-free inference route now exists for eligible open-source and locally hosted applications: Sign in with ChatGPT, plan-use consent and OAuth-authenticated Responses API requests. It does not grant access to existing ChatGPT conversations. This could become an optional adapter. [OpenAI integration overview](https://developers.openai.com/siwc/token-sharing-open-source).

However, OpenAI's user documentation states that plan use in participating apps consumes the included Codex / ChatGPT Work allowance. It adds no separate allowance. It therefore does not meet the specific objective of moving reasoning to ordinary Chat usage to reduce that agentic allowance, and must not be presented as a savings shortcut. [Sign in with ChatGPT](https://learn.chatgpt.com/docs/sign-in-with-chatgpt).

## Free software is not unlimited model usage

ChatRelay is MIT-licensed and can be offered free of charge without a project-hosted account or API key. Each user supplies their own ChatGPT account and remains subject to its availability, limits and settings. Compatibility depends on the applicable service and workspace rules.

The product hypothesis is lower main-agent usage for suitable, self-contained reasoning tasks. Coordination, reading, validation, failures and retries still consume resources. Character counters measure transport size, not tokens or credits. No saving has been measured. Complete the matched-task [benchmark](BENCHMARK.md), including correctness and latency, before making a quantitative claim.

See [distribution](DISTRIBUTION.md) for current packages and publication options.
