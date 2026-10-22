# Route to 1.0 final

Current code is **1.0.0-rc.1**. Creating a candidate or public source repository does not establish provider approval, account reliability or savings. Final 1.0 is not declared.

## Implemented candidate contracts

- Invisible managed browser by default; an explicit one-time connect command and no automatic login windows.
- Positive Chat-only guard; no OAuth/Work substitution or unknown-mode fallback.
- Six bounded MCP tools, atomic batches, serial dispatch and conservative recovery without ambiguous resubmission.
- Signed local HTTP; mutual extension pairing with encrypted credential exchange and readiness acknowledgement.
- Private profiles outside published artifacts; inspected source archives, exact extension parity, checksums and installation checks.
- CI for Node 22/24 and Windows/Linux, synthetic browser tests, advisory audit, pinned actions and minimal permissions. Remote results remain unobserved.

## Before calling it 1.0 final

1. Complete an explicit user-directed live test of the managed backend with its own connected profile: no visible task window, positive Chat selection, one submission, correct complete return and a usable failure state. Do not copy cookies from another browser.
2. Check long/reasoning answers, cancellation, expired session, verification and limits. Never automatically resend uncertain work.
3. Run the supported platform/browser/Node matrix and publish dated results with exact scope. Unsupported combinations must be stated.
4. Complete the matched-task benchmark before any quantitative quota-saving claim. Main-agent orchestration and verification must be included.
5. Review the provider-terms concern and describe the integration accurately. No store approval or account-safety claim is implied by tests.
6. Review the final staged source, license, privacy information and complete artifacts before public publication. Choose the actual repository/maintainer; no fictional badge or reporting address should be used.

## Build and verify locally

```sh
pnpm install --frozen-lockfile
pnpm run check
pnpm test
pnpm run test:browser
pnpm pack --pack-destination artifacts/release
node scripts/prepare-release.js
node scripts/verify-release-install.js
```

The preparation step inspects the tarball without extracting paths, verifies the extension ZIP matches every packaged extension byte and LICENSE, and writes a manifest plus SHA256SUMS. The installation check uses a fresh consumer directory and isolated config; it must not start a real account task or visible browser.

On Windows cache-activation failure, the optional test-runtime preparation script copies the installed Chromium and prints a path for `CHATRELAY_E2E_BROWSER_EXECUTABLE`. Do not disable browser security or modify OS components to make tests green.

## Publication and upgrades

CI generates workflow artifacts but does not publish. The manual candidate workflow can attest artifacts on a public default branch; only an actually generated/verified attestation may be advertised. GitHub, npm and extension-store publication are separate actions.

The extension numeric version is 1.0.0 with `version_name` identifying this RC. Release candidates are for unpacked testing, not store upload; a final unpacked build requires a manual reload. Stop an older broker **before replacing its old CLI files**: protocol-1/bearer clients are incompatible with this candidate. Queues/results are not migrated across restart.

Existing config without `backend` retains extension behavior. New configuration defaults to managed mode. `chatrelay connect` explicitly switches to managed mode after successful manual sign-in; `setup --extension` selects the optional tab-based backend. Switching requires no queued/running jobs.
