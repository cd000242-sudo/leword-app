/**
 * 적응형 호출 간격 — 맞으면 느려지고, 잘 통과하면 조금씩 회복한다.
 *
 * ## 왜 고정 간격으로는 안 되나 (2026-08-17 실측)
 *
 * 선점 회차가 189건 중 96건을 "exceeded the allowed rate limits" 로 잃고
 * 보드가 0행이 됐다. 그때 간격은 400ms 였다. 그럼 800ms 면 되는가? 모른다 —
 * 그건 추측이고, 추측한 값이 틀리면 **다음 회차를 통째로 잃고 나서야** 안다.
 * 반대로 넉넉하게 잡아 두면 매 회차 수십 분을 그냥 버린다.
 *
 * 그래서 실제로 맞은 횟수를 보고 스스로 조절한다. 처음엔 안전한 기본 간격으로
 * 시작하고, 속도 제한을 맞을 때마다 간격을 배로 늘린다. 한동안 아무 문제 없이
 * 통과하면 조금씩 원래 속도로 돌아온다. 상한을 두는 이유는 한 번의 사고로
 * 회차가 영영 안 끝나는 걸 막기 위해서다.
 *
 * 기본 간격 **아래로는 절대 내려가지 않는다** — 그건 우리가 정한 안전선이고,
 * 회복은 '더 빨리 가기'가 아니라 '벌칙을 푸는 것'이다.
 */

export interface AdaptivePacerOptions {
  /** 평소 간격(밀리초). 회복해도 이보다 빨라지지 않는다. */
  baseMs: number;
  /** 한 번 맞을 때 간격에 곱할 배수. 기본 2. */
  growth?: number;
  /** 간격 상한. 기본 기본값의 12배. */
  maxMs?: number;
  /** 이만큼 연속 성공하면 한 단계 회복한다. 기본 25. */
  recoverAfter?: number;
  /** 회복 시 간격에 곱할 배수. 기본 0.7. */
  recovery?: number;
}

export interface AdaptivePacerStats {
  intervalMs: number;
  /** 속도 제한을 맞은 총 횟수. 회차 로그에 남긴다. */
  penalties: number;
  /** 회복한 총 횟수. */
  recoveries: number;
}

export interface AdaptivePacer {
  /** 다음 차례가 올 때까지 기다린다. 동시에 여러 개가 불러도 간격이 벌어진다. */
  wait(): Promise<void>;
  /** 속도 제한을 맞았다 — 간격을 늘린다. */
  penalize(): void;
  /** 정상 통과했다 — 연속으로 쌓이면 회복한다. */
  reward(): void;
  currentIntervalMs(): number;
  stats(): AdaptivePacerStats;
}

export function createAdaptivePacer(options: AdaptivePacerOptions): AdaptivePacer {
  const baseMs = Math.max(0, options.baseMs);
  const growth = options.growth ?? 2;
  const maxMs = options.maxMs ?? baseMs * 12;
  const recoverAfter = options.recoverAfter ?? 25;
  const recovery = options.recovery ?? 0.7;

  let intervalMs = baseMs;
  let nextAt = 0;
  let streak = 0;
  let penalties = 0;
  let recoveries = 0;

  return {
    async wait() {
      if (intervalMs <= 0) return;
      const now = Date.now();
      // 다음 차례는 '지금'과 '앞사람 다음 차례' 중 늦은 쪽이다.
      const slot = Math.max(now, nextAt);
      nextAt = slot + intervalMs;
      const delay = slot - now;
      if (delay > 0) await new Promise((resolve) => { setTimeout(resolve, delay); });
    },

    penalize() {
      penalties += 1;
      streak = 0;
      intervalMs = Math.min(maxMs, Math.round(intervalMs * growth));
    },

    reward() {
      if (intervalMs <= baseMs) return;
      streak += 1;
      if (streak < recoverAfter) return;
      streak = 0;
      recoveries += 1;
      intervalMs = Math.max(baseMs, Math.round(intervalMs * recovery));
    },

    currentIntervalMs() {
      return intervalMs;
    },

    stats() {
      return { intervalMs, penalties, recoveries };
    },
  };
}
