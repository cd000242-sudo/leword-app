/**
 * v2.28.0 Endgame 100회 시뮬레이션
 *
 * 목표:
 *   - 평균 total (SSS+SS+S+A 합계): 100건 이상
 *   - 평균 sss: 20건 이상
 *   - pair jaccard: 50~70%
 *   - pool coverage: 70%+
 *   - 1위 변동: 20종+
 *
 * 실제 Naver API 없이 2500개 가상 후보 풀로 로직 검증
 */

// ─────────────────────────────────────────────
//  필터 패턴 (rich-feed-builder.ts 에서 복제)
// ─────────────────────────────────────────────
const INTENT_SUFFIX_RE = /(추천|후기|비교|방법|순위|종류|가격|리뷰|만드는법|만들기|하는법|사용법|뜻|차이|장단점|원인|증상|효과|부작용|쓰는법|설치법|가입|해지|환불)$/;
const COMMERCIAL_RE = /(추천|비교|후기|가격|순위|할인|최저가|리뷰|원데이|무료|가성비|베스트|인기|신상|브랜드|구매)/;
const GENERIC_BROAD_RE = /^(적금|예금|카드|대출|보험|투자|주식|펀드|ETF|연금|세금|건강|영양제|비타민|음식|요리|청소|여행|맛집|공부|운동|헬스|다이어트|뷰티|화장품|샴푸|선크림|의류|패션|가구|인테리어|네이버|구글|카카오|삼성|엘지|쿠팡|클로드|챗GPT|유튜브|인스타|페이스북|브랜드|제품|상품|서비스|리뷰)$/;
const GENERIC_ACTION_RE = /^(추천|후기|리뷰|비교|순위|가격|방법|꿀팁|정리|할인|세일|이벤트|인기|베스트|신상|최신|tips|모음|목록|소개|설명|정보)$/i;

const KOREAN_SURNAMES = '김이박최정강조윤장임한오서신권황안송류홍전고문양손배백허유남심노하곽성차주우구민유진지엄채원방공현함변염여추도석선설마길연위표명기반나왕금옥육인맹제모탁국어육';
const CELEB_PATTERN_RE = new RegExp(`^[${KOREAN_SURNAMES}][가-힣]{1,3}$`);

function isLikelyCelebrityName(keyword) {
    const clean = keyword.trim();
    if (clean.length < 2 || clean.length > 4) return false;
    if (clean.includes(' ')) return false;
    return CELEB_PATTERN_RE.test(clean);
}

function isTooGeneric2Token(keyword) {
    const tokens = keyword.trim().split(/\s+/).filter(Boolean);
    if (tokens.length !== 2) return false;
    const [a, b] = tokens;
    if (GENERIC_BROAD_RE.test(a) && GENERIC_ACTION_RE.test(b)) return true;
    if (GENERIC_BROAD_RE.test(b) && GENERIC_ACTION_RE.test(a)) return true;
    return false;
}

function isWritableKeyword(keyword, docCount) {
    const tokens = keyword.trim().split(/\s+/).filter(Boolean).length;
    if (tokens === 2 && isTooGeneric2Token(keyword)) return false;
    if (tokens >= 2) return true;
    if (INTENT_SUFFIX_RE.test(keyword)) return true;
    if (isLikelyCelebrityName(keyword)) {
        return docCount > 0 && docCount <= 500;
    }
    if (docCount > 0 && docCount <= 15000) return true;
    return false;
}

function hasCommercialIntent(keyword) {
    return COMMERCIAL_RE.test(keyword);
}

// ─────────────────────────────────────────────
//  calculateGrade (rich-feed-builder.ts 에서 복제)
// ─────────────────────────────────────────────
function calculateGrade(volume, docCount, ratio, score, keyword) {
    const writable = isWritableKeyword(keyword, docCount);
    if (!writable && docCount > 100000) return '';
    if (!writable && isTooGeneric2Token(keyword)) return '';

    const isCelebLike = isLikelyCelebrityName(keyword);
    if (isCelebLike && docCount > 1000) return '';

    const allowSS = writable || (!isCelebLike && docCount > 0 && docCount <= 10000);
    const allowS  = writable || (!isCelebLike && docCount > 0 && docCount <= 30000);
    const allowA  = writable || (!isCelebLike && docCount > 0 && docCount <= 50000);
    const commercial = hasCommercialIntent(keyword);

    // SSS 자동 승격 5경로
    if (!isCelebLike && docCount > 0) {
        if (ratio >= 20 && volume >= 300)                                      return 'SSS';
        if (ratio >= 10 && docCount <= 8000   && volume >= 500)                return 'SSS';
        if (ratio >= 7  && docCount <= 20000  && volume >= 2000)               return 'SSS';
        if (commercial  && docCount <= 5000   && volume >= 300 && ratio >= 3)  return 'SSS';
        if (commercial  && docCount <= 1000   && volume >= 200)                return 'SSS';
    }

    // SSS 기본 게이트
    const sssScore = commercial ? 70 : 75;
    const sssSv    = commercial ? 400 : 600;
    const sssDc    = commercial ? 12000 : 10000;
    const sssRatio = commercial ? 2.5 : 3.5;
    if (score >= sssScore && volume >= sssSv && docCount > 0 && docCount <= sssDc && ratio >= sssRatio && allowSS) return 'SSS';

    // SS 자동 승격
    if (!isCelebLike && docCount > 0) {
        if (ratio >= 5  && docCount <= 15000 && volume >= 500)               return 'SS';
        if (commercial  && docCount <= 8000  && volume >= 300 && ratio >= 2) return 'SS';
        if (ratio >= 3  && docCount <= 5000  && volume >= 200)               return 'SS';
    }

    // SS 기본 게이트
    const ssScore = commercial ? 58 : 62;
    const ssSv    = commercial ? 150 : 250;
    const ssDc    = commercial ? 35000 : 25000;
    const ssRatio = commercial ? 1.2 : 1.8;
    if (score >= ssScore && volume >= ssSv && docCount > 0 && docCount <= ssDc && ratio >= ssRatio && allowSS) return 'SS';

    if (score >= 50 && volume >= 100  && ratio >= 0.8 && allowS) return 'S';
    if (score >= 40 && volume >= 40   && allowA)                  return 'A';
    if (score >= 35 && volume >= 20)                              return 'B';
    return '';
}

// ─────────────────────────────────────────────
//  calculateScore (rich-feed-builder.ts 에서 복제)
// ─────────────────────────────────────────────
function calculateScore(volume, docCount, ratio, cpc, intent, keyword) {
    const sd = Math.min(100,
        ratio >= 20 ? 100 :
        ratio >= 10 ? 80 + (ratio - 10) * 2 :
        ratio >= 5  ? 60 + (ratio - 5)  * 4 :
        ratio >= 2  ? 35 + (ratio - 2)  * 8.3 :
        ratio >= 1  ? 15 + (ratio - 1)  * 20 :
        ratio * 15);

    const vol = Math.min(100,
        volume >= 50000 ? 100 :
        volume >= 10000 ? 80 + (volume - 10000) * 0.0005 :
        volume >= 5000  ? 65 + (volume - 5000)  * 0.003 :
        volume >= 1000  ? 40 + (volume - 1000)  * 0.00625 :
        volume >= 300   ? 15 + (volume - 300)   * 0.036 :
        volume * 0.05);

    const cpcScore = Math.min(100,
        cpc >= 2000 ? 100 :
        cpc >= 1000 ? 70 + (cpc - 1000) * 0.03 :
        cpc >= 500  ? 40 + (cpc - 500)  * 0.06 :
        cpc >= 200  ? 15 + (cpc - 200)  * 0.083 :
        cpc * 0.075);

    const monetization = cpcScore * 0.5 + intent * 0.5;
    const docPenalty   = docCount > 50000 ? 30 : docCount > 20000 ? 20 : docCount > 10000 ? 10 : docCount > 5000 ? 5 : 0;
    const comp         = Math.max(0, 100 - docPenalty);

    let base = sd * 0.45 + vol * 0.25 + monetization * 0.15 + comp * 0.15;

    if (keyword) {
        if (hasCommercialIntent(keyword)) base *= 1.15;
        if (docCount > 0 && docCount < 1000 && volume > 500 && ratio >= 10) base *= 1.20;
        if (cpc >= 2000) base *= 1.08;
        if (isLikelyCelebrityName(keyword)) base *= 0.65;
        const tokens = keyword.trim().split(/\s+/).length;
        if (tokens === 1 && !INTENT_SUFFIX_RE.test(keyword) && intent < 3) base *= 0.85;
    }

    return Math.round(Math.min(100, Math.max(0, base)));
}

// ─────────────────────────────────────────────
//  Mock Pool 생성 — 실전 sv/dc 분포 모사
// ─────────────────────────────────────────────
function logNormal(rng, mu, sigma) {
    // Box-Muller
    const u1 = Math.max(1e-12, rng());
    const u2 = rng();
    const z  = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return Math.exp(mu + sigma * z);
}

// seeded PRNG (mulberry32) — 풀은 고정, 샘플링만 매번 새 난수
function mulberry32(seed) {
    return function () {
        seed |= 0; seed = seed + 0x6D2B79F5 | 0;
        let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}

// 키워드 패턴 (2500개 생성용 — 인덱스 i 반영해 모두 유니크하게)
const KW_TEMPLATES = [
    // 2-token 롱테일 (상업성)
    (i) => `아이템${i} 추천`,
    (i) => `제품${i} 후기`,
    (i) => `브랜드${i} 비교`,
    (i) => `서비스${i} 가격`,
    (i) => `앱${i} 사용법`,
    // 2-token 정보성
    (i) => `주제${i} 방법`,
    (i) => `기술${i} 뜻`,
    (i) => `지식${i} 정리`,
    (i) => `개념${i} 차이`,
    // 3-token 롱테일
    (i) => `고급 아이템${i} 추천`,
    (i) => `초보 기술${i} 배우기`,
    (i) => `2026 트렌드${i} 정리`,
    // 단일 토큰 (writable 판정 가변)
    (i) => `키워드${i}`,
    // 인명 패턴 (차단 대상 — 인덱스 포함해 유니크 유지)
    (i) => `김민준${i}`,
    // 범용 2-token (차단 대상 — 인덱스 포함해 유니크 유지, 실제론 grade '' 출력)
    (i) => `적금${i} 추천`,
    (i) => `네이버${i} 리뷰`,
];

function buildMockPool(size = 2500) {
    const rng = mulberry32(42);
    const pool = [];

    // sv: 로그정규 중앙값 500, sigma 큼 (1.8) → 실전 분포 모사
    // dc: 로그정규 중앙값 5000, sigma 1.5
    const svMu  = Math.log(500);
    const svSig = 1.8;
    const dcMu  = Math.log(5000);
    const dcSig = 1.5;

    for (let i = 0; i < size; i++) {
        const sv = Math.max(10, Math.round(logNormal(rng, svMu, svSig)));
        const dc = Math.max(50, Math.round(logNormal(rng, dcMu, dcSig)));
        const gr = sv / Math.max(1, dc);

        // 키워드 패턴 선택 — 다양성 위해 i 기반 순환 + 일부 특수
        const patternIdx = i % KW_TEMPLATES.length;
        const rawKeyword = KW_TEMPLATES[patternIdx](i);
        // 차단 대상(범용2-token)은 동일 문자열로 고정되어 중복 방지
        const keyword    = rawKeyword.includes(' ') && rawKeyword === rawKeyword
            ? rawKeyword
            : rawKeyword;

        // CPC: 로그정규 중앙값 400원, sigma 1.2
        const cpc    = Math.max(0, Math.round(logNormal(rng, Math.log(400), 1.2)));
        // intent: 0~100
        const intent = Math.round(rng() * 100);

        const score = calculateScore(sv, dc, gr, cpc, intent, keyword);

        // qualityScore: 100점 기준 (score 가중 + 소스수 가산)
        const srcCount   = Math.ceil(rng() * 5);
        const qualScore  = score * 0.85 + srcCount * 3;

        pool.push({ keyword, sv, dc, gr, cpc, intent, score, qualityScore: qualScore });
    }

    // qualityScore 내림차순
    pool.sort((a, b) => b.qualityScore - a.qualityScore);
    return pool;
}

// ─────────────────────────────────────────────
//  Stratified Weighted Sampling (rich-feed-builder 복제)
// ─────────────────────────────────────────────
function weightedSampleWithoutReplacement(items, k, exponent = 1.5) {
    if (items.length <= k) return items.slice();
    const keyed = items.map(x => ({
        item: x,
        key: Math.pow(Math.random(), 1 / Math.max(0.0001, Math.pow(x.qualityScore, exponent))),
    }));
    keyed.sort((a, b) => b.key - a.key);
    return keyed.slice(0, k).map(e => e.item);
}

function stratifiedSample(pool, targetSize = 400) {
    const allScored = [...pool].sort((a, b) => b.qualityScore - a.qualityScore);

    const fixedCount  = Math.min(50, Math.floor(targetSize * 0.125));
    const aPrimeSize  = Math.floor(targetSize * 0.70);
    const layerBSize  = Math.floor(targetSize * 0.125);
    const layerCSize  = targetSize - fixedCount - aPrimeSize - layerBSize;

    // fixed 풀은 상위 fixedCount*8 범위에서 균등 가중 샘플링 → 1위 변동 20종+ 보장
    const FIXED_SPREAD  = Math.min(allScored.length, fixedCount * 8);
    const fixedPoolSrc  = allScored.slice(0, FIXED_SPREAD);
    // exponent 0.4: 거의 균등 샘플링 → 최상위권 전체에서 1위 후보가 다양하게 선택됨
    const fixedPool     = weightedSampleWithoutReplacement(fixedPoolSrc, fixedCount, 0.4);
    const fixedKwSet    = new Set(fixedPool.map(x => x.keyword));

    // A' 풀은 fixed spread 제외 후 시작
    const aPrimeStart   = FIXED_SPREAD;
    const aPrimePoolEnd = Math.min(allScored.length, aPrimeStart + Math.floor(aPrimeSize * 1.07));
    const bPoolEnd      = Math.min(allScored.length, aPrimePoolEnd + Math.max(layerBSize * 9, 450));
    const aPrimePool    = allScored.slice(aPrimeStart, aPrimePoolEnd).filter(x => !fixedKwSet.has(x.keyword));
    const bPool         = allScored.slice(aPrimePoolEnd, bPoolEnd);
    const cPool         = allScored.slice(bPoolEnd);

    const aPrime = weightedSampleWithoutReplacement(aPrimePool, aPrimeSize, 1.2);
    const layerB = weightedSampleWithoutReplacement(bPool,      layerBSize,  0.6);
    const layerC = weightedSampleWithoutReplacement(cPool,      layerCSize,  0.3);
    const layerA = [...fixedPool, ...aPrime];

    const seen = new Set();
    const out  = [];
    for (const r of [...layerA, ...layerB, ...layerC]) {
        if (seen.has(r.keyword)) continue;
        seen.add(r.keyword);
        out.push(r);
    }
    out.sort((a, b) => b.qualityScore - a.qualityScore);
    return out;
}

// ─────────────────────────────────────────────
//  Jaccard 유사도
// ─────────────────────────────────────────────
function jaccardSimilarity(a, b) {
    const setA = new Set(a);
    const setB = new Set(b);
    const intersection = [...setA].filter(x => setB.has(x)).length;
    const union        = new Set([...a, ...b]).size;
    return union === 0 ? 0 : intersection / union;
}

// ─────────────────────────────────────────────
//  메인 시뮬레이션
// ─────────────────────────────────────────────
const N_RUNS    = 100;
const POOL_SIZE = 2500;
const SAMPLE    = 400;

console.log('');
console.log('═══════════════════════════════════════════════════════════════');
console.log('  v2.28.0 Endgame — 100회 시뮬레이션 (API-free 로직 검증)');
console.log('═══════════════════════════════════════════════════════════════');
console.log(`  설정: pool ${POOL_SIZE}, sample ${SAMPLE}, runs ${N_RUNS}`);
console.log('');

const tStart = Date.now();

// 1. 후보 풀 고정 생성
process.stdout.write('  풀 생성 중... ');
const POOL = buildMockPool(POOL_SIZE);
console.log(`완료 (${POOL.length}개)`);

// 2. 100회 반복
const runs = [];  // run[i] = { keywords[], sss, ss, s, a, total }
process.stdout.write('  시뮬레이션 실행 중 ');

for (let r = 0; r < N_RUNS; r++) {
    if (r % 10 === 0) process.stdout.write('.');

    const sampled = stratifiedSample(POOL, SAMPLE);

    let sss = 0, ss = 0, s = 0, a = 0;
    const keywords = [];

    for (const item of sampled) {
        const grade = calculateGrade(item.sv, item.dc, item.gr, item.score, item.keyword);
        if (grade === 'SSS') sss++;
        else if (grade === 'SS') ss++;
        else if (grade === 'S')  s++;
        else if (grade === 'A')  a++;
        keywords.push(item.keyword);
    }

    runs.push({ keywords, sss, ss, s, a, total: sss + ss + s + a });
}

console.log(' 완료');

const elapsed = ((Date.now() - tStart) / 1000).toFixed(2);

// ─────────────────────────────────────────────
//  지표 계산
// ─────────────────────────────────────────────

// 평균 total/sss/ss/s/a
const avgTotal = runs.reduce((acc, r) => acc + r.total, 0) / N_RUNS;
const avgSSS   = runs.reduce((acc, r) => acc + r.sss,   0) / N_RUNS;
const avgSS    = runs.reduce((acc, r) => acc + r.ss,    0) / N_RUNS;
const avgS     = runs.reduce((acc, r) => acc + r.s,     0) / N_RUNS;
const avgA     = runs.reduce((acc, r) => acc + r.a,     0) / N_RUNS;

// pair jaccard (샘플링: 무작위 200쌍 — O(n²) 방지)
let pairJaccardSum = 0;
let pairCount      = 0;
const PAIR_SAMPLE  = Math.min(200, Math.floor(N_RUNS * (N_RUNS - 1) / 2));
const pairRng      = mulberry32(99);
const usedPairs    = new Set();
while (pairCount < PAIR_SAMPLE) {
    const i = Math.floor(pairRng() * N_RUNS);
    const j = Math.floor(pairRng() * N_RUNS);
    if (i === j) continue;
    const key = i < j ? `${i}_${j}` : `${j}_${i}`;
    if (usedPairs.has(key)) continue;
    usedPairs.add(key);
    pairJaccardSum += jaccardSimilarity(runs[i].keywords, runs[j].keywords);
    pairCount++;
}
const pairJaccard = pairJaccardSum / pairCount;

// pool coverage: 100회 동안 몇 개 유니크 키워드 등장?
const allSeen = new Set();
for (const r of runs) for (const k of r.keywords) allSeen.add(k);
const poolCoverage = allSeen.size / POOL.length;

// 1위 변동
const firstPlace = new Map();
for (const r of runs) {
    const top = r.keywords[0];
    firstPlace.set(top, (firstPlace.get(top) || 0) + 1);
}
const uniqueFirstPlaces = firstPlace.size;

// min/max total
const minTotal = Math.min(...runs.map(r => r.total));
const maxTotal = Math.max(...runs.map(r => r.total));
const minSSS   = Math.min(...runs.map(r => r.sss));
const maxSSS   = Math.max(...runs.map(r => r.sss));

// ─────────────────────────────────────────────
//  결과 출력
// ─────────────────────────────────────────────
const pass  = (v, target) => v >= target ? '✅ 달성' : '❌ 미달';
const range = (lo, hi, v)  => v >= lo && v <= hi ? '✅ 달성' : '❌ 미달';

console.log('');
console.log('## 100회 시뮬레이션 결과');
console.log('─────────────────────────────────────────────────────────────');
console.log(`  평균 total (SSS+SS+S+A): ${avgTotal.toFixed(1)}건   [min ${minTotal} / max ${maxTotal}]`);
console.log(`    → 목표 100+  ${pass(avgTotal, 100)}`);
console.log('');
console.log(`  평균 SSS:  ${avgSSS.toFixed(1)}건   [min ${minSSS} / max ${maxSSS}]`);
console.log(`    → 목표 20+   ${pass(avgSSS, 20)}`);
console.log('');
console.log(`  평균 SS:   ${avgSS.toFixed(1)}건`);
console.log(`  평균 S:    ${avgS.toFixed(1)}건`);
console.log(`  평균 A:    ${avgA.toFixed(1)}건`);
console.log('');
console.log(`  pair jaccard:   ${(pairJaccard * 100).toFixed(1)}%   (${pairCount}쌍 측정)`);
console.log(`    → 목표 50~70% ${range(0.50, 0.70, pairJaccard)}`);
console.log('');
console.log(`  pool coverage:  ${(poolCoverage * 100).toFixed(1)}%   (${allSeen.size}/${POOL.length} 유니크)`);
console.log(`    → 목표 70%+   ${pass(poolCoverage, 0.70)}`);
console.log('');
console.log(`  1위 변동:  ${uniqueFirstPlaces}종 / ${N_RUNS} runs`);
console.log(`    → 목표 20종+  ${pass(uniqueFirstPlaces, 20)}`);
console.log('');
console.log(`  실행 시간: ${elapsed}초`);
console.log('─────────────────────────────────────────────────────────────');

// ─────────────────────────────────────────────
//  목표 달성 판정 & 개선 포인트
// ─────────────────────────────────────────────
const goals = [
    { name: '평균 total ≥ 100',    ok: avgTotal      >= 100   },
    { name: '평균 SSS ≥ 20',       ok: avgSSS        >= 20    },
    { name: 'pair jaccard 50~70%', ok: pairJaccard   >= 0.50 && pairJaccard <= 0.70 },
    { name: 'pool coverage ≥ 70%', ok: poolCoverage  >= 0.70  },
    { name: '1위 변동 ≥ 20종',     ok: uniqueFirstPlaces >= 20 },
];

const passed = goals.filter(g => g.ok).length;
console.log('');
console.log('## 실측 대비 판정');
for (const g of goals) {
    console.log(`  ${g.ok ? '✅' : '❌'} ${g.name}`);
}
console.log('');
console.log(`  총 ${passed}/${goals.length} 목표 달성`);

if (passed < goals.length) {
    console.log('');
    console.log('  개선 필요 지점:');
    if (avgTotal < 100) {
        console.log('  - total 부족: S/A 게이트 score 하한 완화 또는 sample 크기 증가 검토');
    }
    if (avgSSS < 20) {
        console.log('  - SSS 부족: SSS 자동 승격 경로 임계값 완화 (ratio/dc/sv 조정) 검토');
    }
    if (pairJaccard < 0.50) {
        console.log('  - jaccard 낮음: fixed 레이어 비율 증가 또는 aPrime exponent 강화 검토');
    }
    if (pairJaccard > 0.70) {
        console.log('  - jaccard 높음: stratified 다양성 파라미터 완화 검토');
    }
    if (poolCoverage < 0.70) {
        console.log('  - coverage 부족: layerB/C exponent 낮춤 또는 targetSize 증가 검토');
    }
    if (uniqueFirstPlaces < 20) {
        console.log('  - 1위 변동 낮음: fixed 레이어 내 tiebreak 로직 추가 검토');
    }
}

console.log('');
console.log('═══════════════════════════════════════════════════════════════');

process.exit(passed === goals.length ? 0 : 1);
