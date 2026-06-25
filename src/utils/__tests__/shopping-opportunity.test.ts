/**
 * shopping-opportunity.test.ts
 *
 * 쇼핑커넥트가 단순 인기상품 나열이 아니라
 * "지금 글로 쓰면 구매 전환 가능성이 높은 상품"을 우선 추천하는지 검증한다.
 */

import {
  attachShoppingOpportunityScore,
  buildProductLeWordSeeds,
  deriveShoppingExpansionQueries,
  judgeShoppingProductOpportunity,
  rankShoppingOpportunities,
  selectBalancedShoppingOpportunities,
  scoreLeWordEntryKeyword,
  type ShoppingItem,
} from '../naver-shopping-api';
import {
  SHOPPING_AUTO_DISCOVERY_MIN_SEEDS,
  SHOPPING_AUTO_DISCOVERY_MAX_SEEDS,
  buildShoppingDiscoverySeeds,
  ensureShoppingDiscoveryIntentQuery,
  getShoppingAutoDiscoveryExpansionLimit,
  getShoppingAutoDiscoverySearchLimit,
  getShoppingRecommendationLimit,
  getStaticShoppingSuggestions,
  normalizeShoppingAutoDiscoveryLimit,
} from '../shopping-keyword-suggestions';

let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(name: string, cond: boolean, detail?: string) {
  if (cond) {
    passed++;
  } else {
    failed++;
    failures.push(`✗ ${name}${detail ? ' — ' + detail : ''}`);
  }
}

function makeItem(partial: Partial<ShoppingItem>): ShoppingItem {
  return {
    title: '',
    link: 'https://example.com',
    image: '',
    lprice: 0,
    hprice: 0,
    mallName: '',
    productId: '',
    productType: 1,
    ...partial,
  };
}

const trendingProduct = makeItem({
  title: 'QCY HT08 무선 이어폰 블루투스 노이즈캔슬링',
  cleanTitle: 'QCY HT08 무선 이어폰',
  lprice: 39900,
  hprice: 59900,
  mallName: '쿠팡',
  productId: 'hot-1',
  brand: 'QCY',
  maker: 'QCY',
  category1: '디지털/가전',
  category2: '음향가전',
  category3: '이어폰',
});

const merelyPopularProduct = makeItem({
  title: '일반 무선 이어폰 초특가 인기상품',
  cleanTitle: '일반 무선 이어폰',
  lprice: 9900,
  hprice: 0,
  mallName: '테스트스토어',
  productId: 'plain-1',
  category1: '디지털/가전',
});

const context = {
  keyword: '무선 이어폰 추천',
  intentPrimary: 'buy',
  totalHits: 8000,
  relatedKeywords: ['qcy ht08 추천', '무선 이어폰 노이즈캔슬링'],
  crossSourceSeeds: [{ seed: 'QCY HT08', sources: ['naver-shopping', 'youtube'], crossScore: 7 }],
  recency: { status: 'rising', ratio: 1.8 },
};

const hotScore = attachShoppingOpportunityScore(trendingProduct, context);
const plainScore = attachShoppingOpportunityScore(merelyPopularProduct, context);

assert('실시간·자동완성 신호 상품이 단순 인기상품보다 높은 점수', hotScore > plainScore, `${hotScore} <= ${plainScore}`);
assert('상승 수요 상품은 HOT 등급 가능', trendingProduct.opportunityGrade === 'HOT', `grade=${trendingProduct.opportunityGrade}`);
assert('작성 추천 문장이 생성됨',
  !!trendingProduct.writeRecommendation && /우선|후보|작성/.test(trendingProduct.writeRecommendation),
  trendingProduct.writeRecommendation);
assert('실시간 근거가 카드 데이터에 남음',
  (trendingProduct.opportunityReasons || []).some(r => r.includes('실시간 유행 시드')),
  JSON.stringify(trendingProduct.opportunityReasons));
assert('핫제품은 쇼핑 상품성 판정에서도 판매 가능 후보',
  trendingProduct.shoppingProductQuality?.isSaleableProduct === true
    && (trendingProduct.shoppingProductQuality?.hotSignalScore || 0) > 0,
  JSON.stringify(trendingProduct.shoppingProductQuality));

const ranked = rankShoppingOpportunities([merelyPopularProduct, trendingProduct], context, 2);
assert('랭킹 1위는 수요 근거가 있는 상품', ranked[0]?.productId === 'hot-1', ranked.map(i => i.productId).join(','));

const profileNoiseProduct = makeItem({
  title: '전영현 프로필 굿즈 이벤트 한정판',
  cleanTitle: '전영현 프로필 굿즈',
  lprice: 12000,
  hprice: 0,
  mallName: '테스트스토어',
  productId: 'noise-profile-1',
  category1: '기타',
  discoveryQuery: '전영현 프로필',
  discoverySource: 'trend-seed',
  discoveryReason: '실시간 이슈 혼입',
});
const profileNoiseContext = {
  keyword: '전영현 프로필',
  intentPrimary: 'info',
  totalHits: 9000,
  relatedKeywords: ['전영현 프로필', '전영현 나이'],
  crossSourceSeeds: [{ seed: '전영현 프로필', sources: ['news'], crossScore: 9 }],
  recency: { status: 'rising', ratio: 2.2 },
};
const profileNoiseQuality = judgeShoppingProductOpportunity(profileNoiseProduct, profileNoiseContext);
const profileNoiseScore = attachShoppingOpportunityScore(profileNoiseProduct, profileNoiseContext);
assert('프로필/뉴스성 비상품 키워드는 쇼핑커넥트 후보에서 차단',
  profileNoiseQuality.reject === true
    && profileNoiseProduct.opportunityGrade === 'LOW'
    && profileNoiseScore <= 34,
  `quality=${JSON.stringify(profileNoiseQuality)}, score=${profileNoiseScore}, grade=${profileNoiseProduct.opportunityGrade}`);

const crowdedSameSeedProducts = [
  ...Array.from({ length: 8 }, (_, i) => makeItem({
    ...trendingProduct,
    productId: `earbud-${i + 1}`,
    title: `QCY HT08 무선 이어폰 추천 ${i + 1}`,
    discoveryQuery: '무선 이어폰 추천',
    discoverySource: 'auto-discovery',
    opportunityScore: 90 - i,
    conversionScore: 50 - i,
  })),
  ...Array.from({ length: 4 }, (_, i) => makeItem({
    title: `접이식 캠핑 의자 추천 ${i + 1}`,
    cleanTitle: '접이식 캠핑 의자',
    lprice: 39000,
    hprice: 59000,
    mallName: '쿠팡',
    productId: `camping-${i + 1}`,
    category1: '스포츠/레저',
    category2: '캠핑',
    category3: '캠핑의자',
    discoveryQuery: '캠핑 의자 추천',
    discoverySource: 'auto-discovery',
    opportunityScore: 78 - i,
    conversionScore: 42 - i,
  })),
  ...Array.from({ length: 4 }, (_, i) => makeItem({
    title: `가정용 제습기 추천 ${i + 1}`,
    cleanTitle: '가정용 제습기',
    lprice: 129000,
    hprice: 179000,
    mallName: '네이버',
    productId: `dehumidifier-${i + 1}`,
    category1: '디지털/가전',
    category2: '생활가전',
    category3: '제습기',
    discoveryQuery: '가정용 제습기 추천',
    discoverySource: 'auto-discovery',
    opportunityScore: 74 - i,
    conversionScore: 36 - i,
  })),
];
const balancedCrowded = selectBalancedShoppingOpportunities(crowdedSameSeedProducts, 9, 3);
const balancedQueryCounts: Map<string, number> = balancedCrowded.reduce((acc, item) => {
  const key = item.discoveryQuery || 'unknown';
  acc.set(key, (acc.get(key) || 0) + 1);
  return acc;
}, new Map<string, number>());
const maxBalancedQueryCount = Math.max(...Array.from(balancedQueryCounts.values()));
assert('무입력 쇼핑 추천은 한 발견 쿼리에만 몰리지 않고 여러 글감으로 분산',
  balancedCrowded.length === 9
    && balancedCrowded[0]?.productId === 'earbud-1'
    && new Set(balancedCrowded.map(item => item.discoveryQuery)).size >= 3
    && maxBalancedQueryCount <= 3,
  Array.from(balancedQueryCounts.entries()).map(([k, v]) => `${k}:${v}`).join(', '));

const autoDiscoveredProduct = makeItem({
  title: '접이식 캠핑 의자 가벼운 1인용 로우체어',
  cleanTitle: '접이식 캠핑 의자',
  lprice: 34900,
  hprice: 49900,
  mallName: '쿠팡',
  productId: 'auto-camping-1',
  brand: '캠핑문',
  category1: '스포츠/레저',
  category2: '캠핑',
  category3: '캠핑의자',
  discoveryQuery: '캠핑 의자 추천',
  discoverySource: 'auto-discovery',
});
attachShoppingOpportunityScore(autoDiscoveredProduct, {
  keyword: '무선 이어폰 추천',
  intentPrimary: 'buy',
  totalHits: 5000,
  relatedKeywords: [],
  crossSourceSeeds: [],
  recency: { status: 'rising', ratio: 1.7 },
});
assert('무입력 확장 상품은 첫 시드가 아니라 발견된 시드 기준으로 추천문을 생성',
  (autoDiscoveredProduct.writeRecommendation || '').includes('"캠핑 의자 추천"') &&
    (autoDiscoveredProduct.opportunityReasons || []).some(r => r.includes('검색 키워드와 상품명이 직접 맞물림')),
  autoDiscoveredProduct.writeRecommendation);

const conversionOnlyProduct = makeItem({
  title: '무선 이어폰 추천 프리미엄 블루투스 이어폰',
  cleanTitle: '프리미엄 블루투스 이어폰',
  lprice: 59900,
  hprice: 89900,
  mallName: '쿠팡',
  productId: 'conversion-only',
  brand: 'TEST',
  maker: 'TEST',
  category1: '디지털/가전',
  category2: '음향가전',
  category3: '이어폰',
});
const conversionOnlyScore = attachShoppingOpportunityScore(conversionOnlyProduct, {
  keyword: '가성비 음향기기 추천',
  intentPrimary: 'buy',
  totalHits: 8000,
  relatedKeywords: [],
  crossSourceSeeds: [],
});
assert('전환 조건만 좋고 수요 근거가 없으면 작성 우선으로 승격하지 않음',
  conversionOnlyProduct.opportunityGrade === 'WATCH' && conversionOnlyScore <= 61,
  `grade=${conversionOnlyProduct.opportunityGrade}, score=${conversionOnlyScore}`);
assert('수요 근거 부족 사유가 남음',
  (conversionOnlyProduct.opportunityReasons || []).some(r => r.includes('수요 근거')),
  JSON.stringify(conversionOnlyProduct.opportunityReasons));
assert('상품마다 작성 판단 문장이 달라짐',
  trendingProduct.writeRecommendation !== conversionOnlyProduct.writeRecommendation,
  `${trendingProduct.writeRecommendation} / ${conversionOnlyProduct.writeRecommendation}`);

const deadProduct = makeItem({ ...trendingProduct, productId: 'dead-1' });
const deadScore = attachShoppingOpportunityScore(deadProduct, { ...context, recency: { status: 'dead', ratio: 0 } });
assert('검색 추세 사망은 강하게 감점', deadScore < hotScore - 20, `${deadScore} vs ${hotScore}`);

const nikeExpansion = deriveShoppingExpansionQueries('나이키', [], [], 8).map(q => q.query);
assert('브랜드 단독 검색도 같은 계열 대체 브랜드로 확장',
  nikeExpansion.some(q => /아디다스|푸마/.test(q)),
  nikeExpansion.join(', '));

const shoeExpansion = deriveShoppingExpansionQueries('운동화 추천', [], [], 8).map(q => q.query);
assert('카테고리 검색은 브랜드별 쇼핑 쿼리로 확장',
  shoeExpansion.some(q => /나이키|아디다스|뉴발란스/.test(q)),
  shoeExpansion.join(', '));

const nikeItem = makeItem({
  title: '나이키 에어맥스 270 운동화 남성 러닝화',
  cleanTitle: '나이키 에어맥스 270 운동화',
  brand: '나이키',
  category1: '패션잡화',
  category2: '신발',
  category3: '운동화',
});
const lewordSeeds = buildProductLeWordSeeds(nikeItem, '나이키', 6);
assert('제품 LEWORD 후보에 대체 브랜드 키워드 포함',
  lewordSeeds.some(seed => seed.relation === 'peer-brand' && /아디다스|푸마|뉴발란스/.test(seed.keyword)),
  lewordSeeds.map(seed => seed.keyword).join(', '));
const commerceIntentSeeds = buildProductLeWordSeeds(nikeItem, '나이키', 10);
assert('제품 LEWORD 후보는 제품군 순위/가격/가성비 구매 의도까지 확장',
  commerceIntentSeeds.some(seed => /운동화 순위/.test(seed.keyword))
    && commerceIntentSeeds.some(seed => /운동화 가격|운동화 가성비|운동화 구매처/.test(seed.keyword)),
  commerceIntentSeeds.map(seed => seed.keyword).join(', '));

const scoredSeed = scoreLeWordEntryKeyword({
  keyword: '아디다스 운동화 추천',
  relation: 'peer-brand',
  reason: '같은 계열 대체 브랜드 키워드',
}, 2400, 300);
assert('LEWORD 진입 후보는 검색량·문서수 기반으로 진입가능 판정',
  scoredSeed.verdict === '진입가능' && (scoredSeed.entryScore || 0) >= 70,
  JSON.stringify(scoredSeed));

const autoDiscoverySeeds = buildShoppingDiscoverySeeds({
  verified: [
    { keyword: '무선 이어폰 추천', category: '디지털', searchVolume: 2400, documentCount: 300, goldenRatio: 8 },
    { keyword: '캠핑 의자 추천', category: '캠핑', searchVolume: 1200, documentCount: 400, goldenRatio: 3 },
  ],
  dynamic: ['무선 이어폰 추천', '가정용 제습기'],
  staticGroups: [{ category: '🏠 생활', keywords: ['가정용 제습기', '커피머신'] }],
  limit: 5,
});
assert('무입력 쇼핑 발굴은 검증/동적/정적 시드를 합쳐 반환',
  autoDiscoverySeeds.length >= 3 &&
    autoDiscoverySeeds.some(s => s.source === 'verified') &&
    autoDiscoverySeeds.some(s => s.source === 'dynamic') &&
    autoDiscoverySeeds.some(s => s.source === 'static'),
  autoDiscoverySeeds.map(s => `${s.keyword}:${s.source}`).join(', '));
assert('무입력 쇼핑 발굴은 중복 키워드를 제거',
  autoDiscoverySeeds.filter(s => s.keyword === '무선 이어폰 추천').length === 1 &&
    autoDiscoverySeeds.filter(s => s.keyword === '가정용 제습기 추천').length === 1,
  autoDiscoverySeeds.map(s => s.keyword).join(', '));
assert('검증 황금 시드가 자동 발굴 우선순위 상단',
  autoDiscoverySeeds[0]?.keyword === '무선 이어폰 추천',
  autoDiscoverySeeds.map(s => `${s.keyword}:${s.priorityScore}`).join(', '));

assert('shopping discovery keeps existing shopping-intent queries unchanged',
  ensureShoppingDiscoveryIntentQuery('무선 이어폰 추천') === '무선 이어폰 추천',
  ensureShoppingDiscoveryIntentQuery('무선 이어폰 추천'));
assert('shopping discovery turns raw product nouns into bloggable intent queries',
  ensureShoppingDiscoveryIntentQuery('커피머신') === '커피머신 추천',
  ensureShoppingDiscoveryIntentQuery('커피머신'));
assert('no-keyword shopping discovery exposes writeable intent queries, not raw product nouns',
  autoDiscoverySeeds
    .filter(s => s.source === 'dynamic' || s.source === 'static')
    .every(s => /추천|비교|후기|리뷰|가성비|순위|가격|할인|구매|체크포인트|장단점/.test(s.keyword)),
  autoDiscoverySeeds.map(s => `${s.keyword}:${s.source}`).join(', '));

const defaultAutoDiscoverySeeds = buildShoppingDiscoverySeeds({
  staticGroups: getStaticShoppingSuggestions(6),
});
assert('무입력 쇼핑 발굴 기본값은 최소 30개 시드를 확보',
  defaultAutoDiscoverySeeds.length >= SHOPPING_AUTO_DISCOVERY_MIN_SEEDS,
  `${defaultAutoDiscoverySeeds.length} < ${SHOPPING_AUTO_DISCOVERY_MIN_SEEDS}`);
assert('무입력 쇼핑 발굴 기본 시드는 카테고리 다양성을 확보',
  new Set(defaultAutoDiscoverySeeds.map(s => s.category).filter(Boolean)).size >= 8,
  defaultAutoDiscoverySeeds.map(s => `${s.keyword}:${s.category}`).join(', '));

const crowdedVerifiedAutoDiscovery = buildShoppingDiscoverySeeds({
  verified: Array.from({ length: 40 }, (_, i) => ({
    keyword: `무선 이어폰 자동발굴 후보 ${i + 1}`,
    category: '디지털/가전',
    searchVolume: 3000 + i,
    documentCount: 500 + i,
    goldenRatio: 6,
  })),
  staticGroups: getStaticShoppingSuggestions(4),
  limit: 30,
});
const crowdedCategoryCounts = crowdedVerifiedAutoDiscovery.reduce((acc, seed) => {
  const key = seed.category || seed.source;
  acc.set(key, (acc.get(key) || 0) + 1);
  return acc;
}, new Map<string, number>());
assert('shopping auto discovery balances categories even when verified cache is crowded',
  crowdedVerifiedAutoDiscovery.length === 30
    && new Set(crowdedVerifiedAutoDiscovery.map(s => s.category).filter(Boolean)).size >= 8
    && (crowdedCategoryCounts.get('디지털/가전') || 0) <= 3,
  Array.from(crowdedCategoryCounts.entries()).map(([k, v]) => `${k}:${v}`).join(', '));

assert('shopping auto discovery limit floors external small requests to 30',
  normalizeShoppingAutoDiscoveryLimit(10) === SHOPPING_AUTO_DISCOVERY_MIN_SEEDS,
  `${normalizeShoppingAutoDiscoveryLimit(10)}`);
assert('shopping auto discovery limit caps runaway requests at 60',
  normalizeShoppingAutoDiscoveryLimit(1000) === SHOPPING_AUTO_DISCOVERY_MAX_SEEDS,
  `${normalizeShoppingAutoDiscoveryLimit(1000)}`);
assert('shopping auto discovery searches most of the 30 seed pool',
  getShoppingAutoDiscoveryExpansionLimit(30, 30) >= 29
    && getShoppingAutoDiscoverySearchLimit(30, 30) >= 24,
  `expand=${getShoppingAutoDiscoveryExpansionLimit(30, 30)}, search=${getShoppingAutoDiscoverySearchLimit(30, 30)}`);
assert('shopping auto discovery keeps 30 final recommendations instead of collapsing to direct-search 10',
  getShoppingRecommendationLimit(true, 30) === 30
    && getShoppingRecommendationLimit(true, 10) === SHOPPING_AUTO_DISCOVERY_MIN_SEEDS
    && getShoppingRecommendationLimit(false, 10) === SHOPPING_AUTO_DISCOVERY_MIN_SEEDS
    && getShoppingRecommendationLimit(false, 60) === 60,
  `auto30=${getShoppingRecommendationLimit(true, 30)}, auto10=${getShoppingRecommendationLimit(true, 10)}, direct10=${getShoppingRecommendationLimit(false, 10)}, direct60=${getShoppingRecommendationLimit(false, 60)}`);
assert('shopping opportunity helpers tolerate missing array inputs',
  deriveShoppingExpansionQueries('무선 이어폰 추천', undefined as any, undefined as any, 4).length >= 0
    && rankShoppingOpportunities(undefined as any, context, 5).length === 0
    && selectBalancedShoppingOpportunities(undefined as any, 5).length === 0,
  'shopping helpers should not throw on missing array inputs');

console.log(`\n[shopping-opportunity.test] passed: ${passed} / failed: ${failed}`);
if (failed > 0) {
  failures.forEach(f => console.error('  ' + f));
  process.exit(1);
}
process.exit(0);
