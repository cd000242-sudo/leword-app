/** 네이버는 :00 / :30 에 발행한다. 그 뒤 3분(:03, :33)에 받는다 — 한국은 UTC+9 라 분 단위는 UTC 와 같다. */
export const COLLECT_OFFSET_MIN = 3;
const WINDOW_MS = 30 * 60_000;

/** nowMs 이후 가장 가까운 :03 / :33 까지 남은 ms(딱 맞으면 다음 칸). */
export function nextCollectDelayMs(nowMs: number): number {
  const offset = COLLECT_OFFSET_MIN * 60_000;
  const sinceSlot = ((nowMs - offset) % WINDOW_MS + WINDOW_MS) % WINDOW_MS;
  return WINDOW_MS - sinceSlot;
}
