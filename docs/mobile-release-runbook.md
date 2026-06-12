# LEWORD Mobile Release Runbook

## Release standard

Mobile release is allowed only when the app delegates heavy keyword work to the LEWORD API worker and returns measured PC-grade results. The phone must never run Chromium, Patchright, Playwright, Puppeteer, or crawler pools.

## 1. Local code gates

```powershell
npm run verify:all
npm run mobile:store-compliance
npm run mobile:export:android
npm run mobile:api-deploy-gate
npm run mobile:store-listing
npm run mobile:assets:generate
npm run mobile:store-assets
npm run mobile:ui-release-gate:save
npm run mobile:store-submission-package:save
npm run mobile:launch-sla:save
npm run mobile:release-audit:save
npm run mobile:release-kit:save
npm run mobile:github-setup-plan:save
npm run mobile:release-dry-run:save
npm run mobile:release-dispatch-plan:save
npm run mobile:release-status:save
npm run mobile:public-release-gate:save
npm run mobile:public-release-gate:android:save
npm run mobile:public-release-gate:android
npm run mobile:deploy-readiness
npm run mobile:deploy-readiness:android
npm run mobile:deploy-readiness:ios
```

Expected state:

- `verify:all` passes desktop, keyword, mobile API, and mobile parity regression tests.
- `mobile:store-compliance` passes the privacy/data-safety manifest gate.
- `mobile:export:android` writes an Android JS bundle under `apps/mobile/.expo-export/android`.
- `mobile:api-deploy-gate` proves the production API worker has a Dockerfile, container healthcheck, deterministic Chromium path, production start command, and required env checklist.
- `mobile:store-listing` proves Play Console and App Store Connect metadata is present, within platform limits, traceable to official Apple/Google references, and does not imply guaranteed traffic or exposure.
- `mobile:assets:generate` creates the mobile app icon, Android adaptive foreground, splash image, Google Play feature graphic, and phone screenshot set.
- `mobile:store-assets` proves the Expo app config references those images and validates PNG dimensions for the icon, splash, feature graphic, and phone screenshots.
- `mobile:ui-release-gate:save` writes `.codex-build-cache/mobile-ui-release-gate.json`, proving the phone UI exposes touch-first controls, focused category hunting, all hunter modes, progress, cancellation, retry/error states, recommendation inbox, prewarm state, push registration, and measured metric result cards.
- `mobile:store-submission-package:save` writes copy-pasteable Play Console and App Store Connect submission files under `.codex-build-cache`.
- `mobile:launch-sla:save` writes `.codex-build-cache/mobile-launch-sla-report.json`, proving mobile endpoints are server-only, heavy automation stays off-device, PC-grade engines are reused, progress/cancellation exist, and user-requested SSS/count floors are preserved.
- `mobile:release-audit:save` records the bundle hash and remaining external blockers in `.codex-build-cache/mobile-release-audit.json`.
- `mobile:release-kit:save` records the selected target's required variables/secrets, target readiness, blockers, and next commands in `.codex-build-cache/mobile-release-kit.json`.
- `mobile:github-setup-plan:save` writes safe example/placeholder `gh variable set` / `gh secret set` drafts to `.codex-build-cache/mobile-github-setup-plan.json` and `.codex-build-cache/mobile-github-setup.ps1`. Target-specific plans stay platform-focused, so `android-public` includes Google Play helpers but not App Store Connect `.p8` helpers.
- `mobile:release-dry-run:save` combines audit, target release kit, and GitHub setup plan into `.codex-build-cache/mobile-release-dry-run.json` without running EAS, Docker push, or store submit.
- `mobile:release-dispatch-plan:save` writes `.codex-build-cache/mobile-release-dispatch-plan.json`, which refuses to dispatch GitHub Actions unless the selected dry-run is green and then records the exact `gh workflow run` command.
- `mobile:release-status:save` writes `.codex-build-cache/mobile-release-status.json`, a one-page machine-readable dashboard that separates local code/UI readiness from external API, EAS, and store-submit blockers across verify-only, API image, Android internal, iOS TestFlight, and full-release targets.
- `mobile:release-secret-scan:save` writes `.codex-build-cache/mobile-release-secret-scan.json` and fails if generated release evidence, setup drafts, store manifests, or mobile env examples contain concrete GitHub/Expo tokens, service-account private keys, or non-placeholder `gh secret set --body` values.
- `mobile:public-release-gate:save` writes `.codex-build-cache/mobile-public-release-gate.json` without blocking internal rollout. It is expected to stay blocked until production API smoke, public-track submit configuration, final device-captured screenshots, and reviewer token evidence are ready. Screenshot evidence must point to an existing local file under the repo or a production HTTPS evidence URL, not just a boolean flag.
- `mobile:public-release-gate:android:save` writes `.codex-build-cache/mobile-public-release-gate-android.json`; `mobile:public-release-gate:android` checks the same Android-only public release path so Google Play production rollout is not blocked by iOS App Store Connect credentials.
- `mobile:deploy-readiness` fails until production API URL, EAS auth, EAS project id, API runtime, privacy URL, and both store submit credentials are all ready.
- `mobile:deploy-readiness:android` and `mobile:deploy-readiness:ios` check the same production gates but only require that platform's store submit credentials.

## 1.1 CI release workflow

GitHub Actions entry point:

```text
.github/workflows/mobile-release.yml
```

Run it manually with one of these targets:

- `verify-only`: run full local parity gates and upload release evidence.
- `api-image`: verify, build, and publish the production API Docker image to GHCR.
- `android-internal`: build Android internal APK; submit only when `submit_to_stores=true`.
- `android-public`: build Android production AAB and submit to Google Play production draft; requires `submit_to_stores=true` and `run_api_smoke=true`.
- `ios-testflight`: build iOS production app; submit only when `submit_to_stores=true`.
- `full-release`: run API image plus Android/iOS paths.

Required repository variables/secrets:

- Variables: `LEWORD_MOBILE_API_URL`, `EXPO_PUBLIC_EAS_PROJECT_ID`, `LEWORD_PRIVACY_URL`, `LEWORD_MOBILE_ENTITLEMENT_URL`, `LEWORD_MOBILE_PREWARM_INTERVAL_MINUTES`.
- Secrets: `EXPO_TOKEN`, `LEWORD_MOBILE_SMOKE_TOKEN`, `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET`, `NAVER_SEARCH_AD_ACCESS_LICENSE`, `NAVER_SEARCH_AD_SECRET_KEY`, `NAVER_SEARCH_AD_CUSTOMER_ID`, `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON_B64`, `EXPO_APPLE_ID`, `EXPO_ASC_APP_ID`, `EXPO_APPLE_TEAM_ID`, plus either `EXPO_APPLE_APP_SPECIFIC_PASSWORD` or the App Store Connect API key set `EXPO_ASC_API_KEY_P8_B64`, `EXPO_ASC_API_KEY_ISSUER_ID`, and `EXPO_ASC_API_KEY_ID`.

The workflow runs `npm run mobile:ci-secrets-gate` before expensive builds. It allows `verify-only` with no release secrets, but blocks Android/iOS/full-release targets when required production variables or platform submit secrets are missing. `npm run mobile:submit-config:materialize` converts base64 store secrets into temporary local credential files during the CI job; those files are never committed.

The `api-image` job logs in to GHCR, pushes both `${GITHUB_SHA}` and `latest` tags, and uploads `.codex-build-cache/mobile-api-image.txt` as the `mobile-api-image-reference` artifact. Use the SHA tag from that artifact for production rollouts.

The release evidence artifact also includes `.codex-build-cache/mobile-release-kit.json`, `.codex-build-cache/mobile-release-dry-run.json`, `.codex-build-cache/mobile-release-dispatch-plan.json`, `.codex-build-cache/mobile-release-status.json`, `.codex-build-cache/mobile-release-secret-scan.json`, `.codex-build-cache/mobile-public-release-gate.json`, `.codex-build-cache/mobile-public-release-gate-android.json`, `.codex-build-cache/mobile-launch-sla-report.json`, `.codex-build-cache/mobile-ui-release-gate.json`, `.codex-build-cache/mobile-github-setup-plan.json`, `.codex-build-cache/mobile-github-setup.ps1`, `.codex-build-cache/mobile-store-submission-package.json`, `.codex-build-cache/mobile-store-submission-google-play.txt`, `.codex-build-cache/mobile-store-submission-app-store.txt`, `docs/mobile-store-compliance.json`, `docs/mobile-store-listing.json`, `docs/mobile-store-assets.json`, and the generated app/store PNG assets so PC parity, mobile UI quality, store privacy labels, descriptions, reviewer notes, release notes, icons, screenshots, missing target inputs, local readiness, public-store readiness, Android-only public-store readiness, secret-scan status, and the exact dispatch command can be checked against the submitted build.

## 2. Production API worker

Configure the production worker with the names in `apps/api/.env.production.example`, then run:

```powershell
npm run mobile:api-deploy-gate
npm run mobile:api:docker:build
npm run mobile:api-runtime-gate
```

Required production worker state:

- Naver Open API credentials are configured for measured document counts.
- Naver SearchAd credentials are configured for measured PC/mobile/total search volume and CPC.
- `LEWORD_MOBILE_ENTITLEMENT_URL` points to the account/license entitlement service.
- `LEWORD_MOBILE_CACHE_FILE` is persistent storage, not a temp path.
- `LEWORD_MOBILE_PREWARM_INTERVAL_MINUTES` is enabled so fresh winners are warmed before users request them.
- Push delivery is configured through `LEWORD_MOBILE_PUSH_PROVIDER=expo` or a production HTTPS gateway.
- `LEWORD_MOBILE_MAX_BODY_BYTES` and `LEWORD_MOBILE_RATE_LIMIT_PER_MINUTE` are left at safe defaults or intentionally tuned after capacity testing.
- `LEWORD_CHROME_PATH` resolves to a server-side Chromium path such as `/usr/bin/chromium` in the production container.

Build the API container from the repository root:

```powershell
docker build -f apps/api/Dockerfile -t leword-mobile-api:latest .
docker run --rm -p 34983:34983 --env-file apps/api/.env.production leword-mobile-api:latest
```

Or deploy the CI-published GHCR image with the production compose file:

```powershell
$env:LEWORD_MOBILE_API_IMAGE='ghcr.io/<owner>/leword-mobile-api:<sha>'
docker compose -f apps/api/docker-compose.production.yml up -d
```

For hands-off production restarts, run `.github/workflows/api-production-restart.yml` after the `api-image` workflow succeeds. Required repository secrets are `LEWORD_PROD_SSH_HOST`, `LEWORD_PROD_SSH_USER`, and `LEWORD_PROD_SSH_KEY`; optional secrets are `LEWORD_PROD_SSH_PORT`, `LEWORD_PROD_SSH_KNOWN_HOSTS`, `LEWORD_GHCR_USER`, and `LEWORD_GHCR_TOKEN`.

The API image installs system Chromium and exposes a `/health` container healthcheck so orchestration can replace broken workers before the mobile app points users at them. The production compose file loads `apps/api/.env.production`, maps port `34983`, and persists `LEWORD_MOBILE_CACHE_FILE` on the `leword-mobile-cache` volume.

## 3. Deployed API smoke

After the API is deployed:

```powershell
$env:LEWORD_MOBILE_SMOKE_API_URL='https://api.leword.app'
$env:LEWORD_MOBILE_SMOKE_TOKEN='mobile-user-token'
$env:LEWORD_MOBILE_SMOKE_RUN_JOB='true'
npm run mobile:api-smoke
npm run mobile:api-performance-smoke:save
```

The smoke must verify `/health`, `/v1/notifications`, runtime readiness, and a small keyword-analysis job with measured metrics.
The performance smoke writes `.codex-build-cache/mobile-api-performance-smoke.json` and checks health latency, notification latency, job acceptance latency, first progress latency, terminal timing, and measured PC metrics against `MOBILE_PC_PARITY_SLA`.

## 4. Internal Android APK

Configure the mobile app with the names in `apps/mobile/.env.production.example`, then run:

```powershell
$env:EXPO_PUBLIC_LEWORD_API_URL='https://api.leword.app'
$env:EXPO_PUBLIC_EAS_PROJECT_ID='<eas-project-id>'
npm run mobile:release-gate:cloud
npm run mobile:deploy-readiness:android
npm run mobile:build:android:internal
npm run mobile:build:android:production
npm run mobile:submit:android:internal
```

The cloud gate blocks builds when EAS auth, the EAS project id, the production API URL, or the Android JS export is missing.
Android submit uses `apps/mobile/eas.json` `submit.production.android`, uploads the latest production AAB to the Google Play internal track, and keeps the release in `draft`.
Public Google Play release uses the separate `submit.public.android` profile with `track=production`; do not change the internal-track profile into a public-track profile.

## 5. iOS TestFlight

After the Android internal build is verified:

```powershell
$env:EXPO_PUBLIC_LEWORD_API_URL='https://api.leword.app'
$env:EXPO_PUBLIC_EAS_PROJECT_ID='<eas-project-id>'
npm run mobile:deploy-readiness:ios
npm run mobile:build:ios:testflight
npm run mobile:submit:ios:testflight
```

Use the reviewer notes from `docs/mobile-store-compliance.json` and make sure any paid mobile entitlement flow follows the final App Store policy decision.
Before iOS submit, replace the `apps/mobile/eas.json` iOS placeholders or run `npm run mobile:submit-config:materialize`. Provide `EXPO_APPLE_APP_SPECIFIC_PASSWORD`, or provide `EXPO_ASC_API_KEY_P8_B64` with `EXPO_ASC_API_KEY_ISSUER_ID` and `EXPO_ASC_API_KEY_ID` so the job can create the temporary App Store Connect `.p8` key file.

## 6. Store submission checklist

- Attach the latest `.codex-build-cache/mobile-release-audit.json` to the internal release record.
- Attach the latest `.codex-build-cache/mobile-release-kit.json` to the same record so missing target-specific variables or secrets are visible without exposing secret values.
- Attach `.codex-build-cache/mobile-release-dry-run.json`; it is the one-file final pre-deploy decision report.
- Attach `.codex-build-cache/mobile-release-dispatch-plan.json`; run its `dispatch.command` only when `readyToDispatch` is `true`.
- Attach `.codex-build-cache/mobile-release-status.json`; it is the status board for which mobile targets are code-ready, build-ready, submit-ready, or blocked by external credentials/runtime.
- Attach `.codex-build-cache/mobile-release-secret-scan.json`; it must be `ok=true` before uploading release evidence or store submission material.
- Attach `.codex-build-cache/mobile-public-release-gate.json` before any public store release. Internal Android/TestFlight can proceed while this is blocked, but public release must wait for `ok=true`.
- Attach `.codex-build-cache/mobile-public-release-gate-android.json` before Android public release. It is the Android-only public store gate and can become green even while iOS App Store credentials are still pending.
- Attach `.codex-build-cache/mobile-launch-sla-report.json`; `ok=true` proves local PC-parity structure is intact, while `releaseReady=true` additionally proves external production runtime inputs are ready.
- Attach `.codex-build-cache/mobile-ui-release-gate.json`; it proves the submitted mobile UI still has phone-native controls, visible progress/cancellation, error recovery, push/inbox/prewarm affordances, and measured metric result cards.
- Attach `.codex-build-cache/mobile-api-performance-smoke.json` after the deployed API smoke; it proves the production worker is not merely reachable but responding within mobile SLA budgets.
- Use `.codex-build-cache/mobile-store-submission-google-play.txt` and `.codex-build-cache/mobile-store-submission-app-store.txt` as the copy-paste source for store console metadata, reviewer notes, privacy summary, and asset paths.
- Use `.codex-build-cache/mobile-github-setup.ps1` as a safe example/placeholder draft for GitHub repository variables and secrets. Replace the values locally and do not commit real secrets.
- Use `docs/mobile-store-compliance.json` for Apple App Privacy and Google Play Data safety forms.
- Use `docs/mobile-store-listing.json` for Play Console and App Store Connect descriptions, keywords, reviewer notes, and release notes.
- Use `docs/mobile-store-assets.json` plus `apps/mobile/assets` for icon, feature graphic, and screenshot upload. Generated screenshots are acceptable for internal-track pipeline validation, but public release should replace them with device-captured screenshots from the final EAS build.
- For public store release, update `docs/mobile-store-assets.json` `publicReleaseEvidence.deviceCapturedScreenshotsReady=true`, set `screenshotSource=device-captured`, and set `evidencePath` to an existing local evidence file or production HTTPS evidence URL for the final EAS build. Set `LEWORD_MOBILE_REVIEWER_TOKEN_READY=true` only after reviewer notes contain a working demo token; if using manifest evidence instead of the CI secret, set `publicReleaseEvidence.reviewerTokenReady=true` and `reviewerTokenEvidencePath` to a non-secret proof file/URL.
- For public Google Play release, run `npm run mobile:public-release-gate:android`, then `npm run mobile:submit-gate:android:public`, and then `npm run mobile:submit:android:public`; this uses `apps/mobile/eas.json` `submit.public.android` instead of the internal rollout profile and does not require iOS submit credentials.
- For CI-based public Google Play release, dispatch `mobile-release.yml` with `target=android-public`, `submit_to_stores=true`, and `run_api_smoke=true`. The job runs the production AAB build, API performance smoke, `mobile:public-release-gate:android`, then `mobile:submit:android:public`.
- Confirm the in-app Privacy Policy footer opens the production HTTPS privacy URL.
- Confirm push notifications are optional and only requested after the user chooses to enable them.
- Confirm keyword jobs, API bearer tokens, Expo push tokens, and notification read state match the declared privacy manifest.

## Current external blockers

- EAS account auth or `EXPO_TOKEN`.
- Real EAS project id for push tokens.
- Google Play service account key at `apps/mobile/credentials/google-play-service-account.json`.
- iOS App Store Connect app id, Apple team id, Apple id, and app-specific password or API key credentials.
- Production HTTPS API deployment.
- Docker Desktop or CI image builder for `npm run mobile:api:docker:build`.
- Production account/license entitlement service.
- Production Naver Open API and SearchAd credentials.
- Android SDK, platform-tools, command-line tools, and JDK 17+ for local native builds if cloud build is not used.
