/**
 * sanity-gate.test.ts — v2.49.9 SSoT validator 의 회귀 방지 테스트.
 *
 * Phase A 합의안 + Phase B 발견 통합 검증:
 *   - sv*0.5 정확 매칭 (FALLBACK_HALF_SV_EXACT)
 *   - sv*0.5 인접 매칭 (FALLBACK_HALF_SV_NEAR, ±40%)
 *   - svEstimated SSS 차단
 *   - redOcean 차단
 *   - 단일 토큰 + dcEstimated 차단
 *   - 빅워드 차단
 *   - Manus 우선 (claude source 차단)
 *   - applySanity 강등 chain
 *
 * 실행: npm run test (또는 ts-node).
 * 단순 assert 기반 — jest 의존 X. CI 에서 exit code 로 판단.
 */

import { validateGrade, applySanity, sanitySummary } from '../sanity-gate';

let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(name: string, cond: boolean, detail?: string) {
    if (cond) {
        passed++;
        // console.log(`  ✓ ${name}`);
    } else {
        failed++;
        failures.push(`✗ ${name}${detail ? ' — ' + detail : ''}`);
    }
}

// ==================== Test 케이스 ====================

// 1. sv*0.5 정확 매칭 → dcEstimated 강제 마킹 → SSS 차단
{
    const r = validateGrade({
        keyword: '게이밍 노트북 추천',
        searchVolume: 1980,
        documentCount: 990,  // 정확히 sv*0.5
        goldenRatio: 2.0,
        score: 75,
        source: 'rich-feed',
    });
    assert('sv*0.5 정확 매칭 → dcEstimated true', r.estimatedFlags.dc === true);
    assert('sv*0.5 정확 매칭 → reason FALLBACK_HALF_SV_EXACT', r.reasons.includes('FALLBACK_HALF_SV_EXACT'));
    assert('sv*0.5 정확 매칭 → SS 까지만 (다른 차단 없으면)',
        applySanity('SSS', r) === 'SS' || applySanity('SSS', r) === 'S' || applySanity('SSS', r) === 'A',
        `applySanity = ${applySanity('SSS', r)}`);
}

// 2. sv*0.5 인접 매칭 (sv*0.4) — Phase B 발견
{
    const r = validateGrade({
        keyword: '강아지 사료 추천',
        searchVolume: 2500,
        documentCount: 1000,  // sv*0.4 → halfSvRatio = 1000/1250 = 0.8 → 0.4~0.6 범위 밖
        goldenRatio: 2.5,
        score: 75,
        source: 'rich-feed',
    });
    // 0.8 은 [0.4, 0.6] 안에 없으므로 NEAR 매칭 안 됨 — 정상
    assert('sv*0.4 (실측, halfSvRatio 0.8) → estimated false 유지', r.estimatedFlags.dc === false);
}

// 3. sv*0.5 인접 매칭 — 진짜 인접 케이스
{
    const r = validateGrade({
        keyword: '에어컨 추천',
        searchVolume: 1000,
        documentCount: 250,  // halfSvRatio = 250/500 = 0.5 → [0.4, 0.6] 안
        goldenRatio: 4.0,
        score: 75,
        source: 'rich-feed',
    });
    assert('sv*0.5 인접 (halfSvRatio 0.5) → estimated 강제 마킹', r.estimatedFlags.dc === true);
    assert('인접 매칭 → reason FALLBACK_HALF_SV_NEAR', r.reasons.includes('FALLBACK_HALF_SV_NEAR'));
}

// 4. svEstimated 단독 → SSS 차단
{
    const r = validateGrade({
        keyword: '맥북 프로 M3',
        searchVolume: 5000,
        documentCount: 200,
        goldenRatio: 25.0,
        score: 90,
        svEstimated: true,
        source: 'rich-feed',
    });
    assert('svEstimated → allowSss false', !r.allowSss);
    assert('svEstimated → reason SV_ESTIMATED', r.reasons.includes('SV_ESTIMATED'));
}

// 5. redOcean (ratio < 1)
{
    const r = validateGrade({
        keyword: '청소기',
        searchVolume: 1000,
        documentCount: 174147,
        goldenRatio: 0.0057,
        score: 60,
        source: 'rich-feed',
    });
    assert('redOcean → allowSss false', !r.allowSss);
    assert('redOcean → allowSs false', !r.allowSs);
    assert('redOcean → reason RED_OCEAN', r.reasons.includes('RED_OCEAN'));
}

// 6. 단일 토큰 + dcEstimated
{
    const r = validateGrade({
        keyword: '청소기',
        searchVolume: 1000,
        documentCount: 500,
        goldenRatio: 2.0,
        score: 75,
        dcEstimated: true,
        source: 'rich-feed',
    });
    assert('single token + dcEst → allowSss false', !r.allowSss);
    assert('single token + dcEst → reason SINGLE_TOKEN_ESTIMATED', r.reasons.includes('SINGLE_TOKEN_ESTIMATED'));
}

// 7. 빅워드 (sv 30K+ + tokens<=2)
{
    const r = validateGrade({
        keyword: '청소기 추천',
        searchVolume: 50000,
        documentCount: 5000,
        goldenRatio: 10.0,
        score: 80,
        source: 'rich-feed',
    });
    assert('big word → allowSss false', !r.allowSss);
    assert('big word → reason BIG_WORD', r.reasons.includes('BIG_WORD'));
}

// 8. 단일 토큰 + dc 5K+
{
    const r = validateGrade({
        keyword: '청소기',
        searchVolume: 5000,
        documentCount: 6000,
        goldenRatio: 0.83,
        score: 70,
        source: 'rich-feed',
    });
    assert('single token + high dc → allowSss false', !r.allowSss);
    assert('single token + high dc → reason SINGLE_TOKEN_HIGH_DC', r.reasons.includes('SINGLE_TOKEN_HIGH_DC'));
}

// 9. Claude source → SSS 차단 (Manus 우선 정책)
{
    const r = validateGrade({
        keyword: 'LG 그램 17 2024 게이밍',
        searchVolume: 1500,
        documentCount: 300,
        goldenRatio: 5.0,
        score: 85,
        source: 'claude',
    });
    assert('claude source → allowSss false', !r.allowSss);
    assert('claude source → reason CLAUDE_SOURCE_REJECTED', r.reasons.includes('CLAUDE_SOURCE_REJECTED'));
}

// 10. backup-no-api source → 모든 등급 차단
{
    const r = validateGrade({
        keyword: '강아지 사료 추천',
        searchVolume: 0,
        documentCount: 0,
        goldenRatio: 0,
        score: 0,
        source: 'backup-no-api',
    });
    assert('backup-no-api → allowSss false', !r.allowSss);
    assert('backup-no-api → allowSs false', !r.allowSs);
    assert('backup-no-api → allowS false', !r.allowS);
}

// 11. applySanity 강등 chain
{
    // SSS 가 차단되면 SS 로 강등
    const r1 = validateGrade({
        keyword: '맥북',
        searchVolume: 5000,
        documentCount: 2000,
        goldenRatio: 2.5,
        score: 70,
        dcEstimated: true,
        source: 'rich-feed',
    });
    // single token + dcEstimated → SSS 차단, SS/S 는 다른 차단 없으면 통과
    assert('SSS 차단 시 applySanity → SS 로 강등', applySanity('SSS', r1) === 'SS');

    // 정상 케이스 — 강등 없음
    const r2 = validateGrade({
        keyword: 'LG 그램 17 2024 가성비',
        searchVolume: 1500,
        documentCount: 300,
        goldenRatio: 5.0,
        score: 85,
        source: 'rich-feed',
    });
    assert('정상 케이스 applySanity → SSS 유지', applySanity('SSS', r2) === 'SSS');
}

// 12. sanitySummary 출력 검증
{
    const r = validateGrade({
        keyword: 'test',
        searchVolume: 1000,
        documentCount: 500,
        goldenRatio: 2.0,
        score: 70,
        source: 'rich-feed',
    });
    const summary = sanitySummary(r);
    assert('sanitySummary 출력 비어있지 않음', summary.length > 0);
}

// ==================== 결과 출력 ====================
console.log(`\n[sanity-gate.test] passed: ${passed} / failed: ${failed}`);
if (failed > 0) {
    failures.forEach(f => console.error('  ' + f));
    process.exit(1);
}
process.exit(0);
