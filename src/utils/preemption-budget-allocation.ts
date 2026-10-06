/**
 * 선점 보드 BD 검증 몫 나누기 — 주제별로 몇 개를 자리 실측(SERP)할 것인가.
 *
 * 1) 먼저 주제마다 같은 몫(총량 ÷ 주제 수)을 준다. 한 주제가 후보를 많이 냈다고
 *    예산을 독식하면 그 주제로 블로그를 안 하는 사용자에게 회차가 헛돈다.
 * 2) 후보가 몫보다 적은 주제가 남긴 슬롯은 **아직 검증 못 한 후보가 많은 주제부터
 *    한 칸씩 돌아가며** 나눈다.
 *
 * 2)가 바뀐 이유(2026-10-06): 예전에는 남은 슬롯을 주제 목록 순서대로 앞 주제가 먼저
 * 다 가져갔다. 10-05 회차에서 게임은 64건을 검증했는데, 후보가 80건으로 가장 많던
 * 스타·연예인은 18건에서 멈춰 62건을 재 보지도 못했다. 총량(호출 수 상한)은 그대로다.
 *
 * 돌려주는 Map 의 열쇠 순서는 입력 순서 그대로다 — 배치가 그 순서로 주제를 돈다.
 */
export function allocateBudget<T>(byTopic: Map<string, readonly T[]>, maxPerRun: number): Map<string, number> {
  const topics = [...byTopic.keys()];
  const budget = Math.max(0, Math.floor(Number(maxPerRun) || 0));
  if (topics.length === 0 || budget === 0) return new Map(topics.map((topic) => [topic, 0]));

  const sizes = new Map(topics.map((topic) => [topic, (byTopic.get(topic) || []).length]));
  const base = Math.floor(budget / topics.length);
  const taken = new Map(topics.map((topic) => [topic, Math.min(base, sizes.get(topic) || 0)]));
  let leftover = budget - [...taken.values()].reduce((sum, n) => sum + n, 0);

  const remaining = (topic: string) => (sizes.get(topic) || 0) - (taken.get(topic) || 0);
  while (leftover > 0) {
    // 미검증이 많은 주제부터. 같으면 입력 순서(결정론 — 난수 없음).
    const order = topics
      .filter((topic) => remaining(topic) > 0)
      .sort((a, b) => remaining(b) - remaining(a) || topics.indexOf(a) - topics.indexOf(b));
    if (order.length === 0) break;
    for (const topic of order) {
      if (leftover <= 0) break;
      taken.set(topic, (taken.get(topic) || 0) + 1);
      leftover -= 1;
    }
  }
  return new Map(topics.map((topic) => [topic, taken.get(topic) || 0]));
}
