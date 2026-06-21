/**
 * scripts/run-sanity-gate-test.js — v2.49.12 sanity-gate.ts 회귀 테스트 runner
 *
 * 단순 wrapper — ts-node 로 sanity-gate.test.ts 실행.
 * 빌드/배포 전 회귀 방지 (release 스크립트의 verify:all 에 통합).
 *
 * exit 0 = 모든 테스트 통과
 * exit 1 = 회귀 발견 (release 차단)
 */

const { spawnSync } = require('child_process');
const path = require('path');

const testFiles = [
    path.join(__dirname, '..', 'src', 'utils', '__tests__', 'sanity-gate.test.ts'),
    path.join(__dirname, '..', 'src', 'utils', '__tests__', 'shopping-opportunity.test.ts'),
    path.join(__dirname, '..', 'src', 'utils', '__tests__', 'policy-briefing.test.ts'),
    path.join(__dirname, '..', 'src', 'utils', '__tests__', 'updater-autostart-regression.test.ts'),
    path.join(__dirname, '..', 'src', 'utils', '__tests__', 'browser-process-regression.test.ts'),
    path.join(__dirname, '..', 'src', 'utils', '__tests__', 'rank-url-normalizer.test.ts'),
    path.join(__dirname, '..', 'src', 'utils', '__tests__', 'background-worker-toggle-regression.test.ts'),
    path.join(__dirname, '..', 'src', 'utils', '__tests__', 'realtime-strength.test.ts'),
    path.join(__dirname, '..', 'src', 'utils', '__tests__', 'exposure-growth-loop.test.ts'),
    path.join(__dirname, '..', 'src', 'utils', '__tests__', 'adsense-approval-purpose.test.ts'),
    path.join(__dirname, '..', 'src', 'utils', '__tests__', 'home-publish-planner.test.ts'),
    path.join(__dirname, '..', 'src', 'utils', '__tests__', 'home-keyword-intent.test.ts'),
    path.join(__dirname, '..', 'src', 'utils', '__tests__', 'home-hunter-splus-floor.test.ts'),
    path.join(__dirname, '..', 'src', 'utils', '__tests__', 'category-discovery-regression.test.ts'),
    path.join(__dirname, '..', 'src', 'utils', '__tests__', 'fresh-issue-golden-seeds.test.ts'),
    path.join(__dirname, '..', 'src', 'utils', '__tests__', 'golden-keyword-precision.test.ts'),
    path.join(__dirname, '..', 'src', 'utils', '__tests__', 'golden-discovery-floor.test.ts'),
    path.join(__dirname, '..', 'src', 'utils', '__tests__', 'golden-category-sss-100run.test.ts'),
    path.join(__dirname, '..', 'src', 'utils', '__tests__', 'pro-traffic-floor.test.ts'),
    path.join(__dirname, '..', 'src', 'utils', '__tests__', 'pro-traffic-category-focus-regression.test.ts'),
    path.join(__dirname, '..', 'src', 'utils', '__tests__', 'pro-traffic-sss-100run.test.ts'),
    path.join(__dirname, '..', 'src', 'utils', '__tests__', 'ui-count-regression.test.ts'),
    path.join(__dirname, '..', 'src', 'utils', '__tests__', 'mindmap-expansion-quality.test.ts'),
    path.join(__dirname, '..', 'src', 'utils', '__tests__', 'mindmap-metrics-regression.test.ts'),
    path.join(__dirname, '..', 'src', 'utils', '__tests__', 'mindmap-ui-focus-regression.test.ts'),
    path.join(__dirname, '..', 'src', 'utils', '__tests__', 'keyword-expansion-ranker.test.ts'),
    path.join(__dirname, '..', 'src', 'utils', '__tests__', 'rich-feed-precision-floor.test.ts'),
    path.join(__dirname, '..', 'src', 'utils', '__tests__', 'keyword-relevance-regression.test.ts'),
    path.join(__dirname, '..', 'src', 'utils', '__tests__', 'deterministic-scoring-regression.test.ts'),
    path.join(__dirname, '..', 'src', 'utils', '__tests__', 'kin-hidden-honey-quality.test.ts'),
    path.join(__dirname, '..', 'src', 'utils', '__tests__', 'kin-hidden-honey-regression.test.ts'),
    path.join(__dirname, '..', 'src', 'utils', '__tests__', 'mobile-ultra-plan-regression.test.ts'),
    path.join(__dirname, '..', 'src', 'utils', '__tests__', 'mobile-job-orchestrator.test.ts'),
    path.join(__dirname, '..', 'src', 'utils', '__tests__', 'mobile-notification-inbox.test.ts'),
    path.join(__dirname, '..', 'src', 'utils', '__tests__', 'mobile-push-notifications.test.ts'),
    path.join(__dirname, '..', 'src', 'utils', '__tests__', 'mobile-runtime-readiness.test.ts'),
    path.join(__dirname, '..', 'src', 'utils', '__tests__', 'mobile-api-status.test.ts'),
    path.join(__dirname, '..', 'src', 'utils', '__tests__', 'mobile-export-share.test.ts'),
    path.join(__dirname, '..', 'src', 'utils', '__tests__', 'mobile-rank-tracking.test.ts'),
    path.join(__dirname, '..', 'src', 'utils', '__tests__', 'mobile-pro-outcomes.test.ts'),
    path.join(__dirname, '..', 'src', 'utils', '__tests__', 'mobile-pro-blueprint.test.ts'),
    path.join(__dirname, '..', 'src', 'utils', '__tests__', 'mobile-wordpress-publishing.test.ts'),
    path.join(__dirname, '..', 'src', 'utils', '__tests__', 'mobile-wordpress-rest.test.ts'),
    path.join(__dirname, '..', 'src', 'utils', '__tests__', 'mobile-keyword-groups.test.ts'),
    path.join(__dirname, '..', 'src', 'utils', '__tests__', 'mobile-schedule-dashboard.test.ts'),
    path.join(__dirname, '..', 'src', 'utils', '__tests__', 'mobile-api-smoke-test.test.ts'),
    path.join(__dirname, '..', 'src', 'utils', '__tests__', 'mobile-api-performance-smoke.test.ts'),
    path.join(__dirname, '..', 'src', 'utils', '__tests__', 'mobile-commerce-ops.test.ts'),
    path.join(__dirname, '..', 'src', 'utils', '__tests__', 'mobile-commerce-api-server.test.ts'),
    path.join(__dirname, '..', 'src', 'utils', '__tests__', 'mobile-ui-release-gate.test.ts'),
    path.join(__dirname, '..', 'src', 'utils', '__tests__', 'mobile-prewarm-scheduler.test.ts'),
    path.join(__dirname, '..', 'src', 'utils', '__tests__', 'mobile-api-server.test.ts'),
    path.join(__dirname, '..', 'src', 'utils', '__tests__', 'mobile-api-guardrails.test.ts'),
    path.join(__dirname, '..', 'src', 'utils', '__tests__', 'mobile-keyword-ai-judge.test.ts'),
    path.join(__dirname, '..', 'src', 'utils', '__tests__', 'mobile-api-ai-judge.test.ts'),
    path.join(__dirname, '..', 'src', 'utils', '__tests__', 'mobile-api-deploy-gate.test.ts'),
    path.join(__dirname, '..', 'src', 'utils', '__tests__', 'mobile-ci-workflow.test.ts'),
    path.join(__dirname, '..', 'src', 'utils', '__tests__', 'mobile-ci-secrets-gate.test.ts'),
    path.join(__dirname, '..', 'src', 'utils', '__tests__', 'mobile-store-listing-gate.test.ts'),
    path.join(__dirname, '..', 'src', 'utils', '__tests__', 'mobile-store-assets-gate.test.ts'),
    path.join(__dirname, '..', 'src', 'utils', '__tests__', 'mobile-store-submission-package.test.ts'),
    path.join(__dirname, '..', 'src', 'utils', '__tests__', 'mobile-launch-sla-report.test.ts'),
    path.join(__dirname, '..', 'src', 'utils', '__tests__', 'mobile-materialize-submit-config.test.ts'),
    path.join(__dirname, '..', 'src', 'utils', '__tests__', 'mobile-submit-gate.test.ts'),
    path.join(__dirname, '..', 'src', 'utils', '__tests__', 'mobile-public-submit-profile.test.ts'),
    path.join(__dirname, '..', 'src', 'utils', '__tests__', 'mobile-deploy-readiness.test.ts'),
    path.join(__dirname, '..', 'src', 'utils', '__tests__', 'mobile-release-kit.test.ts'),
    path.join(__dirname, '..', 'src', 'utils', '__tests__', 'mobile-github-setup-plan.test.ts'),
    path.join(__dirname, '..', 'src', 'utils', '__tests__', 'mobile-release-dry-run.test.ts'),
    path.join(__dirname, '..', 'src', 'utils', '__tests__', 'mobile-release-dispatch-plan.test.ts'),
    path.join(__dirname, '..', 'src', 'utils', '__tests__', 'mobile-release-status.test.ts'),
    path.join(__dirname, '..', 'src', 'utils', '__tests__', 'mobile-public-release-gate.test.ts'),
    path.join(__dirname, '..', 'src', 'utils', '__tests__', 'mobile-release-secret-scan.test.ts'),
    path.join(__dirname, '..', 'src', 'utils', '__tests__', 'mobile-pc-engine-executor.test.ts'),
    path.join(__dirname, '..', 'src', 'utils', '__tests__', 'mobile-pc-feature-catalog.test.ts'),
    path.join(__dirname, '..', 'src', 'utils', '__tests__', 'pro-web-site-regression.test.ts'),
    path.join(__dirname, '..', 'src', 'utils', '__tests__', 'mobile-source-signals.test.ts'),
];

for (const testFile of testFiles) {
    console.log(`[${path.basename(testFile)}] running...`);
    const result = spawnSync('npx', ['ts-node', '--transpile-only', testFile], {
        stdio: 'inherit',
        shell: true,
    });

    if (result.status !== 0) {
        console.error(`[${path.basename(testFile)}] ❌ FAILED — release 차단`);
        process.exit(1);
    }
}

console.log('[sanity-gate.test] ✅ PASSED');
process.exit(0);
