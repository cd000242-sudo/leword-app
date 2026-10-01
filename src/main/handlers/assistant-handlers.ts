/**
 * LEWORD 비서 — 앱 화면 창구(2026-10-01). 사이트 브리지(/v1/bridge/my-blog/assistant)와 같은 검사 · 같은 실행 함수.
 * 실패 사유엔 경로 · 계정 정보가 섞일 수 있어 화면엔 고칠 방법만 보낸다.
 */
import { ipcMain } from 'electron';
import { sanitizeAssistantInput } from '../../utils/assistant/assistant-prompt';
import { runAssistant } from '../assistant-service';

export function setupAssistantHandlers(): void {
  if (ipcMain.listenerCount('assistant-chat')) return;
  ipcMain.handle('assistant-chat', async (_event, raw: unknown) => {
    const input = sanitizeAssistantInput(raw);
    if ('error' in input) return { success: false, error: input.error };
    try {
      return { success: true, result: await runAssistant(input) };
    } catch (error: any) {
      console.warn('[ASSISTANT] 답 실패:', error?.message);
      return { success: false, error: 'AI 엔진이 답하지 못했습니다 — 설정의 AI 연결(처음 설정 마법사)을 확인해 주세요.' };
    }
  });
  console.log('[ASSISTANT] ✅ 비서 핸들러 등록 완료');
}
