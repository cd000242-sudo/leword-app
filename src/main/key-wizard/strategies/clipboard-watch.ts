// LEWORD Key Wizard — 클립보드 감시 전략
// 작성: 2026-04-15
// 사용자가 발급 페이지에서 키를 복사하면 정규식으로 자동 감지해 저장한다.

import { clipboard } from 'electron';
import type { ClipboardPattern } from '../types';

export interface ClipboardWatchOptions {
  patterns: ClipboardPattern[];
  pollIntervalMs?: number;
  timeoutMs?: number;
  onMatch?: (name: string, value: string) => void;
  onTick?: (detected: Record<string, boolean>) => void;
  signal?: AbortSignal;
}

export interface ClipboardWatchResult {
  success: boolean;
  collected: Record<string, string>;
  reason?: 'completed' | 'timeout' | 'aborted';
}

export async function watchClipboardForKeys(
  opts: ClipboardWatchOptions
): Promise<ClipboardWatchResult> {
  const interval = opts.pollIntervalMs ?? 500;
  const timeoutMs = opts.timeoutMs ?? 5 * 60 * 1000;
  const required = opts.patterns.filter((p) => p.required).map((p) => p.name);
  const collected: Record<string, string> = {};
  const detected: Record<string, boolean> = {};
  for (const p of opts.patterns) detected[p.name] = false;

  // 시작 직전의 클립보드 값을 무시 — 사용자가 새로 복사한 것만 감지
  let lastSeen = '';
  try {
    lastSeen = clipboard.readText('clipboard');
  } catch {
    /* ignore */
  }

  const startedAt = Date.now();

  return new Promise((resolve) => {
    const timer = setInterval(() => {
      // 1) 취소 확인
      if (opts.signal?.aborted) {
        clearInterval(timer);
        resolve({ success: false, collected, reason: 'aborted' });
        return;
      }

      // 2) 타임아웃 확인
      if (Date.now() - startedAt > timeoutMs) {
        clearInterval(timer);
        const ok = required.every((r) => collected[r]);
        resolve({ success: ok, collected, reason: ok ? 'completed' : 'timeout' });
        return;
      }

      // 3) 클립보드 읽기
      let text = '';
      try {
        text = clipboard.readText('clipboard');
      } catch {
        return;
      }

      if (!text || text === lastSeen) return;
      lastSeen = text;

      // 4) 패턴 매칭 (단일 값 또는 줄바꿈/공백 분리 다중 토큰 지원)
      const tokens = text.split(/[\s,;\n]+/).map((t) => t.trim()).filter(Boolean);
      tokens.unshift(text.trim()); // 전체 텍스트도 시도

      let anyNew = false;
      for (const token of tokens) {
        for (const pattern of opts.patterns) {
          if (collected[pattern.name]) continue;
          if (pattern.regex.test(token)) {
            collected[pattern.name] = token;
            detected[pattern.name] = true;
            anyNew = true;
            opts.onMatch?.(pattern.name, token);
          }
        }
      }

      if (anyNew) {
        opts.onTick?.(detected);
      }

      // 5) 모든 required 충족 시 즉시 종료
      const allDone = required.every((r) => collected[r]);
      if (allDone) {
        clearInterval(timer);
        resolve({ success: true, collected, reason: 'completed' });
      }
    }, interval);
  });
}
