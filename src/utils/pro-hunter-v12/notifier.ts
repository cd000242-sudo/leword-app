// PRO Hunter v12 — 알림 시스템 (Electron Notification)
// 작성: 2026-04-15

import { Notification, BrowserWindow } from 'electron';

export type NotifyLevel = 'info' | 'warn' | 'success' | 'error';

export interface NotifyPayload {
  title: string;
  body: string;
  level?: NotifyLevel;
  silent?: boolean;
  onClick?: () => void;
}

const recentKeys = new Map<string, number>();
const DEDUPE_WINDOW = 60 * 60 * 1000; // 1시간 내 같은 알림 중복 금지

function shouldNotify(key: string): boolean {
  const now = Date.now();
  const last = recentKeys.get(key);
  if (last && now - last < DEDUPE_WINDOW) return false;
  recentKeys.set(key, now);
  // 100개 초과 시 오래된 것 정리
  if (recentKeys.size > 100) {
    const cutoff = now - DEDUPE_WINDOW;
    for (const [k, t] of recentKeys.entries()) {
      if (t < cutoff) recentKeys.delete(k);
    }
  }
  return true;
}

export function notify(payload: NotifyPayload, dedupeKey?: string): void {
  if (dedupeKey && !shouldNotify(dedupeKey)) return;

  // 1. OS Notification
  try {
    if (Notification.isSupported()) {
      const n = new Notification({
        title: payload.title,
        body: payload.body,
        silent: payload.silent || false,
        urgency: payload.level === 'error' ? 'critical' : 'normal',
      });
      if (payload.onClick) n.on('click', payload.onClick);
      n.show();
    }
  } catch (err) {
    console.warn('[NOTIFY] OS 알림 실패:', (err as Error).message);
  }

  // 2. Renderer 브로드캐스트 (in-app 토스트용)
  try {
    for (const w of BrowserWindow.getAllWindows()) {
      if (!w.isDestroyed()) {
        w.webContents.send('pro12-notification', {
          title: payload.title,
          body: payload.body,
          level: payload.level || 'info',
          ts: Date.now(),
        });
      }
    }
  } catch (err) {
    console.warn('[NOTIFY] renderer 전송 실패:', (err as Error).message);
  }

  console.log(`[NOTIFY] ${payload.level || 'info'}: ${payload.title} — ${payload.body}`);
}

export function notifyKeywordSaturation(keyword: string, dailyGrowth: number): void {
  notify(
    {
      title: '🚨 키워드 포화 임박',
      body: `"${keyword}" — 일간 +${Math.round(dailyGrowth)}개 문서 증가. 작성 서두르세요.`,
      level: 'warn',
    },
    `saturation:${keyword}`
  );
}

export function notifyKeywordDecay(keyword: string, deltaPct: number): void {
  notify(
    {
      title: '📉 검색량 하락',
      body: `"${keyword}" — 검색량 ${Math.round(deltaPct * 100)}% 하락`,
      level: 'warn',
    },
    `decay:${keyword}`
  );
}

export function notifyRankChange(keyword: string, oldRank: number | null, newRank: number | null): void {
  if (oldRank == null && newRank != null) {
    notify(
      {
        title: '🎉 첫 노출!',
        body: `"${keyword}" — ${newRank}위로 첫 노출`,
        level: 'success',
      },
      `firstrank:${keyword}`
    );
  } else if (oldRank != null && newRank != null && newRank < oldRank - 3) {
    notify(
      {
        title: '📈 순위 상승',
        body: `"${keyword}" — ${oldRank}위 → ${newRank}위`,
        level: 'success',
      },
      `rankup:${keyword}:${newRank}`
    );
  } else if (oldRank != null && newRank != null && newRank > oldRank + 5) {
    notify(
      {
        title: '⚠ 순위 하락',
        body: `"${keyword}" — ${oldRank}위 → ${newRank}위`,
        level: 'warn',
      },
      `rankdown:${keyword}:${newRank}`
    );
  }
}
