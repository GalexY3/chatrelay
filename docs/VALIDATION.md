# Local validation — 2026-10-20

Environment: Windows, Node.js 24.19.0, pnpm 11.25.0. Candidate: 1.0.0-rc.1. Distinguish the following evidence; none is a quota-savings benchmark.

## Automated local checks

The Node suite covers real MCP SDK/stdio and signed HTTP paths, job/batch state transitions, output bounds, lost acknowledgement recovery, request replay/tampering, configuration concurrency, detached startup/shutdown, encrypted pairing, Node/browser crypto interoperability, handshake readiness, heartbeat loss and owning-tab checks. Regressions cover sign-out/usage-limit transitions before and after submission, textarea drafts, changed questions, uppercase IDs, positive Chat selection and refusal of Work/unknown modes.

Managed-runner tests additionally cover no launch before connection, browser-start failure without retry, cancellation of queued entries and release of a browser that finishes launching during shutdown. Packaging tests inspect source-only tar paths/types, exact ZIP/tgz file parity, versions and reproducible extension contents.

Final local run after the live editor fixes: syntax/manifest checks passed. Node reported **86 passing checks**, zero failures/skips (85 named test cases and the shared WebSocket helper module loaded by Node's test discovery). All **14 actual Chromium fixture scenarios passed**: nine extension scenarios and five background scenarios. Regressions cover exact controlled-editor paste with escaped HTML, rich-link layout, real whitespace edits, whitespace-only textarea drafts and one-copy KaTeX extraction. Live managed/headless and usage measurements remain pending.

Frozen-lockfile installation passed. `pnpm audit --audit-level=high` reported no known vulnerabilities across runtime and development dependencies. Workflow/issue-form YAML parsed without errors. These checks do not establish security certification or hosted CI success.

The candidate runtime archive was installed with production dependencies in a fresh ignored consumer directory. Its real installed CLI passed MCP stdio startup, all six tool registrations, signed status/version, exact absolute MCP setup paths and refusal before a background profile is connected. No browser or real account task was launched. Release preparation inspected the source tarball, checked all extension bytes and license against the ZIP, and wrote SHA-256 checksums. The local manifest records `sourceCommit: null`; no commit/provenance is invented for this checkout.

## Actual browser fixtures

The original seven extension scenarios passed in Chromium, then two Chat-mode refusal scenarios were added and all nine passed. These use real Manifest V3 APIs, broker, popup, content script and DOM adapter against synthetic pages. External requests are intercepted and DNS is blocked. The fixture defers a new tab's initial navigation until Playwright has attached interception: otherwise this Chromium build can navigate before interception and show a DNS error. This shim is test-only; it is not evidence about live navigation timing.

Separate managed-mode scenarios exercise actual **headless, sandboxed** Chromium without an extension or visible tabs: MCP round trip with the observed 2026 composer markup, idle close/reopen with a private profile, sign-out/Work refusal, cancellation and subsequent work, and large-answer bounds. They contact no real account.

The initially downloaded browser would not activate from its cache location on this Windows machine. A byte-identical independent copy launches successfully. `scripts/prepare-browser-runtime.js` creates such a copy for tests, with a checksum record. The precise cause of Windows' location-dependent activation behavior has not been established; no OS settings or original cache files were changed.

Local evidence is ignored by Git: `artifacts/browser-results.json`, `artifacts/browser-runtime/prepared.json` and test result directories. Earlier six DOM-only in-app-browser fixture cases passed before the stricter Chat-mode guard was added; they are historical evidence, not a new run of this candidate.

## Signed-in manual Chat UI check

The user manually signed in to the in-app browser and selected Chat. The visible controls showed Chat selected and Work unselected. One short test query asking for a fixed marker and `2 + 5 = 7` was submitted through the ordinary UI and returned the expected marker with 7. The UI announced completion. No personal context was sent.

This exposed the current composer, mode, user-bubble, assistant-body and completion-status markup. The adapter was updated from those observed DOM attributes and the same structure is covered by local fixtures. Screenshot evidence: `artifacts/live-chat-ui.png` (local only).

This was **manual UI validation, not a live end-to-end managed/extension pass**. WebMCP tools were visible on the signed-out in-app page and absent after sign-in. The project does not assume that surface exists in ordinary Chrome/Edge.

## Real extension round trip — passed with recorded limits

On 2026-10-20 the user loaded and paired the extension in their ordinary Chrome. A real MCP stdio client submitted a bounded MHU review via the broker and extension; Chat mode was positively checked before send. The job completed and returned to MCP in 133.875 seconds. Two prior attempts failed before submission: one exposed controlled-editor reconciliation and autolink layout; one was refused because the diagnostic draft was retained. Both drafts belonged to this test and were inspected/cleared before the successful attempt. Only one real query was generated.

The accepted packet was 2392 UTF-16 characters. The initial extracted answer was 5463; MCP returned 3500 with `truncated: true`. KaTeX's MathML and visual glyphs duplicated formulas in that initial output. The updated extractor serializes each DOM TeX annotation once; unit tests and a real Chromium math fixture pass. The existing conversation was also read with that serializer without generating another answer. This subsequent DOM read is not represented as another successful MCP round trip.

Local account evidence is ignored by Git under `artifacts/mhu-research-03/`: the original MCP result, a cleaned subsequent DOM read, a report and a viewport screenshot of the submitted query. No account identifier, private conversation URL or live prompt is bundled in source packages. This is one account/task, not general compatibility, model identity or a quota benchmark.

## Live managed backend, platform and savings checks — pending

A visible extension smoke-test window was prepared but cancelled before sending a task when the user requested invisible operation. It was closed and its temporary service stopped. The background backend is the resulting implementation; its account profile has not been connected or copied from another browser.

The later explicit background connection attempt was rejected by Google's sign-in page as an unsafe/unsupported browser. It was stopped without changing protection settings, extracting cookies or adding stealth flags. The user chose the ordinary-Chrome extension alternative, which produced the round trip above. The account-specific headless route remains unvalidated.

No live managed/headless generation, backend-model attestation or before/after account quota comparison has been completed. A simple manual Chat response does not establish those properties. Other OS/Node combinations are configured in CI but no hosted workflow has run. No GitHub release, tag, npm publication or store submission has occurred.
