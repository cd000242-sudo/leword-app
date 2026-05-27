/**
 * datalab-shopping-trend 모듈 실측 검증
 * 캡처된 endpoint 가 우리 함수로도 작동하는지 확인
 */
import * as fs from 'fs';
import * as path from 'path';

const OUT = path.join(__dirname, '..', 'tmp-datalab-verify.log');
const log = (s: string) => { process.stdout.write(s + '\n'); fs.appendFileSync(OUT, s + '\n', 'utf-8'); };

async function main(): Promise<void> {
  fs.writeFileSync(OUT, '', 'utf-8');
  log('\n=== datalab-shopping-trend 실측 검증 ===\n');

  const { fetchTopKeywordsByCategory, fetchAllShoppingTrendKeywords, SHOPPING_CATEGORIES } = await import('../src/utils/sources/datalab-shopping-trend');

  // 1. 단일 카테고리 (패션의류)
  log('1. 단일 카테고리 50000000 (패션의류) top 20...');
  const single = await fetchTopKeywordsByCategory('50000000', 20);
  log(`   → ${single.length}개 키워드`);
  for (const k of single.slice(0, 10)) {
    log(`     ${k.rank}. ${k.keyword}`);
  }
  log('');

  // 2. 모든 카테고리
  log(`2. 전체 ${SHOPPING_CATEGORIES.length} 카테고리 top 15 (총 약 ${SHOPPING_CATEGORIES.length * 15}개)...`);
  const all = await fetchAllShoppingTrendKeywords(15);
  log(`   → 총 ${all.length}개 키워드 수집`);

  // 카테고리별 분포
  const byCategory: Record<string, number> = {};
  for (const k of all) {
    byCategory[k.categoryName] = (byCategory[k.categoryName] || 0) + 1;
  }
  log(`   카테고리별 분포:`);
  for (const [name, count] of Object.entries(byCategory)) {
    log(`     ${name}: ${count}개`);
  }
  log('');

  // 샘플 — 카테고리별 top 3
  log(`3. 카테고리별 top 3 샘플:`);
  for (const cat of SHOPPING_CATEGORIES) {
    const items = all.filter(k => k.cid === cat.cid).slice(0, 3);
    log(`   ${cat.name}: ${items.map(k => k.keyword).join(' / ')}`);
  }
}

main().catch(e => { console.error('FATAL:', e?.message || e); process.exit(1); });
