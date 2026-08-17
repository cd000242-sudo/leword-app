/**
 * 레인 인사이트 IPC — 키워드 하나에 "문제해결 서브 3 + 제목 2종"을 만든다.
 *
 * 애드센스/네이버/홈판 레인 화면(2026-08-17 재편)의 행 단위 온디맨드 호출.
 * 재료는 전부 실측이다:
 *   서브 후보 = 자동완성·연관 실측 확장(무료) → 검색광고 검색량(상위 15개만, 쿼터 절약)
 *   서브 선별 = 문제해결형 프레임 분류(subkeyword-forge) — 하드코딩 접미사 없음
 *   제목      = title-forge (파생 실측 + 낚시 가드)
 * 검색광고 키가 없으면 검색량 null 로 계속 간다 — 실존 검색어라는 사실은 변하지 않는다.
 */

import { ipcMain } from 'electron';
import { EnvironmentManager } from '../../utils/environment-manager';
import { getNaverAutocompleteKeywords } from '../../utils/naver-autocomplete';
import { pickProblemSubKeywords } from '../../utils/title-forge/subkeyword-forge';
import { forgeTitles } from '../../utils/title-forge/forge';

/** 검색량을 실측할 확장 상한 — 검색광고 쿼터를 아낀다(5개 묶음 3회). */
const VOLUME_SAMPLE_CAP = 15;

export function setupLaneInsightsHandlers(): void {
  ipcMain.handle('forge-lane-insights', async (_event, payload: { keyword?: string } | string) => {
    const keyword = String(typeof payload === 'string' ? payload : payload?.keyword || '').trim();
    if (!keyword) {
      return { success: false, error: '키워드가 비어 있습니다.' };
    }

    try {
      const env = EnvironmentManager.getInstance().getConfig();
      const openApi = { clientId: env.naverClientId || '', clientSecret: env.naverClientSecret || '' };

      // ── 1) 실측 확장 (무료) ──────────────────────────────────────────
      let expansions: string[] = [];
      try {
        expansions = await getNaverAutocompleteKeywords(keyword, openApi as never);
      } catch (error) {
        console.error('[LANE-INSIGHTS] 자동완성 확장 실패:', error);
      }
      const candidates = [...new Set(expansions)]
        .filter((k) => k && k !== keyword)
        .slice(0, 40);

      // ── 2) 검색량 실측 (검색광고, 상위 일부만) ───────────────────────
      const volumes = new Map<string, number>();
      const saLicense = env.naverSearchAdAccessLicense || '';
      const saSecret = env.naverSearchAdSecretKey || '';
      if (saLicense && saSecret && candidates.length > 0) {
        try {
          const { getNaverSearchAdKeywordVolume } = await import('../../utils/naver-searchad-api');
          const cid = (env.naverSearchAdCustomerId || '').trim()
            || saLicense.split(':')[0] || saLicense.substring(0, 10);
          const searchAd = { accessLicense: saLicense, secretKey: saSecret, customerId: cid };
          const sample = candidates.slice(0, VOLUME_SAMPLE_CAP);
          for (let i = 0; i < sample.length; i += 5) {
            const rows = await getNaverSearchAdKeywordVolume(searchAd, sample.slice(i, i + 5));
            for (const row of rows) {
              const total = Number(row.pcSearchVolume || 0) + Number(row.mobileSearchVolume || 0);
              if (total > 0) volumes.set(String(row.keyword).replace(/\s+/g, ''), total);
            }
          }
        } catch (error) {
          // 쿼터 소진·키 오류여도 확장 실측 자체는 유효하다 — 검색량만 null 로 간다.
          console.error('[LANE-INSIGHTS] 검색량 실측 실패(검색량 없이 계속):', error);
        }
      }

      const derived = candidates.map((k) => ({
        keyword: k,
        searchVolume: volumes.get(k.replace(/\s+/g, '')) ?? null,
      }));

      // ── 3) 선별 + 제목 ───────────────────────────────────────────────
      const subs = pickProblemSubKeywords(keyword, derived);
      const titles = forgeTitles({
        keyword,
        derivedKeywords: derived,
        // 데스크톱 온디맨드 경로에는 SERP 실측이 없다 — 빈 배열이면 프레임 분석이
        // "빈 프레임" 판단을 못 하므로 지원 프레임 중 근거 강한 것을 쓴다(가드 유지).
        serpTitles: [],
      });

      return {
        success: true,
        keyword,
        subs,
        titles,
        expansionCount: candidates.length,
        volumesMeasured: volumes.size,
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[LANE-INSIGHTS] 실패:', message);
      return { success: false, error: message };
    }
  });
}
