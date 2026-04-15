/**
 * Health Checker — 17개 소스 일괄 라이브 핑
 *
 * 사용:
 *   - 앱 시작 후 백그라운드 1회 실행
 *   - 사용자 수동 트리거 (UI 헬스 대시보드)
 *   - 30분마다 자동 재검증
 */

import { getRegistry, safeCall, getAllStates, SourceTier } from './source-registry';

export interface HealthReport {
    timestamp: number;
    total: number;
    healthy: number;
    degraded: number;
    down: number;
    sources: Array<{
        id: string;
        label: string;
        tier: SourceTier;
        health: string;
        keywords: number;
        latencyMs: number;
        error?: string;
    }>;
}

export async function runHealthCheck(filter?: { tier?: SourceTier }): Promise<HealthReport> {
    const sources = getRegistry().filter(m => !filter?.tier || m.tier === filter.tier);
    const results: HealthReport['sources'] = [];

    await Promise.all(
        sources.map(async meta => {
            const start = Date.now();
            try {
                const r = await safeCall(meta.id, { skipStorage: true });
                results.push({
                    id: meta.id,
                    label: meta.label,
                    tier: meta.tier,
                    health: r.success ? 'HEALTHY' : 'DOWN',
                    keywords: r.keywords.length,
                    latencyMs: Date.now() - start,
                    error: r.error,
                });
            } catch (e: any) {
                results.push({
                    id: meta.id,
                    label: meta.label,
                    tier: meta.tier,
                    health: 'DOWN',
                    keywords: 0,
                    latencyMs: Date.now() - start,
                    error: e.message,
                });
            }
        })
    );

    const healthy = results.filter(r => r.health === 'HEALTHY').length;
    const degraded = results.filter(r => r.health === 'DEGRADED').length;
    const down = results.filter(r => r.health === 'DOWN').length;

    return {
        timestamp: Date.now(),
        total: results.length,
        healthy,
        degraded,
        down,
        sources: results.sort((a, b) => a.id.localeCompare(b.id)),
    };
}

let lastReport: HealthReport | null = null;
let autoCheckTimer: NodeJS.Timeout | null = null;

export function getCachedReport(): HealthReport | null {
    return lastReport;
}

export async function refreshHealthReport(): Promise<HealthReport> {
    lastReport = await runHealthCheck();
    return lastReport;
}

export function startAutoHealthCheck(intervalMs: number = 30 * 60_000): void {
    if (autoCheckTimer) clearInterval(autoCheckTimer);
    refreshHealthReport().catch(err => console.error('[health] 초기 체크 실패:', err));
    autoCheckTimer = setInterval(() => {
        refreshHealthReport().catch(err => console.error('[health] 자동 체크 실패:', err));
    }, intervalMs);
}

export function stopAutoHealthCheck(): void {
    if (autoCheckTimer) {
        clearInterval(autoCheckTimer);
        autoCheckTimer = null;
    }
}

/**
 * 현재 상태 요약 (간단 버전, 실시간 호출 없음)
 */
export function getQuickStatus(): { total: number; healthy: number; down: number } {
    const states = getAllStates();
    return {
        total: states.length,
        healthy: states.filter(s => s.health === 'HEALTHY').length,
        down: states.filter(s => s.health === 'DOWN').length,
    };
}
