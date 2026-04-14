/**
 * 쇼핑 키워드 분석기 단위 테스트 (v2.2.6)
 * 실행: npx ts-node --transpile-only scripts/test-shopping-analyzer.ts
 */
import {
  extractLongtailKeywords,
  extractCategoryKeywords,
  extractBrandKeywords,
  extractPriceTierKeywords,
  analyzePrices,
  analyzeCompetition,
  analyzeShoppingKeywords,
} from '../src/utils/shopping-keyword-analyzer';
import type { ShoppingItem } from '../src/utils/naver-shopping-api';

let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(cond: any, name: string) {
  if (cond) passed++;
  else {
    failed++;
    failures.push(name);
    console.log(`  ❌ ${name}`);
  }
}

function item(overrides: Partial<ShoppingItem> = {}): ShoppingItem {
  return {
    title: '샘플 상품',
    link: 'https://example.com',
    image: 'https://example.com/img.jpg',
    lprice: 10000,
    hprice: 0,
    mallName: '쿠팡',
    productId: '1',
    productType: 1,
    ...overrides,
  };
}

console.log('\n=== 쇼핑 키워드 분석기 테스트 ===\n');

// [1] 롱테일 키워드
console.log('[1] extractLongtailKeywords');
const items1 = [
  item({ title: '무선 이어폰 블루투스 노이즈캔슬링' }),
  item({ title: '무선 이어폰 블루투스 고음질' }),
  item({ title: '유선 이어폰 3.5mm 노이즈캔슬링' }),
];
const kw = extractLongtailKeywords(items1, 10);
assert(kw.length > 0, '키워드 반환');
assert(kw[0].keyword === '이어폰', '최다 빈도 "이어폰"');
assert(kw[0].count === 3, '이어폰 빈도 3');
assert(kw.some(k => k.keyword === '블루투스' && k.count === 2), '블루투스 빈도 2');
assert(kw.every(k => k.keyword.length >= 2), '모든 키워드 2자 이상');

// [2] 카테고리 분석
console.log('\n[2] extractCategoryKeywords');
const items2 = [
  item({ category1: '디지털/가전', category2: '음향기기', category3: '이어폰' }),
  item({ category1: '디지털/가전', category2: '음향기기', category3: '헤드폰' }),
  item({ category1: '디지털/가전', category2: '컴퓨터', category3: '노트북' }),
];
const cats = extractCategoryKeywords(items2);
assert(cats.level1.length === 1, 'level1 1개');
assert(cats.level1[0].name === '디지털/가전', 'level1 이름');
assert(cats.level1[0].pct === 100, 'level1 100%');
assert(cats.level2.length === 2, 'level2 2개');

// [3] 브랜드 분석
console.log('\n[3] extractBrandKeywords');
const items3 = [
  item({ brand: '소니', lprice: 100000 }),
  item({ brand: '소니', lprice: 200000 }),
  item({ brand: '보스', lprice: 300000 }),
  item({ maker: 'LG', lprice: 150000 }),
];
const brands = extractBrandKeywords(items3);
assert(brands.length === 3, '브랜드 3개');
assert(brands[0].brand === '소니', '최다 소니');
assert(brands[0].count === 2, '소니 2개');
assert(brands[0].avgPrice === 150000, '소니 평균가');

// [4] 가격대별 키워드
console.log('\n[4] extractPriceTierKeywords');
const items4 = [
  item({ title: '저가 모델 A', lprice: 5000 }),
  item({ title: '저가 모델 B', lprice: 6000 }),
  item({ title: '중가 모델 C', lprice: 50000 }),
  item({ title: '중가 모델 D', lprice: 60000 }),
  item({ title: '고가 프리미엄', lprice: 300000 }),
  item({ title: '고가 프리미엄 EX', lprice: 400000 }),
];
const tiers = extractPriceTierKeywords(items4);
assert(tiers.low.length > 0, '저가 키워드 있음');
assert(tiers.mid.length > 0, '중가 키워드 있음');
assert(tiers.high.length > 0, '고가 키워드 있음');
assert(tiers.boundaries.lowMax > 0, 'lowMax 경계 존재');

// [5] 경쟁도
console.log('\n[5] analyzeCompetition');
const items5 = [
  item({ brand: 'A', mallName: '쿠팡' }),
  item({ brand: 'B', mallName: '쿠팡' }),
  item({ brand: 'A', mallName: '네이버' }),
];
const comp1 = analyzeCompetition(items5, 300);
assert(comp1.verdict === '저경쟁 (블루오션)', '300개 → 저경쟁');
assert(comp1.uniqueBrands === 2, '고유 브랜드 2');
assert(comp1.uniqueMalls === 2, '고유 판매처 2');

const comp2 = analyzeCompetition(items5, 10000);
assert(comp2.verdict === '과점' || comp2.verdict === '고경쟁', '10000개 → 고경쟁/과점');

// [6] 가격 분석
console.log('\n[6] analyzePrices');
const items6 = [
  item({ lprice: 10000 }),
  item({ lprice: 20000 }),
  item({ lprice: 30000 }),
];
const pa = analyzePrices(items6);
assert(pa.min === 10000, 'min');
assert(pa.max === 30000, 'max');
assert(pa.median === 20000, 'median');
assert(pa.mallDistribution.length > 0, '판매처 분포');
assert(pa.mallDistribution[0].pct === 100, '쿠팡 100%');

// [7] 통합 analyze
console.log('\n[7] analyzeShoppingKeywords');
const insight = analyzeShoppingKeywords(items1, 500);
assert(insight.longtailKeywords.length > 0, '롱테일');
assert(insight.competition.verdict, '경쟁도');
assert(insight.priceAnalysis.median >= 0, '가격 분석');

// [8] 결정성
console.log('\n[8] 결정성');
const a = analyzeShoppingKeywords(items1, 500);
const b = analyzeShoppingKeywords(items1, 500);
assert(JSON.stringify(a) === JSON.stringify(b), '같은 입력 → 같은 출력');

// [9] 블로그 관련 필드 없음 검증 (스코프 준수)
console.log('\n[9] 스코프: 블로그 생성 필드 부재');
assert(!('titleCandidates' in insight), 'titleCandidates 필드 없음');
assert(!('blogDraftMarkdown' in insight), 'blogDraftMarkdown 필드 없음');

console.log('\n' + '='.repeat(50));
console.log(`결과: ${passed} 통과 / ${failed} 실패`);
if (failed > 0) {
  console.log('\n[실패]');
  failures.forEach(f => console.log('  ' + f));
  process.exit(1);
}
console.log('\n✅ 모든 테스트 통과');
process.exit(0);
