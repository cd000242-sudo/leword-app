// PRO Hunter v12 — Keyword Blueprint + 모든 Phase B-F IPC 핸들러
// 작성: 2026-04-15

import { ipcMain } from 'electron';
import { generateKeywordBlueprint, clearBlueprintCache } from '../../utils/pro-hunter-v12';
import { measureBlog, loadProfile, saveProfile, deleteProfile } from '../../utils/pro-hunter-v12/user-profile';
import { expandToCluster } from '../../utils/pro-hunter-v12/cluster-expander';
import {
  listTrackedKeywords,
  removeTrackedKeyword,
  addTrackedPost,
  listTrackedPosts,
  removeTrackedPost,
} from '../../utils/pro-hunter-v12/tracking-store';
import { runLifecycleCheckNow } from '../../utils/pro-hunter-v12/lifecycle-tracker';
import { runRankCheckNow } from '../../utils/pro-hunter-v12/rank-tracker';
import { generateDraft } from '../../utils/pro-hunter-v12/draft-generator';
import { analyzeSeasonality } from '../../utils/pro-hunter-v12/seasonality-analyzer';
import { computeSelfMetrics } from '../../utils/pro-hunter-v12/self-metrics';
import { retrainFromTracking, getModelMetrics } from '../../utils/pro-hunter-v12/model-retrainer';
import { getCompetitorInsight, getAuthorityStats } from '../../utils/pro-hunter-v12/authority-db';
import { enqueueBatch, runPrecrawlNow, getPrecrawlStatus } from '../../utils/pro-hunter-v12/precrawler';
import { generatePyramidPlan } from '../../utils/pro-hunter-v12/pyramid-planner';
import {
  recordOutcome,
  listOutcomes,
  deleteOutcome,
  computeBenchmark,
  syncFromRankTracker,
} from '../../utils/pro-hunter-v12/outcome-recorder';
import { generateBlockEntryPlan } from '../../utils/pro-hunter-v12/smartblock-assistant';
import {
  estimateRevenue,
  loadRevenueConfig,
  saveRevenueConfig,
  getCategoryRpmTable,
  estimatePortfolioRevenue,
} from '../../utils/pro-hunter-v12/revenue-estimator';
import {
  scanForSurges,
  detectSurgeForKeyword,
  listRecentSurges,
} from '../../utils/pro-hunter-v12/trend-surge-detector';

const CHANNELS = [
  'generate-keyword-blueprint',
  'clear-blueprint-cache',
  'pro12-measure-blog',
  'pro12-get-profile',
  'pro12-save-profile',
  'pro12-delete-profile',
  'pro12-expand-cluster',
  'pro12-list-tracked-keywords',
  'pro12-remove-tracked-keyword',
  'pro12-run-lifecycle-check',
  'pro12-add-tracked-post',
  'pro12-list-tracked-posts',
  'pro12-remove-tracked-post',
  'pro12-run-rank-check',
  'pro12-generate-draft',
  'pro12-analyze-seasonality',
  'pro12-self-metrics',
  'pro12-retrain-model',
  'pro12-authority-insight',
  'pro12-authority-stats',
  'pro12-precrawl-enqueue',
  'pro12-precrawl-run',
  'pro12-precrawl-status',
  'pro12-generate-pyramid',
  // Tier 3
  'pro12-record-outcome',
  'pro12-list-outcomes',
  'pro12-delete-outcome',
  'pro12-compute-benchmark',
  'pro12-sync-outcomes',
  'pro12-block-entry-plan',
  'pro12-estimate-revenue',
  'pro12-revenue-config',
  'pro12-save-revenue-config',
  'pro12-category-rpm-table',
  'pro12-portfolio-revenue',
  'pro12-scan-surges',
  'pro12-detect-surge',
  'pro12-list-surges',
];

export function setupKeywordBlueprintHandlers(): void {
  for (const ch of CHANNELS) {
    try {
      ipcMain.removeHandler(ch);
    } catch {}
  }

  // ── Blueprint (Phase A + B 통합) ──
  ipcMain.handle('generate-keyword-blueprint', async (_e, payload: { keyword: string; force?: boolean; searchVolume?: number | null }) => {
    try {
      if (!payload || typeof payload.keyword !== 'string' || !payload.keyword.trim()) {
        return { success: false, error: '키워드가 비어있습니다.' };
      }
      const result = await generateKeywordBlueprint(payload.keyword.trim(), {
        force: !!payload.force,
        searchVolume: payload.searchVolume,
      });
      return {
        success: true,
        blueprint: result.blueprint,
        analysis: {
          postCount: result.analysis.postCount,
          avgWordCount: result.analysis.avgWordCount,
          recommendedWordCount: result.analysis.recommendedWordCount,
          avgImageCount: result.analysis.avgImageCount,
          avgH2Count: result.analysis.avgH2Count,
          avgVideoCount: result.analysis.avgVideoCount,
          videoUsageRatio: result.analysis.videoUsageRatio,
          oldPostRatio: result.analysis.oldPostRatio,
          mustIncludeTerms: result.analysis.mustIncludeTerms,
          competitorTitles: result.analysis.competitorTitles,
        },
        gaps: result.gaps,
        prediction: result.prediction,
        durationMs: result.durationMs,
      };
    } catch (err: any) {
      console.error('[BLUEPRINT] 생성 실패:', err);
      return { success: false, error: err?.message || '생성 실패' };
    }
  });

  ipcMain.handle('clear-blueprint-cache', async () => {
    clearBlueprintCache();
    return { success: true };
  });

  // ── Phase C: User Profile ──
  ipcMain.handle('pro12-measure-blog', async (_e, payload: { url: string }) => {
    try {
      if (!payload?.url) return { success: false, error: 'URL 누락' };
      const profile = await measureBlog(payload.url);
      saveProfile(profile);
      return { success: true, profile };
    } catch (err: any) {
      return { success: false, error: err?.message || '측정 실패' };
    }
  });

  ipcMain.handle('pro12-get-profile', async () => {
    return { success: true, profile: loadProfile() };
  });

  ipcMain.handle('pro12-save-profile', async (_e, payload: { profile: any }) => {
    try {
      if (!payload?.profile) return { success: false, error: 'profile 누락' };
      saveProfile({ ...payload.profile, manualOverride: true, lastMeasuredAt: Date.now() });
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message };
    }
  });

  ipcMain.handle('pro12-delete-profile', async () => {
    deleteProfile();
    return { success: true };
  });

  // ── Phase D: Cluster ──
  ipcMain.handle('pro12-expand-cluster', async (_e, payload: { keyword: string }) => {
    try {
      if (!payload?.keyword) return { success: false, error: '키워드 누락' };
      const cluster = await expandToCluster(payload.keyword);
      return { success: true, cluster };
    } catch (err: any) {
      return { success: false, error: err?.message };
    }
  });

  // ── Phase E: Lifecycle Tracking ──
  ipcMain.handle('pro12-list-tracked-keywords', async () => {
    return { success: true, keywords: listTrackedKeywords() };
  });

  ipcMain.handle('pro12-remove-tracked-keyword', async (_e, payload: { keyword: string }) => {
    if (!payload?.keyword) return { success: false, error: '키워드 누락' };
    removeTrackedKeyword(payload.keyword);
    return { success: true };
  });

  ipcMain.handle('pro12-run-lifecycle-check', async () => {
    try {
      const r = await runLifecycleCheckNow();
      return { success: true, ...r };
    } catch (err: any) {
      return { success: false, error: err?.message };
    }
  });

  // ── Phase F: Rank Tracking ──
  ipcMain.handle('pro12-add-tracked-post', async (_e, payload: { postUrl: string; keyword: string; predictedRank: number }) => {
    if (!payload?.postUrl || !payload?.keyword) return { success: false, error: '필드 누락' };
    addTrackedPost(payload.postUrl, payload.keyword, Number(payload.predictedRank) || 5);
    return { success: true };
  });

  ipcMain.handle('pro12-list-tracked-posts', async () => {
    return { success: true, posts: listTrackedPosts() };
  });

  ipcMain.handle('pro12-remove-tracked-post', async (_e, payload: { postUrl: string }) => {
    if (!payload?.postUrl) return { success: false, error: 'postUrl 누락' };
    removeTrackedPost(payload.postUrl);
    return { success: true };
  });

  ipcMain.handle('pro12-run-rank-check', async () => {
    try {
      const r = await runRankCheckNow();
      return { success: true, ...r };
    } catch (err: any) {
      return { success: false, error: err?.message };
    }
  });

  // ── 100점 신규 채널 ──
  ipcMain.handle('pro12-generate-draft', async (_e, payload: { blueprint: any }) => {
    try {
      if (!payload?.blueprint) return { success: false, error: 'blueprint 누락' };
      const draft = await generateDraft(payload.blueprint);
      return { success: true, draft };
    } catch (err: any) {
      return { success: false, error: err?.message };
    }
  });

  ipcMain.handle('pro12-analyze-seasonality', async (_e, payload: { keyword: string }) => {
    try {
      if (!payload?.keyword) return { success: false, error: '키워드 누락' };
      const seasonality = await analyzeSeasonality(payload.keyword);
      return { success: true, seasonality };
    } catch (err: any) {
      return { success: false, error: err?.message };
    }
  });

  ipcMain.handle('pro12-self-metrics', async () => {
    try {
      return { success: true, metrics: computeSelfMetrics(), modelWeights: getModelMetrics() };
    } catch (err: any) {
      return { success: false, error: err?.message };
    }
  });

  ipcMain.handle('pro12-retrain-model', async () => {
    try {
      const r = retrainFromTracking();
      return { success: true, ...r };
    } catch (err: any) {
      return { success: false, error: err?.message };
    }
  });

  // ── Tier 2 신규 채널 ──
  ipcMain.handle('pro12-authority-insight', async (_e, payload: { category?: string }) => {
    try {
      return { success: true, insight: getCompetitorInsight(payload?.category) };
    } catch (err: any) {
      return { success: false, error: err?.message };
    }
  });

  ipcMain.handle('pro12-authority-stats', async () => {
    return { success: true, stats: getAuthorityStats() };
  });

  ipcMain.handle('pro12-precrawl-enqueue', async (_e, payload: { keywords: string[]; category?: string }) => {
    if (!Array.isArray(payload?.keywords)) return { success: false, error: 'keywords 필요' };
    enqueueBatch(payload.keywords, payload.category, 8);
    return { success: true, count: payload.keywords.length };
  });

  ipcMain.handle('pro12-precrawl-run', async () => {
    try {
      const r = await runPrecrawlNow();
      return { success: true, ...r };
    } catch (err: any) {
      return { success: false, error: err?.message };
    }
  });

  ipcMain.handle('pro12-precrawl-status', async () => {
    return { success: true, ...getPrecrawlStatus() };
  });

  ipcMain.handle('pro12-generate-pyramid', async (_e, payload: { keyword: string }) => {
    try {
      if (!payload?.keyword) return { success: false, error: '키워드 누락' };
      const cluster = await expandToCluster(payload.keyword);
      const plan = await generatePyramidPlan(cluster);
      return { success: true, plan, cluster };
    } catch (err: any) {
      return { success: false, error: err?.message };
    }
  });

  // ── Tier 3 채널 ──
  ipcMain.handle('pro12-record-outcome', async (_e, payload: any) => {
    try {
      if (!payload?.postUrl || !payload?.keyword) return { success: false, error: 'postUrl/keyword 필요' };
      const r = recordOutcome(payload);
      return { success: true, record: r };
    } catch (err: any) {
      return { success: false, error: err?.message };
    }
  });

  ipcMain.handle('pro12-list-outcomes', async () => {
    return { success: true, outcomes: listOutcomes() };
  });

  ipcMain.handle('pro12-delete-outcome', async (_e, payload: { postUrl: string }) => {
    if (!payload?.postUrl) return { success: false, error: 'postUrl 필요' };
    deleteOutcome(payload.postUrl);
    return { success: true };
  });

  ipcMain.handle('pro12-compute-benchmark', async () => {
    try {
      return { success: true, benchmark: computeBenchmark() };
    } catch (err: any) {
      return { success: false, error: err?.message };
    }
  });

  ipcMain.handle('pro12-sync-outcomes', async () => {
    try {
      const synced = syncFromRankTracker();
      return { success: true, synced };
    } catch (err: any) {
      return { success: false, error: err?.message };
    }
  });

  ipcMain.handle('pro12-block-entry-plan', async (_e, payload: { keyword: string; blockType: any; smartBlocks?: any }) => {
    try {
      if (!payload?.keyword || !payload?.blockType) return { success: false, error: '필드 누락' };
      const plan = await generateBlockEntryPlan(payload.keyword, payload.blockType, payload.smartBlocks);
      return { success: true, plan };
    } catch (err: any) {
      return { success: false, error: err?.message };
    }
  });

  ipcMain.handle('pro12-estimate-revenue', async (_e, payload: { keyword: string; monthlyViews: number; category?: string }) => {
    try {
      if (!payload?.keyword || typeof payload.monthlyViews !== 'number') {
        return { success: false, error: '필드 누락' };
      }
      return { success: true, estimate: estimateRevenue(payload.keyword, payload.monthlyViews, payload.category) };
    } catch (err: any) {
      return { success: false, error: err?.message };
    }
  });

  ipcMain.handle('pro12-revenue-config', async () => {
    return { success: true, config: loadRevenueConfig() };
  });

  ipcMain.handle('pro12-save-revenue-config', async (_e, payload: any) => {
    try {
      saveRevenueConfig(payload || {});
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message };
    }
  });

  ipcMain.handle('pro12-category-rpm-table', async () => {
    return { success: true, table: getCategoryRpmTable() };
  });

  ipcMain.handle('pro12-portfolio-revenue', async (_e, payload: { items: any[] }) => {
    try {
      if (!Array.isArray(payload?.items)) return { success: false, error: 'items 필요' };
      return { success: true, result: estimatePortfolioRevenue(payload.items) };
    } catch (err: any) {
      return { success: false, error: err?.message };
    }
  });

  ipcMain.handle('pro12-scan-surges', async (_e, payload: { keywords: string[]; category?: string; notify?: boolean }) => {
    try {
      if (!Array.isArray(payload?.keywords)) return { success: false, error: 'keywords 필요' };
      const r = await scanForSurges(payload.keywords, { notifyOnFind: !!payload.notify, category: payload.category });
      return { success: true, ...r };
    } catch (err: any) {
      return { success: false, error: err?.message };
    }
  });

  ipcMain.handle('pro12-detect-surge', async (_e, payload: { keyword: string; category?: string }) => {
    try {
      if (!payload?.keyword) return { success: false, error: '키워드 필요' };
      const signal = await detectSurgeForKeyword(payload.keyword, payload.category);
      return { success: true, signal };
    } catch (err: any) {
      return { success: false, error: err?.message };
    }
  });

  ipcMain.handle('pro12-list-surges', async (_e, payload?: { limit?: number }) => {
    return { success: true, surges: listRecentSurges(payload?.limit || 20) };
  });

  console.log('[KEYWORD-MASTER] ✅ pro-hunter-v12 핸들러 등록 완료 (38채널)');
}
