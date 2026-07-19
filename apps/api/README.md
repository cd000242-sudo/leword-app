# LEWORD Mobile API

The mobile API is the PC-grade worker surface for LEWORD Mobile. Phones submit jobs here; this server runs measured keyword engines, queueing, cache warming, entitlement checks, and push fan-out.

## Local

```powershell
npm run api:typecheck
npm run api:start
```

## Production Container

Build from the repository root so the API can copy both `apps/api` and shared `src/mobile` plus PC keyword engines:

```powershell
npm run mobile:api-deploy-gate
npm run mobile:api:docker:build
docker run --rm -p 34983:34983 --env-file apps/api/.env.production leword-mobile-api:latest
```

The image installs system Chromium and sets `LEWORD_CHROME_PATH=/usr/bin/chromium` so any server-side browser work stays on the worker and never moves to the phone.

The GitHub Actions `api-image` target publishes the same production image to GHCR from `main` and uploads `.codex-build-cache/mobile-api-image-manifest.json` as the `mobile-api-image-reference` artifact. The strict manifest binds the repository, exact commit, workflow run, image repository, and registry-reported OCI `sha256` descriptor digest.

```text
.github/workflows/mobile-release.yml
```

On the production host, pull and run that image with the compose file:

```powershell
$env:LEWORD_MOBILE_API_IMAGE='ghcr.io/<owner>/leword-mobile-api@sha256:<64-hex-digest>'
docker compose -f apps/api/docker-compose.production.yml up -d
```

The preferred restart path is `.github/workflows/api-production-restart.yml`. It has no image input: it resolves the current `origin/main`, requires a successful `Build and publish production API image` job for that exact commit, validates the artifact manifest, and pulls/verifies the digest-pinned image before creating a rollback journal or touching running services. Configure these repository secrets before dispatching it:

- `LEWORD_PROD_SSH_HOST`
- `LEWORD_PROD_SSH_USER`
- One of `LEWORD_PROD_SSH_KEY` or `LEWORD_PROD_SSH_PASSWORD`
- `LEWORD_PROD_SSH_KNOWN_HOSTS`
- `LEWORD_GHCR_USER`
- `LEWORD_GHCR_TOKEN`
- Optional: `LEWORD_PROD_SSH_PORT`

`apps/api/docker-compose.production.yml` keeps API cache/commerce data on the API-only `leword-mobile-cache`, live-golden board/heartbeat/queue state on `leword-live-golden-data` (worker read-write, API read-only), the human-reviewed home briefing on `leword-home-keyword-briefing` (API read-write, worker read-only), optional SearchAd accounts on `leword-searchad-accounts` (both runtimes read-only), shared SearchAd/OpenAPI quota ledgers on `leword-measurement-quota` (API and worker read-write), and review decisions/certificates on `leword-review-artifacts` (API read-write, worker read-only). The worker loads only `.env.live-golden-worker.production` (copy the minimal example), never the API/web/payment secret file or buyer data volume. A secret-free root one-shot initializer copies legacy golden/briefing/SearchAd state without deleting `/data`, merges quota counters and cooldowns monotonically, migrates review artifacts, and fixes named-volume ownership before the API and worker run as non-root `node`. The rollback-compatible legacy `/data/searchad-accounts.json` copy therefore remains beside API-only commerce data during the rollback window, but is never mounted into the worker; remove it only after the old compose is formally retired. On a failed rollout, every managed project writer stops before the initializer validates and bridges the old-image-compatible board/probe/heartbeat from `/golden` and reviewed briefing from `/briefing` to legacy `/data`, exports the highest quota state, and leaves Phase 2 cohort/certificate/tombstone evidence authoritative on `/review`. The next forward init reconciles only marker-bound old-worker/API advances and atomically consumes each marker; ordinary forward deploys keep `/golden` and `/briefing` authoritative regardless of legacy mtime. The API loads `.env.production`, maps port `34983`, and healthchecks `/health`.

## Required Runtime

Use `apps/api/.env.production.example` as the secret-manager checklist. A deployed worker is not release-ready until:

- `LEWORD_WEB_SESSION_SECRET` is an independent trimmed value of at least 32 UTF-8 bytes and is not equal to `LEWORD_MOBILE_API_TOKEN`; otherwise review-purpose login and Phase 2 review auth stay disabled.
- Review auth additionally needs either a valid configured admin (`LEWORD_ADMIN_LOGIN_ID` plus password/hash) or `LEWORD_MOBILE_LIVE_GOLDEN_REVIEW_PANEL_LOGIN_URL` set to a credential-free public HTTPS endpoint. The general `LEWORD_MOBILE_PANEL_LOGIN_URL` never makes review auth ready by itself.
- `npm run mobile:api-runtime-gate` passes inside the production worker environment.
- `npm run mobile:api-smoke` passes against the public HTTPS API URL.
- `/health.runtime.ok` is `true`.
- `/health.liveGolden.reviewStorage` reports `configured`, `readable`, and `writable` all `true`.
- `/health.liveGolden.reviewAuth` reports `ready` and `signingSecretConfigured` true plus either `configuredAdmin` or `strictProviderConfigured` true.
- `/health.guardrails` shows nonzero body-size and per-minute rate limits.
- `/health.prewarm.scheduler` is enabled for warmed recommendations.

## Phase 2 blind human review

Use the production `/admin` page, open **환경설정**, and use **Phase 2 블라인드 전수 검수**. This surface deliberately does not reuse the normal Pro/admin bearer. The reviewer must re-enter an admin ID and password so `/v1/web/session` can issue a `sessionPurpose=live-golden-review` token signed by the independent review secret. The browser keeps that token in memory only; reloads require re-authentication.

The page reads the server packet from `GET /v1/admin/live-golden/review` and renders only `keyword`, `category`, and `intent` with the opaque row binding. It does not join search volume, document count, rank, grade, or the current LIVE board. Every row starts unselected and requires all seven server decisions: natural keyword, intent match, hidden-known value, malformed, semantic duplicate, platform residue, and sentence residue. The visible "뻔한 헤드" choice is encoded only as `hiddenKnown=false`; `obviousHead` is never sent to the strict server schema.

Before `POST /v1/admin/live-golden/review`, the page re-reads the packet, requires the same cohort ID and board fingerprint, verifies a full-cohort decision set, and displays the cohort ID, row count, failed-row count, and irreversible tombstone warning. A 401/403 clears only the in-memory review token and preserves the entered DOM decisions. After re-authentication, decisions remain only when the server binding is identical; a changed binding discards them and requires a fresh full review. There is no bulk-pass/default-pass action. Treat Phase 2 as eligible only when the response state is `eligible` and a certificate was issued; otherwise record the displayed reason code and take no quota-reset or ceiling-changing action.
