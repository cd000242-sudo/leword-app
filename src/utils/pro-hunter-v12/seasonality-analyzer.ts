// PRO Hunter v12 — 시즌성 분석
// 작성: 2026-04-15 (Tier 1 업그레이드)
// 네이버 Datalab SearchTrend API로 12개월 실측 데이터 확보
// Fallback: substring 기반 추정

import { EnvironmentManager } from '../environment-manager';
import { fetchSearchTrend12M, toMonthlyArray } from './datalab-trend';

export interface SeasonalityProfile {
  keyword: string;
  isSeasonal: boolean;
  peakMonth: number | null;     // 1~12
  peakValue: number;
  troughMonth: number | null;
  currentMonth: number;
  currentVsPeakPct: number;     // 현재가 피크의 몇 %인지
  recommendation: string;
  monthlyVolumes: number[];     // 12개월 데이터
  source: 'api' | 'estimate';
}

function classifyRecommendation(profile: Partial<SeasonalityProfile>): string {
  if (!profile.isSeasonal) return '연중 안정적 — 언제든 작성 가능';
  const cur = profile.currentVsPeakPct || 0;
  const peak = profile.peakMonth || 0;
  const now = new Date().getMonth() + 1;
  const monthsToPeak = ((peak - now + 12) % 12);

  if (cur >= 90) return `🔥 현재 피크 시즌 — 지금 즉시 작성 권장`;
  if (cur >= 70) return `⚡ 피크 임박 — D-${monthsToPeak * 30}일, 지금 작성 시작 권장`;
  if (cur <= 30 && monthsToPeak <= 2) return `🌱 피크 ${monthsToPeak}개월 전 — 미리 작성해서 인덱싱 시간 확보`;
  if (cur <= 30) return `📉 비수기 — 피크(${peak}월)까지 ${monthsToPeak}개월 대기 권장`;
  return `보통 — 작성 가능`;
}

export async function analyzeSeasonality(keyword: string): Promise<SeasonalityProfile> {
  const env = EnvironmentManager.getInstance().getConfig();
  const currentMonth = new Date().getMonth() + 1;

  if (!env.naverClientId || !env.naverClientSecret) {
    return fallbackEstimate(keyword, currentMonth);
  }

  // Datalab SearchTrend API로 12개월 실측 데이터 조회
  try {
    const result = await fetchSearchTrend12M(keyword);
    if (!result || !result.data || result.data.length < 6) {
      return fallbackEstimate(keyword, currentMonth);
    }
    const monthlyVolumes = toMonthlyArray(result);
    return buildProfile(keyword, monthlyVolumes, currentMonth, 'api');
  } catch (err) {
    console.warn(`[SEASONALITY] ${keyword} Datalab 실패, fallback:`, (err as Error).message);
    return fallbackEstimate(keyword, currentMonth);
  }
}

function buildProfile(
  keyword: string,
  monthlyVolumes: number[],
  currentMonth: number,
  source: 'api' | 'estimate'
): SeasonalityProfile {
  const max = Math.max(...monthlyVolumes);
  const min = Math.min(...monthlyVolumes);
  const peakIdx = monthlyVolumes.indexOf(max);
  const troughIdx = monthlyVolumes.indexOf(min);
  const peakMonth = peakIdx + 1;
  const troughMonth = troughIdx + 1;

  // 시즌성 판정: max/min 비율이 2.5배 이상이면 시즌 키워드
  const ratio = min > 0 ? max / min : Infinity;
  const isSeasonal = ratio >= 2.5;

  const currentValue = monthlyVolumes[currentMonth - 1] || 0;
  const currentVsPeakPct = max > 0 ? Math.round((currentValue / max) * 100) : 0;

  const partial: Partial<SeasonalityProfile> = {
    isSeasonal,
    peakMonth: isSeasonal ? peakMonth : null,
    troughMonth: isSeasonal ? troughMonth : null,
    currentMonth,
    currentVsPeakPct,
  };

  return {
    keyword,
    isSeasonal,
    peakMonth: isSeasonal ? peakMonth : null,
    peakValue: max,
    troughMonth: isSeasonal ? troughMonth : null,
    currentMonth,
    currentVsPeakPct,
    recommendation: classifyRecommendation(partial),
    monthlyVolumes,
    source,
  };
}

function fallbackEstimate(keyword: string, currentMonth: number): SeasonalityProfile {
  // 키워드 substring으로 시즌 추정
  const seasonal: Record<string, number> = {
    크리스마스: 12, 산타: 12, 연말: 12, 송년: 12,
    설날: 2, 추석: 9, 명절: 9,
    여름: 7, 휴가: 7, 바캉스: 7, 수영복: 7, 에어컨: 7,
    겨울: 1, 패딩: 1, 난방: 1, 결로: 1, 동파: 1,
    봄: 4, 벚꽃: 4, 환절기: 4,
    가을: 10, 단풍: 10,
    수능: 11, 수험생: 11,
    신학기: 3, 입학: 3,
    어버이날: 5, 어린이날: 5,
    빼빼로: 11, 발렌타인: 2, 화이트데이: 3,
  };
  let peakMonth: number | null = null;
  for (const [token, mo] of Object.entries(seasonal)) {
    if (keyword.includes(token)) {
      peakMonth = mo;
      break;
    }
  }

  const monthlyVolumes = Array.from({ length: 12 }, (_, i) => {
    if (peakMonth == null) return 100;
    const dist = Math.min(Math.abs(i + 1 - peakMonth), 12 - Math.abs(i + 1 - peakMonth));
    return Math.round(100 * Math.exp(-dist / 2));
  });

  if (peakMonth == null) {
    return {
      keyword,
      isSeasonal: false,
      peakMonth: null,
      peakValue: 100,
      troughMonth: null,
      currentMonth,
      currentVsPeakPct: 100,
      recommendation: '연중 안정적 — 언제든 작성 가능',
      monthlyVolumes,
      source: 'estimate',
    };
  }
  return buildProfile(keyword, monthlyVolumes, currentMonth, 'estimate');
}
