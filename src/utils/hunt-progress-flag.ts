/**
 * v2.46.0 E: 황금/PRO 발굴 진행 중 글로벌 플래그
 *
 * 사용자 보고: "발굴 중 CPU 폭주". 원인 중 하나는 백그라운드 자동 작업
 * (auto-hunt/lifecycle/rank/precrawler/surge/health)이 발굴 도중 동시 실행됨.
 *
 * 해결: 발굴 진입 시 플래그 set → 각 스케줄러가 다음 tick에서 이 플래그 확인 → skip.
 *      발굴 종료 시 unset. 발굴 중 백그라운드 작업 일시 정지 효과.
 */

let huntInProgress = false;
let huntStartedAt = 0;

/**
 * 발굴 시작 표시. premium-hunting / keyword-discovery 핸들러 진입 시 호출.
 */
export function markHuntStarted(): void {
  huntInProgress = true;
  huntStartedAt = Date.now();
  console.log('[HUNT-FLAG] ⏳ 발굴 진행 중 — 백그라운드 작업 일시 정지');
}

/**
 * 발굴 종료 표시. 핸들러 finally 블록에서 호출.
 */
export function markHuntEnded(): void {
  if (huntInProgress) {
    const durMs = Date.now() - huntStartedAt;
    console.log(`[HUNT-FLAG] ✅ 발굴 종료 (${(durMs / 1000).toFixed(1)}s) — 백그라운드 작업 재개`);
  }
  huntInProgress = false;
  huntStartedAt = 0;
}

/**
 * 백그라운드 스케줄러가 호출 — true면 이 tick은 skip.
 *
 * 안전망: 발굴이 30분 이상 진행 중이면 hang으로 간주 → false 반환 (백그라운드 재개)
 */
export function shouldSkipBackground(): boolean {
  if (!huntInProgress) return false;
  const stuckMs = Date.now() - huntStartedAt;
  if (stuckMs > 30 * 60 * 1000) {
    console.warn('[HUNT-FLAG] ⚠️ 발굴 30분 초과 — hang 의심, 플래그 강제 reset');
    huntInProgress = false;
    huntStartedAt = 0;
    return false;
  }
  return true;
}

/**
 * 현재 발굴 상태 조회 (UI/로깅용)
 */
export function isHuntInProgress(): boolean {
  return huntInProgress;
}
