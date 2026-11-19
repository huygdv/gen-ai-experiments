# CoupleGames — shared workboard (source of truth for agent tasks)
Updated 2026-11-19. Integration base: `couple-games-cf-do-mvp`.

| ID | Priority | Task / owner lane | Acceptance criterion | State |
| --- | --- | --- | --- | --- |
| CG-001 | P0 | **PC home / Cloudflare integration** | Verify `wrangler whoami` locally; preview deploy ONLY with user approval; send workers.dev URL; local + remote smoke tests | ready, unclaimed |
| CG-002 | P0 | **GPT/Codex / realtime** | Reliable reconnect + snapshot/seq handling, ACK/NACK order, concurrency tests and observed latency instrumentation; no duplicate claim | ready, unclaimed |
| CG-003 | P0 | **Claude / room lifecycle** | Join/leave/kick/lock/close, reconnect to same seat, host-disconnect grace, refresh != forfeit, 3-player / spectator E2E | ready, unclaimed |
| CG-004 | P0 | **Security review** | Abuse controls for create/join, Turnstile/limits, session token handling, origin policy, CI secrets, quotas and logs; written findings | ready, unclaimed |
| CG-005 | P1 | **UI/UX** | Sticky HUD tablet landscape 1024x768, readable 100 numbers, reactions/avatars, low-overhead DOM update and mobile touch QA | ready, unclaimed |
| CG-006 | P1 | **QA/load & release** | HTTP + WS smoke in separate networks, p50/p95 remote render, 3 device/spectator, Free tier quotas, rollback steps | blocked on CG-001..004 |
| CG-007 | P1 | **Gián Bom port** | Authoritative 2-team rules/HP/lanes, deterministic simulation and snapshots, fully tested; disabled until done | parked |
| CG-008 | P2 | **Caro** | Reusable Room/GameDefinition, 15x15 2-player+spectator turn validation/rematch | parked |
| CG-009 | P3 | **Tank spike** | 4–5 participants, server authoritative ticks, compare Colyseus vs Durable Objects, latency/CPU budget | parked |
| CG-010 | P0 | **Repo/privacy handoff** | Confirm repo visibility; secret scanning; clean snapshot private-repo migration guide; no secret exposure | guidance committed, audit incomplete |

## Claim and reporting
- First agent to start an item adds **`CG-xxx` in its feature branch name and PR title**, and comments on the integration PR #2 or tells the others. Avoid concurrent edits to this table; integration owner updates it during merges.
- Use labels in PR title: `[CG-002][Codex/cloud]`, `[CG-003][Claude/pc-home]`, etc.; names are recommendations, not permanent ownership assignments.
- A PR is ready for review only with test commands/output, security impacts, known limitations, changed file list, and a reproducible usage path.
- Mark as blocked instead of bypassing a limit or silently relying on a mock. No secret values in GitHub issues, commits, screenshots, chat or error logs.

## Release milestones
M0: room-server locally tested (done, with follow-on hardening).
M1: workers.dev preview live + independent clients, no secrets in logs.
M2: rollout to stable domain with rollback and monitors.
M3: multi-game hub registry and Caro.
M4: Gián Bom parity and Tank technical spike.
