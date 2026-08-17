import { createAdaptivePacer } from '../adaptive-pacer';

/**
 * 적응형 속도 조절 — "맞으면 더 느려지고, 잘 통과하면 조금씩 회복한다".
 *
 * 2026-08-17 회차가 통째로 0행이 된 뒤 만든 것이다. 고정 간격은 추측이라,
 * 너무 빠르면 그 회차를 잃고 너무 느리면 매 회차를 낭비한다. 실제로 맞은
 * 횟수를 보고 스스로 조절해야 끝까지 완주한다.
 */

let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(name: string, cond: boolean, detail?: string) {
  if (cond) {
    passed++;
  } else {
    failed++;
    failures.push(`FAIL ${name}${detail ? ' - ' + detail : ''}`);
  }
}

// ── 기본 간격 ────────────────────────────────────────────────────────
{
  const pacer = createAdaptivePacer({ baseMs: 800 });
  assert('시작은 기본 간격', pacer.currentIntervalMs() === 800, String(pacer.currentIntervalMs()));
}

// ── 속도 제한을 맞으면 느려진다 ──────────────────────────────────────
{
  const pacer = createAdaptivePacer({ baseMs: 800, growth: 2, maxMs: 10_000 });
  pacer.penalize();
  assert('한 번 맞으면 간격이 늘어난다', pacer.currentIntervalMs() === 1_600, String(pacer.currentIntervalMs()));
  pacer.penalize();
  assert('또 맞으면 더 늘어난다', pacer.currentIntervalMs() === 3_200, String(pacer.currentIntervalMs()));
}

// 상한이 없으면 한 번의 사고로 회차가 영영 안 끝난다.
{
  const pacer = createAdaptivePacer({ baseMs: 800, growth: 4, maxMs: 5_000 });
  for (let i = 0; i < 10; i += 1) pacer.penalize();
  assert('상한을 넘지 않는다', pacer.currentIntervalMs() === 5_000, String(pacer.currentIntervalMs()));
}

// ── 잘 통과하면 회복한다 ─────────────────────────────────────────────
{
  const pacer = createAdaptivePacer({ baseMs: 800, growth: 2, recoverAfter: 3, recovery: 0.5 });
  pacer.penalize();                       // 1600
  pacer.reward(); pacer.reward();
  assert('성공 몇 번으로는 안 풀린다', pacer.currentIntervalMs() === 1_600, String(pacer.currentIntervalMs()));
  pacer.reward();                         // 3회째 → 회복
  assert('연속 성공이 쌓이면 회복한다', pacer.currentIntervalMs() === 800, String(pacer.currentIntervalMs()));
}

// 회복해도 기본 간격보다 빨라지면 안 된다 — 그건 우리가 정한 안전선이다.
{
  const pacer = createAdaptivePacer({ baseMs: 800, recoverAfter: 1, recovery: 0.1 });
  for (let i = 0; i < 20; i += 1) pacer.reward();
  assert('기본 간격 아래로는 안 내려간다', pacer.currentIntervalMs() === 800, String(pacer.currentIntervalMs()));
}

// 맞은 뒤 성공이 끊기면 연속 계산이 초기화돼야 한다.
{
  const pacer = createAdaptivePacer({ baseMs: 800, growth: 2, recoverAfter: 3, recovery: 0.5, maxMs: 100_000 });
  pacer.penalize();                       // 1600
  pacer.reward(); pacer.reward();
  pacer.penalize();                       // 3200 — 연속 성공 초기화
  pacer.reward(); pacer.reward();
  assert('중간에 또 맞으면 회복 카운트가 초기화된다', pacer.currentIntervalMs() === 3_200, String(pacer.currentIntervalMs()));
}

// ── 실제로 기다린다 ──────────────────────────────────────────────────
void (async () => {
  {
    const pacer = createAdaptivePacer({ baseMs: 60 });
    const started = Date.now();
    await pacer.wait();
    await pacer.wait();
    await pacer.wait();
    const elapsed = Date.now() - started;
    // 첫 호출은 즉시 통과, 이후 2회가 간격만큼 벌어진다.
    assert('간격만큼 실제로 벌어진다', elapsed >= 110, `elapsed=${elapsed}`);
  }

  // 느려진 간격이 실제 대기에 반영돼야 의미가 있다.
  {
    const pacer = createAdaptivePacer({ baseMs: 30, growth: 4, maxMs: 10_000 });
    pacer.penalize();                     // 120ms
    const started = Date.now();
    await pacer.wait();
    await pacer.wait();
    const elapsed = Date.now() - started;
    assert('벌칙이 실제 대기에 반영된다', elapsed >= 100, `elapsed=${elapsed}`);
  }

  // 회차 로그에 남길 수 있어야 한다 — 안 재면 다음 회차에 또 추측하게 된다.
  {
    const pacer = createAdaptivePacer({ baseMs: 800 });
    pacer.penalize(); pacer.penalize();
    const s = pacer.stats();
    assert('맞은 횟수를 센다', s.penalties === 2, JSON.stringify(s));
    assert('현재 간격을 보고한다', s.intervalMs === pacer.currentIntervalMs(), JSON.stringify(s));
  }

  console.log(`\n[adaptive-pacer.test] passed: ${passed} / failed: ${failed}`);
  if (failed > 0) {
    failures.forEach((f) => console.error('  ' + f));
    process.exit(1);
  }
  process.exit(0);
})();
