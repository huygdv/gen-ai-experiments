# Optional clean migration to a PRIVATE CoupleGames repository

**Decision:** Existing repo `huygdv/gen-ai-experiments` is **public** and unrelated projects share its history. Do not make the whole repo private or accidentally copy all its history.

## Preferred target
A new GitHub **private** repository, suggested name `huygdv/couplegames`, with *just* the `couple-games/` project at repository root. This is a recommendation; **the target has not been created** by this handoff.

## PC-home safe migration (PowerShell)
1. GitHub → New repository → `couplegames` → **Private** → do not initialize README/.gitignore (to keep initial push simple).
2. Locally clone the SOURCE branch and create a clean snapshot:
```powershell
git clone --branch couple-games-cf-do-mvp --single-branch https://github.com/huygdv/gen-ai-experiments.git cg-source
New-Item -ItemType Directory -Force couplegames-private | Out-Null
Copy-Item -Path cg-source/couple-games/* -Destination couplegames-private -Recurse -Force
# Note: hidden files may need explicit copying, but NEVER copy .git, .env or credentials.
Copy-Item cg-source/couple-games/cloudflare/.gitignore couplegames-private/cloudflare/.gitignore -Force
New-Item -ItemType Directory -Force couplegames-private/.github/workflows | Out-Null
Copy-Item cg-source/.github/workflows/couplegames-cloudflare.yml couplegames-private/.github/workflows/
Set-Location couplegames-private
git init -b main
git add .
git status --short
# Inspect what would be committed; do not proceed if any local .env, .dev.vars or token file appears.
git commit -m "chore: initialize private CoupleGames snapshot"
git remote add origin https://github.com/huygdv/couplegames.git
git push -u origin main
```
3. Update all relative paths and CI working directories, which previously assumed `couple-games/` in a monorepo. Cloudflare Workers Builds **Root directory** becomes `cloudflare`, not `couple-games/cloudflare`. Recheck links in docs, workflow path filters, API origins before enabling deploy.
4. Connect ChatGPT GitHub app and local Claude/Codex with least-privilege **access to the new private repo**; private visibility is not automatically inherited across all connectors.
5. After reviewed migration, set `huygdv/couplegames` as the new source of truth and mark old public PR #2 superseded. Do not delete older public history as a substitute for rotating leaked credentials.

## Why a clean snapshot
A normal fork, `git push --mirror`, or copying the monorepo's `.git` would carry unrelated projects and their full history into the new repo. Starting with an audited working tree minimizes unneeded exposure and confusion, although already-public commits remain public.

## Alternative
If no new private repo is desired, keep a **public/open-source project** with strictly no secrets in version control, protected branches and least privilege. Authentication/security must still be correct; privacy of source code itself is not a substitute for application security.
