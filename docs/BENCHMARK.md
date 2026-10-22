# Measure savings before claiming them

The [2026-10-20 three-task pilot](COST-PILOT-2026-10-20.md) found no cost saving: correct MCP delegation cost about 90.6% more in modeled Standard Codex credit equivalents than the matching direct control and took 7.0 times as long. Actual included allowance deltas remain unmeasured. The protocol below describes the larger follow-up needed before broader claims.

## Compare matched tasks

Prepare at least 10 representative tasks with fixed inputs and objective rubrics: mathematical critique, bounded code review, alternative hypotheses, explanation and constrained planning. Keep the same main-agent model, effort, context and tools. Do not include trivial tasks where delegation overhead dominates.

For each task, compare:

1. Main agent solves the task directly.
2. Main agent delegates reasoning through ChatRelay, receives a short answer, then verifies it.

Use separate fresh sessions and alternate/randomize condition order. Repeat to assess variability. Record failures and retries; do not discard costly failed runs. Keep browser account defaults and ChatGPT model/settings recorded manually, because the current adapter cannot verify them. For batches, include coordination and result-collection calls in the measurement; shared context is still sent to each separate ChatGPT chat.

## Record independent outcomes

| Field | How to obtain it |
| --- | --- |
| Main-agent model and effort | Host session settings |
| Input/output tokens when available | Host usage telemetry; not bridge character counts |
| Account credits/allowance consumed | Account usage before/after, with other activity controlled |
| ChatGPT plan usage | Account usage where separately observable |
| End-to-end latency | Wall-clock time from task start to accepted result |
| Correctness | Same blind rubric for both conditions |
| Errors, retries and human intervention | Complete run record |
| Bridge input/output characters | Job metadata; overhead proxy only |

Do not infer exact token counts from character ratios or metered debits from token rates. An explicitly published Codex credit rate card may be used for a clearly labeled estimate, with input/cache/output separated; it is not an observed allowance debit. If quota deltas are too coarse, report that allowance savings are unmeasured rather than producing a percentage. Provider limits and accounting can change.

Suggested run sheet:

```csv
task_id,condition,repetition,main_model,main_effort,chat_model_observed,main_input_tokens,main_output_tokens,main_usage_delta,chat_usage_delta,seconds,score,errors,human_interventions
```

## Savings with a quality guardrail

When actual comparable usage is available, compute `1 - usage_delegated / usage_direct`. Include coordination, response reading, validation and failed attempts in `usage_delegated`. Report dispersion across tasks, latency and correctness alongside savings. Lower usage with materially worse answers is not a successful result.

Distinguish reduced Codex usage from reduced total compute. This bridge can move work; it does not eliminate reasoning costs, add free quota or override account limits.
