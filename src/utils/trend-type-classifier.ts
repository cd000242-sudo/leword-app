/**
 * 4가지 트렌드 타입 자동 분류 (v2.19.0 Phase L-2)
 *
 * 🐢 연금형  — 30일 이동평균 안정 (분산 낮음) → 꾸준 방문자
 * 🚀 떡상    — 최근 3일 평균이 30일 평균의 2배+ → 지금 당장 작성
 * 📉 단발성  — 최근 며칠 폭발 후 급락 → 회피
 * ❄️ 시즌성  — 작년 동기 대비 패턴 반복 (현재 기반으론 월별 상승 감지)
 */

import axios from 'axios';

export type TrendType = 'evergreen' | 'skyrocket' | 'flash' | 'seasonal' | 'unknown';

export interface TrendAnalysis {
    type: TrendType;
    label: string;       // '🐢 연금형' 등
    recent3Avg: number;
    monthAvg: number;
    surgeRatio: number;  // recent3 / monthAvg
    volatility: number;  // 표준편차/평균
    recommendation: string;
}

export interface NaverDatalabConfig {
    clientId: string;
    clientSecret: string;
}

/**
 * 네이버 데이터랩 쇼핑/검색 트렌드 조회 — 최근 30일 시계열
 * 반환: 일별 상대 검색량 (0~100 정규화)
 */
export async function fetchKeywordTimeseries30Day(
    keyword: string,
    config: NaverDatalabConfig
): Promise<number[]> {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - 29);

    const fmt = (d: Date) => d.toISOString().split('T')[0];

    try {
        const res = await axios.post(
            'https://openapi.naver.com/v1/datalab/search',
            {
                startDate: fmt(start),
                endDate: fmt(end),
                timeUnit: 'date',
                keywordGroups: [{ groupName: keyword, keywords: [keyword] }],
            },
            {
                headers: {
                    'X-Naver-Client-Id': config.clientId,
                    'X-Naver-Client-Secret': config.clientSecret,
                    'Content-Type': 'application/json',
                },
                timeout: 8000,
            }
        );
        const series = res.data?.results?.[0]?.data || [];
        return series.map((d: any) => Number(d.ratio) || 0);
    } catch (err: any) {
        console.warn(`[TREND-TYPE] 시계열 조회 실패 "${keyword}":`, err?.message);
        return [];
    }
}

/**
 * 시계열 배열로 트렌드 타입 분류
 */
export function classifyTrendType(series: number[]): TrendAnalysis {
    if (!series || series.length < 14) {
        return {
            type: 'unknown',
            label: '',
            recent3Avg: 0,
            monthAvg: 0,
            surgeRatio: 0,
            volatility: 0,
            recommendation: '',
        };
    }

    const n = series.length;
    const recent3 = series.slice(-3);
    const recent7 = series.slice(-7);
    const monthAvg = series.reduce((a, b) => a + b, 0) / n || 0.0001;
    const recent3Avg = recent3.reduce((a, b) => a + b, 0) / recent3.length;
    const recent7Avg = recent7.reduce((a, b) => a + b, 0) / recent7.length;

    // 표준편차 (변동성)
    const variance = series.reduce((s, x) => s + (x - monthAvg) ** 2, 0) / n;
    const stdev = Math.sqrt(variance);
    const volatility = monthAvg > 0 ? stdev / monthAvg : 0;   // CV

    const surgeRatio = monthAvg > 0 ? recent3Avg / monthAvg : 0;

    // 📉 단발성: 최근 7일 중 한 날 폭발 (max가 recent3Avg보다 2배+) 이후 급락
    const peak = Math.max(...series.slice(-14));
    const peakIdx = series.slice(-14).lastIndexOf(peak);   // 최근 14일 내 peak 위치 (0=가장 과거, 13=오늘)
    const postPeak = series.slice(-14).slice(peakIdx + 1);
    const postPeakAvg = postPeak.length > 0 ? postPeak.reduce((a, b) => a + b, 0) / postPeak.length : 0;
    const postPeakDrop = peak > 0 ? postPeakAvg / peak : 1;

    // 🚀 떡상: recent3 평균이 monthAvg의 2배 이상 + 상승 추세
    if (surgeRatio >= 2.0 && recent3Avg >= recent7Avg * 1.2) {
        return {
            type: 'skyrocket',
            label: '🚀 떡상',
            recent3Avg, monthAvg, surgeRatio, volatility,
            recommendation: '지금 당장 작성! 3일 내 급증 포착 → 선점 시 상위 노출 확률 매우 높음',
        };
    }

    // 📉 단발성: 최근 14일 내 peak 후 70% 이상 하락
    if (peak > 0 && postPeakDrop < 0.3 && peakIdx < 10 && peak >= monthAvg * 2.5) {
        return {
            type: 'flash',
            label: '📉 단발성',
            recent3Avg, monthAvg, surgeRatio, volatility,
            recommendation: '회피! 지난 며칠 폭발 후 급락 중. 글 써도 유입 없음',
        };
    }

    // ❄️ 시즌성: 변동성 중간 + 최근 상승세 (월별 반복 패턴 — 시계열 30일로 1차 근사)
    if (volatility > 0.3 && volatility < 0.8 && recent7Avg > monthAvg * 1.15) {
        return {
            type: 'seasonal',
            label: '❄️ 시즌성',
            recent3Avg, monthAvg, surgeRatio, volatility,
            recommendation: '시즌 임박 신호. 2주 안에 작성해서 시즌 동안 트래픽 확보',
        };
    }

    // 🐢 연금형: 변동성 낮고 꾸준 (CV < 0.3)
    if (volatility < 0.3 && monthAvg >= 1) {
        return {
            type: 'evergreen',
            label: '🐢 연금형',
            recent3Avg, monthAvg, surgeRatio, volatility,
            recommendation: '한 번 쓰면 1년 꾸준 방문자. 안정적 연금 키워드',
        };
    }

    return {
        type: 'unknown',
        label: '',
        recent3Avg, monthAvg, surgeRatio, volatility,
        recommendation: '',
    };
}

/**
 * 시계열 + 분류 통합 조회 (rich-feed에서 배치 호출용)
 */
export async function analyzeKeywordTrend(
    keyword: string,
    config: NaverDatalabConfig
): Promise<{ series: number[]; analysis: TrendAnalysis }> {
    const series = await fetchKeywordTimeseries30Day(keyword, config);
    const analysis = classifyTrendType(series);
    return { series, analysis };
}
