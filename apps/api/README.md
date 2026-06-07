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

The GitHub Actions `api-image` target publishes the same production image to GHCR and uploads the immutable image reference as the `mobile-api-image-reference` artifact:

```text
.github/workflows/mobile-release.yml
```

On the production host, pull and run that image with the compose file:

```powershell
$env:LEWORD_MOBILE_API_IMAGE='ghcr.io/<owner>/leword-mobile-api:<sha>'
docker compose -f apps/api/docker-compose.production.yml up -d
```

`apps/api/docker-compose.production.yml` keeps the mobile result cache on the `leword-mobile-cache` volume, loads `apps/api/.env.production`, maps port `34983`, and healthchecks `/health`.

## Required Runtime

Use `apps/api/.env.production.example` as the secret-manager checklist. A deployed worker is not release-ready until:

- `npm run mobile:api-runtime-gate` passes inside the production worker environment.
- `npm run mobile:api-smoke` passes against the public HTTPS API URL.
- `/health.runtime.ok` is `true`.
- `/health.guardrails` shows nonzero body-size and per-minute rate limits.
- `/health.prewarm.scheduler` is enabled for warmed recommendations.
