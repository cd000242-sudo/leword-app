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

console.log(`\n[rich-feed-precision-floor.test] passed: ${passed} / failed: ${failed}`);
if (failed > 0) {
  failures.forEach(f => console.error('  ' + f));
  process.exit(1);
}
process.exit(0);
