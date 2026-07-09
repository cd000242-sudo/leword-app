/**
 * vacancy-enricher.test.ts
 *
 * C4 slice2 빈집(vacancy) enricher(../pro-hunter-v12/vacancy-enricher)의 오케스트레이션
 * (topN 제한·dedup·graceful 폴백·신뢰성 판정)을 mock analyzer 로 고정. 네트워크 없이 결정론 검증.
 */
import {
  enrichKeywordsWithVacancy,
  isVacancyReliable,
  unreliableVacancy,
  VACANCY_MAX_TOP_N,
} from '../pro-hunter-v12/vacancy-enricher';
import type { VacancyResult } from '../pro-hunter-v12/vacancy-detector';

let passed = 0;
let failed = 0;
const failures: string[] = [];
function assert(name: string, cond: boolean, detail?: string) {
  if (cond) passed++;
  else { failed++; failures.push(`FAIL ${name}${detail ? ' - ' + detail : ''}`); }
}
const eq = (name: string, got: unknown, want: unknown) =>
  assert(name, got === want, `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

function okVacancy(keyword: string, slots: number): VacancyResult {
  return {
    keyword, totalSlotsAnalyzed: 10, influencerCount: 1, bigDomainCount: 2,
    vacancySlots: slots, freshnessGap: 3, suggestedAction: 'write', domains: [], serpVersion: '2026-04',
  };
}

async function run() {
  // ── topN 제한 ──
  const kws15 = Array.from({ length: 15 }, (_, i) => `kw${i}`);
  let calls = 0;
  const map3 = await enrichKeywordsWithVacancy(kws15, {
    topN: 3, concurrency: 2, analyzer: async (kw) => { calls++; return okVacancy(kw, 4); },
  });
  eq('topN=3 → 3개', map3.size, 3);
  eq('analyzer 3회', calls, 3);
  eq('kw0 vacancySlots', map3.get('kw0')?.vacancySlots, 4);
  eq('kw3 미분석', map3.get('kw3'), undefined);

  // ── 상한 클램프 ──
  const kws50 = Array.from({ length: 50 }, (_, i) => `k${i}`);
  const mapCap = await enrichKeywordsWithVacancy(kws50, { topN: 999, analyzer: async (kw) => okVacancy(kw, 2) });
  eq('topN 상한 클램프', mapCap.size, VACANCY_MAX_TOP_N);

  // ── dedup ──
  let dupCalls = 0;
  const mapDup = await enrichKeywordsWithVacancy(['a', 'a', '  ', 'b'], {
    topN: 10, analyzer: async (kw) => { dupCalls++; return okVacancy(kw, 1); },
  });
  eq('dedup 후 2개', mapDup.size, 2);
  eq('dedup analyzer 2회', dupCalls, 2);

  // ── graceful 폴백: throw → unreliable(vacancySlots:null) ──
  const mapFail = await enrichKeywordsWithVacancy(['x', 'y'], {
    topN: 10, analyzer: async (kw) => { if (kw === 'x') throw new Error('net'); return okVacancy(kw, 5); },
  });
  eq('실패 키워드 vacancySlots null', mapFail.get('x')?.vacancySlots as unknown, null);
  eq('실패 키워드 신뢰불가', isVacancyReliable(mapFail.get('x')), false);
  eq('성공 키워드 신뢰가능', isVacancyReliable(mapFail.get('y')), true);

  // ── 빈 입력 ──
  const empty = await enrichKeywordsWithVacancy([], { analyzer: async (kw) => okVacancy(kw, 1) });
  eq('빈 입력 → 빈 맵', empty.size, 0);

  // ── isVacancyReliable / unreliableVacancy ──
  eq('reliable: 숫자 슬롯', isVacancyReliable(okVacancy('a', 0)), true);
  eq('reliable: undefined false', isVacancyReliable(undefined), false);
  eq('unreliableVacancy 는 신뢰불가', isVacancyReliable(unreliableVacancy('a')), false);

  console.log(`\n[vacancy-enricher.test] passed: ${passed} / failed: ${failed}`);
  if (failed > 0) {
    failures.forEach((f) => console.error('  ' + f));
    process.exit(1);
  }
  process.exit(0);
}

run();
