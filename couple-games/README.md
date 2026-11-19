> **Cross-device team handoff (2026-11-19):** Start with [AGENTS.md](AGENTS.md), [CLAUDE.md](CLAUDE.md), [HANDOFF](docs/HANDOFF-2026-11-19.md), [WORKBOARD](docs/WORKBOARD.md), [COLLABORATION](docs/COLLABORATION.md), [SECURITY](docs/SECURITY.md). Current GitHub repo `huygdv/gen-ai-experiments` is **PUBLIC**. This branch is **pilot only**, not a Cloudflare production deployment. See [private repo migration](docs/PRIVATE-REPO-MIGRATION.md).

# CoupleGames — v0.4.2 UI prototype (staging only)

**Production:** https://couplegames-vn.vercel.app (still v0.4.1, room creation currently unavailable because the private Blob store hit its usage limit).
**Online UI preview:** https://tui-minh-choi-lpebfy33l-huygdvs-projects.vercel.app/online.html?demo=1
**Infrastructure blocker:** Vercel Blob store `couplegames-room-state` has `limits-exceeded-suspended` as of 2026-11-19. New live rooms cannot be created until storage is migrated/restored. Do not claim v0.4.2 is production-released.
**Architecture decisions:** [multi-game platform](./docs/PLATFORM-ARCHITECTURE.md), [realtime backend alternatives](./docs/ADR-REALTIME-BACKEND.md).

## What changed

- Online moved from PeerJS Cloud / WebRTC to same-origin Vercel Functions + private Vercel Blob (Singapore).
- Server is authoritative for room membership, current target number, scoring, and 2-player battle units/HP. Race updates use Blob ETag ifMatch optimistic concurrency.
- Classic Săn Số supports host plus two guest players (3 players total), or spectator host plus two guests (2 players).
- Gián Bom supports exactly two combatants, with spectator host optional.
- Room invite links remain https://couplegames-vn.vercel.app/?room=XXXXXX; root redirects into online lobby.
- Old PeerJS-generated room codes (e.g. JYNN9U) do not migrate to server-backed rooms. Create a fresh code after deploying v0.4.
- Private room records expire after 2 hours; Blob objects have 1-day storage TTL. Each browser keeps its own session token in sessionStorage for refresh/rejoin.

## Limitations and checks

- Smoke-tested backend logic with simulated clients: create/join, full room, spectator role, start, correct-claim race/conflict.
- Vercel production build confirms api/room lambda and production domain READY; live two-physical-device online gameplay has not yet been independently verified.
- Serverless polling uses Blob operations and may incur costs. For growth, switch to Redis/managed realtime or WebSocket service with rate limits; use shorter polling only for small private matches.
- Caution: screenshotting or sharing a personal session token permits impersonation; invite URLs contain only the room code, not the session token.
- Existing tablet split-screen prototype remains on index.html.

## Version release

1. Edit couple-games/index.html, online.html or api/room.js on the couple-games-sanso branch.
2. Perform local/contract tests.
3. Deploy the **same** Vercel project tui-minh-choi, target production. Git auto-deploy is not configured.
4. Verify deployment state READY and alias couplegames-vn.vercel.app before sharing.

## v0.4.2 — Staged Săn Số UX / room management (2026-11-19)

- A unified sticky game HUD prevents the number target from being hidden behind the battle lanes, with compact avatars/scoreboard below.
- Non-scoring playful reactions: 😆 Haha, 🍅 tomato on a selected rival avatar, 💗 heart. Server enforces a 2.5-second cooldown, validates target and publishes a small reaction event.
- Lightweight streak highlight after 3 consecutive numbers, without changing authoritative scoring.
- Explicit online room actions: leave, host close, host lock/unlock, lobby kick and backfill to stable seat IDs; closing invalidates new invites. Refresh is not treated as leaving.
- Dedicated [platform architecture](./docs/PLATFORM-ARCHITECTURE.md) for a shared social shell and future Caro/Tank games.
- Real-time gameplay migration remains staged on [draft PR #1](https://github.com/huygdv/gen-ai-experiments/pull/1) and is **not** claimed as production-ready; HTTP polling is still the fallback/current path.

## Quality checklist

- [ ] Real-phone 2-player online trial on different networks
- [ ] Real-phone/tablet 3-player Classic + spectator
- [ ] Tablet landscape 1024x768 and phone portrait 390x844 visual check
- [ ] Room create -> invite -> join -> lock/unlock -> kick -> rejoin -> start -> rematch -> leave -> close
- [ ] Reactions rate limit + targets + spectators
- [ ] TCP WebSocket probe + Redis/Stream multi-instance proof before replacing HTTP polling
