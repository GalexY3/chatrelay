# Changelog

## 1.0.0-rc.1 — local release candidate, 2026-10-20

- New installations default to a dedicated background browser. `connect` explicitly opens the one-time manual login window; normal tasks run headless, close their owned pages, and release the process after idle time. Login expiry never opens a visible fallback.
- The optional extension remains available through `setup --extension`. Existing configurations preserve their backend.
- The shared DOM adapter requires observed Chat mode and rejects Work, unknown modes, login states and usage blocks. It supports the composer and completion announcement observed in the dated manual Chat UI check.
- A real ordinary-Chrome extension round trip completed through MCP. Google rejected this account's automated connection-browser login; the dedicated headless route remains unvalidated.
- Controlled-editor insertion now uses a normal DOM paste transaction, validates again after reconciliation, and reads rich links without CSS-induced line breaks. Real whitespace edits and existing drafts remain protected. Rendered KaTeX is returned once through its DOM TeX annotation.
- Local HTTP uses replay-bounded request and response authentication without exposing the persistent credential. Extension protocol 2 uses challenged proofs, encrypted credential exchange and acknowledgement before dispatch.
- Cancellation, ambiguous submissions, browser startup/shutdown races, bounded Unicode results and queue recovery have regression coverage. There is no automatic retry of uncertain work.
- Release tooling checks source-only archives, ZIP/runtime parity, checksums and installation in an isolated consumer directory. CI and a manual candidate workflow are prepared; no remote run or public publication is claimed.

See [validation](docs/VALIDATION.md) for final local checks. Authenticated headless end-to-end compatibility and actual credit savings remain unverified. This candidate is not the final 1.0 release.

## 0.2.0 — local alpha, 2026-10-19

- `setup` starts/reuses the broker and prints a two-minute, single-use connection code plus absolute-path MCP configuration.
- MCP startup launches the service on demand. `stop` shuts it down explicitly; no OS startup configuration is installed.
- Atomic batches accept 1–8 tasks with shared context. A multi-result tool collects their bounded answers in one call; browser execution remains serial.
- The popup shows task activity and can open the most recent task tab.
- Extension ZIP packaging is reproducible and includes a SHA-256 checksum. A runtime package allowlist supports source-free installation from a local `.tgz`.
- Concurrent config initialization, pairing/dispatch ordering and interrupted acknowledgement recovery are covered by regression tests.
- Product/distribution research, privacy information and a package installation check document the path to a public release.

43 automated checks pass; six earlier browser DOM fixture scenarios passed. Full extension/browser testing and live-account savings remain unverified. No public release has been made.

## 0.1.0 — initial local prototype

Bounded asynchronous MCP delegation through an authenticated loopback broker and Chrome/Edge DOM extension, with queueing, cancellation and conservative recovery of ambiguous submissions.
