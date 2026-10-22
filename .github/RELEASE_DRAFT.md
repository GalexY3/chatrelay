# ChatRelay 1.0.0-rc.1 — release notes draft

Prepared on 2026-10-20 for a future reviewed public source release. No release or tag has been created. The current local candidate has no source commit or hosted CI run; add their verified links when those exist.

ChatRelay delegates bounded reasoning from an MCP host to ordinary ChatGPT Chat and returns concise results. New installations use a dedicated background browser: explicit manual connection once, then headless task execution without ordinary browser tabs or visible task windows. The source is MIT-licensed and each user supplies their own ChatGPT account.

## Artifacts

- `chatrelay-local-1.0.0-rc.1.tgz`: installable runtime source and documentation; requires Node.js 22+ and downloaded dependencies.
- `chatrelay-extension-1.0.0-rc.1.zip`: optional Chrome/Edge extension for development loading.
- `SHA256SUMS` and `release-manifest.json`: local checksums and build metadata. No signed provenance is claimed for this local build.

See [installation](../README.md), [Spanish guide](../LEEME.es.md), [privacy](../PRIVACY.md) and [security](../SECURITY.md). The dedicated browser runtime is prepared separately by the explicit `connect` command, not bundled in the archive.

## Changes and migration

- Background profile with lazy launch, serial jobs, owned-page cleanup and idle process release. Expired login never opens a visible fallback.
- Positive Chat-mode guard and current observed composer/completion support; Work, unknown mode, signed-out and usage-blocked states are rejected.
- Six bounded MCP tools, atomic batches and wait-based collection. Uncertain submissions are not automatically retried.
- Replay-bounded signed HTTP and mutually authenticated extension protocol 2, including encrypted credential exchange and readiness acknowledgement.
- Source-only archive inspection, exact runtime/extension ZIP parity, checksums and isolated installation verification.

Stop an older broker before replacing its CLI files. Old bearer/protocol-1 clients are incompatible; queues/results are not migrated. Existing backend-less configuration retains extension behavior. `setup --extension` selects the optional tab backend; `connect` explicitly switches to the background backend after manual sign-in.

## Validation and limits

Observed locally on Windows, Node.js 24.19.0, pnpm 11.25.0:

- Syntax/manifest checks and YAML parsing passed.
- Node: 86 passing checks (85 named tests plus the shared helper module), zero failures/skips.
- Real Chromium fixtures: 14 passed, comprising nine MV3-extension scenarios and five sandboxed headless scenarios. Pages are synthetic and external traffic is blocked.
- Fresh archive installation with production dependencies passed: real installed CLI, MCP stdio, six tools, signed local startup/status, absolute setup paths and refusal before background connection. No account task or browser was launched.
- Frozen lockfile install passed. The registry advisory audit reported no known vulnerabilities; this is not a security certification.
- One real ordinary-Chrome extension task completed through MCP in about 134 seconds; two preceding attempts stopped before submission. The bounded return was explicitly truncated. The live test exposed controlled-editor and duplicate-math issues that were fixed and tested. Google rejected the automated connection browser for this account; authenticated headless compatibility and credit savings remain unverified.
- Windows/Linux Node 22/24 CI is configured but has not run remotely. No extension-store review or approval is claimed.

Website changes, login challenges and usage limits can interrupt delegation. The mode guard observes UI, not provider accounting or a specific model. Main-host coordination still consumes usage; no zero-cost or quantified savings promise is made. Cancellation does not guarantee remote generation stopped.

This is an independent experimental integration, not affiliated with or endorsed by OpenAI. Automated answer extraction raises the documented provider-terms concern; see [research](../docs/INTEGRATION-RESEARCH.md). Free source does not remove account limits or provider conditions. See [validation](../docs/VALIDATION.md) and the [remaining final-1.0 gates](../docs/RELEASE.md).
