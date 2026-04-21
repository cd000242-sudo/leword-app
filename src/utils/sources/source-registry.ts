/**
 * Source Registry — 17개 소스 중앙 관리 + Circuit Breaker
 *
 * 역할:
 *  1. 모든 소스 메타데이터 (id, label, tier, fetchFn) 보유
 *  2. 호출 시 자동 rate limit + retry + circuit breaker
 *  3. 헬스 상태 추적 (HEALTHY / DEGRADED / DOWN)
 *  4. 실패율 임계 초과 시 자동 차단 (5분 후 자동 복구 시도)
 */

import { acquireToken, recordCall, getRotatingUA } from './rate-limiter';
import { saveSnapshot } from './source-storage';

export type SourceTier = 'lite' | 'pro';
export type SourceHealth = 'HEALTHY' | 'DEGRADED' | 'DOWN' | 'UNKNOWN';

export interface SourceMeta {
    id: string;
    label: string;
    tier: SourceTier;
    domain: string;
    fetchKeywords: () => Promise<string[]>;  // 통일된 시그니처
    description: string;
}

interface SourceState {
    health: SourceHealth;
    consecFails: number;
    lastSuccess: number;
    lastError: string;
    lastChecked: number;
    blockedUntil: number;
    totalCalls: number;
    totalFails: number;
}

const FAIL_THRESHOLD = 3;          // 3회 연속 실패 → DOWN
const BLOCK_DURATION = 5 * 60_000; // 5분 차단
const DEGRADED_THRESHOLD = 1;       // 1회 실패 → DEGRADED
const SOURCE_TIMEOUT_MS = 10_000;   // 🔥 v2.27.2: 15s → 10s (수용 가능한 속도 복원)

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`${label} timeout after ${ms}ms`)), ms);
        promise.then(
            v => { clearTimeout(timer); resolve(v); },
            e => { clearTimeout(timer); reject(e); }
        );
    });
}

const states = new Map<string, SourceState>();
const registry = new Map<string, SourceMeta>();

export function registerSource(meta: SourceMeta): void {
    registry.set(meta.id, meta);
    if (!states.has(meta.id)) {
        states.set(meta.id, {
            health: 'UNKNOWN',
            consecFails: 0,
            lastSuccess: 0,
            lastError: '',
            lastChecked: 0,
            blockedUntil: 0,
            totalCalls: 0,
            totalFails: 0,
        });
    }
}

export function getRegistry(): SourceMeta[] {
    return Array.from(registry.values());
}

export function getSourceState(id: string): SourceState | undefined {
    return states.get(id);
}

export function getAllStates(): Array<SourceMeta & SourceState> {
    return Array.from(registry.values()).map(meta => ({
        ...meta,
        ...(states.get(meta.id) || {
            health: 'UNKNOWN' as SourceHealth,
            consecFails: 0,
            lastSuccess: 0,
            lastError: '',
            lastChecked: 0,
            blockedUntil: 0,
            totalCalls: 0,
            totalFails: 0,
        }),
    }));
}

/**
 * 안전 호출: rate limit + circuit breaker + retry + storage 자동 저장
 */
export async function safeCall(sourceId: string, options: { skipStorage?: boolean } = {}): Promise<{ success: boolean; keywords: string[]; error?: string }> {
    const meta = registry.get(sourceId);
    if (!meta) return { success: false, keywords: [], error: 'Source not registered' };

    const state = states.get(sourceId)!;
    const now = Date.now();

    // Circuit Breaker: 차단 중인지 확인
    if (state.blockedUntil > now) {
        return { success: false, keywords: [], error: `Circuit OPEN (${Math.ceil((state.blockedUntil - now) / 1000)}s 남음)` };
    }

    state.totalCalls++;
    state.lastChecked = now;

    try {
        // Rate limit 토큰 획득 (자체 타임아웃)
        const url = `https://${meta.domain}/`;
        await withTimeout(acquireToken(url), 5000, `${sourceId} rate-limit`);

        // 실제 fetch — hard timeout 10s
        const keywords = await withTimeout(meta.fetchKeywords(), SOURCE_TIMEOUT_MS, sourceId);

        // 성공 처리
        state.consecFails = 0;
        state.health = 'HEALTHY';
        state.lastSuccess = now;
        state.lastError = '';
        recordCall(meta.domain, true);

        // Storage 자동 저장 (빈도 1로 카운트)
        if (!options.skipStorage && keywords.length > 0) {
            const freqMap = new Map<string, number>();
            for (const kw of keywords) freqMap.set(kw, (freqMap.get(kw) || 0) + 1);
            saveSnapshot(sourceId, freqMap);
        }

        return { success: true, keywords };
    } catch (err: any) {
        state.consecFails++;
        state.totalFails++;
        state.lastError = err?.message || String(err);
        recordCall(meta.domain, false);

        if (state.consecFails >= FAIL_THRESHOLD) {
            state.health = 'DOWN';
            state.blockedUntil = now + BLOCK_DURATION;
            console.warn(`[registry] 🚫 ${sourceId} 차단 (${BLOCK_DURATION / 1000}s) — 연속 실패 ${state.consecFails}회`);
        } else if (state.consecFails >= DEGRADED_THRESHOLD) {
            state.health = 'DEGRADED';
        }

        return { success: false, keywords: [], error: state.lastError };
    }
}

/**
 * 모든 소스 일괄 호출 (병렬)
 */
export async function callAllSources(filter?: { tier?: SourceTier; healthy?: boolean }): Promise<Map<string, { success: boolean; keywords: string[]; error?: string }>> {
    const result = new Map<string, any>();
    const sources = getRegistry().filter(m => {
        if (filter?.tier && m.tier !== filter.tier) return false;
        if (filter?.healthy) {
            const s = states.get(m.id);
            if (s?.health === 'DOWN') return false;
        }
        return true;
    });

    await Promise.all(
        sources.map(async meta => {
            const r = await safeCall(meta.id);
            result.set(meta.id, r);
        })
    );

    return result;
}

/**
 * 차단 강제 해제 (수동 복구)
 */
export function unblockSource(id: string): void {
    const state = states.get(id);
    if (state) {
        state.blockedUntil = 0;
        state.consecFails = 0;
        state.health = 'UNKNOWN';
    }
}

export function unblockAll(): void {
    for (const state of states.values()) {
        state.blockedUntil = 0;
        state.consecFails = 0;
        state.health = 'UNKNOWN';
    }
}

// 외부에서 import용 — UA 로테이터 재export
export { getRotatingUA };
