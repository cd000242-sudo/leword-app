// PRO Hunter v12 — Lifecycle Tracker (Phase E)
// 작성: 2026-04-15
// 추적 키워드의 문서수/검색량을 매일 모니터링 → 포화/하락 알림

import { listTrackedKeywords, recordKeywordCheck } from './tracking-store';
import { EnvironmentManager } from '../environment-manager';
import { notifyKeywordSaturation, notifyKeywordDecay } from './notifier';
import { calibrateVolume } from './volume-calibrator';
import { getNaverBlogDocumentCount } from '../naver-blog-api';

const CHECK_INTERVAL_MS = 12 * 60 * 60 * 1000; // 12시간
let timer: NodeJS.Timeout | null = null;
let initTimer: NodeJS.Timeout | null = null;

async function fetchDocCount(keyword: string): Promise<number | null> {
  const env = EnvironmentManager.getInstance().getConfig();
  if (!env.naverClientId || !env.naverClientSecret) return null;

  try {
    return await getNaverBlogDocumentCount(keyword, {
      config: {
        clientId: env.naverClientId,
        clientSecret: env.naverClientSecret,
      },
      timeoutMs: 8000,
    });
  } catch {
    return null;
  }
}

async function fetchSearchVolume(keyword: string): Promise<number | null> {
  const env = EnvironmentManager.getInstance().getConfig();
  if (!env.naverSearchAdAccessLicense || !env.naverSearchAdSecretKey || !env.naverSearchAdCustomerId) {
    return null;
  }
  try {
    const {
      exactSearchAdTotal,
      getNaverSearchAdKeywordSuggestions,
    } = await import('../naver-searchad-api');
    const r = await getNaverSearchAdKeywordSuggestions(
      {
        accessLicense: env.naverSearchAdAccessLicense,
        secretKey: env.naverSearchAdSecretKey,
        customerId: env.naverSearchAdCustomerId,
      },
      keyword,
      1
    );
    if (Array.isArray(r) && r.length > 0) {
      const raw = exactSearchAdTotal(r[0]);
      if (raw === null) return null;
      // Tier 1: 보정된 검색량 반환
      return calibrateVolume(raw, keyword);
    }
  } catch {
    /* ignore */
  }
  return null;
}

async function runCheck(): Promise<void> {
  // v2.46.0 E: 사용자 발굴 중이면 skip
  try {
    const { shouldSkipBackground } = require('../hunt-progress-flag');
    if (shouldSkipBackground()) {
      console.log('[LIFECYCLE] ⏸ 사용자 발굴 중 — 추적 skip');
      return;
    }
  } catch {}
  const tracked = listTrackedKeywords();
  if (tracked.length === 0) return;

  console.log(`[LIFECYCLE] 추적 키워드 ${tracked.length}개 체크 시작`);
  let success = 0;
  let alerts = 0;

  for (const t of tracked) {
    try {
      const [docCount, searchVolume] = await Promise.all([
        fetchDocCount(t.keyword),
        fetchSearchVolume(t.keyword),
      ]);
      if (docCount == null) continue;
      const updated = recordKeywordCheck(t.keyword, docCount, searchVolume);
      if (updated) {
        success++;
        // 새 알림이 있으면 OS notification 발송
        const lastAlert = updated.alerts[updated.alerts.length - 1];
        if (lastAlert && Date.now() - lastAlert.ts < 60 * 1000) {
          alerts++;
          if (lastAlert.type === 'saturation') {
            const m = lastAlert.message.match(/\+(\d+)/);
            const dailyGrowth = m ? Number(m[1]) : 50;
            notifyKeywordSaturation(t.keyword, dailyGrowth);
          } else if (lastAlert.type === 'decay') {
            const m = lastAlert.message.match(/(-?\d+)%/);
            const pct = m ? Number(m[1]) / 100 : -0.15;
            notifyKeywordDecay(t.keyword, pct);
          }
        }
      }
      await new Promise((r) => setTimeout(r, 800));
    } catch (err) {
      console.warn(`[LIFECYCLE] ${t.keyword} 체크 실패:`, (err as Error).message);
    }
  }

  console.log(`[LIFECYCLE] ✅ ${success}/${tracked.length} 체크 완료, 알림 ${alerts}건`);
}

export function startLifecycleTracker(): void {
  if (timer || initTimer) return;
  const { markWorkerStarted, markWorkerTick } = require('./worker-status');
  markWorkerStarted('lifecycle');
  initTimer = setTimeout(() => {
    initTimer = null;
    runCheck().then(() => markWorkerTick('lifecycle')).catch((e: any) => markWorkerTick('lifecycle', e?.message));
    timer = setInterval(() => {
      runCheck().then(() => markWorkerTick('lifecycle')).catch((e: any) => markWorkerTick('lifecycle', e?.message));
    }, CHECK_INTERVAL_MS);
    (timer as any).unref?.(); // v2.45.0: idle CPU 감소
  }, 60 * 1000);
  (initTimer as any).unref?.();
  console.log('[LIFECYCLE] ✅ 라이프사이클 추적 시작 (12h 주기)');
}

export function stopLifecycleTracker(): void {
  if (initTimer) {
    clearTimeout(initTimer);
    initTimer = null;
  }
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

export async function runLifecycleCheckNow(): Promise<{ checked: number; alerts: number }> {
  const tracked = listTrackedKeywords();
  let checked = 0;
  let alerts = 0;
  for (const t of tracked) {
    try {
      const [docCount, sv] = await Promise.all([fetchDocCount(t.keyword), fetchSearchVolume(t.keyword)]);
      if (docCount == null) continue;
      const updated = recordKeywordCheck(t.keyword, docCount, sv);
      if (updated) {
        checked++;
        const last = updated.alerts[updated.alerts.length - 1];
        if (last && Date.now() - last.ts < 60 * 1000) alerts++;
      }
      await new Promise((r) => setTimeout(r, 500));
    } catch {
      /* ignore */
    }
  }
  return { checked, alerts };
}
