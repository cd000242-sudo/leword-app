/**
 * LEWORD 게이트 시뮬레이션 — 어떤 키워드가 통과/차단되는지 표 출력
 * 실행: node -r ts-node/register scripts/test-gates.ts
 *
 * 네이버 API 호출 없이 정적 규칙(친화도/다의어/niche/금융전문 등)만 검증.
 */

import { diagnoseKeyword } from '../src/utils/sources/rich-feed-builder';

// 50개 샘플: 각 카테고리/패턴 대표
const SAMPLES: Array<{ kw: string; sv: number; dc: number; expected: string }> = [
    // ✅ 통과 예상 (글쓰기 좋음)
    { kw: '신생아 태열',          sv: 9890,  dc: 1000,  expected: '통과 (육아)' },
    { kw: '아기 이유식 시작',      sv: 5400,  dc: 1800,  expected: '통과 (육아)' },
    { kw: '뉴발란스 530 후기',    sv: 8200,  dc: 2400,  expected: '통과 (commercial)' },
    { kw: '클렌징오일 추천',      sv: 12300, dc: 3200,  expected: '통과 (뷰티+commercial)' },
    { kw: '계란찜 만드는법',      sv: 18500, dc: 4800,  expected: '통과 (레시피)' },
    { kw: '제주도 3박4일 코스',   sv: 7600,  dc: 2100,  expected: '통과 (여행)' },
    { kw: '아이폰 단축키 모음',   sv: 4200,  dc: 1500,  expected: '통과 (IT가이드)' },
    { kw: '강아지 사료 추천',     sv: 11000, dc: 2800,  expected: '통과 (반려동물+commercial)' },
    { kw: '소형 책상 추천',       sv: 3400,  dc: 1200,  expected: '통과 (인테리어)' },
    { kw: '갤럭시 워치 후기',     sv: 9800,  dc: 2600,  expected: '통과 (IT+commercial)' },

    // ❌ 차단 예상 (다의어/동사)
    { kw: '시각',     sv: 11640, dc: 5820, expected: '차단 (다의어)' },
    { kw: '통화',     sv: 3380,  dc: 1690, expected: '차단 (다의어)' },
    { kw: '세대',     sv: 3900,  dc: 1950, expected: '차단 (다의어)' },
    { kw: '필름',     sv: 9630,  dc: 4815, expected: '차단 (다의어)' },
    { kw: '입다',     sv: 3000,  dc: 1500, expected: '차단 (단일동사)' },
    { kw: '근무',     sv: 2940,  dc: 1470, expected: '차단 (단일동사)' },
    { kw: '시사',     sv: 5400,  dc: 2700, expected: '차단 (다의어)' },
    { kw: '콜라보',   sv: 6240,  dc: 3120, expected: '차단 (다의어)' },
    { kw: '캠페인',   sv: 7800,  dc: 3900, expected: '차단 (다의어)' },

    // ❌ 차단 예상 (외국 셀럽)
    { kw: '호소키 카즈코',       sv: 59650, dc: 722,  expected: '차단 (외국셀럽)' },
    { kw: '패리스 잭슨',         sv: 4260,  dc: 1443, expected: '차단 (외국셀럽)' },
    { kw: '리사 마리 프레슬리',  sv: 8790,  dc: 1237, expected: '차단 (외국셀럽)' },
    { kw: '자파 잭슨',           sv: 121700, dc: 1682, expected: '차단 (외국셀럽)' },
    { kw: '저메인 잭슨',         sv: 51320, dc: 1220, expected: '차단 (외국셀럽)' },

    // ❌ 차단 예상 (한국 게임)
    { kw: '서브노티카',          sv: 13450, dc: 4493, expected: '차단 (게임)' },
    { kw: '프래그마타',          sv: 107800, dc: 1428, expected: '차단 (게임)' },
    { kw: '붉은사막',            sv: 177500, dc: 33219, expected: '차단 (게임)' },

    // ❌ 차단 예상 (회사명/항공사)
    { kw: '여기어때컴퍼니',      sv: 840,    dc: 13,   expected: '차단 (회사명)' },
    { kw: '코오롱티슈진',        sv: 350700, dc: 40934, expected: '차단 (회사명)' },
    { kw: '파라타항공',          sv: 290400, dc: 7395,  expected: '차단 (항공사)' },

    // ❌ 차단 예상 (영문 단일)
    { kw: 'CORTIS',              sv: 40540,  dc: 6440, expected: '차단 (영문단일)' },

    // ❌ 차단 예상 (AI 도구)
    { kw: '구글 제미나이',       sv: 375700, dc: 98485, expected: '낮은 친화도 (AI도구)' },

    // ❌ 차단 예상 (금융 전문)
    { kw: '정기예금 금리 비교',  sv: 30690,  dc: 9713,  expected: '낮은 친화도 (금융전문)' },
    { kw: '청년도약계좌 신청',   sv: 18000,  dc: 4500,  expected: '낮은 친화도 (금융전문)' },

    // ❌ 차단 예상 (지역시설/축제)
    { kw: '양천구민체육센터',    sv: 7020,   dc: 1226,  expected: '차단 (지역시설)' },
    { kw: '노원구 연등축제',     sv: 350,    dc: 60,    expected: '차단 (지역축제)' },

    // ❌ 차단 예상 (약품)
    { kw: '아티반',              sv: 19830,  dc: 5767,  expected: '차단 (약품)' },

    // ❌ 차단 예상 (정치/법률)
    { kw: '긴급조정권',          sv: 58200,  dc: 1816,  expected: '차단 (정치법률)' },

    // ⚠️ 경계선
    { kw: '신림 그랑프리',       sv: 4670,   dc: 1212,  expected: '경계 (지역+이벤트)' },
    { kw: '더샵송도그란테르',    sv: 27730,  dc: 953,   expected: '낮은 친화도 (아파트)' },
    { kw: '종로쌍뱀',            sv: 1020,   dc: 8,     expected: '낮은 친화도 (음식점)' },
    { kw: '제네시스 GV90',       sv: 30700,  dc: 14186, expected: '경계 (자동차+모델명)' },

    // v2.43.33 신규: 시즌/하우투/시민참여 황금키워드 (사용자 예시)
    { kw: '종합소득세 환급',         sv: 22000,  dc: 4200,  expected: '★ 시즌 환급형' },
    { kw: '환급금 조회 홈택스',       sv: 15600,  dc: 2800,  expected: '★ 조회 경로형' },
    { kw: '연말정산 환급금 조회',     sv: 18900,  dc: 5100,  expected: '★ 시즌 조회형' },
    { kw: '토스주식 하는법',          sv: 9800,   dc: 1450,  expected: '★ 초보 실행형' },
    { kw: '토스증권 계좌개설',        sv: 5400,   dc: 920,   expected: '★ 실행형' },
    { kw: '병원비 환급금 조회',       sv: 4200,   dc: 1200,  expected: '★ 시즌+조회형' },
    { kw: '지방선거 투표 방법',       sv: 12500,  dc: 3800,  expected: '★ 시민참여+실행' },
    { kw: '2026 한일가왕전 투표하기', sv: 8800,   dc: 1900,  expected: '★ 이벤트+실행' },
    { kw: '청년도약계좌 신청 방법',   sv: 14200,  dc: 3500,  expected: '★ 시즌 실행형' },
    { kw: '주민등록등본 인터넷발급',  sv: 19500,  dc: 2400,  expected: '★ 실행형' },
];

function pad(s: string, n: number): string {
    const len = [...s].reduce((acc, ch) => acc + (ch.charCodeAt(0) > 0x1100 ? 2 : 1), 0);
    return s + ' '.repeat(Math.max(0, n - len));
}

console.log('\n=== LEWORD v2.43.29 게이트 시뮬레이션 ===\n');
console.log(pad('키워드', 26) + pad('통과', 6) + pad('점수', 6) + pad('가산/감산 사유', 50) + pad('차단사유', 18) + pad('예상', 24));
console.log('─'.repeat(130));

let passed = 0, blocked = 0;
const summary: Record<string, number> = {};

for (const s of SAMPLES) {
    const r = diagnoseKeyword(s.kw, s.dc, s.sv);
    const passedStr = r.writable ? '✅' : '❌';
    if (r.writable) passed++; else blocked++;
    const factorsStr = r.factors
        .slice()
        .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
        .slice(0, 4)
        .map(f => `${f.delta > 0 ? '+' : ''}${f.delta}${f.label}`)
        .join(' ');
    const blockKey = r.blockedBy || (r.writable ? 'pass' : 'soft-block');
    summary[blockKey] = (summary[blockKey] || 0) + 1;
    console.log(
        pad(r.keyword, 26) +
        pad(passedStr, 6) +
        pad(String(r.writabilityScore), 6) +
        pad(factorsStr, 50) +
        pad(r.blockedBy || '-', 18) +
        pad(s.expected, 24)
    );
}

console.log('─'.repeat(130));
console.log(`\n📊 통계: ${SAMPLES.length}개 중 ${passed}개 통과, ${blocked}개 차단`);
console.log('차단 사유별:');
for (const [k, v] of Object.entries(summary)) {
    console.log(`  ${k}: ${v}건`);
}

// 점수 분포
const scoreBuckets = { '80+': 0, '60~79': 0, '40~59': 0, '20~39': 0, '0~19': 0 };
for (const s of SAMPLES) {
    const r = diagnoseKeyword(s.kw, s.dc, s.sv);
    if (r.writabilityScore >= 80) scoreBuckets['80+']++;
    else if (r.writabilityScore >= 60) scoreBuckets['60~79']++;
    else if (r.writabilityScore >= 40) scoreBuckets['40~59']++;
    else if (r.writabilityScore >= 20) scoreBuckets['20~39']++;
    else scoreBuckets['0~19']++;
}
console.log('\n📊 친화도 점수 분포:');
for (const [k, v] of Object.entries(scoreBuckets)) {
    const bar = '█'.repeat(v);
    console.log(`  ${pad(k, 10)} ${bar} ${v}`);
}

console.log('\n💡 SSS 자격 (친화도 ≥ 40): ' + SAMPLES.filter(s => diagnoseKeyword(s.kw, s.dc, s.sv).writabilityScore >= 40 && diagnoseKeyword(s.kw, s.dc, s.sv).writable).length + '건');
console.log('   추가로 사용자 카테고리(육아) 매칭 시 +30 보너스 적용\n');
