/**
 * v2.43.39 도메인-suffix 매칭 검증
 * 실행: npx ts-node --transpile-only scripts/test-domain-suffix.ts
 */
import { getCurrentSeasonalSeeds, expandWithIntentSuffixes, getSeedDomainBreakdown } from '../src/utils/sources/seasonal-calendar';

const seeds = getCurrentSeasonalSeeds();
console.log(`\n=== ${new Date().getMonth() + 1}월 시즌 시드: ${seeds.length}개 ===\n`);

// 도메인 분류 결과
const breakdown = getSeedDomainBreakdown(seeds);
for (const [domain, list] of Object.entries(breakdown)) {
  if (list.length === 0) continue;
  console.log(`[${domain}] ${list.length}개`);
  for (const k of list.slice(0, 5)) console.log(`  · ${k}`);
  if (list.length > 5) console.log(`  ... +${list.length - 5}개`);
  console.log();
}

// suffix 확장 결과 샘플
console.log('=== suffix 확장 샘플 (시드 5개) ===\n');
const sample = seeds.slice(0, 5);
const expanded = expandWithIntentSuffixes(sample, 8);
console.log(`${sample.length}개 시드 → ${expanded.length}개 longtail\n`);

let lastSeed = '';
for (const exp of expanded) {
  const seed = sample.find(s => exp.startsWith(s));
  if (seed && seed !== lastSeed) {
    console.log(`\n[${seed}]`);
    lastSeed = seed;
  }
  console.log(`  · ${exp}`);
}

// 전체 확장 통계
const full = expandWithIntentSuffixes(seeds, 8);
console.log(`\n=== 전체 통계 ===`);
console.log(`시드 ${seeds.length}개 → longtail ${full.length}개 (배율 ${(full.length / seeds.length).toFixed(1)}x)`);

// 의미 충돌 검증 (이전 버전 문제 사례)
const problemCases = [
  '독립운동가 수수료',
  '3.1절 의미 가격',
  '한글날 의미 안 됨',
  '광복절 의미 수수료',
];
console.log('\n=== 의미 충돌 사례 검증 ===');
for (const p of problemCases) {
  const found = full.includes(p);
  console.log(`  ${found ? '❌' : '✅'} ${p} ${found ? '(여전히 생성됨)' : '(차단됨)'}`);
}
