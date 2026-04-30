/**
 * 🤖 매일 자동 헌팅 + Electron Notification 알람
 *
 * - 매일 새벽 3시 자동으로 5개 카테고리 헌팅
 * - 발견된 SS/SSS 등급 키워드를 누적 저장
 * - 새로운 황금키워드 발견 시 데스크톱 알림
 * - getDailyHuntHistory()로 12개월 추적 대시보드
 */

import { markWorkerStarted, markWorkerTick } from './worker-status';
import * as path from 'path';
import * as fs from 'fs';

interface DailyHuntRecord {
    date: string;              // YYYY-MM-DD
    timestamp: number;
    category: string;
    totalFound: number;
    sssCount: number;
    ssCount: number;
    sCount: number;
    avgPublisherRevenue: number;
    topKeywords: string[];
}

const huntHistory: DailyHuntRecord[] = [];
const MAX_HISTORY = 365;
let timer: NodeJS.Timeout | null = null;

const TARGET_CATEGORIES = ['subsidy', 'season', 'living', 'recipe', 'parenting'];

// 🔥 한계2 부수기: 영속화 (앱 꺼졌다 켜져도 누적 보존 + 누락 복구)
function getStoreFilePath(): string {
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
    return path.join(dir, 'auto-hunt-store.json');
}

function loadStore(): { history: DailyHuntRecord[]; lastRunAt: number } {
    try {
        const file = getStoreFilePath();
        if (fs.existsSync(file)) {
            const data = JSON.parse(fs.readFileSync(file, 'utf8'));
            return { history: data.history || [], lastRunAt: data.lastRunAt || 0 };
        }
    } catch (err: any) {
        console.warn('[AUTO-HUNT] store load 실패:', err?.message);
    }
    return { history: [], lastRunAt: 0 };
}

function saveStore(): void {
    try {
        const file = getStoreFilePath();
        fs.writeFileSync(file, JSON.stringify({
            history: huntHistory,
            lastRunAt: Date.now(),
        }), 'utf8');
    } catch (err: any) {
        console.warn('[AUTO-HUNT] store save 실패:', err?.message);
    }
}

function scheduleNextRun(): number {
    const now = new Date();
    const next = new Date(now);
    next.setHours(3, 0, 0, 0);
    if (next.getTime() <= now.getTime()) {
        next.setDate(next.getDate() + 1);
    }
    return next.getTime() - now.getTime();
}

async function runDailyHunt(): Promise<void> {
    console.log('[AUTO-HUNT] 🤖 매일 자동 헌팅 시작:', new Date().toISOString());
    try {
        const { huntAdsenseKeywords } = await import('../adsense-keyword-hunter');
        const today = new Date().toISOString().slice(0, 10);

        for (const category of TARGET_CATEGORIES) {
            try {
                const isSafe = ['subsidy', 'season', 'living', 'recipe', 'parenting'].includes(category);
                const result = await huntAdsenseKeywords({
                    category, count: 10,
                    requireRealData: true, newbieMode: true,
                    excludeZeroClickHigh: true, blueOceanOnly: false,
                    minInfoIntent: isSafe ? 30 : 40,
                    minMonthlyRevenue: isSafe ? 200 : 2000,
                });

                const record: DailyHuntRecord = {
                    date: today,
                    timestamp: Date.now(),
                    category,
                    totalFound: result.summary.totalFound,
                    sssCount: result.summary.sssCount,
                    ssCount: result.summary.ssCount,
                    sCount: result.summary.sCount,
                    avgPublisherRevenue: result.summary.avgMonthlyRevenue,
                    topKeywords: result.keywords.slice(0, 5).map(k => k.keyword),
                };
                huntHistory.push(record);
                if (huntHistory.length > MAX_HISTORY * TARGET_CATEGORIES.length) huntHistory.shift();

                // 알림: SS+ 등급 1개 이상 발견 시
                if (record.sssCount + record.ssCount >= 1) {
                    sendDesktopNotification(
                        `💎 ${category}: ${record.sssCount + record.ssCount}개 황금키워드 발견`,
                        `TOP: ${record.topKeywords.slice(0, 3).join(', ')}`
                    );
                }
            } catch (err: any) {
                console.warn(`[AUTO-HUNT] ${category} 실패:`, err?.message);
            }
        }
        markWorkerTick('refresh');
        saveStore();  // 🔥 한계2: 매 헌팅 후 영속화
    } catch (err: any) {
        markWorkerTick('refresh', err?.message);
    }
}

/**
 * Electron Notification API로 데스크톱 알림 전송
 */
function sendDesktopNotification(title: string, body: string): void {
    try {
        const { Notification } = require('electron');
        if (Notification && Notification.isSupported()) {
            new Notification({ title, body, silent: false }).show();
            console.log(`[NOTIFICATION] 🔔 ${title} — ${body}`);
        }
    } catch (err: any) {
        // electron 미설치 환경 (test) — 콘솔만
        console.log(`[NOTIFICATION] 🔔 ${title} — ${body}`);
    }
}

export function startAutoHuntingScheduler(): void {
    if (timer) return;
    markWorkerStarted('refresh');

    // 🔥 한계2: 디스크에서 history 복원 + 누락 헌팅 즉시 보충
    const stored = loadStore();
    if (stored.history.length > 0) {
        huntHistory.push(...stored.history);
        console.log(`[AUTO-HUNT] 💾 영속화 store 복원 — 기존 ${stored.history.length}건 history 로드`);
    }
    const sinceLastRun = Date.now() - (stored.lastRunAt || 0);
    const ONE_DAY = 24 * 60 * 60 * 1000;
    if (stored.lastRunAt && sinceLastRun > ONE_DAY) {
        const missedDays = Math.floor(sinceLastRun / ONE_DAY);
        console.log(`[AUTO-HUNT] 🔄 누락 ${missedDays}일 감지 — 5분 후 즉시 보충 헌팅`);
        setTimeout(() => runDailyHunt(), 5 * 60 * 1000);
    }

    const delay = scheduleNextRun();
    console.log(`[AUTO-HUNT] ✅ 매일 새벽 3시 자동 헌팅 예약 (${Math.round(delay / 1000 / 60)}분 후 첫 실행)`);
    timer = setTimeout(async () => {
        await runDailyHunt();
        timer = setInterval(() => runDailyHunt(), 24 * 60 * 60 * 1000);
    }, delay);
}

export function getDailyHuntHistory(category?: string, days: number = 30): DailyHuntRecord[] {
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    return huntHistory
        .filter(r => r.timestamp >= cutoff)
        .filter(r => !category || r.category === category)
        .sort((a, b) => b.timestamp - a.timestamp);
}

export function getDashboardSummary(): {
    totalRuns: number;
    totalKeywordsFound: number;
    totalSSS: number;
    totalSS: number;
    avgRevenuePerCategory: Record<string, number>;
    last7Days: DailyHuntRecord[];
} {
    const last7d = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const recent = huntHistory.filter(r => r.timestamp >= last7d);
    const avgRev: Record<string, number[]> = {};
    for (const r of recent) {
        if (!avgRev[r.category]) avgRev[r.category] = [];
        avgRev[r.category].push(r.avgPublisherRevenue);
    }
    const avgPerCat: Record<string, number> = {};
    for (const [cat, vals] of Object.entries(avgRev)) {
        avgPerCat[cat] = Math.round(vals.reduce((s, n) => s + n, 0) / vals.length);
    }
    return {
        totalRuns: huntHistory.length,
        totalKeywordsFound: huntHistory.reduce((s, r) => s + r.totalFound, 0),
        totalSSS: huntHistory.reduce((s, r) => s + r.sssCount, 0),
        totalSS: huntHistory.reduce((s, r) => s + r.ssCount, 0),
        avgRevenuePerCategory: avgPerCat,
        last7Days: recent,
    };
}

/**
 * 수동 트리거 (테스트용 + 사용자 즉시 실행)
 */
export async function runDailyHuntNow(): Promise<{ success: boolean; recordCount: number }> {
    const before = huntHistory.length;
    await runDailyHunt();
    return { success: true, recordCount: huntHistory.length - before };
}
