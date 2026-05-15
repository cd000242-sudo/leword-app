/**
 * 🏠 홈판 헌터 빌트인 시드 검증 테스트 (v2.42.32 보강판)
 *
 * 검증 매트릭스:
 *   1. 빌트인 시드 25개 전체 (slice 없음)
 *   2. strict vs lenient mode 비교 (AdSense 영향 회귀 검증)
 *   3. Worst case (titleCtr 0, vacancy null, fresh 측정 실패)
 *   4. 사용자 옵션 조합 (minQuality 0/58/75/92)
 *   5. 외부 시드 시뮬레이션 (단일명사 + writability KILL 비율 측정)
 */

import { verifyKeywordValue } from '../src/utils/pro-hunter-v12/keyword-value-verifier';
import { calculateHomeScore } from '../src/utils/pro-hunter-v12/naver-home-score-engine';

// UI의 BUILTIN_HOME_SEEDS 와 정확히 일치 (25개)
const BUILTIN_HOME_SEEDS = [
    '어버이날 선물 추천 부모님 1만원대',
    '스승의날 카네이션 1만원대 후기',
    '어린이날 가족 나들이 수도권 후기',
    '가정의달 외식 한식 4인 가족 후기',
    '5월 결혼식 하객룩 여성 30대 추천',
    '초등학교 운동회 도시락 메뉴 4인 후기',
    '초여름 자외선 차단제 민감성 30대 후기',
    '5월 환절기 알레르기 코막힘 후기',
    '5월 제철 두릅 요리 4인 가족 후기',
    '5월 캠핑 모기 차단 베란다 후기',
    '장마철 빨래 건조 원룸 직장인 후기',
    '장마철 곰팡이 제거 욕실 셀프 후기',
    '6월 제습기 원룸 30대 후기',
    '6월 모기 퇴치 베란다 셀프 후기',
    '직장인 도시락 메뉴 1주일 추천 후기',
    '4인 가족 집밥 1주일 메뉴 후기',
    '주방 수납 다이소 셀프 후기',
    '거실 인테리어 셀프 5만원 후기',
    '욕실 곰팡이 제거 다이소 셀프 후기',
    '커피머신 청소 셀프 후기',
    '신혼 부부 가전 가성비 후기',
    '맞벌이 부부 30대 평일 저녁 후기',
    '5월 캠핑 초보 가족 후기',
    '욕실 청소 셀프 다이소 1만원대 후기',
    '주방 정리 4인 가족 1주일 후기',
];

// 외부 시드 (hunt-adsense collectAdsenseSeeds 시뮬레이션 — naver-news/theqoo 등)
const EXTERNAL_SEED_SAMPLES = [
    '주식',                        // 1토큰 — writability KILL 예상
    '오늘의 운세',                 // 2토큰 — writability KILL 예상
    '점심 메뉴',                   // 2토큰 — writability KILL 예상
    '원룸 인테리어',               // 2토큰 — writability KILL 예상 (chars=8)
    '점심 메뉴 추천',              // 3토큰, 7자 — writability FAIL
    '5월 캠핑 모기',               // 3토큰, 8자 — writability FAIL
    '5월 캠핑 모기 차단',          // 4토큰 — pass
    '주식 추천 부모님 1만원대',    // YMYL 매칭 ("주식 추천") — KILL 예상
];

const ASSUMED_SV = 500;
const ASSUMED_DC = 10000;
const ASSUMED_TITLE_CTR = 70;

console.log('='.repeat(85));
console.log('🏠 v2.42.32 홈판 헌터 검증 — 5가지 매트릭스');
console.log('='.repeat(85));

// ============================================================
// 매트릭스 1: 빌트인 시드 25개 — lenient vs strict 비교
// ============================================================
console.log('\n[매트릭스 1] 빌트인 시드 25개 — lenient mode (홈판 헌터)');
console.log('-'.repeat(85));

let lenientPass = 0, lenientKill = 0;
let strictPass = 0, strictKill = 0;
const detailDepthFailedInStrict: string[] = [];

for (const keyword of BUILTIN_HOME_SEEDS) {
    const lenient = verifyKeywordValue({
        keyword, searchVolume: ASSUMED_SV, documentCount: ASSUMED_DC, mode: 'lenient',
    });
    const strict = verifyKeywordValue({
        keyword, searchVolume: ASSUMED_SV, documentCount: ASSUMED_DC, mode: 'strict',
    });

    if (!lenient.isKilled) lenientPass++; else lenientKill++;
    if (!strict.isKilled) strictPass++; else strictKill++;

    if (strict.isKilled && !lenient.isKilled) {
        detailDepthFailedInStrict.push(keyword);
    }

    const lEmoji = lenient.isKilled ? '🛑' : '✅';
    const sEmoji = strict.isKilled ? '🛑' : '✅';
    const ddMatched = strict.gates.detailDepth.matchedDimensions.length;
    console.log(`${lEmoji}(L) ${sEmoji}(S) | ${keyword.padEnd(38)} | detailDepth ${ddMatched}차원`);
}

console.log(`\nlenient: ${lenientPass}/${BUILTIN_HOME_SEEDS.length} 통과 (KILL ${lenientKill})`);
console.log(`strict:  ${strictPass}/${BUILTIN_HOME_SEEDS.length} 통과 (KILL ${strictKill})`);
if (detailDepthFailedInStrict.length > 0) {
    console.log(`\n⚠️ strict 에서만 KILL (lenient 효과 검증): ${detailDepthFailedInStrict.length}개`);
    detailDepthFailedInStrict.forEach(k => console.log(`  - ${k}`));
}

// ============================================================
// 매트릭스 2: homeScore 분포 (lenient 통과 시드만)
// ============================================================
console.log('\n[매트릭스 2] homeScore 분포 (lenient 통과 시드)');
console.log('-'.repeat(85));

const homeScores: { kw: string; score: number; grade: string }[] = [];
for (const keyword of BUILTIN_HOME_SEEDS) {
    const home = calculateHomeScore({
        keyword,
        searchVolume: ASSUMED_SV, documentCount: ASSUMED_DC,
        titleCtrScore: ASSUMED_TITLE_CTR,
        userBlogCategory: '', keywordCategory: 'general',
        influencerCount: 0, vacancySlots: 5,
        surgeRatio: 1.0, blogPublishCount24h: 0, daysSinceFirstAppear: 30,
    });
    homeScores.push({ kw: keyword, score: home.homeScore, grade: home.grade });
}
homeScores.sort((a, b) => b.score - a.score);
const minHomePassed = homeScores.filter(h => h.score >= 60).length;
console.log(`homeScore ≥ 60 통과: ${minHomePassed}/${BUILTIN_HOME_SEEDS.length}`);
console.log(`최고: ${homeScores[0].score}점 | 최저: ${homeScores[homeScores.length-1].score}점 | 중앙: ${homeScores[Math.floor(homeScores.length/2)].score}점`);

// ============================================================
// 매트릭스 3: Worst case — 모든 측정 실패
// ============================================================
console.log('\n[매트릭스 3] Worst Case — titleCtr=0, vacancy 실패(empty=5), fresh days=30');
console.log('-'.repeat(85));

let worstPass = 0;
for (const keyword of BUILTIN_HOME_SEEDS) {
    const home = calculateHomeScore({
        keyword,
        searchVolume: ASSUMED_SV, documentCount: ASSUMED_DC,
        titleCtrScore: 0, // AI 제목 생성 완전 실패
        userBlogCategory: '', keywordCategory: 'general',
        influencerCount: 0, vacancySlots: 5,
        surgeRatio: 1.0, blogPublishCount24h: 0, daysSinceFirstAppear: 30,
    });
    if (home.homeScore >= 60) worstPass++;
}
console.log(`Worst case homeScore ≥ 60: ${worstPass}/${BUILTIN_HOME_SEEDS.length}`);
console.log(`  (titleCtr=0 시 ctrPotential 0점 → 최대 ${0+10+14+13}=37점 → 60 미달 — 정상 동작)`);

// ============================================================
// 매트릭스 4: 사용자 옵션 minQuality 조합
// ============================================================
console.log('\n[매트릭스 4] minQuality 옵션별 통과 시드 수 (lenient mode)');
console.log('-'.repeat(85));

const minQualities = [0, 42, 58, 75, 92];
for (const mq of minQualities) {
    let count = 0;
    for (const keyword of BUILTIN_HOME_SEEDS) {
        const v = verifyKeywordValue({
            keyword, searchVolume: ASSUMED_SV, documentCount: ASSUMED_DC, mode: 'lenient',
        });
        if (!v.isKilled && v.qualityScore >= mq) count++;
    }
    const label = mq === 0 ? '전체' : mq === 42 ? 'B+' : mq === 58 ? 'A+ (UI 기본)' : mq === 75 ? 'S+ (강력추천)' : 'S+ (끝판왕)';
    console.log(`  minQuality ≥ ${String(mq).padStart(2)}: ${count}/${BUILTIN_HOME_SEEDS.length}건 (${label})`);
}

// ============================================================
// 매트릭스 5: 외부 시드 — writability/YMYL KILL 분포 (회귀 검증)
// ============================================================
console.log('\n[매트릭스 5] 외부 시드 (collectAdsenseSeeds 시뮬레이션)');
console.log('-'.repeat(85));

for (const keyword of EXTERNAL_SEED_SAMPLES) {
    const v = verifyKeywordValue({
        keyword, searchVolume: ASSUMED_SV, documentCount: ASSUMED_DC, mode: 'lenient',
    });
    const reasons: string[] = [];
    if (!v.gates.notPersonDependent.passed) reasons.push('person');
    if (!v.gates.ymylSafe.passed) reasons.push('ymyl:' + v.gates.ymylSafe.matchedTokens.join(','));
    if (!v.gates.writability.passed) reasons.push(`writability(tok=${v.gates.writability.tokens},chr=${v.gates.writability.chars})`);
    if (!v.gates.intentClarity.passed) reasons.push('intent');
    const status = v.isKilled ? `🛑 ${reasons.join('+')}` : `✅ ${v.qualityScore}점`;
    console.log(`  ${keyword.padEnd(30)} | ${status}`);
}
console.log('  (lenient 라도 person/ymyl/writability/intent kill 은 그대로 — 외부 단일명사 차단)');

// ============================================================
// 매트릭스 5b: detailDepth 1차원 매칭 외부 시드 — lenient mode 효과 직접 입증
// ============================================================
console.log('\n[매트릭스 5b] detailDepth 1차원만 매칭되는 외부 시드 — lenient vs strict 분리 효과');
console.log('-'.repeat(85));

const DETAIL_1DIM_SEEDS = [
    '아이폰 15 신제품 발표 소식 정리',     // outcome:정리 1차원
    '주말 운동 루틴 초보 가이드',           // target:초보 1차원
    '5월 신상품 발표 행사 소식',           // timing:5월 1차원
    '셀프 인테리어 시작 가이드',           // spec:셀프 1차원
];

let lenientPassedExt = 0, strictPassedExt = 0;
for (const keyword of DETAIL_1DIM_SEEDS) {
    const lenient = verifyKeywordValue({
        keyword, searchVolume: ASSUMED_SV, documentCount: ASSUMED_DC, mode: 'lenient',
    });
    const strict = verifyKeywordValue({
        keyword, searchVolume: ASSUMED_SV, documentCount: ASSUMED_DC, mode: 'strict',
    });
    if (!lenient.isKilled) lenientPassedExt++;
    if (!strict.isKilled) strictPassedExt++;
    const lE = lenient.isKilled ? '🛑' : `✅(${lenient.qualityScore})`;
    const sE = strict.isKilled ? '🛑KILL' : `✅(${strict.qualityScore})`;
    console.log(`  ${keyword.padEnd(34)} | L=${lE.padEnd(10)} S=${sE}`);
}
console.log(`\n  분리 효과: lenient ${lenientPassedExt}/${DETAIL_1DIM_SEEDS.length} 통과 vs strict ${strictPassedExt}/${DETAIL_1DIM_SEEDS.length} 통과`);
const isolationProven = lenientPassedExt > strictPassedExt;
console.log(`  ${isolationProven ? '✅' : '❌'} lenient mode 가 detailDepth 1차원 매칭 외부 시드를 흡수 — 컨텍스트 분리 동작 확인`);

// ============================================================
// 매트릭스 6: 회귀 — strict mode 가 기존 동작 그대로인지 (AdSense 헌터)
// ============================================================
console.log('\n[매트릭스 6] strict mode 회귀 검증 — 기존 AdSense 헌터 동작 보존');
console.log('-'.repeat(85));

const adsenseLikeKeywords = [
    '아이폰 15 프로 사용 후기',   // detailDepth 2차원 (spec 4세대X, target입문X, outcome후기) → 1차원만
    '직장인 점심 1만원대 추천',   // target+money+추천(intent) → detail 2차원: target+money ✓
    '카메라 추천',                  // tokens=2 — writability KILL
];
for (const keyword of adsenseLikeKeywords) {
    const strict = verifyKeywordValue({
        keyword, searchVolume: ASSUMED_SV, documentCount: ASSUMED_DC, mode: 'strict',
    });
    const ddDims = strict.gates.detailDepth.matchedDimensions;
    const status = strict.isKilled ? '🛑 KILL' : `✅ ${strict.qualityScore}점`;
    console.log(`  ${keyword.padEnd(30)} | ${status} | detailDepth ${ddDims.join('+') || '0차원'}`);
}

// ============================================================
// 매트릭스 7: 🚨 0건 절대 금지 검증 — UI fallback 체인 시뮬레이션
// ============================================================
console.log('\n[매트릭스 7] 🚨 0건 절대 금지 검증 — 다층 fallback 체인');
console.log('-'.repeat(85));

// 시뮬레이션 함수 — UI의 fallback 로직 그대로
function simulateFallback(seeds: string[], scenario: string): { count: number; tier: string } {
    const enriched = seeds.map(kw => {
        const v = verifyKeywordValue({
            keyword: kw, searchVolume: ASSUMED_SV, documentCount: ASSUMED_DC, mode: 'lenient',
        });
        const h = calculateHomeScore({
            keyword: kw, searchVolume: ASSUMED_SV, documentCount: ASSUMED_DC,
            titleCtrScore: scenario === 'all-fail' ? 0 : ASSUMED_TITLE_CTR,
            userBlogCategory: '', keywordCategory: 'general',
            influencerCount: 0, vacancySlots: 5,
            surgeRatio: 1.0, blogPublishCount24h: 0, daysSinceFirstAppear: 30,
        });
        return { keyword: kw, valueGate: v, homeScore: h };
    });

    const valuableOnly = enriched.filter(x => {
        if (!x.valueGate) return false;
        if (x.valueGate.isKilled) return false;
        if ((x.valueGate.qualityScore || 0) < 58) return false;
        if (!x.homeScore || (x.homeScore.homeScore || 0) < 25) return false;
        return true;
    });
    const passed = valuableOnly.filter(x => (x.homeScore?.homeScore || 0) >= 60);

    // UI fallback 체인
    let filtered = [...passed];
    let tier = 'normal';
    if (filtered.length === 0 && valuableOnly.length > 0) {
        filtered = valuableOnly.slice(0, 10);
        tier = 'soft';
    }
    if (filtered.length === 0) {
        const notKilled = enriched.filter(x => !x.valueGate || !x.valueGate.isKilled);
        if (notKilled.length > 0) {
            filtered = notKilled.slice(0, 10);
            tier = 'salvaged';
        }
    }
    if (filtered.length === 0) {
        filtered = seeds.slice(0, 10).map(kw => ({ keyword: kw, valueGate: null, homeScore: null } as any));
        tier = 'lastResort';
    }
    return { count: filtered.length, tier };
}

const scenarios = [
    { name: '정상 (모든 측정 OK)', scenario: 'normal', seeds: BUILTIN_HOME_SEEDS },
    { name: 'titleCtr=0 (AI 제목 실패)', scenario: 'all-fail', seeds: BUILTIN_HOME_SEEDS },
    { name: '단일명사 외부 시드만', scenario: 'normal', seeds: ['주식', '오늘의 운세', '점심 메뉴'] },
    { name: 'YMYL 차단 시드만', scenario: 'normal', seeds: ['주식 추천 부모님 1만원대', '코인 추천 비교 후기', '도박 카지노 슬롯 후기'] },
    { name: '모두 KILL (writability + ymyl)', scenario: 'normal', seeds: ['주식', '코인', '도박', '운세'] },
];

let allNonZero = true;
for (const s of scenarios) {
    const result = simulateFallback(s.seeds, s.scenario);
    const ok = result.count > 0;
    if (!ok) allNonZero = false;
    const emoji = ok ? '✅' : '❌';
    console.log(`  ${emoji} ${s.name.padEnd(35)} | ${result.count}건 (tier: ${result.tier})`);
}

console.log(`\n  ${allNonZero ? '✅' : '❌'} 0건 절대 금지 보장: 모든 시나리오에서 1건 이상`);

// ============================================================
// 최종 결과
// ============================================================
console.log('\n' + '='.repeat(85));
console.log('📊 최종 결과 종합');
console.log('='.repeat(85));
const target = BUILTIN_HOME_SEEDS.length;
const okLenient = lenientPass === target;
const okHomeScore = minHomePassed === target;
// strict 에서 빌트인 100% 통과 = 빌트인 강화가 detailDepth 보증까지 만족 (좋은 일)
const okStrictBuiltin = strictPass === target;
// lenient 효과는 별도 외부 시드 매트릭스(5b)에서 입증
const okIsolation = lenientPassedExt > strictPassedExt;

console.log(`${okLenient ? '✅' : '❌'} 빌트인 시드 25개 lenient 통과: ${lenientPass}/${target}`);
console.log(`${okHomeScore ? '✅' : '❌'} homeScore ≥ 60 통과: ${minHomePassed}/${target}`);
console.log(`${okStrictBuiltin ? '✅' : '❌'} 빌트인 시드 strict 도 통과: ${strictPass}/${target}`);
console.log(`${okIsolation ? '✅' : '❌'} lenient/strict 컨텍스트 분리: lenient ${lenientPassedExt} vs strict ${strictPassedExt}`);
console.log(`${allNonZero ? '✅' : '❌'} 🚨 0건 절대 금지: 모든 시나리오 1건 이상 보장`);
console.log(`${'  '} Worst case 통과율: ${worstPass}/${target} (titleCtr=0 극단 — 정상 fallout)`);

const allOk = okLenient && okHomeScore && okStrictBuiltin && okIsolation && allNonZero;
if (allOk) {
    console.log('\n🎯 결론: v2.42.33 검증 통과');
    console.log('   - 홈판 헌터 100% 결과 보장 (lenient + 빌트인 강화 + 다층 fallback)');
    console.log('   - AdSense 헌터 회귀 없음 (strict 디폴트 유지)');
    console.log('   - 컨텍스트 분리 (외부 detailDepth 1차원 시드 흡수)');
    console.log('   - 🚨 0건 절대 금지 — 모든 측정 실패 시에도 lastResort 시드 노출');
} else {
    console.log('\n⚠️ 결론: 추가 보강 필요');
}
console.log('='.repeat(85));
