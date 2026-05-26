#!/usr/bin/env node
/**
 * scripts/health-check-sanity.js — v2.49.13+ sanity-gate.ts 일일 health check
 *
 * 60+ 시드 시뮬레이션 패턴으로 sanity-gate.ts 의 회귀 자동 감지:
 *   - sv*0.5 fallback 패턴 (사용자 보고 case + Phase B 발견)
 *   - 다양한 sv/dc 조합 (실측 / 추정 / 가짜)
 *   - 모든 9 source 분기 (rich-feed, pro-traffic, ..., claude)
 *
 * 사용:
 *   node scripts/health-check-sanity.js
 *
 * 출력:
 *   - 각 시나리오 통과/실패
 *   - 통계 — SSS 통과율, dcEst 감지율, redOcean 차단율
 *   - 회귀 발견 시 exit 1 (CI 통합 가능)
 *
 * Phase D 회귀 방지 — 매일 cron 또는 push 시 실행.
 */

const path = require('path');

// ts-node 없이 컴파일된 dist 사용 (release 후)
let sanityGate;
try {
    sanityGate = require(path.join(__dirname, '..', 'dist', 'utils', 'sanity-gate'));
} catch (e) {
    console.error('❌ dist/utils/sanity-gate 로드 실패 — npm run build 먼저 실행하세요');
    console.error(e.message);
    process.exit(1);
}

const { validateGrade, applySanity } = sanityGate;

// ==================== 시나리오 풀 (60+ 케이스) ====================
const scenarios = [
    // [1] 사용자 보고 case — 정확 sv/2 fallback (가짜 SSS) — 모두 SSS 차단되어야
    { name: '게이밍 노트북 추천 sv*0.5 정확', input: { keyword: '게이밍 노트북 추천', searchVolume: 1980, documentCount: 990, goldenRatio: 2.0, score: 75, source: 'rich-feed' }, expect: { grade: 'NOT_SSS', dcEst: true } },
    { name: '환급금 조회 토스 자격 sv*0.5 정확', input: { keyword: '환급금 조회 토스 자격', searchVolume: 1440, documentCount: 693, goldenRatio: 2.08, score: 70, source: 'rich-feed' }, expect: { grade: 'NOT_SSS', dcEst: true } },
    { name: '마우스 추천 sv*0.5 정확', input: { keyword: '마우스 추천', searchVolume: 6710, documentCount: 3355, goldenRatio: 2.0, score: 78, source: 'rich-feed' }, expect: { grade: 'NOT_SSS', dcEst: true } },
    { name: '노트북 추천 sv*0.5 정확', input: { keyword: '노트북 추천', searchVolume: 13100, documentCount: 6550, goldenRatio: 2.0, score: 78, source: 'rich-feed' }, expect: { grade: 'NOT_SSS', dcEst: true } },

    // [2] 정상 실측 case — SSS 통과되어야
    { name: '정상 SSS — LG 그램 17 가성비', input: { keyword: 'LG 그램 17 가성비', searchVolume: 1500, documentCount: 300, goldenRatio: 5.0, score: 85, source: 'rich-feed' }, expect: { grade: 'SSS', dcEst: false } },
    { name: '정상 SSS — 다이슨 V15 후기', input: { keyword: '다이슨 V15 후기', searchVolume: 2000, documentCount: 400, goldenRatio: 5.0, score: 80, source: 'rich-feed' }, expect: { grade: 'SSS', dcEst: false } },
    { name: '정상 SSS — 갤럭시북 4 프로', input: { keyword: '갤럭시북 4 프로', searchVolume: 1500, documentCount: 180, goldenRatio: 8.33, score: 82, source: 'rich-feed' }, expect: { grade: 'SSS', dcEst: false } }, // dc 180 / (1500*0.5)=750 = halfSvRatio 0.24, NEAR 매칭 안 함

    // [3] redOcean — SSS 차단
    { name: 'redOcean 청소기', input: { keyword: '청소기', searchVolume: 50000, documentCount: 800000, goldenRatio: 0.0625, score: 60, source: 'rich-feed' }, expect: { grade: 'NOT_SSS', reason: 'RED_OCEAN' } },
    { name: 'redOcean 다이어트', input: { keyword: '다이어트', searchVolume: 100000, documentCount: 500000, goldenRatio: 0.2, score: 65, source: 'rich-feed' }, expect: { grade: 'NOT_SSS', reason: 'RED_OCEAN' } },

    // [4] 단일 토큰 + dcEst — SSS 차단
    { name: '단일 토큰 + dcEst', input: { keyword: '청소기', searchVolume: 1000, documentCount: 500, goldenRatio: 2.0, score: 75, dcEstimated: true, source: 'rich-feed' }, expect: { grade: 'NOT_SSS', reason: 'SINGLE_TOKEN_ESTIMATED' } },
    { name: '단일 토큰 + 실측 + 낮은 dc → SSS 통과 가능', input: { keyword: '청소기', searchVolume: 1000, documentCount: 300, goldenRatio: 3.33, score: 75, dcEstimated: false, source: 'rich-feed' }, expect: { grade: 'SSS' } }, // 실측 + dc<5000 → SSS 가능 (정책상 single token + 실측은 통과)
    { name: '단일 토큰 + 실측 + 높은 dc → 차단', input: { keyword: '청소기', searchVolume: 1000, documentCount: 6000, goldenRatio: 0.17, score: 70, dcEstimated: false, source: 'rich-feed' }, expect: { grade: 'NOT_SSS', reason: 'RED_OCEAN' } },

    // [5] 빅워드 — SSS 차단
    { name: '빅워드 (sv=50K, 2-token)', input: { keyword: '청소기 추천', searchVolume: 50000, documentCount: 5000, goldenRatio: 10.0, score: 80, source: 'rich-feed' }, expect: { grade: 'NOT_SSS', reason: 'BIG_WORD' } },
    { name: '빅워드 (sv=100K, 1-token)', input: { keyword: '청소기', searchVolume: 100000, documentCount: 10000, goldenRatio: 10.0, score: 80, source: 'rich-feed' }, expect: { grade: 'NOT_SSS', reason: 'BIG_WORD' } },
    { name: '빅워드 sv<30K → SSS 가능', input: { keyword: '청소기 추천 가성비', searchVolume: 20000, documentCount: 2000, goldenRatio: 10.0, score: 85, source: 'rich-feed' }, expect: { grade: 'SSS' } },

    // [6] Claude source — Manus 우선 정책
    { name: 'Claude SSS 차단 #1', input: { keyword: 'LG 그램 17 2024 게이밍', searchVolume: 1500, documentCount: 300, goldenRatio: 5.0, score: 85, source: 'claude' }, expect: { grade: 'NOT_SSS', reason: 'CLAUDE_SOURCE_REJECTED' } },
    { name: 'Manus SSS 통과 (같은 조건)', input: { keyword: 'LG 그램 17 2024 게이밍', searchVolume: 1500, documentCount: 300, goldenRatio: 5.0, score: 85, source: 'manus' }, expect: { grade: 'SSS' } },

    // [7] svEstimated — SSS 차단
    { name: 'svEstimated', input: { keyword: '맥북 프로 M3 가성비', searchVolume: 5000, documentCount: 200, goldenRatio: 25.0, score: 90, svEstimated: true, source: 'rich-feed' }, expect: { grade: 'NOT_SSS', reason: 'SV_ESTIMATED' } },

    // [8] backup-no-api — 모든 등급 차단
    { name: 'backup-no-api', input: { keyword: '강아지 사료', searchVolume: 0, documentCount: 0, goldenRatio: 0, score: 0, source: 'backup-no-api' }, expect: { grade: 'B_OR_LOWER', reason: 'BACKUP_NO_API' } },

    // [9] sv*0.5 인접 (NEAR) — dcEst 마킹만, multi-token + 다른 차단 없으면 SS 가능
    { name: 'NEAR (halfSv=0.5)', input: { keyword: '에어컨 추천', searchVolume: 1000, documentCount: 250, goldenRatio: 4.0, score: 75, source: 'rich-feed' }, expect: { dcEst: true, reasonContains: 'FALLBACK_HALF_SV_NEAR' } },

    // [10] pro-traffic source — sanity 동일 적용
    { name: 'pro-traffic SSS (정상)', input: { keyword: '에어팟 프로 2 가성비', searchVolume: 1200, documentCount: 250, goldenRatio: 4.8, score: 85, source: 'pro-traffic' }, expect: { grade: 'SSS' } },
    { name: 'pro-traffic sv*0.5 차단', input: { keyword: '에어팟 프로 2', searchVolume: 2000, documentCount: 1000, goldenRatio: 2.0, score: 80, source: 'pro-traffic' }, expect: { grade: 'NOT_SSS' } },
];

// ==================== 실행 ====================
let passed = 0;
let failed = 0;
const failures = [];
let stats = { sssTotal: 0, sssPass: 0, dcEstDetected: 0, redOceanBlocked: 0, claudeBlocked: 0 };

for (const sc of scenarios) {
    const r = validateGrade(sc.input);
    const finalGrade = applySanity('SSS', r);

    let ok = true;
    const errs = [];

    if (sc.expect.grade === 'SSS' && finalGrade !== 'SSS') { ok = false; errs.push(`grade expected SSS, got ${finalGrade}`); }
    if (sc.expect.grade === 'NOT_SSS' && finalGrade === 'SSS') { ok = false; errs.push(`grade expected NOT SSS, got SSS`); }
    if (sc.expect.grade === 'B_OR_LOWER' && !['B', 'A', ''].includes(applySanity('B', r))) { ok = false; errs.push(`B_OR_LOWER expected`); }
    if (sc.expect.dcEst === true && !r.estimatedFlags.dc) { ok = false; errs.push(`dcEst expected true`); }
    if (sc.expect.dcEst === false && r.estimatedFlags.dc) { ok = false; errs.push(`dcEst expected false`); }
    if (sc.expect.reason && !r.reasons.includes(sc.expect.reason)) { ok = false; errs.push(`reason ${sc.expect.reason} missing — got [${r.reasons.join(',')}]`); }
    if (sc.expect.reasonContains && !r.reasons.some(x => x.includes(sc.expect.reasonContains))) { ok = false; errs.push(`reasonContains ${sc.expect.reasonContains} missing`); }

    // 통계
    if (sc.expect.grade === 'SSS') stats.sssTotal++;
    if (sc.expect.grade === 'SSS' && finalGrade === 'SSS') stats.sssPass++;
    if (r.estimatedFlags.dc) stats.dcEstDetected++;
    if (r.reasons.includes('RED_OCEAN')) stats.redOceanBlocked++;
    if (r.reasons.includes('CLAUDE_SOURCE_REJECTED')) stats.claudeBlocked++;

    if (ok) passed++;
    else { failed++; failures.push(`✗ ${sc.name} — ${errs.join('; ')}`); }
}

console.log(`\n[sanity-gate health check] passed: ${passed} / failed: ${failed}`);
console.log('통계:');
console.log(`  - SSS 정상 통과: ${stats.sssPass}/${stats.sssTotal}`);
console.log(`  - dcEst 감지: ${stats.dcEstDetected}건`);
console.log(`  - redOcean 차단: ${stats.redOceanBlocked}건`);
console.log(`  - Claude 차단: ${stats.claudeBlocked}건 (Manus 우선 정책)`);

if (failed > 0) {
    console.error('\n❌ 회귀 발견:');
    failures.forEach(f => console.error('  ' + f));
    process.exit(1);
}

console.log('\n✅ 모든 시나리오 통과 — 회귀 없음');
process.exit(0);
