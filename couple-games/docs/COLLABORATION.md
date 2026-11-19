# Distributed development protocol — GPT / Codex / Claude / home PC / cloud

## Branch ownership
- Protected conceptual integration: `couple-games-cf-do-mvp`; PR #2 represents the migration against `couple-games-sanso`.
- **Never commit direct to the integration branch after this handoff**, except designated integrator/approved hotfix; do not force push.
- Each task receives a branch from the current integration tip:
  `feat/cg-002-ws-codex-cloud`, `fix/cg-003-room-claude-home`, `chore/cg-004-security-gpt`.
- All task PRs target `couple-games-cf-do-mvp`, not main. No self-merge if another agent is available to review.

## Same-PC concurrency via worktrees (PowerShell)
```powershell
git clone https://github.com/huygdv/gen-ai-experiments.git
cd gen-ai-experiments
git fetch --all --prune
git switch couple-games-cf-do-mvp
git pull --ff-only origin couple-games-cf-do-mvp
git worktree add ../cg-claude -b fix/cg-003-room-claude-home origin/couple-games-cf-do-mvp
git worktree add ../cg-codex -b feat/cg-002-ws-codex-home origin/couple-games-cf-do-mvp
```
Each agent works in its **own directory**, never two agents on a single checkout/branch. Use `git status` and `git diff` before every commit and ensure only task-scoped paths changed.

## Multi-device communication
GitHub PRs and committed documents are the shared state; chats are not synchronized automatically. On entering a new session, fetch and read this handoff + open PRs. On exit, leave a PR link and a concise comment with objective, tests, blockers, and next action. Share no uncommitted state as if another device can see it.

## Conflict handling
- Respect a single `CG-xxx` owner; file overlap: announce a dependency and split modules, do not cherry-pick without review.
- Before PR: `git fetch origin; git rebase origin/couple-games-cf-do-mvp`; resolve conflicts only in owned files and rerun tests.
- Preserve a stable `src/engine.js` pure reducer and `src/index.js` transport, so game logic and network changes can evolve independently.
- Integration owner merges reviewed PRs serially after CI; update WORKBOARD and HANDOFF as a follow-up commit.

## CI and deploy rules
- Branch/PR CI: `npm run check`, `npm run build:check`.
- `.github/workflows/couplegames-cloudflare.yml`: deploy job only on explicit `workflow_dispatch` with `deploy=true` and Cloudflare secrets. Never expose secrets to PR builds.
- Cloudflare Git integration, if configured, must target a reviewed release branch or preview project; **never auto-deploy unreviewed feature branches as production**.
- Deployment change (hostname, routes, billing, private repo, public site cutover) requires the user's sign-off.
- Run `npm run test:smoke` with Worker local or preview and record URL in a PR if non-sensitive; no live room tokens.
