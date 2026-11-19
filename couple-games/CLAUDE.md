# Claude Code instructions — CoupleGames

The canonical team instructions live in [AGENTS.md](AGENTS.md). Read that file **before** editing, then [docs/HANDOFF-2026-11-19.md](docs/HANDOFF-2026-11-19.md), [docs/WORKBOARD.md](docs/WORKBOARD.md) and [docs/SECURITY.md](docs/SECURITY.md).

This is the `couple-games/` subtree in the PUBLIC monorepo `huygdv/gen-ai-experiments`; there is no separate private CoupleGames repo yet. **Never commit .env, .dev.vars, credential files, tokens, session data or live room snapshots.**

If working on PC home while GPT/Codex work elsewhere, create an independent branch/worktree, take one CG task, and open a PR targeting `couple-games-cf-do-mvp`. Never overwrite others' in-flight branches. Validate with `npm run check`, `npm run build:check` and `npm run test:smoke` where relevant.

Before attempting Cloudflare deploy, check `wrangler whoami` locally **without pasting credentials or account identifiers into public logs**. Deploy only a non-production pilot after the user's approval. Keep the established Vercel domain untouched until live multi-device checks pass.
