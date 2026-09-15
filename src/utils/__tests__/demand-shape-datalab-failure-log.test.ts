import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * 데이터랩 실패를 조용히 삼키지 않는다 (2026-09-15).
 *
 * fetchMonthlyDemand·fetchMonthlyDemandPoints 는 응답이 !ok 이거나 호출이 던지면 빈 배열을 돌려준다 —
 * 호출자가 추세를 '판정불가'로 남기는 정상 경로라 그 계약은 그대로 둔다. 문제는 **왜** 비었는지가
 * 어디에도 안 남았다는 것이다. API HUB 가 legacy 로 떨어진 세션은 legacy 일일 한도(1,000)에 막혀
 * 한 회차의 행 전체가 판정불가가 되는데 로그는 조용했다(적대 검증 2026-09-15).
 *
 * 여기서 잠그는 것: ① 빈 배열 계약은 그대로 ② 사유를 처음 한 번 알린다 ③ 같은 사유는 다시 안 찍는다
 * (회차당 수천 줄이 되면 안 된다) ④ 던진 오류는 메시지가 아니라 이름으로 센다 ⑤ 성공은 조용하다.
 */
const config = { clientId: 'id', clientSecret: 'secret' };
const load = async () => {
  vi.resetModules();   // 모듈 안의 사유별 카운터를 테스트마다 새로
  return import('../keyword-demand-shape');
};

describe('데이터랩 실패를 조용히 삼키지 않는다', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it('!ok 는 빈 배열 그대로 — 사유를 처음 한 번 알리고, 같은 사유는 다시 안 찍는다', async () => {
    const mod = await load();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const limited = (async () => ({ ok: false, status: 429, json: async () => ({}) })) as unknown as typeof fetch;

    await expect(mod.fetchMonthlyDemandPoints('키워드', config, limited)).resolves.toEqual([]);
    await expect(mod.fetchMonthlyDemand('키워드', config, limited)).resolves.toEqual([]);

    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain('응답 429');
    expect(mod.datalabFailureCounts()).toEqual({ '응답 429': 2 });
  });

  it('호출이 던지면 이름으로 센다 — 메시지마다 새 줄을 찍지 않는다', async () => {
    const mod = await load();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    let n = 0;
    const broken = (async () => { n += 1; throw new TypeError(`fetch failed #${n}`); }) as unknown as typeof fetch;

    await expect(mod.fetchMonthlyDemand('가', config, broken)).resolves.toEqual([]);
    await expect(mod.fetchMonthlyDemand('나', config, broken)).resolves.toEqual([]);

    expect(warn).toHaveBeenCalledTimes(1);
    expect(mod.datalabFailureCounts()).toEqual({ '호출 실패(TypeError)': 2 });
  });

  it('성공은 아무것도 안 찍는다', async () => {
    const mod = await load();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const ok = (async () => ({
      ok: true,
      status: 200,
      json: async () => ({ results: [{ data: [{ period: '2026-08-01', ratio: 42 }] }] }),
    })) as unknown as typeof fetch;

    await expect(mod.fetchMonthlyDemand('키워드', config, ok)).resolves.toEqual([42]);
    expect(warn).not.toHaveBeenCalled();
    expect(mod.datalabFailureCounts()).toEqual({});
  });
});
