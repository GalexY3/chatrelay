# Contributing

Use Node 22+ and `pnpm install --frozen-lockfile`. Run `pnpm run check` and `pnpm test` before proposing a change.

## Development and tests

For reproducible installation without dependency lifecycle scripts, use `pnpm install --frozen-lockfile --ignore-scripts`. Keep the lockfile in sync with intentional dependency changes; do not run automatic audit fixes as an unrelated change.

Keep the browser adapter separate from transport and job state. Tests must not contact a real account, read browser profiles or require credentials. DOM fixtures must be synthetic; do not commit captured conversations. New selectors need fixtures for success, ambiguity and failure, plus a dated manual test if live compatibility is claimed.

Never auto-retry a submission whose outcome is unknown. Do not add private endpoint calls, cookie extraction, verification bypasses or automatic account switching as recovery behavior. Return a clear unsupported state instead.

PRs should explain the behavior change, validation and any new permissions. Keep changes focused. Model/backend choices and usage accounting must remain explicit. Do not promise savings based on prompt length alone.

The ordinary CI workflow runs checks and installed-package tests on Windows/Ubuntu with Node 22/24. Its Linux browser job runs on pushes and pull requests, using intercepted synthetic pages and an isolated Chromium profile. It does not require a ChatGPT account. A configured workflow is not evidence that a remote run passed: link the completed run when reporting CI results.

Run `pnpm run test:browser` for browser-backend or adapter changes. An unavailable local Chromium should be reported separately from passed unit/DOM tests. Never weaken a failing synthetic test to claim live compatibility. Follow [release validation](docs/RELEASE.md) for account-bound testing.

## Dependency and workflow maintenance

`pnpm audit --audit-level=high` checks the lockfile against known advisories, including development dependencies. `pnpm audit --prod --audit-level=high` gives the runtime-only view. Both contact the configured package registry; a clean report is not a full security audit. Do not substitute `npm audit` against a newly generated lockfile and claim it audited the committed pnpm resolution. [pnpm audit](https://pnpm.io/cli/audit), [npm audit behavior](https://docs.npmjs.com/cli/commands/npm-audit/).

Actions are pinned to full commit SHAs from their official repositories; Dependabot proposes updates for Actions and npm/pnpm dependencies. Review source changes before accepting an update. Ordinary checks receive only `contents: read`, do not persist checkout credentials and use no account credentials. Do not add `pull_request_target` or grant write permissions to execute pull-request code. GitHub now recommends workflow dependency lockfiles as the stronger option, including transitive action pinning; this repository currently uses SHA pinning for compatibility and does not claim to lock transitive actions. [GitHub secure-use guidance](https://docs.github.com/en/actions/reference/security/secure-use), [workflow dependency lockfiles](https://docs.github.com/en/actions/concepts/security/workflow-dependency-lockfiles).

## Preparing reviewable release artifacts

From the reviewed checkout:

```sh
pnpm run check
pnpm test
pnpm audit --audit-level=high
pnpm pack --pack-destination artifacts/release
node scripts/prepare-release.js
node scripts/verify-release-install.js
```

Preparation inspects source tar entries without extracting them, rejects unexpected local-only paths and links, compares runtime/extension versions, and writes a ZIP, per-ZIP checksum, `SHA256SUMS` and `release-manifest.json` next to the runtime tarball. These are local files in ignored `artifacts/`; no release, tag or registry publication occurs.

The installed-package check uses npm from a standard Node installation and creates a fresh `artifacts/release-consumer-*` directory on each run, so stale files cannot hide packaging omissions. It retains the installed source there for inspection. A nonstandard runtime can provide an absolute `CHATRELAY_NPM_CLI` path to `npm-cli.js`. Process execution uses Node and argument arrays, with no constructed shell command.

The manual **Verify release candidate** workflow builds only the default branch, reruns the browser checks and can attest artifacts when the repository is public. Only that job receives OIDC/attestation write permissions. On GitHub Free/Pro/Team, artifact attestations are available for public repositories. A checksum detects changed bytes; an attestation associates a build with a workflow/source identity. Neither proves safety, correctness, live account compatibility or credit savings. Verify a downloaded artifact with `gh attestation verify PATH --repo OWNER/REPO` only after a successful attested build exists. [GitHub artifact attestations](https://docs.github.com/en/actions/how-tos/secure-your-work/use-artifact-attestations/use-artifact-attestations).

Use [.github/RELEASE_DRAFT.md](.github/RELEASE_DRAFT.md) as a draft, update it with observed evidence and actual source/workflow links, and retain the license and privacy/security links. Version changes, tags and publication remain separate reviewed steps.

## Extension-store readiness

Store listings must describe the actual single-purpose delegation workflow, the local-runtime dependency, account requirements and data sent to ChatGPT. Review the source behavior against PRIVACY.md and the store's disclosure fields; a public privacy URL and minimal permission justifications are needed. Chrome disallows broken or misleading functionality, and remotely hosted extension code is restricted. Edge likewise requires working functionality, narrow permissions, readable code and accurate disclosures. Synthetic tests alone are insufficient grounds to claim store readiness or acceptance. [Chrome policies](https://developer.chrome.com/docs/webstore/program-policies/policies), [Microsoft Edge policies](https://learn.microsoft.com/en-us/legal/microsoft-edge/extensions/developer-policies).

The unpacked ZIP remains a development distribution route; see [distribution decisions](docs/DISTRIBUTION.md). Do not add auto-installation, auto-update downloads, account/profile extraction or silent provider-route switching to simplify publication.
