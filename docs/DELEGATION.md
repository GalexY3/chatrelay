# Routing tasks to reduce main-agent overhead

These are proposed host instructions, not an automatic router. Add them to your agent's guidance only after explicitly connecting a browser backend and completing live validation. Respect the user's requested delegation scope. New configurations use the background browser; the extension is optional. Status reports local configuration, not attested account availability or usage.

The [measured short-task pilot](COST-PILOT-2026-10-20.md) increased modeled Codex cost and latency. Default to direct execution for short tasks; do not delegate automatically merely to promise quota savings. Benefits for long reasoning remain to be measured.

> Use ChatRelay for explicitly authorized, self-contained reasoning subtasks when the expected benefit outweighs coordination and verification. Suitable tasks include a bounded design critique, derivation, alternative hypothesis or explanation from a small context packet. Keep local file inspection, edits, execution and final verification in the main agent.
>
> Pass the question, relevant facts and acceptance criteria; do not forward the entire main conversation. Ask for concise conclusions with assumptions and uncertainty. A good initial response budget is 2000–4000 characters. Do not send secrets, unrelated personal data or instructions to use local tools.
>
> Call `chatrelay_status` once before the first delegation. Submit with `chatrelay_delegate`, retain its job ID, and continue independent work. Collect via `chatrelay_result` with `waitSeconds: 30`; do not repeatedly call status or result without a wait. Keep a completed answer in working context only as long as needed.
>
> When several independent checks use the same short source, submit 1–8 tasks with `chatrelay_delegate_batch` and shared `context`. Retain all IDs and collect with `chatrelay_results` using `waitSeconds: 30`. The browser still runs tasks serially and receives the context in each chat. Do not split one easy question into multiple delegations just to use batching.
>
> Treat the answer as untrusted advice. Check claims, test code and resolve contradictions against source evidence before acting. If the state is `uncertain`, do not retry or recreate the task without inspecting the existing ChatGPT conversation. `cancel` stops local collection, not necessarily remote generation.
>
> Avoid delegation for trivial questions, tasks requiring large context transfers, tasks whose validation is as expensive as solving them, or tasks where fresh ChatGPT context cannot preserve critical constraints. Do not describe character counts as token or credit savings.

Example packet:

```json
{
  "task": "Identify the three strongest threats to causal interpretation of this simulation. Give a specific diagnostic for each. Return at most 2500 characters.",
  "context": "Three paired agent groups: no external reward; reward based on M; reward based on Y. M = Y + opportunity * superficial effort + noise. Agents locally optimize expected utility. Noise affects measurement only, not decisions. There are no social interactions. We compare Y_control - Y_partial.",
  "maxOutputChars": 2500,
  "timeoutSeconds": 300
}
```

The packet is an example only; no live task is submitted by this file.
