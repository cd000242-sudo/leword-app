import * as fs from 'fs';
import * as path from 'path';

function assert(name: string, condition: boolean, detail?: string): void {
  if (!condition) {
    throw new Error(`${name}${detail ? `: ${detail}` : ''}`);
  }
}

const root = path.join(__dirname, '..', '..', '..');
const workflow = fs.readFileSync(path.join(root, '.github', 'workflows', 'mobile-release.yml'), 'utf8');

assert('mobile workflow is manually dispatchable', /workflow_dispatch/.test(workflow));
assert('mobile workflow exposes staged targets',
  /verify-only/.test(workflow)
    && /api-image/.test(workflow)
    && /android-internal/.test(workflow)
    && /android-public/.test(workflow)
    && /ios-testflight/.test(workflow)
    && /full-release/.test(workflow));
assert('mobile workflow keeps store submit behind boolean',
  /submit_to_stores/.test(workflow)
    && /github\.event\.inputs\.submit_to_stores == 'true'/.test(workflow));
assert('mobile workflow runs full verification and release evidence',
  /npm run verify:all/.test(workflow)
    && /mobile:ci-secrets-gate/.test(workflow)
    && /npm run mobile:api-deploy-gate/.test(workflow)
    && /npm run mobile:store-compliance/.test(workflow)
    && /npm run mobile:store-listing/.test(workflow)
    && /npm run mobile:store-assets/.test(workflow)
    && /npm run mobile:ui-release-gate:save/.test(workflow)
    && /npm run mobile:store-submission-package:save/.test(workflow)
    && /npm run mobile:launch-sla:save/.test(workflow)
    && /npm run mobile:release-audit:save/.test(workflow)
    && /npm run mobile:release-kit:save/.test(workflow)
    && /npm run mobile:github-setup-plan:save/.test(workflow)
    && /npm run mobile:release-dry-run:save/.test(workflow)
    && /npm run mobile:release-dispatch-plan:save/.test(workflow)
    && /npm run mobile:release-status:save/.test(workflow)
    && /npm run mobile:public-release-gate:save/.test(workflow)
    && /mobile-release-evidence/.test(workflow));
assert('mobile workflow publishes API docker image to GHCR in CI',
  /REGISTRY:\s*ghcr\.io/.test(workflow)
    && /API_IMAGE_REPOSITORY:\s*leword-mobile-api/.test(workflow)
    && /docker login \$\{\{ env\.REGISTRY \}\}/.test(workflow)
    && /docker build -f apps\/api\/Dockerfile/.test(workflow)
    && /docker push "\$\{IMAGE_NAME\}:\$\{GITHUB_SHA\}"/.test(workflow)
    && !/docker push "\$\{IMAGE_NAME\}:latest"/.test(workflow)
    && /imagetools inspect "\$\{IMAGE_NAME\}:\$\{GITHUB_SHA\}" > "\$descriptor_output"/.test(workflow)
    && /\^Digest:\[\[:space:\]\]\+\(sha256:\[0-9a-f\]\{64\}\)/.test(workflow)
    && /verified_descriptor_digests\[0\]/.test(workflow)
    && /RepoDigests/.test(workflow)
    && !/sha256sum "\$manifest_raw"/.test(workflow)
    && /mobile-api-image-manifest\.json/.test(workflow)
    && /--manifest-digest "\$MANIFEST_DIGEST"/.test(workflow)
    && /--commit-sha "\$GITHUB_SHA"/.test(workflow)
    && /--image-repository "\$IMAGE_NAME"/.test(workflow)
    && /mobile-api-image-reference/.test(workflow));
assert('production API image is published only from main',
  /api-image:[\s\S]*github\.ref == 'refs\/heads\/main'/.test(workflow),
  'branch images must never become production restart evidence');
assert('API image credential cleanup exits explicitly on runner signals',
  /trap cleanup EXIT/.test(workflow)
    && /trap 'exit 129' HUP/.test(workflow)
    && /trap 'exit 130' INT/.test(workflow)
    && /trap 'exit 143' TERM/.test(workflow)
    && !/trap cleanup EXIT HUP INT TERM/.test(workflow));
assert('mobile workflow uses platform-specific deploy readiness',
  /mobile:deploy-readiness:android/.test(workflow)
    && /mobile:deploy-readiness:ios/.test(workflow));
assert('mobile workflow materializes submit config from secrets',
  /mobile:submit-config:materialize/.test(workflow)
    && /GOOGLE_PLAY_SERVICE_ACCOUNT_JSON_B64/.test(workflow)
    && /EXPO_ASC_APP_ID/.test(workflow)
    && /EXPO_APPLE_TEAM_ID/.test(workflow)
    && /EXPO_ASC_API_KEY_P8_B64/.test(workflow)
    && /EXPO_ASC_API_KEY_ISSUER_ID/.test(workflow)
    && /EXPO_ASC_API_KEY_ID/.test(workflow));
assert('mobile workflow checks selected target inputs before expensive work',
  /Check selected CI release inputs/.test(workflow)
    && /--target/.test(workflow)
    && /--submit/.test(workflow)
    && /--smoke/.test(workflow));
assert('mobile workflow can build and submit Android and iOS',
  /mobile:build:android:internal/.test(workflow)
    && /mobile:build:android:production/.test(workflow)
    && /mobile:submit:android:internal/.test(workflow)
    && /mobile:submit:android:public/.test(workflow)
    && /mobile:submit-gate:android:public/.test(workflow)
    && /mobile:build:ios:testflight/.test(workflow)
    && /mobile:submit:ios:testflight/.test(workflow));
assert('mobile workflow is wired to production API vars and EAS auth',
  /vars\.LEWORD_MOBILE_API_URL/.test(workflow)
    && /vars\.EXPO_PUBLIC_EAS_PROJECT_ID/.test(workflow)
    && /vars\.LEWORD_MOBILE_ENTITLEMENT_URL/.test(workflow)
    && /secrets\.NAVER_CLIENT_ID/.test(workflow)
    && /secrets\.NAVER_SEARCH_AD_ACCESS_LICENSE/.test(workflow)
    && /secrets\.EXPO_TOKEN/.test(workflow));
assert('mobile workflow exports JS bundle in EAS jobs before cloud gate',
  /Export Android JS bundle[\s\S]*mobile:export:android[\s\S]*Verify cloud build inputs/.test(workflow)
    && /Export Android JS bundle for release gate[\s\S]*mobile:export:android[\s\S]*Verify cloud build inputs/.test(workflow));
assert('mobile workflow uploads store compliance and listing evidence',
  /docs\/mobile-store-compliance\.json/.test(workflow)
    && /\.codex-build-cache\/mobile-release-kit\.json/.test(workflow)
    && /\.codex-build-cache\/mobile-release-dry-run\.json/.test(workflow)
    && /\.codex-build-cache\/mobile-release-dispatch-plan\.json/.test(workflow)
    && /\.codex-build-cache\/mobile-release-status\.json/.test(workflow)
    && /\.codex-build-cache\/mobile-public-release-gate\.json/.test(workflow)
    && /\.codex-build-cache\/mobile-github-setup-plan\.json/.test(workflow)
    && /\.codex-build-cache\/mobile-github-setup\.ps1/.test(workflow)
    && /\.codex-build-cache\/mobile-ui-release-gate\.json/.test(workflow)
    && /\.codex-build-cache\/mobile-store-submission-package\.json/.test(workflow)
    && /\.codex-build-cache\/mobile-store-submission-google-play\.txt/.test(workflow)
    && /\.codex-build-cache\/mobile-store-submission-app-store\.txt/.test(workflow)
    && /\.codex-build-cache\/mobile-launch-sla-report\.json/.test(workflow)
    && /docs\/mobile-store-listing\.json/.test(workflow)
    && /docs\/mobile-store-assets\.json/.test(workflow)
    && /apps\/mobile\/assets\/icon\.png/.test(workflow)
    && /apps\/mobile\/assets\/store\/screenshots\/\*\.png/.test(workflow));
assert('mobile workflow runs deployed API performance smoke when smoke is enabled',
  /Run deployed API performance smoke/.test(workflow)
    && /mobile:api-performance-smoke:save/.test(workflow)
    && /mobile-api-performance-smoke\.json/.test(workflow)
    && /mobile-api-smoke-evidence/.test(workflow)
    && /LEWORD_MOBILE_PERF_API_URL/.test(workflow)
    && /LEWORD_MOBILE_PERF_TOKEN/.test(workflow));

console.log('[mobile-ci-workflow.test] passed');

export {};
