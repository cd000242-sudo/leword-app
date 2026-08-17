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

  /*
   * 회차 보드 — 웹과 같은 데이터를 앱에서도 본다("앱은 되는데 웹은 안 되고
   * 이러면 안 된다"의 역방향 격차: 보드는 웹이 더 좋았다). 발행본은 공개
   * 정적 파일이므로 그대로 읽고, 10분 캐시로 사이트에 부담을 안 준다.
   * 실패하면 success:false — 화면은 로컬 발굴 결과로 폴백한다.
   */
  let boardCache: { at: number; body: unknown } | null = null;
  ipcMain.handle('get-preemption-board', async () => {
    if (boardCache && Date.now() - boardCache.at < 10 * 60_000) {
      return boardCache.body;
    }
    try {
      const https = await import('https');
      const body = await new Promise<string>((resolve, reject) => {
        const req = https.get('https://leaderspro.kr/data/preemption-board.json', { timeout: 15_000 }, (res) => {
          if ((res.statusCode || 0) >= 400) { reject(new Error(`HTTP ${res.statusCode}`)); return; }
          const chunks: Buffer[] = [];
          res.on('data', (c: Buffer) => chunks.push(c));
          res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
        });
        req.on('timeout', () => { req.destroy(new Error('timeout')); });
        req.on('error', reject);
      });
      const parsed = JSON.parse(body);
      const result = { success: true, publishedAt: parsed.publishedAt || null, rows: parsed.rows || [] };
      boardCache = { at: Date.now(), body: result };
      return result;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
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
