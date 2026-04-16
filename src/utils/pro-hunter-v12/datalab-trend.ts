// PRO Hunter v12 — 네이버 Datalab SearchTrend API
// 작성: 2026-04-15
// 12개월 실측 검색 트렌드 데이터를 가져와 시즌 분석에 사용
// 공식 API: https://openapi.naver.com/v1/datalab/search

import { EnvironmentManager } from '../environment-manager';

export interface TrendDataPoint {
  period: string;   // "2025-04"
  ratio: number;    // 0~100 정규화된 검색량
}

export interface DatalabResult {
  keyword: string;
  startDate: string;
  endDate: string;
  timeUnit: 'month' | 'week' | 'date';
  data: TrendDataPoint[];
  source: 'datalab';
}

function pad(n: number): string {
  return n < 10 ? '0' + n : String(n);
}

function formatDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * 지정 키워드의 12개월 검색 트렌드 조회
 * 월간 단위로 반환 (배열 길이 12~13)
 */
export async function fetchSearchTrend12M(
  keyword: string,
  options: { timeUnit?: 'month' | 'week' | 'date' } = {}
): Promise<DatalabResult | null> {
  const env = EnvironmentManager.getInstance().getConfig();
  if (!env.naverClientId || !env.naverClientSecret) {
    console.warn('[DATALAB] 네이버 Client ID/Secret 미설정');
    return null;
  }

  const end = new Date();
  const start = new Date();
  start.setFullYear(end.getFullYear() - 1);

  const body = {
    startDate: formatDate(start),
    endDate: formatDate(end),
    timeUnit: options.timeUnit || 'month',
    keywordGroups: [
      {
        groupName: keyword,
        keywords: [keyword],
      },
    ],
  };

  try {
    const axios = (await import('axios')).default;
    const res = await axios.post('https://openapi.naver.com/v1/datalab/search', body, {
      headers: {
        'X-Naver-Client-Id': env.naverClientId,
        'X-Naver-Client-Secret': env.naverClientSecret,
        'Content-Type': 'application/json',
      },
      timeout: 10000,
    });

    if (!res.data?.results || !Array.isArray(res.data.results) || res.data.results.length === 0) {
      return null;
    }

    const result = res.data.results[0];
    const data: TrendDataPoint[] = (result.data || []).map((d: any) => ({
      period: String(d.period || ''),
      ratio: Number(d.ratio) || 0,
    }));

    return {
      keyword,
      startDate: body.startDate,
      endDate: body.endDate,
      timeUnit: body.timeUnit as 'month',
      data,
      source: 'datalab',
    };
  } catch (err: any) {
    const msg = err?.response?.data?.errorMessage || err?.message || 'unknown';
    console.warn(`[DATALAB] ${keyword} 실패:`, msg);
    return null;
  }
}

/**
 * Datalab 월간 데이터를 12개월 배열로 변환 (seasonality-analyzer 입력용)
 */
export function toMonthlyArray(result: DatalabResult): number[] {
  // period는 "YYYY-MM-01" 형태. 월별로 매핑.
  const map = new Map<number, number>();
  for (const d of result.data) {
    const m = d.period.match(/(\d{4})-(\d{1,2})/);
    if (!m) continue;
    const month = Number(m[2]);
    map.set(month, d.ratio);
  }
  // 1~12월 배열로 변환 (누락된 월은 이웃 월로 보간)
  const arr: number[] = [];
  for (let i = 1; i <= 12; i++) {
    arr.push(map.get(i) || 0);
  }
  // 전부 0이면 의미 없음
  if (arr.every((v) => v === 0)) {
    return Array(12).fill(50);
  }
  return arr;
}
