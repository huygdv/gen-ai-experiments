# Security and privacy — CoupleGames

## Current repository: PUBLIC
As of 2026-11-19 the code lives at **`huygdv/gen-ai-experiments` (public)**, in `couple-games/`. Its branches, PRs, commits, GitHub Actions logs and shared links may be publicly readable. There is **no dedicated private CoupleGames repository** in the verified setup. Recommend creating one by a clean snapshot, then restricting collaborators to minimum permissions; see [private migration](PRIVATE-REPO-MIGRATION.md). Changing visibility later does not unpublish downloaded copies or past leaks.

## Secrets and sensitive inputs
Never commit (also not even temporarily): `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` when not intended to disclose, Cloudflare Workers secrets, `BLOB_READ_WRITE_TOKEN`, GitHub PAT, OAuth keys, private keys, database URLs, `.env`, `.dev.vars`, browser storage dumps, real users' names/messages/room snapshots, access logs with session tokens. Use **GitHub Actions secrets** or **Cloudflare Workers Secrets** only. User credentials remain on PC local; do not copy them to ChatGPT.
- Existing workflow refers to `secrets.CLOUDFLARE_API_TOKEN` and `secrets.CLOUDFLARE_ACCOUNT_ID` by **name only**, not values.
- `wrangler.jsonc` contains `ALLOWED_ORIGIN=https://couplegames-vn.vercel.app` (public configuration, not a credential).
- Scoped scan of current branch known Cloudflare/CI/core files found no obvious literal hard-coded API tokens/private keys. **This is not a full repository/history audit.**
- If a secret ever reached public history: **revoke/rotate it first**. Deleting a file or making the repo private is insufficient.

## Threat model / pending gates before public deployment
| Risk | Current countermeasure | Remaining release gate |
| --- | --- | --- |
| Guessable invite codes | 6-character nontrivial alphabet, room token required to act | Add per-IP and per-device rate limits on join/create, anti-enumeration, monitor code attempts |
| Room ownership theft | Random bearer token, SHA-256 hash stored in DO, access checked server-side | Test replay/reconnect, ACL after kick and close, no logging of token |
| Score cheating / double count | DO authoritative claim ordering and state, numeric validation | E2E concurrency/load, idempotency and clientSeq protocol audits |
| Abusive create/join/WS floods | Socket cap 16, local per-socket action credit and ping throttle | **Creation rate limit / Turnstile**; cap per account/IP, quotas/alerts; origin check alone is not bot prevention |
| Spam emojis | Server cooldown 2.5s and target validation | User mute preference, flood test across simultaneous sockets with same token |
| Open websocket without login | First `hello` authenticates; unauthenticated socket cap | Add short preauth timeout; server close, backpressure, verify origin restrictions |
| XSS/DOM injection | Text output primarily uses `textContent` | Audit every `innerHTML`, name from room input, CSP, dependencies |
| Lost connection / ghost seats | Rejoin token and full snapshot | Add presence/host grace period and reconnection stress test |
| Free Tier depletion | 2h room TTL, SQLite DO/WebSocket hibernation | Usage alerts, abuse throttling, traffic spike test, operational failure messaging |
| Data privacy | Minimal player names and short reactions, 2h room expiration | Public privacy notice, retention policy, deletion and user consent before history/accounts |

## Release checklist
- [ ] Scan full current tree **and commit history** for secrets (gitleaks or equivalent) before creating a new private snapshot; do not disclose matches themselves.
- [ ] Ensure local/CI `.gitignore` protects `.dev.vars`, `.env*`, `node_modules`, `.wrangler`, logs, credentials.
- [ ] Enable GitHub secret scanning / push protection where available; branch protection, PR approval, and least-privilege repo access.
- [ ] End-to-end authentication/authorization, cross-origin WebSocket and HTTP tests, fuzz invalid JSON/large payload, 429 create/join flood limits.
- [ ] Avoid auto-deploy from an editable public feature branch; required CI and manual approval to change production binding/routes.
- [ ] Deploy worker preview only after owner approval; avoid unreviewed production domain and paid resources.
- [ ] Track Cloudflare Free quota, DO SQL rows and request usage; preserve rollback path.
