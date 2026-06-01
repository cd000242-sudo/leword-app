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
    path.join(__dirname, '..', 'src', 'utils', '__tests__', 'realtime-strength.test.ts'),
    path.join(__dirname, '..', 'src', 'utils', '__tests__', 'home-publish-planner.test.ts'),
    path.join(__dirname, '..', 'src', 'utils', '__tests__', 'home-keyword-intent.test.ts'),
    path.join(__dirname, '..', 'src', 'utils', '__tests__', 'category-discovery-regression.test.ts'),
    path.join(__dirname, '..', 'src', 'utils', '__tests__', 'golden-discovery-floor.test.ts'),
    path.join(__dirname, '..', 'src', 'utils', '__tests__', 'pro-traffic-floor.test.ts'),
    path.join(__dirname, '..', 'src', 'utils', '__tests__', 'ui-count-regression.test.ts'),
    path.join(__dirname, '..', 'src', 'utils', '__tests__', 'rich-feed-precision-floor.test.ts'),
    path.join(__dirname, '..', 'src', 'utils', '__tests__', 'keyword-relevance-regression.test.ts'),
    path.join(__dirname, '..', 'src', 'utils', '__tests__', 'deterministic-scoring-regression.test.ts'),
    path.join(__dirname, '..', 'src', 'utils', '__tests__', 'kin-hidden-honey-regression.test.ts'),
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
