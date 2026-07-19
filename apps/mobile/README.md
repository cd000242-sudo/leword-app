# LEWORD Mobile

LEWORD Mobile is not a reduced desktop clone. The phone is the mobile command center, while PC-grade discovery, Patchright/Playwright work, measured metrics, queueing, and cache warming run on the LEWORD API/worker side.

## Runtime Contract

- Mobile never runs Chromium, Patchright, Playwright, Puppeteer, or scraper pools.
- Mobile sends jobs to `apps/api`, then renders progress, cancellation state, partial status, and result cards.
- Mobile reads `/v1/notifications` to show warmed SSS/S candidates in the recommendation inbox.
- Mobile can register push subscriptions through `/v1/push/subscriptions`; server-side warmed winners are forwarded only when a push gateway is configured.
- Mobile uses `expo-notifications`, `expo-device`, and `expo-constants` to acquire a real-device Expo push token and register it with the LEWORD API.
- Golden discovery precision targets 30+ SSS candidates.
- Golden discovery bulk targets 60+ high-quality golden candidates, with SSS prioritized first.
- PRO traffic hunter supports 250 SSS-grade targets.
- Long-running tasks must stream progress and support cancellation.

## Local Commands

```bash
npm --prefix apps/mobile run typecheck
npm run verify:mobile
npm run api:typecheck
npm run mobile:doctor
npm run mobile:audit
npm run mobile:export:android
npm run mobile:eas:whoami
npm run mobile:readiness
npm run mobile:release-gate:production
npm run mobile:api-deploy-gate
npm run mobile:api:docker:build
npm run mobile:api-runtime-gate
npm run mobile:api-smoke
npm run mobile:api-performance-smoke
npm run mobile:ui-release-gate
npm run mobile:store-compliance
npm run mobile:store-listing
npm run mobile:assets:generate
npm run mobile:store-assets
npm run mobile:store-submission-package
npm run mobile:launch-sla
npm run mobile:release-audit
npm run mobile:release-kit
npm run mobile:github-setup-plan
npm run mobile:release-dry-run
npm run mobile:release-dispatch-plan
npm run mobile:release-status
npm run mobile:release-secret-scan
npm run mobile:public-release-gate
npm run mobile:public-release-gate:android
npm run mobile:public-release-gate:android:save
npm run mobile:release-gate:cloud
npm run mobile:deploy-readiness
npm run mobile:deploy-readiness:android
npm run mobile:deploy-readiness:ios
npm run mobile:preflight:production
```

## Internal Builds

```bash
npm run mobile:deploy-readiness
npm run mobile:deploy-readiness:android
npm run mobile:deploy-readiness:ios
npm run mobile:build:android:internal
npm run mobile:build:android:production
npm run mobile:build:ios:testflight
npm run mobile:submit:android:internal
npm run mobile:submit:android:public
npm run mobile:submit:ios:testflight
npm run mobile:deploy:android:internal
npm run mobile:deploy:ios:testflight
```

Android internal APK is the first release target. iOS TestFlight follows after account, entitlement, and App Store review policy decisions are finalized.
Use `mobile:deploy-readiness:android` for Android-only internal rollout and `mobile:deploy-readiness:ios` for TestFlight-only rollout. The unscoped `mobile:deploy-readiness` still requires both stores.
Android production build emits an AAB for the Google Play internal track; submit stays `draft` until store review metadata is verified.
Public Google Play submission is a separate command, `mobile:submit:android:public`, backed by `apps/mobile/eas.json` `submit.public.android` with `track=production`. Run `mobile:public-release-gate:android` before that path; it checks Android public release evidence without requiring iOS submit credentials.

## CI Release

Use `.github/workflows/mobile-release.yml` for release automation. It supports `verify-only`, `api-image`, `android-internal`, `android-public`, `ios-testflight`, and `full-release` targets. Store submission is behind `submit_to_stores=true`.

Set GitHub variables `LEWORD_MOBILE_API_URL`, `EXPO_PUBLIC_EAS_PROJECT_ID`, `LEWORD_PRIVACY_URL`, `LEWORD_MOBILE_ENTITLEMENT_URL`, and `LEWORD_MOBILE_PREWARM_INTERVAL_MINUTES`. Set secrets `EXPO_TOKEN`, `LEWORD_MOBILE_SMOKE_TOKEN`, Naver/SearchAd credentials, `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON_B64`, `EXPO_APPLE_ID`, `EXPO_ASC_APP_ID`, `EXPO_APPLE_TEAM_ID`, and either `EXPO_APPLE_APP_SPECIFIC_PASSWORD` or the App Store Connect API key set `EXPO_ASC_API_KEY_P8_B64`, `EXPO_ASC_API_KEY_ISSUER_ID`, and `EXPO_ASC_API_KEY_ID` before using the submit paths.
For `android-public`, also set `LEWORD_MOBILE_REVIEWER_TOKEN_READY=true` only after the store reviewer token and final device-captured screenshot evidence are ready. The public release gate requires `docs/mobile-store-assets.json` `publicReleaseEvidence.evidencePath` to resolve to an existing repo file or production HTTPS evidence URL when `deviceCapturedScreenshotsReady=true`.

`npm run mobile:ci-secrets-gate` is the target-aware preflight used by the workflow. It keeps `verify-only` light and blocks release targets before EAS or store work starts when a required variable/secret is missing. `npm run mobile:release-secret-scan` runs before evidence upload and blocks concrete GitHub/Expo tokens, service-account private keys, or non-placeholder `gh secret set --body` values from release artifacts. `npm run mobile:submit-config:materialize` writes temporary Google Play and App Store Connect credential files from base64 secrets during CI.

The `api-image` target publishes the production API worker to GHCR from `main` and uploads a strict commit/repository/run/OCI-digest manifest in the `mobile-api-image-reference` artifact. Manual compose recovery must use the registry digest, never a SHA tag or `latest`:

```powershell
$env:LEWORD_MOBILE_API_IMAGE='ghcr.io/<owner>/leword-mobile-api@sha256:<64-hex-digest>'
docker compose -f apps/api/docker-compose.production.yml up -d
```

Normal production restarts use `.github/workflows/api-production-restart.yml`, which accepts no image input and selects only a successful API image build for the current `origin/main` commit.

## SDK Baseline

- Expo SDK: 56
- React Native: 0.85
- React: 19.2.3
- TypeScript: 6.0.3
- Minimum Node for native build tooling: 22.13.x

## API Requirement

The mobile app defaults to the local development API at `http://127.0.0.1:34983`. Production builds must point to a real LEWORD API domain through `EXPO_PUBLIC_LEWORD_API_URL`.

Before a production build, run:

```bash
EXPO_PUBLIC_LEWORD_API_URL=https://api.leword.app npm run mobile:release-gate:production
```

PowerShell:

```powershell
$env:EXPO_PUBLIC_LEWORD_API_URL='https://api.leword.app'; npm run mobile:release-gate:production
```

The production gate rejects localhost, `127.0.0.1`, non-HTTPS API URLs, and placeholder domains such as `.example`, `.test`, or `.invalid`.

`apps/api` supports `LEWORD_MOBILE_API_TOKEN` for a single staging/admin token, `LEWORD_MOBILE_ENTITLEMENTS_FILE` for token-to-tier staging entitlements, and `LEWORD_MOBILE_ENTITLEMENT_URL` for the production account/license entitlement service.

Keyword analysis and mindmap expansion run through the server-side PC metric path. When the API worker has Naver SearchAd and Naver Open API credentials, mobile results include measured PC/mobile/total search volume, CPC, document count, golden ratio, and recalculated grades.

Production API worker readiness:

```powershell
npm run mobile:api-deploy-gate
npm run mobile:api:docker:build
$env:NAVER_CLIENT_ID='...'
$env:NAVER_CLIENT_SECRET='...'
$env:NAVER_SEARCH_AD_ACCESS_LICENSE='...'
$env:NAVER_SEARCH_AD_SECRET_KEY='...'
$env:NAVER_SEARCH_AD_CUSTOMER_ID='...'
$env:LEWORD_MOBILE_ENTITLEMENT_URL='https://api.leword.app/mobile/entitlement'
$env:LEWORD_MOBILE_PREWARM_INTERVAL_MINUTES='15'
$env:LEWORD_MOBILE_CACHE_FILE='C:\leword\mobile-cache.json'
$env:LEWORD_MOBILE_PUSH_PROVIDER='expo'
$env:LEWORD_MOBILE_MAX_BODY_BYTES='65536'
$env:LEWORD_MOBILE_RATE_LIMIT_PER_MINUTE='120'
$env:LEWORD_CHROME_PATH='/usr/bin/chromium'
npm run mobile:api-runtime-gate
```

The API container is built from the repository root with `apps/api/Dockerfile`. It installs system Chromium and sets `LEWORD_CHROME_PATH=/usr/bin/chromium`, so browser-heavy PC-grade work stays on the server worker.
Production hosts run the CI-published digest through `apps/api/docker-compose.production.yml`; the API loads `.env.production`, while the live-golden worker loads the dedicated minimal `.env.live-golden-worker.production`. Compose maps `34983`, keeps `/data` API-only for cache/commerce, gives the worker only `/golden` state, mounts the SearchAd account pool read-only from `/searchad`, shares only monotonic SearchAd/OpenAPI quota ledgers through API/worker-RW `/quota`, stores review artifacts on a separate API-RW/worker-RO volume, initializes legacy volume ownership without deleting rollback sources, and healthchecks `/health` while both runtime containers run as non-root. Verified rollback stops failed-generation writers and exports the maximum quota state to legacy `/data` before restarting the previous compose.
The API `/health` response includes `runtime` so operators can verify whether the deployed worker is actually ready to return measured PC-grade mobile results.
The API `/health.liveGolden.reviewStorage` response separately reports whether Phase 2 review storage is configured, readable, and writable; deployment requires all three.
The API `/health.guardrails` response includes request body and per-client rate-limit settings so public mobile traffic cannot silently overwhelm PC-grade workers.

After the deployed API is reachable:

```powershell
$env:LEWORD_MOBILE_SMOKE_API_URL='https://api.leword.app'
$env:LEWORD_MOBILE_SMOKE_TOKEN='mobile-user-token'
$env:LEWORD_MOBILE_SMOKE_RUN_JOB='true'
npm run mobile:api-smoke
npm run mobile:api-performance-smoke:save
```

The smoke test checks `/health`, runtime readiness, the notification inbox, and optionally creates a tiny keyword-analysis job and verifies that measured result metrics come back.
The performance smoke records health, inbox, job acceptance, first progress, terminal timing, and measured-result checks against `MOBILE_PC_PARITY_SLA` in `.codex-build-cache/mobile-api-performance-smoke.json`.

Before attaching a build artifact to a release, capture a machine-readable audit:

```powershell
npm run mobile:release-audit
npm run mobile:release-audit:save
npm run mobile:ui-release-gate:save
npm run mobile:store-submission-package:save
npm run mobile:launch-sla:save
npm run mobile:release-kit:save
npm run mobile:github-setup-plan:save
npm run mobile:release-dry-run:save
npm run mobile:release-dispatch-plan:save
npm run mobile:release-status:save
npm run mobile:public-release-gate:save
npm run mobile:public-release-gate:android:save
npm run mobile:public-release-gate:android
```

The audit includes app versions, package ids, EAS profiles, Android JS export hash, readiness state, runtime readiness, configured gates, and remaining external blockers.
`mobile:release-audit:save` writes the same JSON to `.codex-build-cache/mobile-release-audit.json` for internal release evidence.
`mobile:ui-release-gate:save` writes `.codex-build-cache/mobile-ui-release-gate.json`, proving the mobile UI is touch-first, exposes all hunter modes, keeps one focused category, renders progress/cancellation/error recovery, shows inbox/prewarm/push controls, and displays measured PC-grade keyword metrics.
`mobile:release-kit:save` writes `.codex-build-cache/mobile-release-kit.json`, which is target-aware and lists required GitHub variables/secrets, blockers, and next commands without printing secret values.
`mobile:github-setup-plan:save` writes safe placeholder GitHub CLI setup drafts to `.codex-build-cache/mobile-github-setup-plan.json` and `.codex-build-cache/mobile-github-setup.ps1`.
`mobile:release-dry-run:save` writes `.codex-build-cache/mobile-release-dry-run.json`, the one-file final pre-deploy decision report, without running EAS, Docker push, or store submit.
`mobile:release-dispatch-plan:save` writes `.codex-build-cache/mobile-release-dispatch-plan.json`. It blocks dispatch while dry-run is not green, and when ready it records the exact `gh workflow run mobile-release.yml` command plus follow-up run-watch commands.
`mobile:release-status:save` writes `.codex-build-cache/mobile-release-status.json`, which shows local code/UI readiness, Android build readiness, store-submit readiness, and full-release blockers without exposing secret values.
`mobile:public-release-gate:save` writes `.codex-build-cache/mobile-public-release-gate.json`. It documents public-store blockers such as final device screenshots, reviewer token readiness, production API smoke evidence, and public-track submit configuration without blocking internal Android/TestFlight rollout. It verifies that claimed device-captured screenshot evidence is resolvable instead of trusting a bare readiness flag. `mobile:public-release-gate:android:save` writes `.codex-build-cache/mobile-public-release-gate-android.json`; `mobile:public-release-gate:android` is the Android-only gate used by the `android-public` CI target.

Production env examples:

```text
apps/mobile/.env.production.example
apps/api/.env.production.example
docs/mobile-release-runbook.md
```

Store compliance:

```powershell
npm run mobile:store-compliance
npm run mobile:store-listing
npm run mobile:assets:generate
npm run mobile:store-assets
```

The store compliance manifest lives at `docs/mobile-store-compliance.json`. It maps the app's API token, keyword job inputs, push token, notification state, permission usage, privacy policy URL, and reviewer access notes to Apple App Privacy and Google Play Data safety fields.
The store listing manifest lives at `docs/mobile-store-listing.json`. It contains Play Console and App Store Connect descriptions, keywords, release notes, reviewer notes, and screenshot planning, with a gate that checks platform length limits and blocks guaranteed-exposure claims.
The store assets manifest lives at `docs/mobile-store-assets.json`. `npm run mobile:assets:generate` writes the app icon, adaptive icon foreground, splash image, Google Play feature graphic, and phone screenshot PNGs under `apps/mobile/assets`; `npm run mobile:store-assets` validates their dimensions and Expo app config references. Generated screenshots prove the internal-track asset pipeline; public release should replace them with device-captured screenshots from the final EAS build.
`mobile:store-submission-package:save` writes `.codex-build-cache/mobile-store-submission-package.json`, `.codex-build-cache/mobile-store-submission-google-play.txt`, and `.codex-build-cache/mobile-store-submission-app-store.txt` so store console metadata, reviewer notes, privacy summary, and asset paths are ready to review without hunting through multiple manifests.
`mobile:launch-sla:save` writes `.codex-build-cache/mobile-launch-sla-report.json`, which proves the mobile app is a mobile UI for server-side PC-grade engines, not a weakened local crawler clone. `ok=true` means the local code contract is intact; `releaseReady=true` additionally requires real production runtime credentials and launch evidence.
The launch SLA report embeds the UI release gate summary, so a build cannot look server-ready while losing phone-native controls or result metric visibility.

The production entitlement endpoint receives a POST JSON body with `token`, `appId`, and `requestedAt`, plus the same bearer token in the `Authorization` header. It should respond with `{ "ok": true, "subjectId": "...", "tier": "standard|pro|unlimited|admin", "expiresAt": null }`.

Server-side prewarm scheduling:

```powershell
$env:LEWORD_MOBILE_PREWARM_INTERVAL_MINUTES='15'
$env:LEWORD_MOBILE_PREWARM_LIMIT='4'
npm run api:start
```

Use `LEWORD_MOBILE_PREWARM_ON_START=false` when the server should wait for the first interval instead of warming immediately.

Prewarm winners appear in the mobile recommendation inbox:

```text
GET /v1/notifications
PATCH /v1/notifications/:id/read
```

Push subscription and delivery:

```text
POST /v1/push/subscriptions
DELETE /v1/push/subscriptions/:id
```

Configure `LEWORD_MOBILE_PUSH_ENDPOINT` to forward warmed SSS/S winners to a custom Expo/FCM/APNs gateway, or set `LEWORD_MOBILE_PUSH_PROVIDER=expo` to send directly through Expo Push Service. Optional `LEWORD_MOBILE_PUSH_TOKEN` is sent as a bearer token, and `/health.push` reports enabled subscriptions plus recent delivery state.

On the app side, Expo push token acquisition needs an EAS project id. EAS builds usually expose it automatically. For local development builds, set:

```powershell
$env:EXPO_PUBLIC_EAS_PROJECT_ID='your-eas-project-id'
```

Entitlement tiers:

- `standard`: golden discovery, keyword analysis, mindmap expansion.
- `pro` or stronger: PRO traffic hunter, home-board hunter, KIN hidden-honey hunter.
- `admin`: server prewarm execution.

## Current Blockers Before Store Release

- Produce Android internal APK and iOS simulator/TestFlight builds.
- Log in to EAS or provide `EXPO_TOKEN` for cloud builds.
- Set `EXPO_PUBLIC_LEWORD_API_URL` to the real HTTPS LEWORD API and pass `npm run mobile:release-gate:cloud` before EAS builds.
- Install Android SDK, platform-tools, command-line tools, and JDK 17+ for local Android native builds.
- Point `LEWORD_MOBILE_ENTITLEMENT_URL` at the production account/license service and verify real entitlements.
- Connect `LEWORD_MOBILE_PUSH_ENDPOINT` to the chosen push gateway, or set `LEWORD_MOBILE_PUSH_PROVIDER=expo`, and provide the EAS project id for real-device push tokens.
- Provide Naver SearchAd and Naver Open API credentials on the deployed API worker so live keyword analysis and mindmap results are always measured.
- Add `apps/mobile/credentials/google-play-service-account.json` on the release machine for Android submit.
- Replace the iOS submit placeholders in `apps/mobile/eas.json`, or run `npm run mobile:submit-config:materialize`, and provide `EXPO_APPLE_APP_SPECIFIC_PASSWORD` or the `EXPO_ASC_API_KEY_P8_B64`/issuer/key-id App Store Connect API key set before TestFlight submit.
