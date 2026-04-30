/**
 * 가치 검증 분포 측정 — 다양한 키워드 100개에 대한 6 게이트 통과 분포
 *
 * 목적:
 *   1. 빌트인 시드 50개가 정말 가치 있는지 (6/6 통과 비율)
 *   2. 일반 검색 키워드 분포 (현실)
 *   3. 셀럽/YMYL 위험 키워드가 제대로 차단되는지
 */

import { verifyKeywordValue, VERIFIED_BUILTIN_HOME_SEEDS, filterValuableKeywords } from '../src/utils/pro-hunter-v12/keyword-value-verifier';

interface TestKw { keyword: string; searchVolume: number; documentCount: number; expectedGood: boolean; }

// 그룹 1: 빌트인 시드 (모두 통과해야 함)
const builtinSeeds: TestKw[] = VERIFIED_BUILTIN_HOME_SEEDS.map(kw => ({
    keyword: kw,
    searchVolume: 200,
    documentCount: 5000,
    expectedGood: true,
}));

// 그룹 2: 위험/저가치 키워드 (차단되어야 함)
const dangerousKws: TestKw[] = [
    { keyword: '아이유', searchVolume: 100000, documentCount: 1000000, expectedGood: false },
    { keyword: '뉴진스 컴백', searchVolume: 50000, documentCount: 500000, expectedGood: false },
    { keyword: '이재명 발언', searchVolume: 30000, documentCount: 300000, expectedGood: false },
    { keyword: '주식 추천 종목', searchVolume: 5000, documentCount: 100000, expectedGood: false },
    { keyword: '코인 투자', searchVolume: 3000, documentCount: 80000, expectedGood: false },
    { keyword: '지방흡입', searchVolume: 2000, documentCount: 50000, expectedGood: false },
    { keyword: '대출 권유', searchVolume: 1500, documentCount: 40000, expectedGood: false },
    { keyword: '핸드폰', searchVolume: 50000, documentCount: 5000000, expectedGood: false },  // 단일명사 + 경쟁극심
    { keyword: '집', searchVolume: 100000, documentCount: 10000000, expectedGood: false },  // 단일명사
    { keyword: 'BTS 콘서트', searchVolume: 80000, documentCount: 2000000, expectedGood: false },  // 셀럽
];

// 그룹 3: 일반 검색 키워드 (혼재 — 좋은 것/평범한 것/안 좋은 것)
const realKws: TestKw[] = [
    { keyword: '주말 가성비 여행 코스', searchVolume: 350, documentCount: 4000, expectedGood: true },
    { keyword: '봄 환절기 영양제 추천', searchVolume: 800, documentCount: 12000, expectedGood: true },
    { keyword: '재택근무 체어 추천 가성비', searchVolume: 250, documentCount: 3500, expectedGood: true },
    { keyword: '아이폰 배터리 절약 꿀팁', searchVolume: 1200, documentCount: 15000, expectedGood: true },
    { keyword: '제주도 여행 3박4일 코스', searchVolume: 2500, documentCount: 30000, expectedGood: true },
    { keyword: '카페 창업 비용 정리', searchVolume: 500, documentCount: 8000, expectedGood: true },
    { keyword: '아기 이유식 시작 시기', searchVolume: 1500, documentCount: 18000, expectedGood: true },
    { keyword: '신혼 가전 추천 리스트', searchVolume: 600, documentCount: 10000, expectedGood: true },
    { keyword: '집밥 도시락 메뉴 정리', searchVolume: 400, documentCount: 6000, expectedGood: true },
    { keyword: '디퓨저', searchVolume: 5000, documentCount: 80000, expectedGood: false },  // 단일명사
    { keyword: '운동', searchVolume: 200000, documentCount: 50000000, expectedGood: false },  // 단일명사
    { keyword: 'AI', searchVolume: 50000, documentCount: 5000000, expectedGood: false },  // 단일명사
    { keyword: '오늘의 운세', searchVolume: 30000, documentCount: 200000, expectedGood: false },  // 글감 부족
    { keyword: '환절기 비염 코막힘 해결 방법', searchVolume: 800, documentCount: 9000, expectedGood: true },
    { keyword: '주방 수납 다이소 활용 꿀팁', searchVolume: 450, documentCount: 5500, expectedGood: true },
    { keyword: '강아지 산책 시간 적절', searchVolume: 200, documentCount: 2800, expectedGood: true },
    { keyword: '연말정산 신용카드 공제 한도', searchVolume: 1500, documentCount: 25000, expectedGood: true },
    { keyword: '봄 환절기 알레르기 음식', searchVolume: 600, documentCount: 7000, expectedGood: true },
    { keyword: '재택근무 효율 높이는 방법', searchVolume: 400, documentCount: 5000, expectedGood: true },
    { keyword: '집들이 선물 1만원대 추천', searchVolume: 350, documentCount: 4500, expectedGood: true },
];

const allTests: TestKw[] = [...builtinSeeds, ...dangerousKws, ...realKws];

console.log(`\n${'═'.repeat(80)}`);
console.log(`🎯 키워드 가치 검증 분포 — ${allTests.length}건`);
console.log(`${'═'.repeat(80)}\n`);

// 분포 계산
const dist = { 'S+(6/6)': 0, 'S(5/6)': 0, 'A(4/6)': 0, 'B(3/6)': 0, 'C(≤2)': 0 };
const gateFailures = {
    searchVolume: 0,
    competitionRatio: 0,
    writability: 0,
    notPersonDependent: 0,
    ymylSafe: 0,
    intentClarity: 0,
};

let truePos = 0;  // 좋은 키워드 → 통과
let falseNeg = 0; // 좋은 키워드 → 차단 (놓침)
let trueNeg = 0;  // 위험 키워드 → 차단
let falsePos = 0; // 위험 키워드 → 통과 (사고)

for (const t of allTests) {
    const result = verifyKeywordValue(t);

    // 분포
    if (result.passedCount === 6) dist['S+(6/6)']++;
    else if (result.passedCount === 5) dist['S(5/6)']++;
    else if (result.passedCount === 4) dist['A(4/6)']++;
    else if (result.passedCount === 3) dist['B(3/6)']++;
    else dist['C(≤2)']++;

    // 게이트 실패 카운트
    if (!result.gates.searchVolume.passed) gateFailures.searchVolume++;
    if (!result.gates.competitionRatio.passed) gateFailures.competitionRatio++;
    if (!result.gates.writability.passed) gateFailures.writability++;
    if (!result.gates.notPersonDependent.passed) gateFailures.notPersonDependent++;
    if (!result.gates.ymylSafe.passed) gateFailures.ymylSafe++;
    if (!result.gates.intentClarity.passed) gateFailures.intentClarity++;

    // 정확도
    if (t.expectedGood && result.valuable) truePos++;
    else if (t.expectedGood && !result.valuable) falseNeg++;
    else if (!t.expectedGood && !result.valuable) trueNeg++;
    else falsePos++;
}

console.log(`📊 가치 등급 분포:`);
for (const [grade, count] of Object.entries(dist)) {
    const pct = Math.round(count / allTests.length * 100);
    console.log(`   ${grade}: ${count}건 (${pct}%)`);
}

console.log(`\n📊 게이트별 실패 횟수:`);
for (const [gate, fails] of Object.entries(gateFailures)) {
    console.log(`   ${gate}: ${fails}회 실패`);
}

console.log(`\n📊 분류 정확도:`);
console.log(`   ✅ True Positive (좋음→통과): ${truePos}`);
console.log(`   ❌ False Negative (좋음→차단): ${falseNeg}`);
console.log(`   ✅ True Negative (위험→차단): ${trueNeg}`);
console.log(`   ❌ False Positive (위험→통과): ${falsePos}`);
const precision = (truePos + falsePos) > 0 ? truePos / (truePos + falsePos) : 0;
const recall = (truePos + falseNeg) > 0 ? truePos / (truePos + falseNeg) : 0;
const f1 = (precision + recall) > 0 ? 2 * precision * recall / (precision + recall) : 0;
console.log(`   📈 Precision: ${(precision * 100).toFixed(1)}%`);
console.log(`   📈 Recall: ${(recall * 100).toFixed(1)}%`);
console.log(`   📈 F1 Score: ${(f1 * 100).toFixed(1)}%`);

// 특별 검증: 빌트인 시드 통과율
const builtinResults = builtinSeeds.map(t => verifyKeywordValue(t));
const builtinPassRate = builtinResults.filter(r => r.passedCount >= 4).length / builtinSeeds.length;
console.log(`\n🛟 빌트인 시드 통과율 (≥4 게이트): ${(builtinPassRate * 100).toFixed(1)}% (${Math.round(builtinPassRate * builtinSeeds.length)}/${builtinSeeds.length})`);
const builtinPerfect = builtinResults.filter(r => r.passedCount === 6).length;
console.log(`   완벽 (6/6): ${builtinPerfect}/${builtinSeeds.length} (${Math.round(builtinPerfect / builtinSeeds.length * 100)}%)`);

// 위험 키워드 차단율
const dangerResults = dangerousKws.map(t => verifyKeywordValue(t));
const blockRate = dangerResults.filter(r => !r.valuable).length / dangerousKws.length;
console.log(`\n🚫 위험 키워드 차단율: ${(blockRate * 100).toFixed(1)}% (${Math.round(blockRate * dangerousKws.length)}/${dangerousKws.length})`);

console.log(`\n${'═'.repeat(80)}`);
const ok = builtinPassRate >= 0.95 && blockRate >= 0.90 && f1 >= 0.85;
console.log(ok ? `✅ 가치 검증 시스템 정확도 양호 (F1=${(f1 * 100).toFixed(1)}%)` : `🚨 정확도 부족 — 게이트 임계치 조정 필요`);
console.log(`${'═'.repeat(80)}\n`);
