/**
 * 키워드 수요 분석 IPC — 얇은 래퍼. 실체는 keyword-demand-service 다.
 * (황금키워드 레인의 get-preemption-board / forge-lane-insights 는 2026-09-09 사이트로 이관하며 삭제.
 *  forge 실체 lane-insights-service 는 웹 브리지가 계속 쓴다.)
 */

import { ipcMain } from 'electron';
import { analyzeKeywordDemand } from '../keyword-demand-service';

export function setupLaneInsightsHandlers(): void {
  /*
   * 키워드 분석기의 두뇌 — "왜 많이 검색하나" + "무엇을 이어서 검색하나".
   * 규칙 확장(rich-feed-drilldown)과 달리 사용자 **본인 구독**이 개입한다.
   * 구독이 하나도 없으면 agent.error='no_agent' 로 돌려주고, 화면이 설치를 권한다.
   */
  ipcMain.handle('analyze-keyword-demand', async (_event, payload: { keyword?: string; light?: boolean } | string) => {
    const keyword = String(typeof payload === 'string' ? payload : payload?.keyword || '').trim();
    const light = typeof payload === 'object' && payload?.light === true;
    if (!keyword) {
      return { success: false, error: '키워드가 비어 있습니다.' };
    }
    try {
      return await analyzeKeywordDemand(keyword, { light });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[DEMAND] 실패:', message);
      return { success: false, error: message };
    }
  });
}
