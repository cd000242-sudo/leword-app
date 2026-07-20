/**
 * keyword-daily-trend 회귀 — 데이터랩 30일 일별 상대 추이 (한달 그래프 v2.49.87).
 *
 * 고정하는 계약:
 * 1. 30일 축 완전 채움 — 데이터랩이 생략한 집계 미달 일자는 ratio 0
 * 2. 실측 일자의 ratio 보존 (상대값 그대로 — 절대량 환산 금지)
 * 3. 데이터 전무 키워드 → null (가짜 0 곡선 제조 금지)
 * 4. HTTP 실패 → null
 */

import { getKeywordDailyTrend30d, getDateDaysAgo } from '../naver-datalab-api';

function assert(name: string, condition: boolean, detail?: string): void {
  if (!condition) {
    console.error(`[keyword-daily-trend.test] failed: ${name}${detail ? ` - ${detail}` : ''}`);
    process.exit(1);
  }
}

async function run(): Promise<void> {
  let passed = 0;
  const ok = (name: string, condition: boolean, detail?: string) => {
    assert(name, condition, detail);
    passed += 1;
  };

  const originalFetch = (globalThis as any).fetch;
  const config = { clientId: 'test-client', clientSecret: 'test-secret' };
  const spikeDay = getDateDaysAgo(2);
  const tailDay = getDateDaysAgo(1);

  (globalThis as any).fetch = async () => ({
    ok: true,
    json: async () => ({
      results: [{
        title: '스파이크 키워드',
        data: [
          { period: spikeDay, ratio: 100 },
          { period: tailDay, ratio: 40.5 },
        ],
      }],
    }),
  });
  const trend = await getKeywordDailyTrend30d(config, '스파이크 키워드');
  ok('trend is returned for a keyword with datalab data', trend !== null);
  ok('30-day axis is fully filled', trend!.series.length === 30, String(trend!.series.length));
  ok('series starts at startDate and ends at endDate',
    trend!.series[0].period === trend!.startDate
      && trend!.series[trend!.series.length - 1].period === trend!.endDate);
  ok('measured ratios are preserved as-is',
    trend!.series.find((p) => p.period === spikeDay)?.ratio === 100
      && trend!.series.find((p) => p.period === tailDay)?.ratio === 40.5);
  ok('omitted days are zero-filled',
    trend!.series.filter((p) => p.ratio === 0).length === 28);

  (globalThis as any).fetch = async () => ({
    ok: true,
    json: async () => ({ results: [{ title: '무데이터', data: [] }] }),
  });
  const empty = await getKeywordDailyTrend30d(config, '무데이터 키워드');
  ok('keyword with no datalab data returns null', empty === null);

  (globalThis as any).fetch = async () => ({ ok: false, status: 429, json: async () => ({}) });
  const failed = await getKeywordDailyTrend30d(config, 'HTTP 실패 키워드');
  ok('http failure returns null', failed === null);

  (globalThis as any).fetch = originalFetch;
  console.log(`[keyword-daily-trend.test] passed: ${passed} / failed: 0`);
  process.exit(0); // 무거운 모듈 임포트가 남기는 핸들(캐시 타이머 등) 때문에 명시 종료
}

run().catch((err) => {
  console.error('[keyword-daily-trend.test] FAILED:', (err as Error).message);
  process.exit(1);
});
