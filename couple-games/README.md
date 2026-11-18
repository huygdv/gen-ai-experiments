# CoupleGames — Online v0.4.0

**Production:** https://couplegames-vn.vercel.app
**Online lobby:** https://couplegames-vn.vercel.app/online.html

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
