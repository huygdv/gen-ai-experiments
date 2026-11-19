# ADR-RT-001 — CoupleGames authoritative real-time migration
Status: **staged / pending Redis backplane / NOT PRODUCTION GAME TRANSPORT**
Date: 2026-11-19

## Observed bottleneck
The v0.4.1 production client at `/online.html` uses ~350ms adaptive HTTP state polling while playing. Reported HTTP API RTT is around 200ms. Local optimistic claims respond instantly, but remote clients only learn about server-arbitrated claims on their next polling request. Some transitions repaint too frequently and each state-changing request writes a Vercel Blob CAS snapshot.

## Decision
- Use **native WebSockets on Vercel Functions** (GA since Oct 20, 2026). Deploy in Singapore alongside server-side room state.
- Authoritative game server decides each number's owner and battle effect, monotonically sequences messages, and broadcasts a **delta** to all players and the spectator.
- Redis or equivalent atomically shared room engine and **Redis Pub/Sub** backplane are necessary: WebSocket clients can be hosted in different Vercel Function instances. In-process broadcasting alone will lose cross-instance events.
- Persist immutable/recoverable snapshots to Vercel Blob at a bounded cadence rather than per claim. Do not use Blob as the hot Pub/Sub bus.
- Preserve optimistic feedback and reconcile rejected claims. WebSocket auto-reconnect with exponential backoff, `lastSeq` replay, and HTTP fallback when a socket cannot be established.
- Battle animations are interpolated locally based on timestamped state; broadcast compact events, not every rendered frame.

## Protocol v1 (proposed)
`join {roomCode, sessionToken, lastSeq}`
`snapshot {round, roomVersion, seq, players, claims, scores, battle}`
`claim {clientSeq, number}` -> `claim.accepted {serverSeq, number, owner, next, scores}` / `claim.rejected {serverSeq, reason, stateDelta}`
`game.started`, `game.finished`, `presence`, `ping/pong`.
No trust in client score, winner, or timestamp; validate ACL for host/spectator.

## Staged implementation
1. `api/ws-probe.js` + `ws-lab.html` verify upgrade and 10/50-message p50/p95 latency, compare HTTP RTT. The probe does not handle live game events.
2. Connect Redis (Singapore, production/preview) in Vercel Marketplace; verify Pub/Sub and atomic room claim across separate Vercel function instances.
3. Implement shared authoritative room engine and WebSocket gateway with reconnect/resume, 2/3 players and spectator, battle simulation; game client behind rollout flag.
4. Cross-network E2E, drop/reconnect tests, 1000 simultaneous-claim simulations, server-seq assertions; record real p50/p95 of input->ack and input->remote-render.
5. Promote only after p95 <250ms remote-render on stable Vietnam network is demonstrated (initial goal, not a guarantee). Maintain HTTP fallback and rollback.

## Security/cost
- Validate session tokens server-side, max payload length, per-socket rate limit and room membership; never expose Blob/Redis tokens.
- Redis, WebSocket function duration/memory and Pub/Sub messages incur service costs. Use idle timeouts and disconnect handling.
- Do not keep authoritative room state only in a Function instance: Vercel does not guarantee instance affinity.
- If Redis provisioning is blocked, retain v0.4.1 production and do not present the probe as a complete fix.

## Docs
- https://vercel.com/changelog/websocket-support-is-now-generally-available
- https://vercel.com/docs/functions/websockets
- https://vercel.com/kb/guide/real-time-chat-websockets
