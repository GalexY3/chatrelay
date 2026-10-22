# Cost pilot — 2026-10-20

**Result: this pilot did not save Codex usage cost.** For three short synthetic tasks, ordinary MCP delegation to ChatGPT produced correct answers but increased the estimated Standard credit equivalent by 90.6% against the matching direct control and took 7.0 times as long. This is preliminary evidence about the current workflow, not a universal result for complex reasoning tasks.

## What was measured

Two fresh direct Codex executions and one successful relay execution requested **GPT-6.1 Sol, medium effort**, using Codex CLI `0.163.0-alpha.10.2`, ChatGPT account authentication, ephemeral sessions, an empty working directory and the same six MCP tool definitions. User configuration was not loaded or modified. No API-key inference was used. In the relay condition, the Codex host submitted one batch, collected results and verified its final answer. It did not use shell, browser, file or search tools.

The fixed tasks were a JavaScript rate-limiter trace with a falsy-zero bug, a constrained lexicographic ordering, and an optimal two-worker schedule of eight jobs. Inputs and oracles were frozen before model invocation, with an identical SHA-256 across all run artifacts. Graders checked exact traces, the smallest valid ordering, schedule feasibility, precedences, overlap and the independently enumerated optimum. No MHU or personal project data was used.

All successful conditions passed **3/3 tasks**. ChatGPT's raw returned answers also passed 3/3 before the host's verification. No answer was truncated.

| Run | Seconds | Input tokens, including cache | Cached input | Output tokens | Reasoning tokens, included in output | Estimated Standard credit equivalent | Quality |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Direct, first observation | 27.52 | 15,282 | 0 | 888 | 684 | 0.98610 | 3/3 |
| Relay, blocked setup attempt | 22.66 | 48,060 | 30,976 | 894 | 49 | 1.15514 | 0/3; no task sent |
| Relay, completed batch | 193.68 | 141,171 | 119,936 | 1,753 | 196 | 1.79984 | 3/3 |
| Direct, matching configuration control | 27.57 | 15,282 | 0 | 720 | 516 | 0.94410 | 3/3 |

Input/cache/output counts came from the CLI's `turn.completed.usage`, not character estimates. Wall-clock time includes host startup, inference, MCP orchestration, ChatGPT waiting and host verification. Fixture construction and this investigation/development session are outside those per-execution measurements and consumed additional resources.

## Interpreting the estimate

The official Standard GPT-6.1 Sol rate card lists 50 credits per million uncached input tokens, 2.5 per million cached input tokens and 250 per million output tokens. Cached input is a subset of input, and reasoning output is a subset of output; neither is counted twice. The calculation is:

```text
equivalent = ((input - cached) * 50 + cached * 2.5 + output * 250) / 1,000,000
```

These are **modeled credit equivalents**, conditional on that Standard rate card, not metered debits, an invoice, euro savings or measured changes in included subscription allowance. OpenAI states that credit prices alone do not determine included subscription usage. ChatGPT Chat inference tokens and account usage were not observable here, so no total-compute or total-provider-cost claim is made. [Official pricing and token rates](https://learn.chatgpt.com/docs/pricing).

Against the matching direct control, the completed relay used 62.0% fewer Codex reasoning tokens, yet 143.5% more output tokens overall. It required one batch submission plus five result-collection tool calls. Copying task text into tool arguments, collecting metadata/results and processing further turns outweighed the removed reasoning. Cache reduced the repeated-input cost substantially; the estimate already includes that benefit.

The three serial ChatGPT jobs took 21.327, 29.999 and 115.012 seconds from dispatch. Those waits are part of the 193.68-second host run, not additional time to add again. Bridge character counts remain separate from tokens.

The first relay attempt was blocked by the isolated host's approval configuration before any job reached ChatGPT. Its usage has not been discarded. Enabling only the two already-authorized benchmark tools in the temporary process resolved it. Counting that setup failure plus the successful relay gives **2.95498 estimated credits**; no ordinary user configuration was changed. The matching direct control used the corrected temporary configuration too.

## Limits and product decision

This is one fixed three-task batch, two direct observations and one successful relay observation, in a nonrandomized order. It is not a ten-task representative study or a statistically precise effect estimate. Model/backend identity and billing tier were not provider-attested; the Codex model/effort were explicitly requested. ChatGPT settings and personalization may affect results. The account allowance counter is aggregate, shared and unsuitable for attributing individual task costs in this investigation. More model calls or longer delays should not be extrapolated into a guaranteed saving.

**Current recommendation:** solve short tasks directly. Keep ChatRelay an explicit alternative for self-contained reasoning where extra latency is acceptable; do not advertise automatic quota savings. Before claiming value for long reasoning, test those cases separately with the same quality guardrail. A promising optimization is deterministic orchestration that avoids repeatedly routing copied context and polling through the main model; its cost benefit is still unmeasured.

## Reproduce from a source checkout

These opt-in commands consume ordinary Codex and ChatGPT account usage. They require a paired extension, the installed Codex CLI and a fresh output directory for each run. The script retains failed attempts and never overwrites a previous trial.

```sh
node scripts/benchmark-costs.js --condition direct --out artifacts/my-direct-run --codex /absolute/path/to/codex
node scripts/benchmark-costs.js --condition relay --out artifacts/my-relay-run --codex /absolute/path/to/codex
node --test scripts/benchmark-costs.test.js scripts/benchmark-fixtures.test.js
```

Review `scripts/benchmark-fixtures.js` and the fixed prompts before running. The relay host temporarily permits only `chatrelay_delegate_batch` and `chatrelay_results`, for the synthetic tasks authorized by invoking this experiment. Other tools retain their normal approval behavior. Interrupted or uncertain jobs require inspection before any retry.

Local raw evidence is ignored by Git under `artifacts/cost-pilot-direct-01/`, `cost-pilot-relay-01/`, `cost-pilot-relay-02/`, `cost-pilot-direct-02/` and `cost-pilot-summary/measurements.json`. These paths are not promised as files in a public package. No public release has been created. The broader protocol remains in [BENCHMARK.md](BENCHMARK.md).
