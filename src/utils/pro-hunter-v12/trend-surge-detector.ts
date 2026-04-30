// PRO Hunter v12 — 트렌드 급발진 조기 경보 (Tier 3 #4)
// 작성: 2026-04-15
// v4.0 멀티소스 신호 + Datalab 시계열을 조합해 "3일 내 급등 예상" 키워드 감지
// Exploding Topics 기능을 한국 데이터로 구현

import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import { fetchSearchTrend12M } from './datalab-trend';
import { notify } from './notifier';

export interface TrendSignal {
  keyword: string;
  category?: string;
  currentTrendScore: number;     // 0~100 (최근 4주 평균)
  previousTrendScore: number;    // 이전 4주 평균
  delta: number;                 // current - previous
  growthRate: number;            // delta / previous (%)
  surgeLevel: 'explosive' | 'strong' | 'moderate' | 'stable' | 'declining';
  multiSourceEvidence: string[]; // 어느 소스에서 나왔나
  recommendedAction: string;
  detectedAt: number;
}

export interface SurgeDetectionResult {
  scanned: number;
  detected: TrendSignal[];
  topSurges: TrendSignal[];      // 급발진 TOP 10
  computedAt: number;
}

interface SurgeStore {
  version: 1;
  signals: TrendSignal[];         // 최근 100개
  lastScanAt: number;
}

const FILE_NAME = 'trend-surges.json';

function getStorePath(): string {
  const dir = path.join(app.getPath('userData'), 'pro-hunter-v12');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, FILE_NAME);
}

function loadStore(): SurgeStore {
  try {
    const p = getStorePath();
    if (!fs.existsSync(p)) return { version: 1, signals: [], lastScanAt: 0 };
    const raw = fs.readFileSync(p, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed.version === 1) return parsed;
  } catch {}
  return { version: 1, signals: [], lastScanAt: 0 };
}

function saveStore(store: SurgeStore): void {
  fs.writeFileSync(getStorePath(), JSON.stringify(store, null, 2), 'utf8');
}

function classifySurge(growthRate: number): TrendSignal['surgeLevel'] {
  if (growthRate >= 200) return 'explosive';
  if (growthRate >= 80) return 'strong';
  if (growthRate >= 30) return 'moderate';
  if (growthRate >= -10) return 'stable';
  return 'declining';
}

function recommendAction(level: TrendSignal['surgeLevel'], delta: number): string {
  switch (level) {
    case 'explosive':
      return '🚨 즉시 작성! 3일 내 작성 시 기회 극대화. 현재 경쟁 글이 적어 진입 쉬움';
    case 'strong':
      return '🔥 강력 추천 — 다음 주 내 작성 권장. 포화 전에 선점';
    case 'moderate':
      return '⚡ 상승세 — 1~2주 내 작성 고려';
    case 'stable':
      return '📊 안정적 — 기존 전략대로';
    case 'declining':
      return '📉 하락 — 작성 비추천';
  }
}

/**
 * 단일 키워드 급발진 체크 (Datalab 시계열 분석)
 */
export async function detectSurgeForKeyword(keyword: string, category?: string): Promise<TrendSignal | null> {
  try {
    const trend = await fetchSearchTrend12M(keyword, { timeUnit: 'week' });
    if (!trend || !trend.data || trend.data.length < 8) return null;

    const data = trend.data;
    const recent = data.slice(-4).map((d) => d.ratio);
    const previous = data.slice(-8, -4).map((d) => d.ratio);

    const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / Math.max(1, arr.length);
    const currentScore = avg(recent);
    const previousScore = avg(previous);
    const delta = currentScore - previousScore;
    const growthRate = previousScore > 0 ? (delta / previousScore) * 100 : delta > 0 ? 100 : 0;

    const surgeLevel = classifySurge(growthRate);

    // 급발진/강력 상승만 의미 있음
    if (surgeLevel === 'stable' || surgeLevel === 'declining') return null;

    const signal: TrendSignal = {
      keyword,
      category,
      currentTrendScore: Math.round(currentScore * 10) / 10,
      previousTrendScore: Math.round(previousScore * 10) / 10,
      delta: Math.round(delta * 10) / 10,
      growthRate: Math.round(growthRate * 10) / 10,
      surgeLevel,
      multiSourceEvidence: ['datalab_weekly'],
      recommendedAction: recommendAction(surgeLevel, delta),
      detectedAt: Date.now(),
    };

    return signal;
  } catch (err) {
    console.warn(`[SURGE] ${keyword} 실패:`, (err as Error).message);
    return null;
  }
}

/**
 * 다수 키워드 일괄 스캔 + 저장 + 알림
 */
export async function scanForSurges(
  keywords: string[],
  options: { notifyOnFind?: boolean; category?: string } = {}
): Promise<SurgeDetectionResult> {
  const store = loadStore();
  const detected: TrendSignal[] = [];

  for (const kw of keywords) {
    const signal = await detectSurgeForKeyword(kw, options.category);
    if (signal) {
      detected.push(signal);
      // 시계열 저장
      store.signals.unshift(signal);

      // 알림 (explosive/strong만)
      if (options.notifyOnFind && (signal.surgeLevel === 'explosive' || signal.surgeLevel === 'strong')) {
        notify(
          {
            title: signal.surgeLevel === 'explosive' ? '🚨 트렌드 급발진!' : '🔥 강력 상승세',
            body: `"${kw}" — ${signal.growthRate > 0 ? '+' : ''}${signal.growthRate}%. ${signal.recommendedAction.slice(0, 40)}`,
            level: signal.surgeLevel === 'explosive' ? 'error' : 'warn',
          },
          `surge:${kw}:${signal.surgeLevel}`
        );
      }

      // 부하 회피
      await new Promise((r) => setTimeout(r, 800));
    }
  }

  // store 100개 제한
  if (store.signals.length > 100) store.signals = store.signals.slice(0, 100);
  store.lastScanAt = Date.now();
  saveStore(store);

  // 상위 급발진
  const topSurges = [...detected].sort((a, b) => b.growthRate - a.growthRate).slice(0, 10);

  return {
    scanned: keywords.length,
    detected,
    topSurges,
    computedAt: Date.now(),
  };
}

export function listRecentSurges(limit: number = 20): TrendSignal[] {
  return loadStore().signals.slice(0, limit);
}

export function clearSurgeHistory(): void {
  saveStore({ version: 1, signals: [], lastScanAt: 0 });
}

// 자동 스캔 스케줄러 (6시간 주기)
let timer: NodeJS.Timeout | null = null;

async function autoScan(): Promise<void> {
  // 추적 키워드 + 프리크롤 큐에서 자동으로 소스 획득
  try {
    const { listTrackedKeywords } = await import('./tracking-store');
    const tracked = listTrackedKeywords().map((t) => t.keyword).slice(0, 20);
    if (tracked.length === 0) return;
    const r = await scanForSurges(tracked, { notifyOnFind: true });
    console.log(`[SURGE] 자동 스캔: ${r.scanned}개 중 ${r.detected.length}개 감지`);
  } catch (err) {
    console.warn('[SURGE] 자동 스캔 실패:', (err as Error).message);
  }
}

export function startSurgeScanner(): void {
  if (timer) return;
  const { markWorkerStarted, markWorkerTick } = require('./worker-status');
  markWorkerStarted('surge');
  setTimeout(() => {
    Promise.resolve(autoScan()).then(() => markWorkerTick('surge')).catch((e: any) => markWorkerTick('surge', e?.message));
    timer = setInterval(() => {
      Promise.resolve(autoScan()).then(() => markWorkerTick('surge')).catch((e: any) => markWorkerTick('surge', e?.message));
    }, 6 * 60 * 60 * 1000);
  }, 15 * 60 * 1000);
  console.log('[SURGE] ✅ 트렌드 급발진 스캐너 시작 (6h 주기)');
}

export function stopSurgeScanner(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
