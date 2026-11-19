# CoupleGames v1 — Shared Platform Architecture (2026-11-19)

## Product definition
**One destination for small social games**: invite by link, choose a game, play together, react to one another, replay or change game without losing the room. Casual, mobile/tablet-first, no account required for MVP.

### Architectural decision
Build a **shared social shell** + **per-game modules**. Do not force turn-based Caro and fast-action Tanks into a single game loop.

```text
CoupleGames Web (Vercel)
  Home / game catalog / room lobby / friends / profiles
  ├─ Social Room Core: invite, join, reconnect, seats, host, spectator
  ├─ Interaction Core: avatars, emotes, chat quick replies, mute, privacy
  ├─ Transport Layer: WebSocket + HTTP fallback, sequence/ack/replay
  └─ Game Registry:
      ├─ san-so / classic + gian-bom (reaction-time authoritative claims)
      ├─ caro (turn-based validator: board + turns + victory rules)
      └─ tank (fixed-tick authoritative combat, 4–5 players)

Backend: Control plane (Vercel Functions + shared auth/Redis)
  └─ Game data plane:
      A. Turn/claim-based games: atomic state actions, event broadcast
      B. Action games (Tank): Colyseus room server, snapshots, prediction
            ↳ Phaser 4 client renders 60 FPS and interpolates remote tanks
Shared: Redis room directory/session leases + event stream
Durable: snapshot/replay log via database / object storage (policy)
```

## Module contracts (TypeScript sketch)
```ts
type GameId = 'san-so' | 'caro' | 'tank';
type RoomPhase = 'lobby'|'countdown'|'playing'|'paused'|'finished'|'closed';
interface GameDefinition<TState,TAction> {
  id: GameId; title: string; minPlayers: number; maxPlayers: number;
  supportsSpectators: boolean;
  transport: 'turn'|'event'|'fixed-tick';
  configSchema: unknown;
  createState(seed: number, seats: Seat[]): TState;
  validateAction(ctx: GameContext, state:TState, action:TAction): ActionResult;
  applyAction(state:TState, action:TAction): TState;
  isFinished(state:TState): { winnerIds: string[] } | null;
  serializeView(state:TState, viewer: Viewer): unknown;
}
interface RoomSession {
  roomId: string; gameId: GameId; phase:RoomPhase;
  hostId: string; seats: Seat[]; spectators: Viewer[];
  settings: { locked: boolean; capacity: number; privacy:'unlisted'|'private' };
  round: number; stateVersion: number; expiresAt: number;
}
```

Host/room logic must be defined in one place, **not copied in each game's front-end**. Each game renders its own board or simulation; all receive the same room event envelope and social overlay. Keep a transport adapter so the first games use native Vercel WebSockets and Tank can use a dedicated Colyseus authoritative server without replacing UI/routing.

## Game-specific engine and rules
| Game | Players | Update model | Suggested tooling | Scope |
| --- | --- | --- | --- | --- |
| Săn Số | 2–3 + optional host spectator | server arbitrates `claim(number)`, sends `number.claimed` events | existing DOM; native WS + Redis | now |
| Caro | 2 + spectators | server enforces turn and 5-in-row with configurable rules | pure TS reducer, optionally boardgame.io concepts; DOM/SVG | next |
| Tank | 4–5 + spectators | input commands, server 20–30Hz, client 60fps interpolation and prediction | Phaser 4 front-end, Colyseus back-end | later spike |

**Never transmit full board state every animation frame.** Tank sends input vectors and compact authoritative snapshots ~10–20Hz, interpolates remote entities and predicts local player. Server remains authoritative over collisions, health, ammo, powerups and winning.

## Unified room lifecycle: state machine
```text
created → lobby → ready/countdown → playing → finished → rematch/lobby
             ↘ close (host)         ↘ close (host)
lobby: join, leave, kick, lock/unlock, change settings
playing: reconnect (grace window), forfeit, emote, spectate, pause policy
closed: all clients notified, invites invalid, no new actions
```
- Fixed seat IDs across disconnects; joining after a lobby kick fills available seat without changing other players' IDs.
- Explicit **Leave** vs transient offline. Browser refresh must *not* forfeit. Rejoin credentials stored per tab, not in invite URL.
- Explicit **Close Room** by host, with confirmation; all players should see it. For a host unexpectedly offline, allow grace period and transfer host/room expiry in next milestone.
- Host tools: lock room / kick **only before start** / change game only between rounds. During game, spectator cannot claim. Rate limit emotes and provide mute setting.
- Public code is an invite identifier, **not authentication**. Tokens and capacity are server controlled. Limit active rooms and input throughput.

## UX priorities for Săn Số
1. **One sticky HUD**: number target always visible; score/avatar row beneath; battle lane third and collapsible. Optimized for 1024×768 and horizontal tablet; avoid two independent sticky elements overlapping.
2. 100-number board must be readable at mobile widths, with large tap targets, no drag/mis-taps; optional hint for users new to game.
3. **Playful competition**: target another player's avatar and send Haha 😆, Tomato 🍅 or Heart 💗. Local animation immediately, relay as small server event; 2.5s cooldown; no public chat needed.
4. Fairness: server arbitration, optimistic UI rolled back if claim lost, visible confirmed latency/transport diagnostics. Next stage **WebSocket with shared Redis event stream** rather than expensive 350ms HTTP polling.
5. Optional later: streaks, close-race feedback, result awards (fastest-finger, comeback, most tomatoes thrown) — don't add misleading random bonuses to skill-based scoring.

## Delivery and measurable gates
**M0 (now):** sticky HUD, avatar/reactions, explicit leave/close, host lobby lock/kick, correctness tests. Release behind existing stable CoupleGames URL.
**M1:** socket transport + atomic Redis room state, reliable reconnect and presence, ping p50/p95 instrumentation, cross-instance fan-out. Preserve REST polling fallback.
**M2:** game catalog and Caro 2p prototype using shared lobby, spectator support and rematch. No account required.
**M3:** Tank 4–5p technical spike with Phaser 4 + Colyseus; measure gameplay p95/jitter and optimize interpolation. Use a separate game data plane, reuse social shell.
**M4:** friends/invite history (opt-in), persistent profiles, ranking (opt-in), moderation and analytics.

**Release criteria:** at least two physical devices on separate networks, no duplicate claims, room create/join/leave/close/rematch, 3-player classic and 2-player battle, spectator, disconnect+restore, responsive phone/tablet portrait/landscape. Publish actual p50/p95 before calling real-time networking "fixed."

## Important trade-offs
- Shared room + social widgets offer leverage and consistent UX; do not prematurely package unrelated physics into a generic engine.
- Native WebSocket on Vercel is generally available (Oct 20 2026) but each connection sticks to one Function instance; Redis or equivalent cross-instance coordination is needed.
- Colyseus is compelling for Tank due to room, state sync and authoritative game-loop facilities. Caro can use a small pure ruleset rather than boot a full runtime just for turns.
- Redis + WS duration and Blob writes have ongoing costs; avoid per-frame persistence and limit payload/retention.
- User data: names/reactions only in private invite-based rooms by default; no public leaderboard or chat history without opt-in.

## References
- Vercel WebSockets GA: https://vercel.com/changelog/websocket-support-is-now-generally-available
- Cross-instance Redis: https://vercel.com/kb/guide/do-vercel-serverless-functions-support-websocket-connections
- Colyseus rooms/authoritative server: https://docs.colyseus.io/room/
- Colyseus prediction: https://docs.colyseus.io/faq/
- Phaser 4: https://phaser.io/oss/docs
- boardgame.io: https://github.com/boardgameio/boardgame.io
