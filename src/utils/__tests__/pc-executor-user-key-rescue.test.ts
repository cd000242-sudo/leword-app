/**
 * pc-executor-user-key-rescue 회귀 — 사용자 API 키 실측 0건 시 서버 키 구조 실측.
 *
 * 배경(2026-07-20): 브라우저 환경설정에 죽은 네이버 API 키가 저장되면 사용자 키가
 * 서버의 살아있는 키를 통째로 덮어써 문서수 401 전멸 → 키워드 분석기가 빈 결과.
 *
 * 고정하는 계약 (차원 단위 rescue):
 * 1. 사용자 네이버 키 오버라이드 없음 → 병합 어댑터 그대로 (서버 키 어댑터 호출 0회)
 * 2. 검색량·문서수 두 차원 모두 1건 이상 실측 → 구조 실측 안 함 (사용자 쿼터 존중)
 * 3. 문서수 차원 전멸(죽은 OpenAPI 키 401 시나리오) → 서버 키 재실측 + 증거 태그
 * 4. 검색량 차원 전멸 → 서버 키 재실측
 * 5. lt10 구간 플래그는 검색량 실측 신호로 인정 (재실측 낭비 금지)
 */

import { createUserKeyRescueMetricsAdapter } from '../../mobile/pc-engine-executor';
import type { MobileKeywordMetric } from '../../mobile/contracts';

function assert(name: string, condition: boolean, detail?: string): void {
  if (!condition) {
    console.error(`[pc-executor-user-key-rescue.test] failed: ${name}${detail ? ` - ${detail}` : ''}`);
    process.exit(1);
  }
}

function metric(overrides: Partial<MobileKeywordMetric>): MobileKeywordMetric {
  return {
    keyword: '테스트 키워드',
    rank: 1,
    grade: '-',
    score: 0,
    totalSearchVolume: null,
    pcSearchVolume: null,
    mobileSearchVolume: null,
    documentCount: null,
    goldenRatio: null,
    source: 'test',
    intent: 'requested-keyword',
    categoryId: 'auto',
    evidence: [],
    isMeasured: false,
    ...overrides,
  } as MobileKeywordMetric;
}

const context = {
  signal: new AbortController().signal,
  progress: () => undefined,
};

async function run(): Promise<void> {
  let passed = 0;
  const ok = (name: string, condition: boolean, detail?: string) => {
    assert(name, condition, detail);
    passed += 1;
  };

  // 1. 오버라이드 없음 → 병합 어댑터 결과 그대로, 서버 키 어댑터 호출 없음
  {
    let baseCalls = 0;
    const mergedRows = [metric({ keyword: '무신호', totalSearchVolume: null, documentCount: null })];
    const adapter = createUserKeyRescueMetricsAdapter(
      async (rows) => mergedRows,
      async (rows) => { baseCalls += 1; return rows; },
      false,
    );
    const out = await adapter([metric({})], context);
    ok('no override keeps merged result untouched', out === mergedRows && baseCalls === 0);
  }

  // 2. 두 차원 모두 어딘가에서 실측 성공 → 구조 실측 안 함
  {
    let baseCalls = 0;
    const adapter = createUserKeyRescueMetricsAdapter(
      async () => [
        metric({ keyword: '검색량만', totalSearchVolume: 570, documentCount: null }),
        metric({ keyword: '문서수만', totalSearchVolume: null, documentCount: 42 }),
      ],
      async (rows) => { baseCalls += 1; return rows; },
      true,
    );
    const out = await adapter([metric({})], context);
    ok('both dimensions measured somewhere skips rescue', baseCalls === 0 && out.length === 2);
  }

  // 3. 문서수 차원 전멸 (죽은 OpenAPI 키 401 시나리오 — 검색량은 정상)
  {
    let baseCalls = 0;
    const adapter = createUserKeyRescueMetricsAdapter(
      async (rows) => rows.map((row) => ({ ...row, totalSearchVolume: 570, documentCount: null })),
      async (rows) => {
        baseCalls += 1;
        return rows.map((row) => ({ ...row, totalSearchVolume: 570, documentCount: 123 }));
      },
      true,
    );
    const out = await adapter([metric({ keyword: '메가 라이츄 졸업스킬' })], context);
    ok('document-dimension blackout triggers server-key rescue',
      baseCalls === 1 && out[0].totalSearchVolume === 570 && out[0].documentCount === 123);
    ok('rescued rows carry the rescue evidence tag',
      (out[0].evidence || []).includes('server-key-rescue-after-user-key-zero-measurement'));
  }

  // 4. 검색량 차원 전멸 → 재실측
  {
    let baseCalls = 0;
    const adapter = createUserKeyRescueMetricsAdapter(
      async (rows) => rows.map((row) => ({ ...row, totalSearchVolume: null, documentCount: 42 })),
      async (rows) => { baseCalls += 1; return rows; },
      true,
    );
    await adapter([metric({})], context);
    ok('volume-dimension blackout triggers server-key rescue', baseCalls === 1);
  }

  // 5. lt10 플래그는 검색량 실측 신호 (문서수도 실측되어 있으면 재실측 안 함)
  {
    let baseCalls = 0;
    const adapter = createUserKeyRescueMetricsAdapter(
      async (rows) => rows.map((row) => ({ ...row, pcSearchVolumeLt10: true, mobileSearchVolumeLt10: true, documentCount: 7 })),
      async (rows) => { baseCalls += 1; return rows; },
      true,
    );
    await adapter([metric({})], context);
    ok('lt10-range flags count as a volume signal', baseCalls === 0);
  }

  console.log(`[pc-executor-user-key-rescue.test] passed: ${passed} / failed: 0`);
  process.exit(0); // 무거운 모듈 임포트가 남기는 핸들(브라우저 풀 등) 때문에 명시 종료
}

run().catch((err) => {
  console.error('[pc-executor-user-key-rescue.test] FAILED:', (err as Error).message);
  process.exit(1);
});
