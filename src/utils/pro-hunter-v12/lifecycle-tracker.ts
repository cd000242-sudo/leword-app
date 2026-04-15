// PRO Hunter v12 — Lifecycle Tracker (Phase E)
// 작성: 2026-04-15
// 추적 키워드의 문서수/검색량을 매일 모니터링 → 포화/하락 알림

import { listTrackedKeywords, recordKeywordCheck } from './tracking-store';
import { EnvironmentManager } from '../environment-manager';

const CHECK_INTERVAL_MS = 12 * 60 * 60 * 1000; // 12시간
let timer: NodeJS.Timeout | null = null;

async function fetchDocCount(keyword: string): Promise<number | null> {
  const env = EnvironmentManager.getInstance().getConfig();
  if (!env.naverClientId || !env.naverClientSecret) return null;

  try {
    const axios = (await import('axios')).default;
    const r = await axios.get('https://openapi.naver.com/v1/search/blog.json', {
      params: { query: keyword, display: 1 },
      headers: {
        'X-Naver-Client-Id': env.naverClientId,
        'X-Naver-Client-Secret': env.naverClientSecret,
      },
      timeout: 8000,
    });
    return r.data?.total ?? null;
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
    const { getNaverSearchAdKeywordSuggestions } = await import('../naver-searchad-api');
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
      const item = r[0] as any;
      const pc = Number(item.monthlyPcQcCnt) || 0;
      const mo = Number(item.monthlyMobileQcCnt) || 0;
      return pc + mo;
    }
  } catch {
    /* ignore */
  }
  return null;
}

async function runCheck(): Promise<void> {
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
        // 새 알림이 있으면 카운트
        const lastAlertTs = updated.alerts[updated.alerts.length - 1]?.ts;
        if (lastAlertTs && Date.now() - lastAlertTs < 60 * 1000) alerts++;
      }
      // rate limit 방지
      await new Promise((r) => setTimeout(r, 800));
    } catch (err) {
      console.warn(`[LIFECYCLE] ${t.keyword} 체크 실패:`, (err as Error).message);
    }
  }

  console.log(`[LIFECYCLE] ✅ ${success}/${tracked.length} 체크 완료, 알림 ${alerts}건`);
}

export function startLifecycleTracker(): void {
  if (timer) return;
  // 첫 실행은 60초 뒤
  setTimeout(() => {
    runCheck();
    timer = setInterval(runCheck, CHECK_INTERVAL_MS);
  }, 60 * 1000);
  console.log('[LIFECYCLE] ✅ 라이프사이클 추적 시작 (12h 주기)');
}

export function stopLifecycleTracker(): void {
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
