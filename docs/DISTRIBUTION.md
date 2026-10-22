# Distribution for 1.0.0-rc.1

Prepared on 2026-10-20. This is an MIT-licensed release candidate for local testing. No GitHub release, npm publication or extension-store submission has been performed.

## Build the candidate

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm run check
pnpm test
pnpm exec playwright test
pnpm pack --pack-destination artifacts/release
node scripts/prepare-release.js
node scripts/verify-release-install.js
```

The final command needs npm; a standalone npm CLI can be selected with `CHATRELAY_NPM_CLI`. Browser tests need the matching Chromium runtime. See [validation](VALIDATION.md) for the tested Windows executable override and the exact evidence limits.

Output under the ignored `artifacts/release/` directory:

- `chatrelay-local-1.0.0-rc.1.tgz`: runtime source, extension source, license and documentation. Runtime dependencies are downloaded during installation; Node.js is required.
- `chatrelay-extension-1.0.0-rc.1.zip`: optional Chrome/Edge extension for development loading, with installation notes.
- `release-manifest.json` and `SHA256SUMS`: version, hashes and available build metadata.

The release builder checks the tar archive without extracting it, rejects private files and unsafe entries, and verifies that its extension source and license exactly match the ZIP. The ZIP uses sorted entries and fixed timestamps. Local checksums do not establish publisher identity. Build attestations exist only if the public-repository workflow actually generates them; no local attestation is claimed.

## Install without a source checkout

With Node.js 22+ and npm:

```sh
npm install --global ./chatrelay-local-1.0.0-rc.1.tgz
chatrelay setup
chatrelay connect
```

`setup` prints absolute-path MCP configuration and opens no browser. `connect` explicitly downloads/prepares the browser if needed, then opens one dedicated window for manual login and Chat selection. It closes after detecting readiness. Subsequent jobs use that private profile in headless mode; they do not open normal browser tabs. The browser is released after idle time. An expired login fails the job and requires another explicit `connect`.

Alternatively, install the archive in a persistent empty directory and invoke `node node_modules/chatrelay-local/src/cli.js setup`. Use the exact MCP paths printed by that installed CLI and keep the directory in place. The archive is a local build, not an npm registry publication.

Existing configurations without a backend retain the extension behavior. To use the optional ZIP, extract to a persistent folder, load unpacked through Chrome/Edge's Extensions page, then run `chatrelay setup --extension` and paste its temporary pairing code into the popup. Extension mode creates inactive task tabs. Switch to background mode only through an explicit `chatrelay connect` after active work has finished.

## Verify a download

Compare each archive's SHA-256 with the intended release's published `SHA256SUMS`. In PowerShell:

```powershell
Get-FileHash -LiteralPath .\chatrelay-local-1.0.0-rc.1.tgz -Algorithm SHA256
Get-Content -LiteralPath .\SHA256SUMS
```

A checksum detects a changed file. It does not authenticate an untrusted archive/checksum pair. Before publication, link the reviewed source commit and actual workflow run; do not invent provenance for an uncommitted local candidate.

## Public rollout

The primary distribution is GitHub source plus the runtime archive. Background mode does not require an extension-store installation. Optional extension publishing can follow separately: Microsoft documents no registration fee for Edge Add-ons; Chrome documents a one-time publisher registration fee. Acceptance and account requirements still apply. [Edge registration](https://learn.microsoft.com/en-us/microsoft-edge/extensions/publish/create-dev-account), [Chrome registration](https://developer.chrome.com/docs/webstore/register).

The development ZIP has manual installation and updates. It is not a store-managed consumer installer. Chrome documents the supported distribution routes and restrictions on self-hosting. [Chrome distribution](https://developer.chrome.com/docs/extensions/how-to/distribute).

Release claims must distinguish synthetic tests, the recorded manual Chat UI check, and the still-pending authenticated background integration and usage benchmark. Free MIT source does not mean unlimited Chat access or measured savings. See [release gates](RELEASE.md), [provider conditions](INTEGRATION-RESEARCH.md) and [benchmark protocol](BENCHMARK.md).
