# Plan: smoky-agent builder/repair bot

Status: draft for review (2026-10-13). Docs only, nothing deployed.

## 1. What we are building

An issue-to-PR bot that runs as GitHub user `smoky-agent`:

- **Build**: issue labeled `agent:build`, or a comment `@smoky-agent build` from an allowlisted user (only `saariuslystoned` for now). Bot opens a **draft** PR, stacks commits, then marks it **ready for review**.
- **Repair**: only on a `@smoky-agent repair` comment on the PR (allowlisted user). Max ~3 repair rounds per PR, then stop and tag @saariuslystoned.
- **Never** merges, deploys, publishes, deletes branches, or touches settings.
- ClawSweeper stays **review-only**. The builder never reviews; ClawSweeper never builds.
- No Grok Bot or acp-runner in the loop.
- Commit author: `saariuslystoned <159389674+saariuslystoned@users.noreply.github.com>` (pushed by `smoky-agent`).

**Hard requirement:** model work runs on Ryan's subscriptions (Codex/ChatGPT, Antigravity/Google, Grok, Claude), **not** pay-per-token API keys.

## 2. Reference: how emdashbot runs (prior art)

Source: `emdash-cms/emdash`, folder [`infra/emdash-bot`](https://github.com/emdash-cms/emdash/tree/main/infra/emdash-bot).

| Question | Answer | Source |
| --- | --- | --- |
| Where it runs | One Cloudflare Worker at `bot.emdashcms.com` (webhook ingress, orchestrator, dashboard, agent) | `wrangler.jsonc` (routes), `package.json` description |
| State | Per-issue state machine in a Durable Object (`OrchestratorDO`); labels like `bot:working`, `bot:in-review` mirror state | `.flue/lib/machine.ts`, `BOT_STATE_MACHINE.md` |
| Trigger | GitHub webhook to `/webhook/github` (HMAC `GITHUB_WEBHOOK_SECRET`); commands are `@emdashbot <cmd>` at start of a comment line (`triage`, `work`, `investigate`, `retry`, `needs_changes`, `take_over`, ...) with actor roles | `.flue/routes.ts`, `.flue/lib/router.ts`, `.flue/lib/webhook.ts` |
| Agent harness | Flue (`@flue/runtime`) agents; code runs in a Cloudflare Sandbox container (`Dockerfile`) that can't push or see credentials | `.flue/agents/investigate.ts`, `wrangler.jsonc` |
| Models / billing | Workers AI binding, no API key: `@cf/qwen/qwen3-30b-a3b-fp8` (command classifier), `@cf/moonshotai/kimi-k2.7-code` (investigate/fix). Billed to the Cloudflare account; no subscription | `classify-command.ts:45`, `investigate.ts:270` |
| GitHub auth | GitHub App "emdashbot" (App ID + installation token from private key) | `.env.example`, `wrangler.jsonc` vars |
| PRs | Orchestrator (not the sandbox) publishes candidate branches/PRs, monitors PRs, repairs on `needs_changes`/`retry` | `candidate-publisher.ts`, `pull-request-monitor.ts` |
| Dashboard ("workbench") | Served by the same Worker at `/` (`dashboard.html`, `DashboardDO`); operator recovery API behind `EMDASH_BOT_OPERATOR_SECRET` | `.flue/routes.ts` |

Not verified: exact PR repair round limits; whether a separate "workbench" repo exists beyond this dashboard.

**Takeaway:** copy the shape (Worker ingress + Durable Object state + labels + dashboard), not the compute. Their model is Workers AI per-token; we need subscription CLIs, which need a real machine with logged-in CLIs.

## 3. Reference: how ClawSweeper runs Codex

Source: [`openclaw/clawsweeper` README](https://github.com/openclaw/clawsweeper/blob/main/README.md).

- Hosted GitHub Actions mode uses `OPENAI_API_KEY` behind a per-job local Responses proxy (API billing).
- Local mode uses the subscription: `codex login --device-auth`, then `pnpm run review -- --local-only ...`; `CLAWSWEEPER_CODEX_LOGIN_METHOD=chatgpt` forces ChatGPT OAuth and fails closed (`CHANGELOG.md`, `src/codex-env.ts`).
- Spark-2 already runs it this way (Codex 0.162.1). Same pattern works for the builder: CLI logged in once on the box, isolated `CODEX_HOME`, no API key in env.

## 4. Runtime options

| Option | Pros | Cons |
| --- | --- | --- |
| A. GitHub Actions self-hosted runner on CP-1 | Simple; GitHub handles triggers; outbound-only | Runner on a box with logged-in subscriptions executes workflow code from repos (risky on forks/PR text); per-repo workflow files; weak dedupe/lanes; no dashboard |
| **B. Worker at bot.dinkuskit.com + CP-1 runner pulls jobs (pick)** | Webhook verify/allowlist/dedupe at the edge; Durable Object holds state and lanes; CP-1 has no inbound ports; reuses Shed harnesses on subscriptions; natural home for dashboard later | Two components to build; CP-1 offline = jobs wait (acceptable, visible) |
| C. Webhook listener directly on CP-1 (via Tunnel) | Fewest parts | Public endpoint into the box with subscriptions; downtime drops webhooks; state lives on one box |

**Pick B.** It is emdashbot's shape with the compute moved to CP-1, where the subscription CLIs already live.

## 5. Architecture (option B)

```
GitHub (App webhooks) --> Worker bot.dinkuskit.com
                           - verify X-Hub-Signature-256
                           - allowlist actor, dedupe by delivery id
                           - JobDO per (repo, branch) + Cloudflare Queue
CP-1 runner (outbound only) --pull/lease--> Worker API
   - claims job, heartbeats, reports status
   - runs harness through AI Shed (shed.sm0ky.dev): Codex / Antigravity / Grok Build / Claude
   - git push + PR API as smoky-agent
```

- Runner polls (or holds a long-poll/WebSocket) to the Worker; auth with a runner token (Worker secret). No Cloudflare Tunnel needed; Tunnel only if we later want the Worker to reach CP-1.
- Session links: each job records the Shed session `/s/<id>` for later dashboard use.

## 6. Auth and secrets

- **Recommend a GitHub App** for webhooks + reading (scoped installs, signed webhooks, short-lived tokens), and **`smoky-agent` fine-grained PAT** on CP-1 only for push and PR create/edit, so commits/PRs show as smoky-agent. Alternative: App-only (PRs show as `app[bot]`), see open questions.
- `smoky-agent` repo role: Write. No admin, no merge (branch protection requires review), no delete.
- Secrets: Worker secrets via `wrangler secret put`; CP-1 secrets in a root-owned env file. Never echo, never pass into the harness env; harness gets a checkout and no GitHub token (orchestrator pushes, like emdashbot).
- Subscription logins: done once by Ryan per CLI; each job gets an isolated copy of the CLI home where the CLI supports it. No `*_API_KEY` vars set; runner refuses to start if one is present (fail closed, like ClawSweeper's `chatgpt` mode).

## 7. Concurrency and lanes

- One active job per branch (Durable Object lock keyed `repo#branch`). New triggers for a busy branch queue behind it.
- Up to 5 concurrent jobs per harness lane; global cap set by CP-1 capacity.
- Leases with heartbeat; a lease that expires (runner died) returns the job to the queue once, then marks it failed.

## 8. Harness choice and fallback

- Default order (configurable per repo): Codex -> Claude -> Antigravity -> Grok Build.
- Fall back to the next only on harness-level failure (quota/rate limit, login expired, crash), not on "the code is wrong".
- Record which harness ran in the PR body and job log.

## 9. Build flow

1. Trigger accepted -> react 👀 on the issue, label `agent:building`.
2. Create branch `agent/<issue#>-<slug>` from default branch, open **draft** PR linking the issue.
3. Harness works; runner runs repo checks (from `AGENTS.md` / package scripts) locally; commits stacked.
4. When finished, push final commit, mark PR **ready for review**.
5. Verify ClawSweeper picked up the **exact head SHA** (see §11). If not within ~15 min, comment once and tag Ryan.

## 10. Repair loop

- Only on `@smoky-agent repair` from an allowlisted user on the PR (optional free text = what to fix).
- Inputs: latest ClawSweeper verdict for the current head, failing checks, the comment text.
- Convert PR to draft while working, push, mark ready, re-verify pickup.
- Round counter in the Durable Object; after 3 rounds, stop, label `agent:needs-human`, tag @saariuslystoned.

## 11. Reading ClawSweeper verdicts

ClawSweeper edits its verdict comment in place, so comment-created events are not enough.

- Subscribe to `issue_comment` created **and edited**, and also poll: after marking ready, the Worker checks every 1-2 min (up to the timeout) for the ClawSweeper comment/check and parses the reviewed head SHA.
- A verdict counts only if its SHA equals the current PR head.
- Source of truth for state: clawsweeper.ztoned.com stays reviews-only; we read from GitHub, not its dashboard.

## 12. Failure handling

- Every failure posts one short PR/issue comment (what failed, harness, Shed session link) and sets `agent:failed`. No retry storms: max 1 automatic retry for infra errors.
- Dedupe by webhook delivery id and by (issue, command, comment id).
- Bot ignores its own events and any non-allowlisted actor (silently, no reply).
- Kill switch: Worker env var `BOT_PAUSED=1` and label `agent:stop` on an issue/PR.

## 13. Rollout

1. Worker in shadow mode (logs decisions, no GitHub writes), one quiet repo.
2. Runner on CP-1 with one harness (Codex), one lane, build only.
3. Enable repair, then more harnesses/lanes.
4. Add repos one at a time.
5. Last: dashboard at bot.dinkuskit.com (emdashbot dashboard style: job list, state, Shed session links).

## 14. Open questions for Ryan

1. GitHub App + smoky-agent PAT (recommended), or App-only?
2. Which quiet repo first?
3. Harness default order and any repo that must use a specific harness?
4. Do the Shed's Antigravity/Grok/Claude paths run headless today, or is Codex the only ready one?
5. Should Spark-2 also be a runner (Codex lanes), or keep it ClawSweeper-only?
6. Max job runtime before we kill it (suggest 60 min)?
7. Okay with branch naming `agent/<issue#>-<slug>`?
