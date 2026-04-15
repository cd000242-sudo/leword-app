// LEWORD Key Wizard — OAuth 토큰 자동 갱신 스케줄러
// 작성: 2026-04-15
// 앱 기동 시 1회 + 1시간마다 만료 임박 토큰 검사

import { EnvironmentManager } from '../../utils/environment-manager';
import { refreshYouTubeToken } from './providers/youtube';
import { refreshThreadsToken } from './providers/threads';

const CHECK_INTERVAL = 60 * 60 * 1000; // 1시간
const YOUTUBE_THRESHOLD = 72 * 60 * 60 * 1000; // 72시간 전 갱신
const THREADS_THRESHOLD = 7 * 24 * 60 * 60 * 1000; // 7일 전 갱신

let timer: NodeJS.Timeout | null = null;

async function checkAndRefresh(): Promise<void> {
  try {
    const env = EnvironmentManager.getInstance().getConfig();
    const now = Date.now();

    // YouTube
    if (
      env.youtubeOAuthRefreshToken &&
      env.youtubeTokenExpiresAt &&
      env.youtubeTokenExpiresAt - now < YOUTUBE_THRESHOLD
    ) {
      console.log('[KEY-WIZARD][scheduler] YouTube 토큰 갱신 시도');
      await refreshYouTubeToken();
    }

    // Threads
    if (
      env.threadsAccessToken &&
      env.threadsTokenExpiresAt &&
      env.threadsTokenExpiresAt - now < THREADS_THRESHOLD
    ) {
      console.log('[KEY-WIZARD][scheduler] Threads 토큰 갱신 시도');
      await refreshThreadsToken();
    }
  } catch (err) {
    console.error('[KEY-WIZARD][scheduler] 갱신 검사 실패:', err);
  }
}

export function startRefreshScheduler(): void {
  if (timer) return;
  // 첫 실행은 30초 지연 (앱 기동과 충돌 방지)
  setTimeout(() => {
    checkAndRefresh();
    timer = setInterval(checkAndRefresh, CHECK_INTERVAL);
  }, 30 * 1000);
  console.log('[KEY-WIZARD][scheduler] ✅ 자동 갱신 스케줄러 시작');
}

export function stopRefreshScheduler(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
