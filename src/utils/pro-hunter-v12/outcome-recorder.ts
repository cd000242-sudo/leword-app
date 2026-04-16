// PRO Hunter v12 — Outcome Recorder (Tier 3 #1)
// 작성: 2026-04-15
// 사용자가 작성한 글의 실제 성과(노출/트래픽/수익)를 기록하고 벤치마크 생성

import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import { listTrackedPosts } from './tracking-store';
import { listTrackedKeywords } from './tracking-store';

export interface OutcomeRecord {
  postUrl: string;
  keyword: string;
  category?: string;
  predictedRank: number;
  predictedTraffic: number;
  actualRank: number | null;
  actualMonthlyViews: number | null;     // 사용자가 입력
  actualMonthlyRevenue: number | null;   // 사용자가 입력 (원화)
  firstExposureDays: number | null;      // 작성 → 첫 노출까지 일수
  recordedAt: number;
  notes?: string;
}

export interface BenchmarkStats {
  totalPosts: number;
  avgPredictionAccuracy: number;    // 예측 ±3위 이내 비율
  avgRankError: number;
  avgFirstExposureDays: number;
  totalMonthlyViews: number;
  totalMonthlyRevenue: number;
  avgRevenuePerPost: number;
  avgRevenuePerView: number;        // RPM 환산
  topPerformingKeywords: Array<{ keyword: string; rank: number | null; views: number; revenue: number }>;
  categoryBreakdown: Record<string, { posts: number; avgRank: number | null; revenue: number }>;
  computedAt: number;
}

interface OutcomeStore {
  version: 1;
  records: Record<string, OutcomeRecord>;  // key = postUrl
}

const FILE_NAME = 'outcome-records.json';

function getStorePath(): string {
  const dir = path.join(app.getPath('userData'), 'pro-hunter-v12');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, FILE_NAME);
}

function loadStore(): OutcomeStore {
  try {
    const p = getStorePath();
    if (!fs.existsSync(p)) return { version: 1, records: {} };
    const raw = fs.readFileSync(p, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed.version === 1) return parsed;
  } catch {}
  return { version: 1, records: {} };
}

function saveStore(store: OutcomeStore): void {
  fs.writeFileSync(getStorePath(), JSON.stringify(store, null, 2), 'utf8');
}

export function recordOutcome(outcome: Partial<OutcomeRecord> & { postUrl: string; keyword: string }): OutcomeRecord {
  const store = loadStore();
  const existing = store.records[outcome.postUrl];
  const record: OutcomeRecord = {
    postUrl: outcome.postUrl,
    keyword: outcome.keyword,
    category: outcome.category || existing?.category,
    predictedRank: outcome.predictedRank || existing?.predictedRank || 0,
    predictedTraffic: outcome.predictedTraffic || existing?.predictedTraffic || 0,
    actualRank: outcome.actualRank !== undefined ? outcome.actualRank : existing?.actualRank || null,
    actualMonthlyViews: outcome.actualMonthlyViews !== undefined ? outcome.actualMonthlyViews : existing?.actualMonthlyViews || null,
    actualMonthlyRevenue: outcome.actualMonthlyRevenue !== undefined ? outcome.actualMonthlyRevenue : existing?.actualMonthlyRevenue || null,
    firstExposureDays: outcome.firstExposureDays !== undefined ? outcome.firstExposureDays : existing?.firstExposureDays || null,
    recordedAt: Date.now(),
    notes: outcome.notes || existing?.notes,
  };
  store.records[outcome.postUrl] = record;
  saveStore(store);
  return record;
}

export function listOutcomes(): OutcomeRecord[] {
  return Object.values(loadStore().records);
}

export function deleteOutcome(postUrl: string): void {
  const store = loadStore();
  delete store.records[postUrl];
  saveStore(store);
}

/**
 * 실측 데이터 기반 벤치마크 통계 생성
 */
export function computeBenchmark(): BenchmarkStats {
  const records = listOutcomes();
  const valid = records.filter((r) => r.actualRank != null);

  const totalMonthlyViews = valid.reduce((s, r) => s + (r.actualMonthlyViews || 0), 0);
  const totalMonthlyRevenue = valid.reduce((s, r) => s + (r.actualMonthlyRevenue || 0), 0);

  // 예측 정확도 (±3위 이내)
  const errors = valid
    .filter((r) => r.actualRank != null && r.predictedRank > 0)
    .map((r) => Math.abs((r.actualRank as number) - r.predictedRank));
  const accuracyCount = errors.filter((e) => e <= 3).length;
  const avgAccuracy = errors.length > 0 ? Math.round((accuracyCount / errors.length) * 100) : 0;
  const avgRankError =
    errors.length > 0 ? Math.round((errors.reduce((a, b) => a + b, 0) / errors.length) * 10) / 10 : 0;

  const firstExposureDays = valid.filter((r) => r.firstExposureDays != null);
  const avgFirstExposureDays =
    firstExposureDays.length > 0
      ? Math.round(
          firstExposureDays.reduce((s, r) => s + (r.firstExposureDays as number), 0) / firstExposureDays.length
        )
      : 0;

  // 상위 글
  const topPerforming = [...valid]
    .sort((a, b) => (b.actualMonthlyViews || 0) - (a.actualMonthlyViews || 0))
    .slice(0, 10)
    .map((r) => ({
      keyword: r.keyword,
      rank: r.actualRank,
      views: r.actualMonthlyViews || 0,
      revenue: r.actualMonthlyRevenue || 0,
    }));

  // 카테고리 분석
  const categoryBreakdown: Record<string, { posts: number; avgRank: number | null; revenue: number }> = {};
  for (const r of valid) {
    const cat = r.category || 'uncategorized';
    if (!categoryBreakdown[cat]) {
      categoryBreakdown[cat] = { posts: 0, avgRank: null, revenue: 0 };
    }
    categoryBreakdown[cat].posts++;
    categoryBreakdown[cat].revenue += r.actualMonthlyRevenue || 0;
  }
  for (const cat of Object.keys(categoryBreakdown)) {
    const catRecords = valid.filter((r) => (r.category || 'uncategorized') === cat);
    const ranks = catRecords.filter((r) => r.actualRank != null).map((r) => r.actualRank as number);
    categoryBreakdown[cat].avgRank =
      ranks.length > 0 ? Math.round((ranks.reduce((a, b) => a + b, 0) / ranks.length) * 10) / 10 : null;
  }

  return {
    totalPosts: valid.length,
    avgPredictionAccuracy: avgAccuracy,
    avgRankError,
    avgFirstExposureDays,
    totalMonthlyViews,
    totalMonthlyRevenue,
    avgRevenuePerPost: valid.length > 0 ? Math.round(totalMonthlyRevenue / valid.length) : 0,
    avgRevenuePerView: totalMonthlyViews > 0 ? Math.round((totalMonthlyRevenue / totalMonthlyViews) * 1000) : 0, // RPM (원/천뷰)
    topPerformingKeywords: topPerforming,
    categoryBreakdown,
    computedAt: Date.now(),
  };
}

/**
 * 자동 outcome 반영 — rank-tracker가 매일 체크한 순위를 outcome record에 흡수
 */
export function syncFromRankTracker(): number {
  const posts = listTrackedPosts();
  let synced = 0;
  for (const p of posts) {
    const lastWithRank = [...p.history].reverse().find((h) => h.rank != null);
    if (lastWithRank && lastWithRank.rank != null) {
      const firstWithRank = p.history.find((h) => h.rank != null);
      const firstExposureDays = firstWithRank
        ? Math.round((firstWithRank.ts - p.registeredAt) / 86400000)
        : null;
      recordOutcome({
        postUrl: p.postUrl,
        keyword: p.keyword,
        predictedRank: p.predictedRank,
        predictedTraffic: 0,
        actualRank: lastWithRank.rank,
        firstExposureDays,
      });
      synced++;
    }
  }
  return synced;
}
