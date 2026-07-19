# LEWORD Mobile Ultra Plan

## Non-negotiable goal

Mobile must not be a weaker copy of the desktop app. Mobile is a new product surface with a mobile-first UI, while analysis quality and throughput must be equal to or stronger than the PC version.

That means mobile devices must not run heavy browser automation. The PC-grade engines run on LEWORD Cloud workers, and the mobile app streams progress and results with a fast, calm UI.

## Product shape

- Desktop: expert workstation for dense tables, exports, diagnostics, and deep tuning.
- Mobile: daily traffic command center for finding what to write now, saving winners, expanding winners into mindmaps, and receiving fresh issue alerts.
- Server: the shared source of truth for keyword discovery, PRO hunting, measured metrics, queueing, cache, and browser automation.

## Performance parity rules

- Mobile cannot relax SSS, SS, S, or golden ratio gates.
- Mobile cannot hide missing measured search volume as a success state.
- Mobile cannot run on-device Patchright, Playwright, Puppeteer, Chromium, or scraper pools.
- Mobile dependencies cannot use floating `latest` versions; Expo, React, and React Native must stay on a verified SDK matrix.
- Mobile must stay on an Expo SDK line where Hermes and the React Native New Architecture are the default release path, without invalid app config flags.
- Mobile must show first progress within 2 seconds at P95.
- Mobile must return cached fresh-issue results within 1.5 seconds at P95.
- Golden precision mode must target 30+ SSS results.
- Golden bulk mode targets 60+ high-quality golden results, with SSS prioritized first.
- PRO traffic mode must target up to 250 SSS-grade candidates when the user requests 250.
- Every long-running task must support streaming progress, cancellation, retry, and partial results.
- Repeat requests with the same product and parameters should return completed cached jobs within the cached-result P95 budget.
- Server prewarm should run on an operator-controlled schedule so mobile users receive warmed results instead of always starting cold PC-grade jobs.
- Warmed SSS/S recommendation inbox items should fan out through server-side push delivery when `LEWORD_MOBILE_PUSH_ENDPOINT` or `LEWORD_MOBILE_PUSH_PROVIDER=expo` is configured.

## Architecture

```text
apps/mobile
  Expo React Native UI
  mobile-only navigation
  job progress stream
  result cards/table/mindmap preview

apps/api
  REST/SSE gateway
  auth/session/license bridge
  job creation and result reads

workers
  Patchright-first browser pool
  source collectors
  SearchAd/DataLab/news/policy/entertainment/KIN enrichment
  cache warmer

src/mobile
  shared contracts
  mobile parity SLA
  API endpoint registry

src/utils
  existing LEWORD engines
  MDP/pro/mindmap/scoring source of truth
```

## Variables and risks

- iOS background execution is limited, so fresh issue scanning must be server scheduled, not mobile scheduled.
- Android background work is also lifecycle-sensitive, so mobile should receive push notifications instead of doing heavy polling.
- App Store IAP rules can conflict with existing license-key unlock flows. Mobile subscription and desktop license migration need a policy-safe account model.
- Google Play Data Safety and Apple privacy labels must match actual data collection, including API keys, account IDs, usage analytics, and push tokens.
- API source terms must be reviewed source-by-source. The app should expose evidence and source labels but must not imply guaranteed Naver main exposure.
- Multi-user load can exceed a desktop PC quickly. Worker concurrency, queue limits, cache TTL, and source rate limits are required before public release.
- Mobile API job execution must be back-pressured. It cannot start every heavy PC-grade job immediately when many mobile users submit jobs at once.
- Public mobile API requests must be guarded by body-size and per-client rate limits before they can create expensive PC-grade work.
- The mobile UI must not be a miniature desktop table. It needs category-first workflows, result cards, saved winners, and drill-down screens.
- Warmed server results must surface as a mobile recommendation inbox, so users see actionable winners instead of needing to manually poll every hunter.

## Phased execution

### Phase 0: Foundation

- Add mobile/API contracts.
- Add mobile parity regression tests.
- Scaffold Expo mobile shell.
- Scaffold API gateway shell.
- Keep desktop build and sanity tests green.

### Phase 1: API extraction

- Convert IPC handlers into callable service functions.
- Preserve desktop IPC wrappers.
- Add HTTP endpoints for golden discovery, PRO hunter, keyword analysis, mindmap expansion, home board hunter, and KIN hunter.
- Add job IDs, progress events, cancellation, and partial result storage.

### Phase 2: Worker and cache

- Move browser automation to server workers only.
- Add queueing and browser-pool budgets.
- Add fresh issue prewarming for policy, support money, celebrity, incident, entertainment, shopping, education, health, finance, and IT categories.
- Add cache tiers: fresh issue 15 minutes, evergreen 24 hours.

### Phase 3: Mobile UX

- Build category-first home.
- Build one-category deep hunt flow.
- Build results cards with SSS evidence, measured volume, document count, ratio, source, and write intent.
- Build mindmap expansion from any saved keyword.
- Build notification inbox for daily fresh issue recommendations.

### Phase 4: Account and compliance

- Build account/session server.
- Decide mobile subscription strategy separately for iOS and Android.
- Prepare privacy policy, App Privacy details, Google Play Data Safety, demo account, and reviewer notes.
- Migrate desktop license to account-linked entitlement without breaking existing desktop users.

### Phase 5: Release gates

- Desktop `npm run verify:all` passes.
- Mobile typecheck passes.
- Mobile release gate passes: pinned SDK versions, valid SDK 56 app config, EAS profiles, no on-device crawler imports.
- Mobile UI release gate passes: touch-first controls, one focused category, all hunter modes, visible progress/cancel/error recovery, recommendation inbox, prewarm state, push registration, and measured metric cards.
- Mobile native environment gate passes with Node 22.13.x+ or the Codex bundled Node 24 runtime.
- Production mobile release gate passes with `EXPO_PUBLIC_LEWORD_API_URL` set to a real HTTPS LEWORD API domain, not localhost or `127.0.0.1`.
- API contract tests pass.
- API entitlement tests pass: `standard` can analyze, `pro` can run PRO/home/KIN products, and `admin` is required for prewarm execution.
- Golden precision target 30+ and bulk target 100+ pass in regression fixtures.
- PRO target 250 stress fixture passes.
- No mobile source imports Electron or browser automation.
- Internal Android APK and iOS TestFlight builds are produced before public store submission.
- `npm run mobile:release-status` must show local code/UI readiness separately from external production blockers, so operators can see whether the app is ready for verify-only, API image, Android internal build, Android submit, iOS TestFlight, or full-release.
- `npm run mobile:public-release-gate` must stay separate from internal rollout. Android internal and TestFlight can ship with generated validation screenshots, but public stores require production API smoke evidence, public-track submit settings, reviewer token proof, and final device-captured screenshots. Android public rollout uses `npm run mobile:public-release-gate:android` so Google Play production submission is not blocked by iOS App Store Connect credentials.

## First release scope

- Android internal build first.
- iOS TestFlight second.
- Public store release only after subscription/compliance review.
- Desktop remains supported and continues to use the same core engines.

## Current implementation status

- Phase 0 foundation is started in this repository.
- Shared mobile contracts live in `src/mobile/contracts.ts`.
- The mobile shell lives in `apps/mobile`.
- Mobile dependencies are pinned to the Expo SDK 56 family instead of `latest`; Expo SDK 56 targets React Native 0.85 and React 19.2.3.
- Expo SDK 56 requires Node 22.13.x or newer for the native release toolchain; this workspace can use the Codex bundled Node 24 runtime for mobile builds.
- Root mobile helper scripts now run Expo/EAS commands through a Node 22.13+ runtime discovery layer so desktop verification can stay on the existing Node line while mobile builds use the newer toolchain.
- Mobile runtime API configuration is now driven by `EXPO_PUBLIC_LEWORD_API_URL`, with a local development fallback and an in-app warning when the URL is device-local.
- `npm run mobile:release-gate:production` rejects production builds that do not provide a real HTTPS API domain.
- `npm run mobile:readiness` reports local native release blockers, including Android SDK, platform-tools, command-line tools, and JDK readiness.
- `npm run mobile:eas:whoami` is the separate cloud-build account gate before `npm run mobile:build:android:internal`.
- `npm run mobile:release-gate:cloud` now blocks EAS builds unless the production API URL is a real HTTPS domain, EAS auth is available, an Expo project id is configured for push tokens, and the Android JS export exists.
- `npm run mobile:api-deploy-gate` now proves the production API worker package is deployable: `apps/api/Dockerfile`, Node 22 runtime, system Chromium via `LEWORD_CHROME_PATH=/usr/bin/chromium`, healthcheck, env checklist, and Docker build command.
- `npm run mobile:api:docker:build` builds the production worker image from the repository root so shared `src/mobile` and PC keyword engines stay available to mobile users.
- `.github/workflows/mobile-release.yml` publishes the production API worker image to GHCR only from `main`, verifies the registry descriptor/RepoDigest, and uploads a strict commit/repository/run/OCI-digest JSON manifest as `mobile-api-image-reference`. Production restart selects only the successful image job for current `origin/main`; there is no mutable image input.
- `apps/api/docker-compose.production.yml` runs the digest-pinned GHCR image as non-root, separates API and minimal worker env files, keeps cache/commerce `/data` API-only, isolates worker-RW/API-RO golden state on `/golden`, shares the human-reviewed home briefing on API-RW/worker-RO `/briefing`, mounts the SearchAd account pool read-only from `/searchad`, shares monotonic SearchAd/OpenAPI quota ledgers through API/worker-RW `/quota`, and keeps review decisions/certificates on API-RW/worker-RO `/review`. A secret-free one-shot initializer copies legacy state without deleting rollback sources. Failed-deploy rollback stops managed writers, schema-validates and bridges only old-image-compatible board/probe/heartbeat and the reviewed briefing to `/data`, exports maximum quota state, and leaves Phase 2 review evidence on `/review`; the next forward consumes digest markers after reconciliation. Deployment readiness also requires an independent review signing secret plus either a valid configured admin or the dedicated strict-review HTTPS provider, never the general panel fallback. The restart workflow verifies the immutable pull before rollback journaling or service mutation.
- `npm run mobile:api-runtime-gate` now blocks production API rollout unless the worker has Naver Open API, Naver SearchAd, entitlement service, prewarm interval, persistent cache, and push delivery settings for PC-grade mobile results.
- `/health.runtime` exposes stable-code API worker readiness without leaking secrets, and `/health.liveGolden.reviewStorage` independently reports configured/readable/writable Phase 2 storage health.
- `npm run mobile:api-smoke` validates a deployed API URL from the mobile client's perspective: health, runtime readiness, notification inbox, and optional keyword-analysis job creation/polling with measured metrics.
- `npm run mobile:store-compliance` validates the App Privacy/Data safety manifest, in-app privacy link, notification permission, push token disclosure, API token disclosure, and reviewer-access notes.
- `npm run mobile:store-listing` validates Play Console and App Store Connect metadata: app name, short description, full description, release notes, promotional text, Apple keywords, reviewer notes, official reference traceability, and no guaranteed-traffic claims.
- `npm run mobile:assets:generate` creates mobile release PNG assets: app icon, Android adaptive icon foreground, splash image, Google Play feature graphic, and a phone screenshot set.
- `npm run mobile:store-assets` validates `apps/mobile/app.json` asset references plus PNG dimensions for the icon, splash, feature graphic, and 1290x2796 phone screenshots. The manifest requires device-captured screenshots before public release, while generated screenshots can validate the internal-track asset pipeline.
- `npm run mobile:ui-release-gate` validates the mobile screen contract so a release cannot quietly lose phone-native controls, progress/cancellation, inbox/prewarm/push affordances, or measured PC-grade result visibility.
- `npm run mobile:release-audit` emits a machine-readable release evidence report with app versions, package ids, EAS profiles, Android JS bundle hash, readiness, runtime readiness, gates, and remaining external blockers.
- `apps/mobile/.env.production.example`, `apps/api/.env.production.example`, `apps/api/Dockerfile`, and `docs/mobile-release-runbook.md` document the exact environment values, API worker package, and release sequence needed to avoid shipping a mobile build that silently falls back below PC-grade quality.
- `apps/mobile/eas.json` defines Android internal APK, preview, production, and iOS simulator/TestFlight build paths.
- `apps/mobile/eas.json` now defines EAS Submit production profiles for Google Play internal-track draft release and iOS TestFlight submission, plus a separate `submit.public.android` profile for Google Play production-track public release, guarded by `scripts/mobile-submit-gate.js`.
- Root scripts now expose `mobile:api-deploy-gate`, `mobile:api:docker:build`, `mobile:deploy-readiness`, `mobile:deploy-readiness:android`, `mobile:deploy-readiness:ios`, `mobile:public-release-gate:android`, `mobile:public-release-gate:android:save`, `mobile:build:android:production`, `mobile:submit:android:internal`, `mobile:submit:android:public`, `mobile:submit:ios:testflight`, `mobile:deploy:android:internal`, and `mobile:deploy:ios:testflight`.
- `mobile:deploy-readiness` is the final production signal: it combines release audit evidence, API runtime readiness, HTTPS production URL checks, EAS project/auth checks, privacy URL, and Android/iOS submit readiness before the app can be deployed.
- `mobile:deploy-readiness:android` and `mobile:deploy-readiness:ios` support the actual staged rollout path: Android internal track first, then iOS TestFlight.
- `.github/workflows/mobile-release.yml` provides the CI release rail: verify-only, API image publish, Android internal rollout, Android public rollout, iOS TestFlight rollout, optional deployed API smoke, and store submit guarded by `submit_to_stores=true`.
- `npm run mobile:ci-secrets-gate` performs target-aware GitHub variable/secret checks before expensive CI release work starts.
- `submitToStores=false` is the build-only rule for internal Android builds and dry-runs; store submit credentials become required only when the selected target actually submits to Google Play or App Store Connect.
- `npm run mobile:release-status` now produces the consolidated release dashboard, including `uiReady`, code readiness, full public-store readiness, Android-only public-store readiness, target blockers, and next actions without printing any secret values.
- `npm run mobile:release-secret-scan` scans generated release evidence, setup drafts, store manifests, and mobile env examples before upload, blocking concrete GitHub/Expo tokens, service-account private keys, and non-placeholder `gh secret set --body` values.
- `npm run mobile:public-release-gate` now produces the public-store dashboard, including screenshot source, reviewer token readiness, public Google Play track readiness, production API smoke readiness, and Korean store-copy readability. `npm run mobile:public-release-gate:android` scopes the same policy to Android public rollout.
- The mobile first screen now exposes golden discovery, PRO hunter, keyword analysis, mindmap expansion, home board hunting, and KIN hidden-question hunting.
- The mobile first screen includes an API token input so the optional bearer gate can be exercised without hard-coding secrets.
- The API gateway shell lives in `apps/api`.
- The API gateway now supports job creation, job reads, SSE progress streams, and cancellation.
- The API job store now has a concurrency queue so PC-grade jobs are limited by `maxConcurrentJobs` instead of starting every heavy worker immediately.
- `/health` exposes `jobs` queue stats so operators can see queued/running/completed/failed/cancelled counts and the current concurrency cap.
- The API gateway supports optional `LEWORD_MOBILE_API_TOKEN` bearer authorization so public mobile endpoints are not accidentally exposed.
- The API gateway enforces public request guardrails through `LEWORD_MOBILE_MAX_BODY_BYTES` and `LEWORD_MOBILE_RATE_LIMIT_PER_MINUTE`, exposes the active settings in `/health.guardrails`, and rejects oversized bodies with 413 or burst traffic with 429 before expensive PC-grade work starts.
- The API gateway now has a pluggable mobile entitlement bridge in `src/mobile/entitlements.ts`: `standard` users can analyze/expand, `pro` or stronger users can run PRO/home-board/KIN products, and `admin` is required for server prewarm execution.
- `LEWORD_MOBILE_ENTITLEMENTS_FILE` can point to a JSON token file for staging.
- `LEWORD_MOBILE_ENTITLEMENT_URL` can point to the production account/license service; the API fails closed if the service rejects, times out, or returns an expired entitlement.
- The API gateway now has a result cache that turns repeated identical requests into immediately completed mobile jobs, with optional disk persistence through `LEWORD_MOBILE_CACHE_FILE`.
- The API gateway exposes `/v1/prewarm/run` and `/v1/prewarm/snapshot` so server workers can warm high-impact policy, celebrity, home-board, and KIN targets before mobile users ask for them.
- The API gateway can run scheduled server-side prewarming with `LEWORD_MOBILE_PREWARM_INTERVAL_MINUTES`, optional `LEWORD_MOBILE_PREWARM_LIMIT`, and `LEWORD_MOBILE_PREWARM_ON_START=false` when operators want interval-only warming.
- `/health.prewarm.scheduler` reports whether scheduled warming is enabled, running, and how many runs have succeeded or failed.
- Prewarm winners are published into `MobileNotificationInbox` and exposed through `/v1/notifications`, with `/v1/notifications/:id/read` for read state.
- The API gateway exposes `/v1/push/subscriptions`; when `LEWORD_MOBILE_PUSH_ENDPOINT` or `LEWORD_MOBILE_PUSH_PROVIDER=expo` is configured, warmed SSS/S notification winners are forwarded to the push gateway, and `/health.push` reports enabled subscriptions plus recent delivery state.
- The mobile app now uses `expo-notifications`, `expo-device`, and `expo-constants` to request notification permission, create the Android notification channel, acquire an Expo push token, and register it with the LEWORD API.
- The mobile first screen now has a "오늘 추천 인박스" section that renders warmed SSS/S winners with search volume, document count, and golden ratio.
- The default API executor is now `MobilePcEngineExecutor`.
- `keyword-analysis` is connected to the existing PC keyword expansion ranker.
- `mindmap-expansion` is connected to the existing PC mindmap quality gate.
- `keyword-analysis` and `mindmap-expansion` now share the PC/server metric path: Naver SearchAd supplies PC/mobile/total volume and CPC, Naver Open API blog search supplies document count, and grades are recalculated from measured volume/document/ratio gates when credentials are available.
- `golden-discovery` is connected to the PC MDP/category-first engine path through `MobilePcEngineExecutor`; live runs require Naver Open API configuration on the server/PC worker.
- `pro-traffic-hunter` is connected to the PC PRO hunter path through `MobilePcEngineExecutor`; deterministic tests inject the same adapter contract so the 250-target regression does not hit live sources.
- `home-board-hunter` is connected to the PC home intent and publish planner path; deterministic tests require 30 S+ home-board candidates.
- `kin-hidden-honey` is connected to the PC Naver KIN golden hunter path; deterministic tests inject the adapter contract because the live path is server/browser-bound.
- Sanity gate now includes mobile parity, job orchestration, and API server smoke tests.

## Next implementation target

Complete `MobilePcEngineExecutor`:

- Connect `LEWORD_MOBILE_ENTITLEMENT_URL` to the deployed account/license entitlement service and run live entitlement checks before public mobile exposure.
- Connect `LEWORD_MOBILE_PUSH_ENDPOINT` to a custom gateway, or set `LEWORD_MOBILE_PUSH_PROVIDER=expo` to use Expo Push Service directly, and provide an EAS project id through EAS build metadata or `EXPO_PUBLIC_EAS_PROJECT_ID`.
- Wire deployed server credentials for Naver SearchAd and Naver Open API so the live mobile worker always returns measured keyword-analysis and mindmap metrics instead of development fallback metrics.
- Pass `npm run mobile:api-runtime-gate` on the deployed API worker before pointing production mobile builds at it.
- Pass `npm run mobile:api-deploy-gate` and either `npm run mobile:api:docker:build` locally or the CI `api-image` GHCR publish path before deploying the production API worker image.
- Pass `npm run mobile:api-smoke` against the deployed API URL before distributing an internal APK.
- Pass `npm run mobile:store-compliance` before App Store Connect or Play Console submission.
- Pass `npm run mobile:store-listing` before App Store Connect or Play Console submission.
- Pass `npm run mobile:store-assets` before App Store Connect or Play Console submission.
- Attach the `npm run mobile:release-audit` JSON output plus `docs/mobile-store-compliance.json`, `docs/mobile-store-listing.json`, `docs/mobile-store-assets.json`, and generated `apps/mobile/assets` images to the internal release record.
- Log in to EAS or provide `EXPO_TOKEN`, set the real `EXPO_PUBLIC_LEWORD_API_URL` and `EXPO_PUBLIC_EAS_PROJECT_ID`, then produce a real Android internal APK.
- Keep desktop IPC wrappers intact.
- Prove every mobile endpoint returns the same or stronger result floors than desktop fixtures.
