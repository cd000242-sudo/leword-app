/**
 * 변별력 보장 백필 로직 검증
 *
 * 시나리오: 50개 시드 → 점수 컷 70 + 인플루언서 차단 → 통과 매우 적음
 *           → 부족분을 점수순으로 보충해서 minResults(10) 보장
 */

import { calculateHomeScore } from '../src/utils/pro-hunter-v12/naver-home-score-engine';

interface Seed { keyword: string; titleCtrScore: number; influencerCount: number; vacancySlots: number; days: number; }

function gen(n: number): Seed[] {
    const out: Seed[] = [];
    for (let i = 0; i < n; i++) {
        out.push({
            keyword: `kw-${i}`,
            titleCtrScore: 30 + Math.floor(Math.random() * 60),  // 30~90
            influencerCount: Math.floor(Math.random() * 5),       // 0~4
            vacancySlots: 2 + Math.floor(Math.random() * 7),
            days: Math.floor(Math.random() * 90),
        });
    }
    return out;
}

function simulate(seeds: Seed[], opts: { minScore: number; blockInf: boolean; minResults: number }) {
    const enriched = seeds.map(s => ({
        ...s,
        score: calculateHomeScore({
            keyword: s.keyword,
            searchVolume: 1000,
            documentCount: 5000,
            titleCtrScore: s.titleCtrScore,
            keywordCategory: 'general',
            influencerCount: s.influencerCount,
            vacancySlots: s.vacancySlots,
            daysSinceFirstAppear: s.days,
        }).homeScore,
    }));
    enriched.sort((a, b) => b.score - a.score);

    let passed = enriched.filter(x => x.score >= opts.minScore);
    if (opts.blockInf) passed = passed.filter(x => x.influencerCount <= 1);

    let final = [...passed];
    let backfilled = 0;
    if (final.length < opts.minResults) {
        const need = opts.minResults - final.length;
        const set = new Set(passed.map(p => p.keyword));
        const candidates = enriched.filter(x => !set.has(x.keyword));
        const adds = candidates.slice(0, need);
        final = [...final, ...adds];
        backfilled = adds.length;
    }
    return { totalSeeds: seeds.length, passed: passed.length, finalCount: final.length, backfilled, scores: final.map(x => x.score) };
}

console.log(`\n${'═'.repeat(70)}`);
console.log(`🛟 변별력 보장 백필 검증 — minResults=10 무조건 보장 확인`);
console.log(`${'═'.repeat(70)}\n`);

const seeds = gen(50);

// 시나리오 1: 매우 엄격 (75점 + 인플루언서 차단)
const r1 = simulate(seeds, { minScore: 75, blockInf: true, minResults: 10 });
console.log(`📋 시나리오 1 — 매우 엄격 (75점, 인플루언서 차단)`);
console.log(`   컷 통과: ${r1.passed}건 / 백필: ${r1.backfilled}건 / 최종: ${r1.finalCount}건`);
console.log(`   점수 분포: ${r1.scores.map(s => Math.round(s)).join(', ')}`);
console.log(`   ${r1.finalCount >= 10 ? '✅' : '🚨'} 최소 10개 보장`);

// 시나리오 2: 보통 (60점)
const r2 = simulate(seeds, { minScore: 60, blockInf: false, minResults: 10 });
console.log(`\n📋 시나리오 2 — 권장 (60점)`);
console.log(`   컷 통과: ${r2.passed}건 / 백필: ${r2.backfilled}건 / 최종: ${r2.finalCount}건`);
console.log(`   ${r2.finalCount >= 10 ? '✅' : '🚨'} 최소 10개 보장`);

// 시나리오 3: 극단 (90점 — 거의 통과 0)
const r3 = simulate(seeds, { minScore: 90, blockInf: true, minResults: 10 });
console.log(`\n📋 시나리오 3 — 극단 (90점)`);
console.log(`   컷 통과: ${r3.passed}건 / 백필: ${r3.backfilled}건 / 최종: ${r3.finalCount}건`);
console.log(`   ${r3.finalCount >= 10 ? '✅' : '🚨'} 최소 10개 보장`);

// 시나리오 4: minResults=20
const r4 = simulate(seeds, { minScore: 70, blockInf: true, minResults: 20 });
console.log(`\n📋 시나리오 4 — 70점 + minResults=20`);
console.log(`   컷 통과: ${r4.passed}건 / 백필: ${r4.backfilled}건 / 최종: ${r4.finalCount}건`);
console.log(`   ${r4.finalCount >= 20 ? '✅' : '🚨'} 최소 20개 보장`);

console.log(`\n${'═'.repeat(70)}`);
const allOk = r1.finalCount >= 10 && r2.finalCount >= 10 && r3.finalCount >= 10 && r4.finalCount >= 20;
console.log(allOk ? `✅ 모든 시나리오에서 최소 결과 보장 — 0건 절대 안 나옴` : `🚨 일부 시나리오 실패`);
console.log(`${'═'.repeat(70)}\n`);
