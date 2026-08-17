/**
 * 레인 인사이트 IPC — 얇은 래퍼. 실체는 lane-insights-service 다
 * (웹 브리지와 공용이라 분리 — 사이트도 사용자 PC 의 클로드코드를 쓴다).
 */

import { ipcMain } from 'electron';
import { forgeLaneInsights } from '../lane-insights-service';

export function setupLaneInsightsHandlers(): void {
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
