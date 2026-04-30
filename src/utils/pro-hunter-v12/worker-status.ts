/**
 * 🚀 PRO 백그라운드 워커 상태 추적
 * 5개 워커(lifecycle/rank/precrawler/surge/refresh)의 동작 여부를 실시간 추적.
 * UI에서 status 조회 가능 → 1년 라이선스 사용자에게 자동화 작동 증명.
 */

export type WorkerName = 'lifecycle' | 'rank' | 'precrawler' | 'surge' | 'refresh';

interface WorkerStatus {
    name: WorkerName;
    started: boolean;
    startedAt: number;
    lastTickAt: number;
    tickCount: number;
    lastError?: string;
}

const status = new Map<WorkerName, WorkerStatus>();

export function markWorkerStarted(name: WorkerName): void {
    status.set(name, {
        name,
        started: true,
        startedAt: Date.now(),
        lastTickAt: Date.now(),
        tickCount: 0,
    });
    console.log(`[WORKER] ✅ ${name} 시작됨`);
}

export function markWorkerTick(name: WorkerName, error?: string): void {
    const s = status.get(name);
    if (!s) return;
    s.lastTickAt = Date.now();
    s.tickCount++;
    if (error) s.lastError = error;
}

export function getWorkerStatus(): Array<{ name: WorkerName; running: boolean; startedAgo: string; lastTickAgo: string; tickCount: number; lastError?: string }> {
    const now = Date.now();
    const ago = (ms: number) => {
        const sec = Math.floor((now - ms) / 1000);
        if (sec < 60) return `${sec}초 전`;
        if (sec < 3600) return `${Math.floor(sec / 60)}분 전`;
        return `${Math.floor(sec / 3600)}시간 전`;
    };
    return Array.from(status.values()).map(s => ({
        name: s.name,
        running: s.started && (now - s.lastTickAt) < 24 * 3600 * 1000,
        startedAgo: ago(s.startedAt),
        lastTickAgo: ago(s.lastTickAt),
        tickCount: s.tickCount,
        lastError: s.lastError,
    }));
}

export function getWorkerHealthSummary(): { runningCount: number; totalCount: number; summary: string } {
    const all = getWorkerStatus();
    const running = all.filter(w => w.running).length;
    return {
        runningCount: running,
        totalCount: all.length,
        summary: `🚀 백그라운드 워커 ${running}/${all.length} 작동 중 — ${all.map(w => `${w.name}:${w.running ? '✅' : '❌'}`).join(' ')}`,
    };
}
