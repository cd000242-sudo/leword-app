/**
 * v2.21.0 실제 뽑힌 키워드 샘플 보기 — 3회 run 의 top 30 비교
 *
 * 주의: 이 테스트는 모의 풀(kw_0000 등)이 아니라 실제 한국어 시드 풀에
 *       Stratified Weighted Sampling 을 적용해 어떤 키워드가 매 run 마다
 *       얼마나 다르게 뽑히는지 시각적으로 확인한다.
 */

// 실전 시드 샘플 — 다양한 카테고리 2000개 모의 (품질점수는 지수 감소)
const CATEGORIES = {
    생활꿀팁: ['곰팡이 제거', '냉장고 청소', '화장실 찌든때', '싱크대 막힘', '배수구 냄새',
             '옷장 정리', '주방 수납', '욕실 수납', '이불 세탁', '커튼 세탁',
             '세탁기 청소', '에어컨 청소', '창문 청소', '블라인드 청소', '신발장 정리'],
    건강: ['비타민D 결핍', '갑상선 검사', '대장내시경', '위내시경', '건강검진',
          '혈당 관리', '콜레스테롤', '고혈압 증상', '당뇨 초기', '피로 원인'],
    재테크: ['IRP 가입', '연금저축', '주택청약', 'ETF 추천', '배당주',
          '파킹통장', '청년도약계좌', '세액공제', '연말정산', '종합소득세'],
    뷰티: ['선크림 추천', '수분크림 추천', '토너 추천', '클렌징오일', '앰플',
          '쿠션 추천', '립스틱 추천', '아이섀도우', '향수 추천', '샴푸 추천'],
    부동산: ['청약 가점', '전세 사기', '임대차 계약', '중개수수료', '등기부등본',
          '취득세', '양도세', '재건축', '재개발', '오피스텔'],
    IT: ['아이폰 설정', '갤럭시 단축키', '윈도우 최적화', '맥북 단축키', '크롬 확장프로그램',
         'VSCode 플러그인', 'ChatGPT 활용', '파이썬 입문', 'JS 입문', 'React 초보'],
    정책: ['청년도약계좌 조건', '근로장려금', '출산지원금', '육아휴직', '실업급여',
          '기초연금', '국민연금', '장애인 지원', '한부모 지원', '소상공인 지원'],
    여행: ['제주 맛집', '부산 여행', '강릉 코스', '경주 1박2일', '서울 근교',
          '일본 온천', '오사카 쇼핑', '도쿄 자유여행', '베트남 다낭', '태국 방콕'],
    육아: ['신생아 수유', '이유식 시작', '기저귀 추천', '분유 추천', '유모차 추천',
          '카시트 추천', '젖병 추천', '아기 장난감', '수면교육', '어린이집 선택'],
    음식: ['김치찌개 레시피', '된장찌개 황금비율', '제육볶음', '닭볶음탕', '떡볶이',
          '잡채', '갈비찜', '삼계탕', '비빔밥', '김밥 속재료'],
};

const SUFFIXES = ['', ' 추천', ' 후기', ' 비교', ' 방법', ' 순위', ' 정리', ' 꿀팁'];

function buildRealisticPool() {
    const keywords = [];
    for (const cat of Object.keys(CATEGORIES)) {
        for (const base of CATEGORIES[cat]) {
            for (const suffix of SUFFIXES) {
                keywords.push(base + suffix);
            }
        }
    }
    // 중복 제거 후 품질점수 부여 (지수 감소)
    const unique = [...new Set(keywords)];
    return unique.map((kw, i) => ({
        keyword: kw,
        qualityScore: 100 * Math.pow(0.9985, i),
    }));
}

function stratifiedSample(pool, targetSize) {
    const allScored = [...pool].sort((a, b) => b.qualityScore - a.qualityScore);

    const weightedSampleWithoutReplacement = (items, k, exponent = 1.0) => {
        if (items.length <= k) return items.slice();
        const keyed = items.map(x => ({
            item: x,
            key: Math.pow(Math.random(), 1 / Math.max(0.0001, Math.pow(x.qualityScore, exponent))),
        }));
        keyed.sort((a, b) => b.key - a.key);
        return keyed.slice(0, k).map(e => e.item);
    };

    const fixedCount = Math.min(50, Math.floor(targetSize * 0.125));
    const aPrimeSize = Math.floor(targetSize * 0.70);
    const layerBSize = Math.floor(targetSize * 0.125);
    const layerCSize = targetSize - fixedCount - aPrimeSize - layerBSize;

    const fixedPool = allScored.slice(0, fixedCount);
    const aPrimePoolEnd = Math.min(allScored.length, fixedCount + Math.floor(aPrimeSize * 1.07));
    const bPoolEnd = Math.min(allScored.length, aPrimePoolEnd + Math.max(layerBSize * 9, 450));
    const aPrimePool = allScored.slice(fixedCount, aPrimePoolEnd);
    const bPool = allScored.slice(aPrimePoolEnd, bPoolEnd);
    const cPool = allScored.slice(bPoolEnd);

    const aPrime = weightedSampleWithoutReplacement(aPrimePool, aPrimeSize, 1.2);
    const layerB = weightedSampleWithoutReplacement(bPool, layerBSize, 0.6);
    const layerC = weightedSampleWithoutReplacement(cPool, layerCSize, 0.3);

    const seen = new Set();
    const out = [];
    for (const r of [...fixedPool, ...aPrime, ...layerB, ...layerC]) {
        if (seen.has(r.keyword)) continue;
        seen.add(r.keyword);
        out.push(r);
    }
    return out;
}

const pool = buildRealisticPool();
console.log(`풀 크기: ${pool.length}개 키워드`);
console.log('');

// 3회 run
const runs = [];
for (let r = 0; r < 3; r++) {
    runs.push(stratifiedSample(pool, 100).map(x => x.keyword));
}

for (let r = 0; r < 3; r++) {
    console.log(`════ Run #${r + 1} top 30 ════`);
    console.log(runs[r].slice(0, 30).map((k, i) => `  ${String(i + 1).padStart(2)}. ${k}`).join('\n'));
    console.log('');
}

// Run1 vs Run2 차이 분석
const set1 = new Set(runs[0]);
const set2 = new Set(runs[1]);
const onlyIn2 = runs[1].filter(k => !set1.has(k));
const onlyIn1 = runs[0].filter(k => !set2.has(k));

console.log(`════ Run #1 → Run #2 변화 ════`);
console.log(`Run #1 에만 있는 키워드 (Run #2 에서 사라짐): ${onlyIn1.length}개`);
console.log(onlyIn1.slice(0, 15).map(k => `  - ${k}`).join('\n'));
console.log('');
console.log(`Run #2 에 새로 등장한 키워드: ${onlyIn2.length}개`);
console.log(onlyIn2.slice(0, 15).map(k => `  + ${k}`).join('\n'));
console.log('');

// 3회 모두 등장 vs 1회만
const counts = new Map();
for (const run of runs) for (const k of new Set(run)) counts.set(k, (counts.get(k) || 0) + 1);
const always = [...counts.entries()].filter(([, c]) => c === 3).map(([k]) => k);
const once = [...counts.entries()].filter(([, c]) => c === 1).map(([k]) => k);

console.log(`════ 3회 모두 등장 (절대 보장): ${always.length}개 ════`);
console.log(always.slice(0, 20).map(k => `  🏆 ${k}`).join('\n'));
console.log('');
console.log(`════ 1회만 등장 (희귀 발굴): ${once.length}개 ════`);
console.log(once.slice(0, 20).map(k => `  💎 ${k}`).join('\n'));
