/**
 * 쇼핑 커넥트 블로그 생성기 단위 테스트
 * 실행: npx ts-node --transpile-only scripts/test-shopping-generator.ts
 */
import {
  extractLongtailKeywords,
  generateTitleCandidates,
  analyzePrices,
  generateBlogDraft,
  enrichShoppingResult,
} from '../src/utils/shopping-blog-generator';
import type { ShoppingItem } from '../src/utils/naver-shopping-api';

let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(cond: any, name: string) {
  if (cond) passed++;
  else {
    failed++;
    failures.push(`❌ ${name}`);
    console.log(`  ❌ ${name}`);
  }
}

function eq<T>(a: T, b: T, name: string) {
  assert(a === b, `${name} (got ${JSON.stringify(a)}, expected ${JSON.stringify(b)})`);
}

function mockItem(overrides: Partial<ShoppingItem> = {}): ShoppingItem {
  return {
    title: '샘플 무선 이어폰 노이즈캔슬링',
    link: 'https://example.com/1',
    image: 'https://example.com/1.jpg',
    lprice: 50000,
    hprice: 70000,
    mallName: '쿠팡',
    productId: '1',
    productType: 1,
    brand: '샘플브랜드',
    maker: '샘플제조',
    category1: '디지털/가전',
    category2: '음향기기',
    category3: '이어폰',
    ...overrides,
  };
}

console.log('\n=== 쇼핑 블로그 생성기 테스트 ===\n');

// [1] 롱테일 키워드 추출
console.log('[1] extractLongtailKeywords');
const items: ShoppingItem[] = [
  mockItem({ title: '무선 이어폰 블루투스 노이즈캔슬링 프리미엄' }),
  mockItem({ title: '무선 이어폰 블루투스 통화품질 좋은 제품' }),
  mockItem({ title: '유선 이어폰 젠더 지원' }),
];
const keywords = extractLongtailKeywords(items, 10);
assert(Array.isArray(keywords), 'Array 반환');
assert(keywords.length > 0, '빈 배열 아님');
assert(keywords.includes('이어폰'), '반복 단어 "이어폰" 포함');
assert(keywords[0] === '이어폰', '최다 빈도가 첫 번째');

// [2] 제목 후보 3개 생성
console.log('\n[2] generateTitleCandidates');
const titles = generateTitleCandidates('무선이어폰', items);
eq(titles.length, 3, '제목 3개 생성');
assert(titles.every(t => t.includes('무선이어폰')), '모든 제목에 키워드 포함');
const year = new Date().getFullYear();
assert(titles.some(t => t.includes(String(year))), '연도 포함 제목');
assert(titles.some(t => t.includes('가이드')), '가이드 스타일 포함');

// [3] 가격 분석
console.log('\n[3] analyzePrices');
const priceItems: ShoppingItem[] = [
  mockItem({ lprice: 10000 }),
  mockItem({ lprice: 20000 }),
  mockItem({ lprice: 30000 }),
  mockItem({ lprice: 40000 }),
  mockItem({ lprice: 50000 }),
];
const analysis = analyzePrices(priceItems);
eq(analysis.min, 10000, 'min');
eq(analysis.max, 50000, 'max');
eq(analysis.median, 30000, 'median');
eq(analysis.avg, 30000, 'avg');
assert(analysis.mallDistribution.length > 0, '판매처 분포');

// 빈 배열 edge case
const emptyAnalysis = analyzePrices([]);
eq(emptyAnalysis.min, 0, '빈 배열 min=0');
eq(emptyAnalysis.mallDistribution.length, 0, '빈 배열 판매처 없음');

// [4] 블로그 초안
console.log('\n[4] generateBlogDraft');
const draft = generateBlogDraft('무선이어폰', items, items.slice(0, 3));
assert(draft.includes('# 📝'), '제목 헤더');
assert(draft.includes('## 🎯 들어가며'), '도입부 섹션');
assert(draft.includes('## 🏆'), '추천 섹션');
assert(draft.includes('## 📊'), '비교표 섹션');
assert(draft.includes('## 💡'), '상세 리뷰 섹션');
assert(draft.includes('## 🎁'), '구매 가이드 섹션');
assert(draft.includes('## 🎉'), '마무리 섹션');
assert(draft.includes('🏷️ **태그**'), '태그 섹션');
assert(draft.length > 500, '초안 최소 500자 이상');
assert(draft.includes('무선이어폰'), '키워드 포함');
assert(draft.includes('쿠팡'), '판매처 포함');

// [5] enrichShoppingResult 통합
console.log('\n[5] enrichShoppingResult');
const enriched = enrichShoppingResult('무선이어폰', items, items.slice(0, 3));
assert(enriched.titleCandidates.length === 3, '제목 3개');
assert(enriched.longtailKeywords.length > 0, '키워드 있음');
assert(enriched.priceAnalysis.median > 0, '가격 분석');
assert(enriched.blogDraftMarkdown.length > 500, '초안 생성');

// [6] 결정성
console.log('\n[6] 결정성 (같은 입력 → 같은 출력)');
const a = generateBlogDraft('테스트', items, items);
const b = generateBlogDraft('테스트', items, items);
assert(a === b, '같은 입력은 같은 출력');

console.log('\n' + '='.repeat(50));
console.log(`결과: ${passed} 통과 / ${failed} 실패`);
if (failed > 0) {
  console.log('\n[실패]');
  failures.forEach(f => console.log(f));
  process.exit(1);
}
console.log('\n✅ 모든 테스트 통과');
process.exit(0);
