/**
 * Multi-depth 마인드맵 확장 로직 검증
 *   갯수 → depth 자동 결정 + 단계별 누적 후보 수 시뮬레이션
 */

const scenarios = [
    { limit: 50, expectedDepth: 1, label: '50개 (1단계)' },
    { limit: 150, expectedDepth: 2, label: '150개 (2단계)' },
    { limit: 300, expectedDepth: 3, label: '300개 (3단계 꼬리에 꼬리)' },
    { limit: 400, expectedDepth: 4, label: '400개 (4단계 초롱테일)' },
    { limit: 500, expectedDepth: 5, label: '500개 (5단계 끝판왕)' },
];

console.log('='.repeat(95));
console.log('🌳 Multi-Depth 자동 결정 로직 검증');
console.log('='.repeat(95));
console.log(`${'갯수'.padEnd(10)} | ${'자동 depth'.padEnd(10)} | ${'expandPerSeed'.padEnd(15)} | ${'예상 후보 수'.padEnd(15)} | 비고`);
console.log('-'.repeat(95));

let allOk = true;
const seedsPerDepth = [0, 5, 8, 10, 12];
for (const s of scenarios) {
    const limit = Math.max(10, Math.min(500, s.limit));
    const targetDepth = limit <= 50 ? 1 : limit <= 150 ? 2 : limit <= 300 ? 3 : limit <= 400 ? 4 : 5;
    const expandPerSeed = limit <= 50 ? 50 : limit <= 150 ? 30 : limit <= 300 ? 25 : limit <= 400 ? 20 : 15;

    let totalCandidates = 1 + expandPerSeed; // 시드 + 1단계
    for (let d = 2; d <= targetDepth; d++) {
        const seeds = seedsPerDepth[d - 1] || 5;
        totalCandidates += seeds * expandPerSeed;
    }

    const ok = targetDepth === s.expectedDepth;
    if (!ok) allOk = false;
    const mark = ok ? '✅' : '❌';
    console.log(`${mark} ${String(s.limit).padStart(8)} | ${String(targetDepth).padStart(10)} | ${String(expandPerSeed).padStart(15)} | ${String(totalCandidates).padStart(15)} | ${s.label}`);
}

console.log('-'.repeat(95));
console.log(`${allOk ? '✅' : '❌'} depth 자동 결정 로직 검증 ${allOk ? '통과' : '실패'}`);
console.log('');
console.log('📌 한계 — depth 3 시 예상 측정 시간 (concurrency 3):');
console.log(`  - 후보 ~340개 × Naver SearchAd 조회 ≈ 90~120초`);
console.log(`  - + getNaverRelatedKeywords (8개 시드) × 자동완성+스마트블록 ≈ 60초`);
console.log(`  - 총 약 3분 예상`);
console.log('='.repeat(95));
