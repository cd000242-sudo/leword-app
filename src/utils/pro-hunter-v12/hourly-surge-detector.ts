/**
 * 🔥 시간단위 급발진 감지 (Hourly Surge Detector)
 *
 * 기존 trend-surge-detector는 datalab 주간 단위 → 1주 지연 발생.
 * Hourly: 자동완성/뉴스 1시간 vs 24시간 비교 → 즉각 surge 신호.
 *
 * 알고리즘:
 *   1. 매시간 실시간 검색어 수집 (Signal.bz/Zum/Daum/Nate + 네이버 뉴스 헤드라인)
 *   2. 24시간 이동 윈도우로 키워드별 등장 빈도 추적
 *   3. 1시간 등장 / 24시간 평균 ≥ 3.0 → "급발진" 신호
 *   4. PRO 헌터 호출 시 surge 키워드를 시드 풀에 우선 주입
 */

import * as path from 'path';
import * as fs from 'fs';

interface KeywordObservation {
    keyword: string;
    timestamp: number;
    source: string;
}

interface KeywordTrendStats {
    keyword: string;
    countInLastHour: number;
    countInLast24h: number;
    surgeRatio: number;       // hour / (24h/24)
    sources: Set<string>;
    firstSeen: number;
    lastSeen: number;
}

const observations: KeywordObservation[] = [];
const MAX_OBSERVATIONS = 5000;
const ONE_HOUR = 60 * 60 * 1000;
const TWENTY_FOUR_HOURS = 24 * ONE_HOUR;
let persistTimer: NodeJS.Timeout | null = null;
let loaded = false;

// 🔥 한계3 부수기: 영속화 (앱 재시작 시 24h 슬라이딩 윈도우 즉시 복원)
function getStorePath(): string {
    let baseDir: string;
    try {
        const electron = require('electron');
        baseDir = electron.app && typeof electron.app.getPath === 'function'
            ? electron.app.getPath('userData')
            : process.env.APPDATA || process.cwd();
    } catch {
        baseDir = process.env.APPDATA || process.cwd();
    }
    const dir = path.join(baseDir, 'leword-pro-hunter');
    fs.mkdirSync(dir, { recursive: true });
    return path.join(dir, 'hourly-surge-store.json');
}

function loadObservations(): void {
    if (loaded) return;
    loaded = true;
    try {
        const file = getStorePath();
        if (fs.existsSync(file)) {
            const data = JSON.parse(fs.readFileSync(file, 'utf8'));
            const now = Date.now();
            const valid = (data.observations || []).filter((o: any) =>
                o && typeof o.timestamp === 'number' && (now - o.timestamp) <= TWENTY_FOUR_HOURS
            );
            observations.push(...valid);
            console.log(`[HOURLY-SURGE] 💾 영속화 복원: ${valid.length}개 관찰 데이터 로드`);
        }
    } catch (err: any) {
        console.warn('[HOURLY-SURGE] store load 실패:', err?.message);
    }
}

function saveObservationsThrottled(): void {
    if (persistTimer) return;
    persistTimer = setTimeout(() => {
        persistTimer = null;
        try {
            fs.writeFileSync(getStorePath(), JSON.stringify({ observations }), 'utf8');
        } catch (err: any) {
            console.warn('[HOURLY-SURGE] store save 실패:', err?.message);
        }
    }, 30 * 1000);  // 30초 throttle
}

/**
 * 키워드 관찰 기록 (실시간 수집 시 호출)
 */
export function recordKeywordObservation(keyword: string, source: string): void {
    loadObservations();
    const now = Date.now();
    observations.push({ keyword, timestamp: now, source });
    while (observations.length > 0 && (now - observations[0].timestamp > TWENTY_FOUR_HOURS || observations.length > MAX_OBSERVATIONS)) {
        observations.shift();
    }
    saveObservationsThrottled();
}

/**
 * 현재 surge 키워드 목록 반환 (1시간 내 빈도 / 24시간 평균 비율)
 */
export function detectHourlySurges(minSurgeRatio: number = 3.0): KeywordTrendStats[] {
    loadObservations();
    const now = Date.now();
    const oneHourAgo = now - ONE_HOUR;
    const stats = new Map<string, KeywordTrendStats>();

    for (const obs of observations) {
        const age = now - obs.timestamp;
        if (age > TWENTY_FOUR_HOURS) continue;

        const existing = stats.get(obs.keyword);
        if (existing) {
            if (obs.timestamp >= oneHourAgo) existing.countInLastHour++;
            existing.countInLast24h++;
            existing.sources.add(obs.source);
            existing.lastSeen = Math.max(existing.lastSeen, obs.timestamp);
            existing.firstSeen = Math.min(existing.firstSeen, obs.timestamp);
        } else {
            stats.set(obs.keyword, {
                keyword: obs.keyword,
                countInLastHour: obs.timestamp >= oneHourAgo ? 1 : 0,
                countInLast24h: 1,
                surgeRatio: 0,
                sources: new Set([obs.source]),
                firstSeen: obs.timestamp,
                lastSeen: obs.timestamp,
            });
        }
    }

    // surgeRatio 계산 + 필터링
    const surges: KeywordTrendStats[] = [];
    for (const stat of stats.values()) {
        const avgPerHour = stat.countInLast24h / 24;
        stat.surgeRatio = avgPerHour > 0 ? stat.countInLastHour / avgPerHour : stat.countInLastHour * 24;
        if (stat.surgeRatio >= minSurgeRatio && stat.countInLastHour >= 2) {
            surges.push(stat);
        }
    }

    surges.sort((a, b) => b.surgeRatio - a.surgeRatio);
    return surges;
}

/**
 * surge 키워드 일괄 등록 (PRO 헌터의 multiSourceKeywords 호출 직후 사용)
 */
export function recordKeywordsBatch(keywords: string[], source: string): void {
    for (const kw of keywords) {
        if (kw && kw.length >= 2) recordKeywordObservation(kw, source);
    }
}

/**
 * 통계 정보
 */
export function getSurgeStats(): { totalObservations: number; uniqueKeywords: number; oldestAgeMs: number } {
    const now = Date.now();
    const unique = new Set(observations.map(o => o.keyword));
    return {
        totalObservations: observations.length,
        uniqueKeywords: unique.size,
        oldestAgeMs: observations.length > 0 ? now - observations[0].timestamp : 0,
    };
}
