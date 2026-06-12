/**
 * Guards the precise rich golden feed against returning fewer than 30 rows
 * after the final SSR/SSS-only filter.
 */

import {
  RichKeywordRow,
  selectPrecisionRowsWithBackfill,
} from '../sources/rich-feed-builder';

let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(name: string, cond: boolean, detail?: string) {
  if (cond) {
    passed++;
  } else {
    failed++;
    failures.push(`FAIL ${name}${detail ? ' - ' + detail : ''}`);
  }
}

function row(keyword: string, categoryId: string, grade: RichKeywordRow['grade'], rank = 1): RichKeywordRow {
  return {
    rank,
    keyword,
    category: categoryId,
    categoryId,
    categoryIcon: '#',
    grade,
    searchVolume: 1200,
    documentCount: 520,
    goldenRatio: 2.31,
    cpc: null,
    freshness: 'STABLE',
    sources: ['test'],
    sourceCount: 1,
    purchaseIntent: 55,
    isBlueOcean: true,
    bloggerWritability: 72,
  };
}

const categories = ['health', 'finance', 'policy', 'travel', 'tech', 'shopping'];
const primaryRows = [
  row('health seed primary', 'health', 'SSS'),
  row('finance seed primary', 'finance', 'SSR'),
];

const backupRows: RichKeywordRow[] = [];
for (const categoryId of categories) {
  for (let i = 0; i < 6; i++) {
    backupRows.push(row(`${categoryId} longtail ${i + 1}`, categoryId, i % 3 === 0 ? 'SS' : i % 3 === 1 ? 'S' : 'A', i + 10));
  }
}

const result = selectPrecisionRowsWithBackfill(primaryRows, backupRows, {
  minReturnCount: 30,
  selectedCategoryIds: categories,
  minPerSelectedCategory: 5,
  excludedKeywords: new Set(['policy longtail 1']),
});

assert('precise mode returns at least 30 rows after backfill', result.length >= 30, `${result.length}`);
assert('primary SSR/SSS rows are kept first', result[0]?.keyword === 'health seed primary' && result[1]?.keyword === 'finance seed primary');
assert('excluded keyword is not backfilled', !result.some(r => r.keyword === 'policy longtail 1'));
assert('backfill does not fake-promote rows to SSS', result.filter(r => r.grade === 'SSS' || r.grade === 'SSR').length === 2);
for (const categoryId of categories) {
  const count = result.filter(r => r.categoryId === categoryId).length;
  assert(`selected category floor ${categoryId}`, count >= 5, `${count}`);
}

const realLogLikePrimary = [
  row('비렌느 스팟엑스 후기', 'beauty', 'SSS'),
  row('도미나크림 가격', 'beauty', 'SSS'),
  row('병원비 환급금 조회', 'health', 'SSR'),
];
const realLogLikeBackup: RichKeywordRow[] = [];
const pushRealLogRows = (prefix: string, grade: RichKeywordRow['grade'], count: number, offset: number) => {
  for (let i = 0; i < count; i++) {
    const r = row(`${prefix} ${i + 1}`, i % 2 === 0 ? 'beauty' : 'health', grade, offset + i);
    r.searchVolume = 800 + i * 40;
    r.documentCount = 180 + i * 7;
    r.goldenRatio = Number((r.searchVolume / r.documentCount).toFixed(2));
    r.bloggerWritability = 68;
    realLogLikeBackup.push(r);
  }
};
pushRealLogRows('실측 SS 후보', 'SS', 15, 100);
pushRealLogRows('실측 S 후보', 'S', 11, 200);
pushRealLogRows('실측 A 후보', 'A', 8, 300);

const realLogLikeResult = selectPrecisionRowsWithBackfill(realLogLikePrimary, realLogLikeBackup, {
  minReturnCount: 30,
  selectedCategoryIds: ['beauty', 'health'],
  minPerSelectedCategory: 5,
  excludedKeywords: new Set(),
});

assert('real app log scenario fills 30 from measured SS/S/A candidates',
  realLogLikeResult.length === 30,
  `${realLogLikeResult.length}`);
assert('real app log scenario marks lower-grade rows as precision backfill',
  realLogLikeResult.filter(r => r.precisionBackfill).length >= 27,
  `${realLogLikeResult.filter(r => r.precisionBackfill).length}`);

const estimatedFashionSeed: RichKeywordRow = {
  ...row('원피스 추천', 'shopping', 'A'),
  searchVolume: 360,
  documentCount: 180,
  goldenRatio: 2,
  dcEstimated: true,
  sources: ['datalab-shopping-expanded', 'fashion'],
  sourceCount: 2,
  bloggerWritability: 80,
};

const unmarkedHalfSvFallback: RichKeywordRow = {
  ...row('여름 원피스 추천', 'shopping', 'A'),
  searchVolume: 360,
  documentCount: 180,
  goldenRatio: 2,
  dcEstimated: false,
  bloggerWritability: 80,
};

const blockedBackfill = selectPrecisionRowsWithBackfill([], [estimatedFashionSeed, unmarkedHalfSvFallback], {
  minReturnCount: 2,
  selectedCategoryIds: ['shopping'],
  minPerSelectedCategory: 1,
  excludedKeywords: new Set(),
});

assert('precision backfill rejects estimated/fallback document counts',
  blockedBackfill.length === 0,
  blockedBackfill.map(r => `${r.keyword}:${r.documentCount}`).join(','));

console.log(`\n[rich-feed-precision-floor.test] passed: ${passed} / failed: ${failed}`);
if (failed > 0) {
  failures.forEach(f => console.error('  ' + f));
  process.exit(1);
}
process.exit(0);
