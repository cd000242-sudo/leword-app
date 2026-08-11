/**
 * 동시에 여러 개를 돌리되, **API 별 총 호출 속도는 그대로** 유지한다.
 *
 * ## 왜 필요한가 (2026-08-11 실측)
 *
 * 선점 보드 한 회차가 2시간 걸렸다. 내역을 세어 보니 계산이 아니라 **네트워크 왕복을
 * 하나씩 기다리는 것**이 전부였다:
 *
 *   후보 발굴 63분 — 주제당 약 190회 호출 × 32주제, 전부 순서대로
 *   자리 판정 60분 — 키워드당 2회 × 107건, 전부 순서대로
 *
 * 주제끼리는 아무 상관이 없는데 1번이 끝나야 2번을 시작했다.
 *
 * ## 그냥 동시에 돌리면 안 되는 이유
 *
 * 지금 코드는 호출 사이에 sleep 을 끼워 속도를 맞춘다(자동완성 150ms, 문서수 120ms).
 * 그 상태로 3개를 동시에 돌리면 **초당 호출이 3배**가 되어 네이버가 429 를 준다.
 * 이 프로젝트는 그걸로 이미 한 번 당했다(블로그 API 는 6개씩 800ms 가 실측 한계).
 *
 * 그래서 sleep 을 **공용 간격기**로 바꾼다. 몇 개가 동시에 돌든 그 API 로 나가는
 * 호출은 정해진 간격 이상 벌어진다. 대신 **기다리는 시간이 겹친다** — 한 작업이
 * 응답을 기다리는 동안 다른 작업이 자기 차례를 쓴다. 속도 제한은 그대로인데
 * 지연이 겹쳐 없어지므로, 지연이 지배적인 이 배치에서는 그만큼 빨라진다.
 */

/**
 * 호출 간 최소 간격을 지키는 문지기.
 *
 * 몇 개가 동시에 불러도 통과 시각이 minIntervalMs 이상 벌어진다.
 * 순서는 도착 순이 아니라 **깨어나는 순**이다 — 공평성이 필요한 곳이 아니고,
 * 순서를 보장하려 들면 큐를 들고 있어야 해서 더 복잡해진다.
 */
export function createInterval(minIntervalMs: number): () => Promise<void> {
  let nextAt = 0;
  return async () => {
    if (minIntervalMs <= 0) return;
    const now = Date.now();
    // 다음 차례는 '지금'과 '앞사람 다음 차례' 중 늦은 쪽이다.
    const slot = Math.max(now, nextAt);
    nextAt = slot + minIntervalMs;
    const wait = slot - now;
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  };
}

/**
 * 최대 n 개를 동시에 돌린다. 결과는 **입력 순서 그대로** 돌려준다.
 *
 * 순서를 지키는 이유: 이 배치의 출력은 주제 순으로 저장되고 사람이 그 순서로 읽는다.
 * 완료 순으로 섞이면 회차마다 순서가 바뀌어 회차 간 대조가 어려워진다.
 *
 * 하나가 던지면 그 자리에 undefined 를 넣고 나머지는 계속 돈다 —
 * 주제 하나가 실패했다고 회차 전체를 버리지 않는다(이미 그렇게 하고 있다).
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
  onError?: (error: unknown, item: T, index: number) => void,
): Promise<(R | undefined)[]> {
  const limit = Math.max(1, Math.floor(concurrency));
  const results: (R | undefined)[] = new Array(items.length);
  let cursor = 0;

  async function run(): Promise<void> {
    for (;;) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      try {
        results[index] = await worker(items[index] as T, index);
      } catch (error) {
        results[index] = undefined;
        if (onError) onError(error, items[index] as T, index);
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => run()));
  return results;
}
