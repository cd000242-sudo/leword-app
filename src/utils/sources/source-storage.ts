/**
 * Source Storage — electron-store 기반 시계열 스냅샷 누적
 *
 * 목적: "어제 대비 +30%" 같은 진짜 선행 신호를 만들기 위해
 *      소스별 일별 키워드 빈도를 14일 보관.
 */

import Store from 'electron-store';

interface DailySnapshot {
    date: string;                    // YYYY-MM-DD
    keywords: Record<string, number>; // keyword → frequency
}

interface SourceHistory {
    sourceId: string;
    snapshots: DailySnapshot[];
}

const store = new Store<{ sources: Record<string, SourceHistory> }>({
    name: 'leword-source-history',
    defaults: { sources: {} },
});

const MAX_DAYS = 14;

function todayStr(): string {
    return new Date().toISOString().split('T')[0];
}

/**
 * 오늘 스냅샷 저장 (소스ID + 키워드 빈도 맵)
 */
export function saveSnapshot(sourceId: string, keywords: Map<string, number> | Record<string, number>): void {
    const all = (store as any).get('sources') as Record<string, SourceHistory>;
    let history = all[sourceId];
    if (!history) {
        history = { sourceId, snapshots: [] };
        all[sourceId] = history;
    }

    const today = todayStr();
    const kwObj: Record<string, number> = keywords instanceof Map
        ? Object.fromEntries(keywords.entries())
        : keywords;

    const existingIdx = history.snapshots.findIndex(s => s.date === today);
    if (existingIdx >= 0) {
        history.snapshots[existingIdx] = { date: today, keywords: kwObj };
    } else {
        history.snapshots.push({ date: today, keywords: kwObj });
    }

    // Keep last MAX_DAYS only
    history.snapshots = history.snapshots
        .sort((a, b) => a.date.localeCompare(b.date))
        .slice(-MAX_DAYS);

    (store as any).set('sources', all);
}

/**
 * 키워드별 7일 평균 대비 오늘 비율 (급상승 측정)
 */
export function getKeywordTrend(sourceId: string, keyword: string): { today: number; weekAvg: number; ratio: number } {
    const history = ((store as any).get('sources') as Record<string, SourceHistory>)[sourceId];
    if (!history || history.snapshots.length === 0) return { today: 0, weekAvg: 0, ratio: 0 };

    const sorted = history.snapshots.slice().sort((a, b) => b.date.localeCompare(a.date));
    const today = sorted[0]?.keywords[keyword] || 0;
    const prior7 = sorted.slice(1, 8);
    if (prior7.length === 0) return { today, weekAvg: 0, ratio: today > 0 ? 10 : 0 };

    const sum = prior7.reduce((acc, s) => acc + (s.keywords[keyword] || 0), 0);
    const weekAvg = sum / prior7.length;
    const ratio = weekAvg > 0 ? today / weekAvg : (today > 0 ? 10 : 0);

    return { today, weekAvg: parseFloat(weekAvg.toFixed(2)), ratio: parseFloat(ratio.toFixed(2)) };
}

/**
 * 특정 소스에서 오늘 신규로 등장한 키워드 (어제는 없었음)
 */
export function getNewKeywords(sourceId: string): string[] {
    const history = ((store as any).get('sources') as Record<string, SourceHistory>)[sourceId];
    if (!history || history.snapshots.length < 2) return [];

    const sorted = history.snapshots.slice().sort((a, b) => b.date.localeCompare(a.date));
    const today = sorted[0]?.keywords || {};
    const yesterday = sorted[1]?.keywords || {};

    return Object.keys(today).filter(kw => !(kw in yesterday));
}

/**
 * 소스별 급상승 키워드 (ratio >= threshold)
 */
export function getRisingKeywords(sourceId: string, threshold: number = 2.0): Array<{ keyword: string; ratio: number; today: number }> {
    const history = ((store as any).get('sources') as Record<string, SourceHistory>)[sourceId];
    if (!history || history.snapshots.length < 2) return [];

    const sorted = history.snapshots.slice().sort((a, b) => b.date.localeCompare(a.date));
    const todayKws = sorted[0]?.keywords || {};
    const result: Array<{ keyword: string; ratio: number; today: number }> = [];

    for (const [kw, count] of Object.entries(todayKws)) {
        const trend = getKeywordTrend(sourceId, kw);
        if (trend.ratio >= threshold && count >= 2) {
            result.push({ keyword: kw, ratio: trend.ratio, today: count });
        }
    }

    return result.sort((a, b) => b.ratio - a.ratio);
}

/**
 * 전 소스 스냅샷 통계 (대시보드용)
 */
export function getStorageStats(): Array<{ sourceId: string; days: number; latestDate: string; totalKeywords: number }> {
    const all = (store as any).get('sources') as Record<string, SourceHistory>;
    return Object.values(all).map(h => {
        const sorted = h.snapshots.slice().sort((a, b) => b.date.localeCompare(a.date));
        const latest = sorted[0];
        return {
            sourceId: h.sourceId,
            days: h.snapshots.length,
            latestDate: latest?.date || '-',
            totalKeywords: latest ? Object.keys(latest.keywords).length : 0,
        };
    });
}

export function clearStorage(): void {
    (store as any).set('sources', {});
}
