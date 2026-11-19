# CoupleGames — agent entry point (GPT / Codex / Claude)

Scope: **only `couple-games/**`** in `huygdv/gen-ai-experiments`. Do not edit unrelated projects.

## Mandatory reading order
1. [Handoff](docs/HANDOFF-2026-11-19.md) — actual test evidence and current blockers.
2. [Workboard](docs/WORKBOARD.md) — task IDs, acceptance gates and owners.
3. [Collaboration](docs/COLLABORATION.md) — branches, worktrees, PRs, conflict resolution.
4. [Security](docs/SECURITY.md) — repo public, token handling, release gates.
5. [Cloudflare backend](cloudflare/README.md) and [architecture](docs/PLATFORM-ARCHITECTURE.md).

## State and source of truth
- Integration branch: `couple-games-cf-do-mvp`, **not deployed on Cloudflare yet**.
- Draft PR #2: https://github.com/huygdv/gen-ai-experiments/pull/2 (Cloudflare migration). Draft PR #1 is alternative Vercel WS research, not a competing implementation.
- Production `https://couplegames-vn.vercel.app` is still Vercel v0.4.1, **multiplayer not usable** as the Blob store `couplegames-room-state` is suspended due to quota. Never claim it is fixed.
- Cloudflare MVP supports Săn Số Classic (max 3 players or spectator host + 2) and emotes/room controls. **Gián Bom, Caro and Tank not ported**. No public Cloudflare URL yet.

## Execution rules for every coding agent
- `git fetch --all --prune`; inspect the integration branch and open PRs before modifying anything.
- Select ONE `CG-xxx` item from the workboard and state it in your PR. Use a separate feature branch and, when agents run in the same checkout, a separate worktree.
- Do not force-push, push to main, merge own PR, deploy production, alter Cloudflare billing/quota or commit secrets without explicit human approval.
- Run tests for changed scope, e.g. `cd couple-games/cloudflare && npm install && npm run check && npm run build:check`. For socket/network work, run `npm run dev` and in another terminal `npm run test:smoke`.
- Record **actual observed results**. Do not call Wrangler local benchmarks real two-device network latency.
- Add concise updates to your PR description: task ID, files, tests, remaining risks, deploy implications, handoff for next agent.
- Security: repository is PUBLIC. All keys only in Cloudflare secret settings or protected GitHub Actions secrets. See [security](docs/SECURITY.md).

## Definition of done
Code + relevant tests + reviewed PR + migration notes. Production release **requires** real two-/three-device tests on independent networks and explicit approval.
