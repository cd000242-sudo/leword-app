/**
 * 레인 인사이트 IPC — 얇은 래퍼. 실체는 lane-insights-service 다
 * (웹 브리지와 공용이라 분리 — 사이트도 사용자 PC 의 클로드코드를 쓴다).
 */

import { ipcMain } from 'electron';
import { forgeLaneInsights } from '../lane-insights-service';
import { analyzeKeywordDemand } from '../keyword-demand-service';

export function setupLaneInsightsHandlers(): void {
  /*
   * 키워드 분석기의 두뇌 — "왜 많이 검색하나" + "무엇을 이어서 검색하나".
   * 규칙 확장(rich-feed-drilldown)과 달리 사용자 **본인 구독**이 개입한다.
   * 구독이 하나도 없으면 agent.error='no_agent' 로 돌려주고, 화면이 설치를 권한다.
   */
  ipcMain.handle('analyze-keyword-demand', async (_event, payload: { keyword?: string } | string) => {
    const keyword = String(typeof payload === 'string' ? payload : payload?.keyword || '').trim();
    if (!keyword) {
      return { success: false, error: '키워드가 비어 있습니다.' };
    }
    try {
      return await analyzeKeywordDemand(keyword);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[DEMAND] 실패:', message);
      return { success: false, error: message };
    }
  });

  ipcMain.handle('forge-lane-insights', async (_event, payload: { keyword?: string } | string) => {
    const keyword = String(typeof payload === 'string' ? payload : payload?.keyword || '').trim();
    if (!keyword) {
      return { success: false, error: '키워드가 비어 있습니다.' };
    }
    try {
      return await forgeLaneInsights(keyword);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[LANE-INSIGHTS] 실패:', message);
      return { success: false, error: message };
    }
  });
}
