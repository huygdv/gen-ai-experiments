# ADR-CG-002 — Chọn realtime backend cho nền tảng CoupleGames (19/11/2026)

**Status:** Decision proposal. No Cloudflare/Redis credentials configured; no deployment to realtime backend has been performed.

## Tình trạng đo được
- Frontend Production v0.4.1 đang dùng HTTP polling nhanh (mục tiêu ~350ms) và optimistic UI.
- Người dùng báo RTT API ~200ms vẫn cảm giác trễ.
- Staging v0.4.2 mới được kiểm tra từ Vercel Sandbox và API `POST /api/room` trả HTTP 503.
- Vercel runtime: `Vercel Blob: This store has been suspended.` (not a WebSocket latency issue).
- Store `couplegames-room-state`: `billingState=suspended`, `usageQuotaExceeded=true`, `status=limits-exceeded-suspended`. Only 8 objects totaling 9,900 bytes; specific exceeded metric unknown. Per-game writes and state polling must not use Blob as a hot room store. **Do not create another Blob store to bypass usage limits.**
- Current frontend changes (floating HUD, avatars, emotes, explicit room lifecycle) passed synthetic API tests but cannot complete live staging E2E while Blob is suspended.

## Options assessed (2026)
| Option | Strength | Weakness | Fit |
| --- | --- | --- | --- |
| A. Vercel Functions Native WebSocket + Redis Streams | Keep hosting and deployment on Vercel; WebSocket GA (Oct 2026), event replay and atomic Redis CAS | At least two coordinated services; cross-instance broadcast/reconnect needs stream fanout, metrics, cost | Strong if Redis already connected |
| **B. Cloudflare Workers + Durable Objects, one object/room** | Strong single-room coordination and storage, built-in WebSockets, idle hibernation, no Redis Pub/Sub required | Requires Cloudflare account deployment and cross-provider routing/config; benchmark per-room performance before tank | **Preferred spike for Săn Số + Caro + social room core** |
| C. Dedicated Colyseus server | Room lifecycle, authoritative input, delta sync, predictable game tick, modern prediction support | Separate runtime/ops/cost, substantial for simple tap/turn games | Preferred spike for 4–5 player Tanks |

### Recommendation
**Test Cloudflare Durable Objects for the social room platform first**, in a separate proof of concept while leaving frontend on the existing Vercel domain. Keep the transport and storage as interfaces. 
- One Durable Object per room code: accept WebSocket clients; authenticate host/player/spectator; maintain authoritative state and monotonically increasing server seq; broadcast delta events synchronously; SQLite-backed persistence; WebSocket hibernation while idle.
- Use Cloudflare Worker route `/room/:code` and optionally Vercel rewrites/reverse proxy; ensure upgrade headers, correct CORS, and invite URLs stay on `couplegames-vn.vercel.app`.
- Avoid server-held timers in inactive rooms; active Tank simulation may keep objects awake and cost duration. Benchmark rather than assume Tanks fits.
- Build one shared `RoomProtocol` regardless of backend so Caro, Săn Số, Tank share room UI and emote actions.
- Retire Blob from hot path. Persist optional match history separately when demanded; for MVP TTL per-room data is sufficient.

## Protocol
```
HELLO {room,token,lastSeq}
WELCOME {roomVersion,seq,seatId,role,phase,config,snapshot}
ROOM_JOINED / ROOM_LEFT / ROOM_LOCKED / ROOM_CLOSED
GAME_START / GAME_INPUT / GAME_EVENT / GAME_END / REMATCH
REACTION {id,kind,target,from,serverTime}
ACK {clientMsgId,serverSeq}
NACK {clientMsgId,reason,expectedVersion}
REPLAY {sinceSeq} => SNAPSHOT plus any replayable events
PING / PONG + application health
```
- Sequence + idempotency per client/round, monotonic and collision-safe.
- First valid claim wins by **server receive order** per room; optimistic client UI reconciles on ACK/NACK.
- Stream delta/event, not full board on each tap; bounded snapshot for join/reconnect.
- React emoji rate limit 2.5s, per-room mute and cap 12-event replay.
- Authoritative room validates seat, capacity, spectator role, turn/tick rules.

## Tentative product milestones
1. **Recovery now**: users can see clear storage-unavailable reason; keep old Production unmodified until a new source of truth is verified.
2. **Spike B (Durable Objects)**: create/join on two networks, 3 players + spectator, 100 simultaneous claim attempts with one winner per number, reconnect + replay, close/kick/leave, 2h TTL. Measure p50/p95.
3. **Ship v0.5**: switch production game action API and websocket transport to DO, rollback supported; keep stable front-end URL.
4. **Caro v0.1**: 15x15 freestyle five-in-row, 2 seats + spectators, rematch swap first player, game rules pure reducer.
5. **Tank spike**: 4–5 players free-for-all or 2v2 with 5th spectator; Phaser client, compare Colyseus vs DO 20/30 Hz, 60FPS render, mobile joystick, prediction. Choose based on actual p95/jitter and operational load, not the frontend framework.

## Blockers and operational safety
- Deployment to Cloudflare requires explicitly connecting/deploying to the user's Cloudflare account or Workers toolchain. No connected Cloudflare deployment action currently available here.
- Alternatively attach Redis from Vercel Marketplace; any paid-resource choice is user-controlled.
- Do not claim current game's multiplayer fixed or the v0.4.2 code released; staging API currently returns 503 while suspended.
- Monitor session/room quota, rate limits and no-spam, input size, client per-IP throttles, cost per concurrent 5-player room, data-retention and vulnerability exposure.

## Official resources
- https://developers.cloudflare.com/durable-objects/best-practices/websockets/
- https://developers.cloudflare.com/durable-objects/best-practices/architecture-guidance/
- https://developers.cloudflare.com/durable-objects/platform/pricing/
- https://vercel.com/changelog/websocket-support-is-now-generally-available
- https://vercel.com/kb/guide/do-vercel-serverless-functions-support-websocket-connections
- https://docs.colyseus.io/
