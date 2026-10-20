/**
 * 지금 쓰면 트래픽이 오나 — 데이터랩 주별 실측 비율로 판정한다(2026-10-20).
 *
 * 사장님: "검색량 문서량도 중요하지만 현재 글을 쓰면 트래픽을 몰고 올 수 있냐 없냐가 중요해요. 그래프로 확인을 하지만
 * 그걸 확인해서 알려줘야 됩니다." 월별(keyword-demand-shape)은 이번 달이 덜 차서 '지금'을 못 본다 — 주별 13개월을 한 번 받아
 *   ① 최근 4주 vs 직전 8주(지금 오르나)  ② 작년 같은 때 바로 다음 4주(곧 시즌인가)  ③ 13개월 최고치 대비(이미 지났나)
 * 를 같이 본다. 예상 유입 · 확률 같은 추정치는 만들지 않는다 — 문장은 잰 비율의 변화만 말한다.
 */
import { naverApiFetch } from './naver-api-hub';

export interface WeeklyPoint { period: string; ratio: number }
export type DemandNowVerdict = 'rising' | 'season-soon' | 'steady' | 'cooling' | 'past-peak' | 'unknown';
export interface DemandNow {
  verdict: DemandNowVerdict;
  label: string;
  /** 화면에 그대로 쓰는 한 문장 — 잰 비율의 변화만. */
  fact: string;
  /** 최근 4주 평균 / 직전 8주 평균 - 1 (%). */
  recentChangePct: number | null;
  /** 작년 같은 때 다음 4주 평균 / 그 직전 4주 평균 - 1 (%). */
  lastYearNextPct: number | null;
  /** 그래프용 최근 26주 실측 비율(데이터랩 상대값). */
  series: number[];
  /** 마지막 완료 주의 시작일. */
  asOf: string | null;
}
export interface DemandNowConfig { clientId: string; clientSecret: string }

export const DEMAND_NOW_LABEL: Record<DemandNowVerdict, string> = {
  rising: '지금 오르는 중',
  'season-soon': '곧 시즌',
  steady: '꾸준함',
  cooling: '식는 중',
  'past-peak': '피크 지남',
  unknown: '추이 모름',
};

const DAY_MS = 86400000;
const RISE_PCT = 30;
const FALL_PCT = -30;
const PAST_PEAK_SHARE = 0.4;
const MIN_WEEKS = 30;

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const pct = (now: number, before: number) => (before > 0 ? Math.round((now / before - 1) * 100) : null);

/** 아직 안 끝난 주를 뺀다 — 덜 찬 주는 늘 낮게 나와 하락으로 보인다. */
export function completeWeeks(points: WeeklyPoint[], todayIso: string): WeeklyPoint[] {
  const today = Date.parse(`${todayIso.slice(0, 10)}T00:00:00Z`);
  return (points || []).filter((p) => {
    const start = Date.parse(`${String(p.period).slice(0, 10)}T00:00:00Z`);
    return Number.isFinite(start) && Number.isFinite(Number(p.ratio)) && start + 7 * DAY_MS <= today;
  });
}

export function readDemandNow(points: WeeklyPoint[], todayIso: string): DemandNow {
  const weeks = completeWeeks(points, todayIso);
  const r = weeks.map((p) => Number(p.ratio));
  const series = r.slice(-26).map((v) => Math.round(v * 10) / 10);
  const asOf = weeks.length ? weeks[weeks.length - 1].period.slice(0, 10) : null;
  const base = { series, asOf };
  if (r.length < MIN_WEEKS) {
    return { verdict: 'unknown', label: DEMAND_NOW_LABEL.unknown, fact: '검색 추이가 짧아 판단하지 않았습니다', recentChangePct: null, lastYearNextPct: null, ...base };
  }
  const n = r.length;
  const last4 = avg(r.slice(-4));
  const recentChangePct = pct(last4, avg(r.slice(-12, -4)));
  const lyIdx = n - 1 - 52;
  const lastYearNextPct = lyIdx >= 0 && lyIdx + 4 < n
    ? pct(avg(r.slice(lyIdx + 1, lyIdx + 5)), avg(r.slice(Math.max(0, lyIdx - 3), lyIdx + 1)))
    : null;
  const peak = Math.max(...r);

  let verdict: DemandNowVerdict = 'steady';
  if (recentChangePct !== null && recentChangePct >= RISE_PCT && r[n - 1] >= last4 * 0.9) verdict = 'rising';
  else if (lastYearNextPct !== null && lastYearNextPct >= RISE_PCT && (recentChangePct ?? 0) > -15) verdict = 'season-soon';
  else if (recentChangePct !== null && recentChangePct <= FALL_PCT) verdict = last4 <= peak * PAST_PEAK_SHARE ? 'past-peak' : 'cooling';

  const facts: Record<DemandNowVerdict, string> = {
    rising: `최근 4주 검색 관심이 직전 8주보다 ${recentChangePct}% 높습니다`,
    'season-soon': `작년 이맘때 다음 4주 동안 검색 관심이 ${lastYearNextPct}% 올랐습니다`,
    cooling: `최근 4주 검색 관심이 직전 8주보다 ${Math.abs(recentChangePct ?? 0)}% 낮습니다`,
    'past-peak': `최근 4주 검색 관심이 1년 최고치의 ${peak > 0 ? Math.round((last4 / peak) * 100) : 0}% 수준입니다`,
    steady: `최근 4주 검색 관심 변화 ${(recentChangePct ?? 0) >= 0 ? '+' : ''}${recentChangePct ?? 0}% (직전 8주 대비)`,
    unknown: '',
  };
  return { verdict, label: DEMAND_NOW_LABEL[verdict], fact: facts[verdict], recentChangePct, lastYearNextPct, ...base };
}

/** 데이터랩 주 단위 약 13개월. 실패하면 빈 배열 — 추이를 지어내지 않는다. */
export async function fetchWeeklyDemand(
  keyword: string,
  config: DemandNowConfig,
  fetchImpl: typeof fetch = ((url: any, init: any) => naverApiFetch(String(url), init)) as typeof fetch,
  today: Date = new Date(),
): Promise<WeeklyPoint[]> {
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  try {
    const response = await fetchImpl('https://openapi.naver.com/v1/datalab/search', {
      method: 'POST',
      headers: { 'X-Naver-Client-Id': config.clientId, 'X-Naver-Client-Secret': config.clientSecret, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        startDate: iso(new Date(today.getTime() - 400 * DAY_MS)),
        endDate: iso(today),
        timeUnit: 'week',
        keywordGroups: [{ groupName: keyword, keywords: [keyword] }],
      }),
    });
    if (!response.ok) return [];
    const payload = await response.json() as { results?: Array<{ data?: Array<{ period?: string; ratio?: number }> }> };
    return (payload.results?.[0]?.data || [])
      .map((p) => ({ period: String(p.period || ''), ratio: Number(p.ratio) }))
      .filter((p) => p.period && Number.isFinite(p.ratio));
  } catch {
    return [];
  }
}
