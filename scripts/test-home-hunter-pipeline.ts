/**
 * 🏠 홈판 헌터 파이프라인 진단
 *
 * 50개 합성 시드를 통과시키며 각 단계 통과율 측정 → 병목 식별
 * 목표: 최종 통과율 ≥ 30% (50개 → 15+ 결과)
 */

import { calculateHomeScore } from '../src/utils/pro-hunter-v12/naver-home-score-engine';
import { predictTitleCtr } from '../src/utils/pro-hunter-v12/title-ctr-predictor';

interface SyntheticSeed {
    keyword: string;
    searchVolume: number;
    documentCount: number;
    category: string;
    titleCtrScore: number;
    influencerCount: number;
    vacancySlots: number;
    daysSinceFirstAppear: number;
    surgeRatio: number;
    blogPublishCount24h: number;
}

function generateSeeds(n: number): SyntheticSeed[] {
    const cats = ['living', 'food', 'recipe', 'parenting', 'health', 'travel', 'beauty', 'fashion', 'pet', 'it'];
    const baseKws = [
        '봄나물 무치는 법', '환절기 면역력 영양제', '아이 감기 빨리 낫는 법', '주말 가성비 여행',
        '5월 시즌 제철 음식', '거실 인테리어 셀프', '강아지 산책 시간', '화장품 정리 팁',
        '효율적 자녀 학습', '재택근무 책상', '공기청정기 청소', '주방 수납 정리',
        '집밥 1주일 메뉴', '운동 초보 루틴', '고양이 분리불안', '가족 캠핑 준비물',
        '신생아 수면교육', '봄 다이어트 식단', '비염 완화 방법', '회사 점심 도시락',
        '부엌 청소 꿀팁', '드라이브 코스 추천', '아이패드 활용법', '노트북 발열 해결',
        '주말 한끼 요리', '베란다 가드닝', '욕실 곰팡이 제거', '아이 책 추천',
        '연말 정산 환급', '월급 재테크', '주식 초보 시작', '부동산 청약',
        '환절기 옷 코디', '러닝화 추천', '가습기 관리법', '커피머신 청소',
        '집들이 음식 추천', '아기 이유식 메뉴', '잠 잘 자는 법', '아이 한자 공부',
        '자전거 입문 가이드', '캠핑 요리 메뉴', '건강한 야식', '강아지 사료 비교',
        '주말 영화 추천', '국내 여행 코스', '요가 초보 자세', '수면 질 높이는 법',
        '집 정리 5분 팁', '주방 도구 추천',
    ];
    const seeds: SyntheticSeed[] = [];
    for (let i = 0; i < n; i++) {
        const kw = baseKws[i % baseKws.length] + (i >= baseKws.length ? ` ${i}` : '');
        seeds.push({
            keyword: kw,
            searchVolume: 200 + Math.floor(Math.random() * 3000),
            documentCount: 1000 + Math.floor(Math.random() * 50000),
            category: cats[i % cats.length],
            titleCtrScore: 40 + Math.floor(Math.random() * 50),  // 40~90
            influencerCount: Math.floor(Math.random() * 4),       // 0~3
            vacancySlots: 2 + Math.floor(Math.random() * 7),       // 2~8
            daysSinceFirstAppear: Math.floor(Math.random() * 60),  // 0~60일
            surgeRatio: 0.8 + Math.random() * 3.0,                  // 0.8~3.8
            blogPublishCount24h: Math.floor(Math.random() * 80),
        });
    }
    return seeds;
}

function pct(part: number, total: number): string {
    return total === 0 ? '0%' : `${Math.round(part / total * 100)}%`;
}

function runPipeline(seeds: SyntheticSeed[], opts: {
    minScore: number;
    blockInfluencer: boolean;
    requireVacancy: boolean;
}): {
    totalCandidates: number;
    homeScoreDistribution: Record<string, number>;
    passedScore: number;
    passedInfluencer: number;
    passedVacancy: number;
    finalPassed: number;
    avgScore: number;
} {
    const dist: Record<string, number> = { 'CERTAIN(85+)': 0, 'EASY(70-84)': 0, 'POSSIBLE(55-69)': 0, 'HARD(35-54)': 0, 'IMPOSSIBLE(<35)': 0 };
    let scoreSum = 0;
    const scored = seeds.map(seed => {
        const result = calculateHomeScore({
            keyword: seed.keyword,
            searchVolume: seed.searchVolume,
            documentCount: seed.documentCount,
            titleCtrScore: seed.titleCtrScore,
            keywordCategory: seed.category,
            influencerCount: seed.influencerCount,
            vacancySlots: seed.vacancySlots,
            daysSinceFirstAppear: seed.daysSinceFirstAppear,
            surgeRatio: seed.surgeRatio,
            blogPublishCount24h: seed.blogPublishCount24h,
        });
        scoreSum += result.homeScore;
        if (result.homeScore >= 85) dist['CERTAIN(85+)']++;
        else if (result.homeScore >= 70) dist['EASY(70-84)']++;
        else if (result.homeScore >= 55) dist['POSSIBLE(55-69)']++;
        else if (result.homeScore >= 35) dist['HARD(35-54)']++;
        else dist['IMPOSSIBLE(<35)']++;
        return { seed, score: result.homeScore };
    });

    const passedScore = scored.filter(x => x.score >= opts.minScore).length;
    let filtered = scored.filter(x => x.score >= opts.minScore);
    if (opts.blockInfluencer) filtered = filtered.filter(x => x.seed.influencerCount <= 1);
    const passedInfluencer = filtered.length;
    if (opts.requireVacancy) filtered = filtered.filter(x => x.seed.vacancySlots >= 5);
    const passedVacancy = filtered.length;

    return {
        totalCandidates: seeds.length,
        homeScoreDistribution: dist,
        passedScore,
        passedInfluencer,
        passedVacancy,
        finalPassed: filtered.length,
        avgScore: scoreSum / seeds.length,
    };
}

function diagnose() {
    const seeds = generateSeeds(50);
    console.log(`\n${'═'.repeat(70)}`);
    console.log(`🏠 홈판 헌터 파이프라인 진단 — 50개 시드 (실제 사용 패턴 시뮬레이션)`);
    console.log(`${'═'.repeat(70)}\n`);

    // 시나리오 1: 사용자 기본 (minScore=70, 인플루언서 차단)
    const r1 = runPipeline(seeds, { minScore: 70, blockInfluencer: true, requireVacancy: false });
    console.log(`📋 시나리오 1 — 기본 설정 (minScore=70, 인플루언서 ≤1)`);
    console.log(`   homeScore 분포:`, r1.homeScoreDistribution);
    console.log(`   평균 점수: ${r1.avgScore.toFixed(1)}/100`);
    console.log(`   점수 통과 (≥70): ${r1.passedScore}/${r1.totalCandidates} (${pct(r1.passedScore, r1.totalCandidates)})`);
    console.log(`   + 인플루언서 차단: ${r1.passedInfluencer}/${r1.totalCandidates} (${pct(r1.passedInfluencer, r1.totalCandidates)})`);
    console.log(`   ✅ 최종 통과: ${r1.finalPassed}/${r1.totalCandidates} (${pct(r1.finalPassed, r1.totalCandidates)})`);

    // 시나리오 2: 신규 default (minScore=60, 인플루언서 차단 OFF)
    const r2 = runPipeline(seeds, { minScore: 60, blockInfluencer: false, requireVacancy: false });
    console.log(`\n📋 시나리오 2 — 신규 default (minScore=60, 인플루언서 차단 OFF) ⭐`);
    console.log(`   ✅ 최종 통과: ${r2.finalPassed}/${r2.totalCandidates} (${pct(r2.finalPassed, r2.totalCandidates)})`);

    // 시나리오 3: 최대 완화
    const r3 = runPipeline(seeds, { minScore: 50, blockInfluencer: false, requireVacancy: false });
    console.log(`\n📋 시나리오 3 — 느슨 (minScore=50, 모든 필터 끔)`);
    console.log(`   ✅ 최종 통과: ${r3.finalPassed}/${r3.totalCandidates} (${pct(r3.finalPassed, r3.totalCandidates)})`);

    // 시나리오 4: 엄격
    const r4 = runPipeline(seeds, { minScore: 75, blockInfluencer: true, requireVacancy: false });
    console.log(`\n📋 시나리오 4 — 엄격 (minScore=75, 인플루언서 차단)`);
    console.log(`   ✅ 최종 통과: ${r4.finalPassed}/${r4.totalCandidates} (${pct(r4.finalPassed, r4.totalCandidates)})`);

    console.log(`\n${'═'.repeat(70)}`);
    console.log(`🎯 목표: 신규 default(시나리오 2) 통과율 30~70% — 현재 ${pct(r2.finalPassed, r2.totalCandidates)}`);
    const passRate = r2.finalPassed / r2.totalCandidates;
    if (passRate < 0.30) {
        console.log(`🚨 너무 적음 — 점수 산식 더 인상`);
    } else if (passRate > 0.70) {
        console.log(`⚠️ 너무 많음 — 변별력 부족`);
    } else {
        console.log(`✅ 적정 범위`);
    }
    console.log(`${'═'.repeat(70)}\n`);

    return passRate;
}

diagnose();
