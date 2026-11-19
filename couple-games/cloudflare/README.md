# CoupleGames Cloudflare Free-Tier MVP — 19/11/2026

Status: **Implemented and locally tested; NOT deployed to a Cloudflare account.** Production Vercel remains on v0.4.1 and its Blob-backed room service is currently suspended.

## Decision
- **Workers + SQLite-backed Durable Objects + WebSocket Hibernation + Workers Static Assets** as the only core services.
- **One DO per room code.** Single authoritative sequence, seat admission, access control, deterministic number claims, lock/kick, explicit leave/close, spectator support, 2-hour alarm/TTL.
- DO persists the `room` key and sends `room.event` to every connected WebSocket. A reconnect authenticates again and receives a full snapshot plus monotonic `seq`; losing the network does not forfeit the seat.
- WebSockets used for live claims and state push. HTTP API is retained for create/join and as a fallback.
- Current online Săn Số Classic is supported. **Gián Bom, Caro and Tank NOT YET ported to Cloudflare; the creation API intentionally rejects unsupported variants** rather than silently applying incorrect rules.
- No global leaderboard, login, chat history or analytics based on personal identities without consent.

## Why these free services and not every service
| Product | Now | Later if needed | Reason |
| --- | --- | --- | --- |
| Workers | Required | — | HTTP API + socket upgrade, static assets routing |
| Durable Objects + SQLite | Required | — | Room consistency and hot state; no Redis Pub/Sub |
| Workers Static Assets | Required | — | Host web UI on same origin to avoid extra Vercel/Cloudflare hop |
| D1 | No | Caro/Tank match history and opt-in leaderboard | Avoid writing every input into two databases |
| Workers KV | No | Low-frequency configs, feature flags | KV is eventually consistent; do NOT use for score arbitration |
| R2 | No | Avatars, screenshots, replays/assets | Larger object storage, unnecessary for text board |
| Queues | No | Async result summaries and aggregated metrics | Available on Workers Free (24h retention max); not for realtime messages |
| Turnstile | Release gate if public abuse rises | Bot mitigation on room creation | Free, server-side token validation required |
| Cloudflare Web Analytics | Optional | Anonymous traffic/error monitoring | Avoid collecting per-user sensitive details |
| Workers AI | No | Optional fun avatars or trivia | Not core to fair multiplayer; free allocation is metered |

## 2026-11-19 published Free limits (verify against dashboard)
- Workers: **100,000 requests/day** and **10ms CPU/request** on Free.
- Durable Objects: **100,000 billed requests/day**, **13,000 GB-seconds duration/day**.
- DO SQLite: **5M rows read/day, 100K rows written/day, 5GB stored** across account. The daily limits reset at 00:00 UTC.
- Durable Object WS incoming messages count **20:1 for billing requests**; outgoing socket messages not charged as requests.
- D1 (if introduced): 5M rows read/day, 100K written/day, 5GB storage.
- KV (if introduced): 100K reads/day, 1K writes/day; do not write room state into KV.
- R2 (if introduced): 10GB-month free standard storage; verify per-operation quotas.
- Workers AI: 10K Neurons/day included; some model access requires paid plan.

Unlike a free allowance on a paid account, **exhausting a Free quota can stop further operations until the limit resets**. Alerts/quotas/cost assessment are release requirements. Workers Free 10ms CPU is not a game-simulation budget: Tank 4–5 players likely needs a separate authoritative game host (e.g. Colyseus) after a measured spike, or careful DO ticks tested under actual caps.

## Test results (Wrangler local, Vercel Sandbox in Singapore)
- `node --test`: **8/8 PASS** on room engine.
- `wrangler dev --local`: **health HTTP 200**, Worker + DO bindings loaded, serving static assets.
- Live local test: host spectator creates room; guests A & B join, all three WebSockets receive both `game.started` and `number.claimed` events; loser gets 409; emote cooldown returns 429; closing room blocks late joins with 410.
- In the **same local test runtime**, remote broadcast took ~11ms. **This is not measured cross-network RTT or production performance.**

## Easiest connection: Cloudflare Workers Builds (GitHub integration)
No credential pasted in ChatGPT, no new Vercel storage store, no paid tier required for the initial test.

1. Cloudflare dashboard → **Workers & Pages** → create a **Worker** from a Git repository, connect GitHub repository `huygdv/gen-ai-experiments`.
2. Set **production branch** to `couple-games-cf-do-mvp` for an isolated pilot. In Cloudflare **Root directory**, enter `couple-games/cloudflare`.
3. Set Worker name `couplegames-rooms` to match `wrangler.jsonc`, **Build command** `npm install --no-audit --no-fund && npm run check`, **Deploy command** `npx wrangler deploy`.
4. Leave the Durable Object migration `v1: new_sqlite_classes: [CoupleRoom]` unchanged on first deploy. Worker static assets ship with the Worker automatically.
5. Verify `https://<worker-subdomain>.workers.dev/api/health` and then `/online.html`. Run live mobile tests (invite/create/join, claim push, spectator, reconnect, close). Keep `couplegames-vn.vercel.app` unchanged until this pilot passes.
6. Configure Cloudflare Free quota and build alerts, and apply a rate-limiting rule and/or Turnstile to the **create room** endpoint before public promotion.

Git-integrated Workers Builds deploy on push to the configured production branch. For a controlled manual path, the GitHub workflow `.github/workflows/couplegames-cloudflare.yml` is also included; it requires repository secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`, so the Git integration is simpler for the first setup.

Official Git integration docs: https://developers.cloudflare.com/workers/ci-cd/builds/git-integration/github-integration/ and monorepo configuration: https://developers.cloudflare.com/workers/ci-cd/builds/configuration/.

## Deployment prerequisites
1. Cloudflare account + Workers Free with Durable Objects SQLite available, and account-level quota review.
2. A scoped Cloudflare API token with Worker scripts edit/deploy and DO rights, stored as **GitHub Actions Secret or CLI login**, never in source code or chat.
3. Run from `couple-games/cloudflare`: `npm install`, `npm run check`, `npm run dev`, then `npm run deploy` (once linked).
4. Get the generated `*.workers.dev` hostname. Test 3 independent clients, 2 networks, mobile/tablet landscape, socket reconnect, upgrade restrictions, and <250ms p95 remote-render target (initial target, not guarantee).
5. Integrate the new endpoint into the stable Vercel domain, or redirect it to Cloudflare when explicitly approved; don't change production until E2E passes.
6. Set up Cloudflare usage/analytics alerts, Free quota monitors and room-creation anti-abuse (Turnstile or WAF rate limiting).

## Protocol
```
C → S: WebSocket /api/ws?room=ABC234 (NO token in URL)
S → C: hello.required
C → S: {"type":"hello","token":"<private token>"}
S → C: room.snapshot {room, playerId, role}
C → S: {"type":"action","action":"claim","clientSeq":1,"data":{"number":1}}
S → ALL: room.event {event:{type:"number.claimed",seq,number,owner,...},room}
S → C: action.ack {clientSeq,serverSeq}
S → C (invalid): action.rejected {code,clientSeq}
C ↔ S: ping / pong
```
Snapshots recover missed events after reconnection, but current v0.5 alpha does not yet include an event replay log. For turn-based and claim games the snapshot is authoritative; for Tank physics a separate realtime protocol will be required.

## Official references
- https://developers.cloudflare.com/durable-objects/platform/pricing/
- https://developers.cloudflare.com/durable-objects/best-practices/websockets/
- https://developers.cloudflare.com/workers/platform/limits/
- https://developers.cloudflare.com/workers/static-assets/
- https://developers.cloudflare.com/turnstile/plans/
- https://developers.cloudflare.com/changelog/post/2026-02-04-queues-free-plan/
