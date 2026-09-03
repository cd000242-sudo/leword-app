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
 * 데이터랩 일별 원응답 — 빠진 날을 채우지 않은 그대로. 데이터랩은 검색 0 인 날을
 * 응답에서 아예 뺀다(실측 2026-09-03: 30일 요청에 29점, 갓 태어난 키워드는 1~2점).
 */
async function fetchDatalabDailyRaw(
    keyword: string,
    config: NaverDatalabConfig,
    startDate: string,
    endDate: string
): Promise<{ series: number[]; dates: string[] }> {
    const { transformNaverRequest } = await import('./naver-api-hub');
    const hubReq = transformNaverRequest('https://openapi.naver.com/v1/datalab/search', {
        'X-Naver-Client-Id': config.clientId,
        'X-Naver-Client-Secret': config.clientSecret,
        'Content-Type': 'application/json',
    });
    const res = await axios.post(
        hubReq.url,
        {
            startDate,
            endDate,
            timeUnit: 'date',
            keywordGroups: [{ groupName: keyword, keywords: [keyword] }],
        },
        {
            headers: hubReq.headers,
            timeout: 8000,
        }
    );
    const raw = res.data?.results?.[0]?.data || [];
    const series = raw.map((d: any) => Number(d.ratio) || 0);
    const dates = raw.map((d: any) => String(d.period || ''));
    return { series, dates };
}

/**
 * 데이터랩이 집계를 끝낸 마지막 날(지평선). 매일 검색되는 닻 키워드('날씨')를 한 번
 * 물어 그 마지막 날짜를 쓴다 — 어떤 키워드든 이 날짜까지 응답에 없는 날은 '아직
 * 집계 안 됨'이 아니라 '검색 0'이다. 오늘은 늘 집계 전이라 여기 안 들어온다.
 * 프로세스당 한 시간 캐시(회차 하나에 호출 하나).
 */
const HORIZON_ANCHOR_KEYWORD = '날씨';
const HORIZON_TTL_MS = 60 * 60 * 1000;
let horizonCache: { date: string; atMs: number } | null = null;

export async function fetchDatalabHorizon(
    config: NaverDatalabConfig,
    nowMs: number = Date.now()
): Promise<string | null> {
    if (horizonCache && nowMs - horizonCache.atMs < HORIZON_TTL_MS) return horizonCache.date;
    const end = new Date(nowMs);
    const start = new Date(nowMs);
    start.setDate(end.getDate() - 6);
    const fmt = (d: Date) => d.toISOString().split('T')[0];
    try {
        const raw = await fetchDatalabDailyRaw(HORIZON_ANCHOR_KEYWORD, config, fmt(start), fmt(end));
        const last = raw.dates.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort().pop() || null;
        if (last) horizonCache = { date: last, atMs: nowMs };
        return last;
    } catch (err: any) {
        console.warn('[TREND-TYPE] 데이터랩 지평선 조회 실패:', err?.message);
        return null;
    }
}

/** 테스트·재시도용 — 지평선 캐시를 비운다. */
export function resetDatalabHorizonCache(): void {
    horizonCache = null;
}

/**
 * 네이버 데이터랩 검색 트렌드 조회 — 최근 30일 시계열
 * 반환: 일별 상대 검색량 (0~100, 30일 중 최대 = 100 기준) + 해당 날짜 ISO 문자열
 * 데이터랩이 뺀 날(검색 0)은 집계 지평선까지 0 으로 채워 돌려준다(padOmittedDays).
 */
export async function fetchKeywordTimeseries30Day(
    keyword: string,
    config: NaverDatalabConfig
): Promise<{ series: number[]; dates: string[] }> {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - 29);

    const fmt = (d: Date) => d.toISOString().split('T')[0];

    try {
        const raw = await fetchDatalabDailyRaw(keyword, config, fmt(start), fmt(end));
        const horizon = raw.dates.length > 0 ? await fetchDatalabHorizon(config) : null;
        return padOmittedDays(raw, fmt(start), horizon ?? undefined);
    } catch (err: any) {
        console.warn(`[TREND-TYPE] 시계열 조회 실패 "${keyword}":`, err?.message);
        return { series: [], dates: [] };
    }
}

/**
 * 데이터랩이 빼고 준 날(검색 0)을 0 으로 채운다.
 *
 * 데이터랩 일별 응답은 검색이 없던 날을 아예 빼고 돌려준다(실측 2026-09-03: 30일을
 * 물었는데 29점, 갓 태어난 이슈 키워드는 2점). 그대로 그리면 이틀짜리 폭발이 평평한
 * 두 점으로 보이고, 14점이 안 돼 트렌드 분류도 'unknown' 이 된다.
 * 채우는 구간은 요청 시작일부터 「마지막으로 돌려준 날」과 「집계 지평선(throughDate)」
 * 중 늦은 날까지다. 지평선이 없으면 마지막 응답일까지만 — 그 뒤(보통 오늘)는 아직
 * 집계가 안 된 날이라 0 으로 적으면 없는 급락을 지어내는 것이다. 지평선이 있으면
 * 그 날까지의 빈 날은 진짜 0 이다(8/14 한 점뿐인 키워드를 "지금 터진 것"처럼 그리지
 * 않으려면 뒤쪽 0 이 있어야 한다 — 실측 '아틀라스 브라우저'). 한 점도 없으면 빈 그대로.
 */
export function padOmittedDays(
    raw: { series: number[]; dates: string[] },
    startDate: string,
    throughDate?: string
): { series: number[]; dates: string[] } {
    const byDate = new Map<string, number>();
    raw.dates.forEach((date, index) => {
        if (/^\d{4}-\d{2}-\d{2}$/.test(date)) byDate.set(date, Number(raw.series[index]) || 0);
    });
    if (byDate.size === 0) return { series: [], dates: [] };
    const ordered = Array.from(byDate.keys()).sort();
    const validStart = /^\d{4}-\d{2}-\d{2}$/.test(startDate) && startDate < ordered[0];
    const first = validStart ? startDate : ordered[0];
    const returnedLast = ordered[ordered.length - 1];
    const validThrough = typeof throughDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(throughDate);
    const last = validThrough && (throughDate as string) > returnedLast ? (throughDate as string) : returnedLast;
    const series: number[] = [];
    const dates: string[] = [];
    const cursor = new Date(`${first}T00:00:00Z`);
    for (let guard = 0; guard < 400; guard += 1) {
        const date = cursor.toISOString().split('T')[0];
        if (date > last) break;
        dates.push(date);
        series.push(byDate.get(date) ?? 0);
        cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return { series, dates };
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

    // 📉 단발성: 최근 14일 내 peak 이후 급락
    // 🔥 v2.19.1 Fix5: peakIdx를 indexOf(첫 출현)로 변경 + postPeak 최소 3일 요구
    //    기존 lastIndexOf는 중복 peak 있을 때 postPeak 구간이 너무 짧아 편향
    const last14 = series.slice(-14);
    const peak = Math.max(...last14);
    const peakIdx = last14.indexOf(peak);   // 첫 출현 위치 (postPeak 구간 최대화)
    const postPeak = last14.slice(peakIdx + 1);
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

    // 📉 단발성: 최근 14일 내 peak 후 70% 이상 하락 + 하락 구간 최소 3일
    if (peak > 0 && postPeakDrop < 0.3 && peakIdx < 10 && peak >= monthAvg * 2.5 && postPeak.length >= 3) {
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
): Promise<{ series: number[]; dates: string[]; analysis: TrendAnalysis }> {
    const { series, dates } = await fetchKeywordTimeseries30Day(keyword, config);
    const analysis = classifyTrendType(series);
    return { series, dates, analysis };
}
