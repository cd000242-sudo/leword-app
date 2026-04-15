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

  console.log('[KEYWORD-MASTER] ✅ pro-hunter-v12 핸들러 등록 완료 (14채널)');
}
