/**
 * LEWORD 비서 — 앱 화면 창구(2026-10-01). 사이트 브리지(/v1/bridge/my-blog/assistant)와 같은 검사 · 같은 실행 함수.
 * 실패 사유엔 경로 · 계정 정보가 섞일 수 있어 화면엔 고칠 방법만 보낸다.
 */
import { ipcMain } from 'electron';
import { sanitizeAssistantInput } from '../../utils/assistant/assistant-prompt';
import { describeAssistantFailure } from '../../utils/assistant/assistant-failure';
import { getEngineCooldown } from '../../utils/agent-cli/engineHealth';
import { runAssistant } from '../assistant-service';

export const ASSISTANT_PROGRESS_CHANNEL = 'assistant-progress';

export function setupAssistantHandlers(): void {
  if (ipcMain.listenerCount('assistant-chat')) return;
  ipcMain.handle('assistant-chat', async (event, raw: unknown) => {
    const input = sanitizeAssistantInput(raw);
    if ('error' in input) return { success: false, error: input.error };
    // 도구를 돌리는 동안 화면에 "검색량 조회 중 …"을 보낸다(2026-10-06) — 자리 실측은 수십 초 걸린다.
    const onProgress = (label: string) => { try { event.sender.send(ASSISTANT_PROGRESS_CHANNEL, { label }); } catch { /* 창이 닫혔을 수 있다 */ } };
    try {
      return { success: true, result: await runAssistant(input, { onProgress }) };
    } catch (error: any) {
      console.warn('[ASSISTANT] 답 실패:', error?.message);
      // 2026-10-06: 엔진별 진짜 원인(한도 · 로그인 · 설치)만 옮긴다 — 원문은 안 넘긴다.
      return { success: false, error: describeAssistantFailure(error, (p) => getEngineCooldown(p as any)?.reason ?? null) };
    }
  });
  console.log('[ASSISTANT] ✅ 비서 핸들러 등록 완료');
}
