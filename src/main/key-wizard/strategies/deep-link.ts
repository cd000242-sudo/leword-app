// LEWORD Key Wizard — 외부 브라우저 딥링크 헬퍼
// 작성: 2026-04-15

import { shell } from 'electron';

export async function openExternal(url: string): Promise<void> {
  try {
    await shell.openExternal(url);
  } catch (err) {
    console.error('[KEY-WIZARD][deep-link] 외부 브라우저 열기 실패:', err);
    throw new Error('외부 브라우저를 열 수 없습니다: ' + (err as Error).message);
  }
}
