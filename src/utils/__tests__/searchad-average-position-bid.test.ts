import { createHmac } from 'crypto';
import { describe, expect, it } from 'vitest';

process.env['LEWORD_SEARCHAD_SOFT_CEILING'] = '100';

import {
  AVERAGE_POSITION_BID_CHUNK,
  getNaverSearchAdAveragePositionBids,
  getNaverSearchAdBidPairs,
  parseAveragePositionBids,
} from '../naver-searchad-api';
import { bidKey } from '../money-keywords';

/**
 * 파워링크 평균 순위 입찰가 — 네이버 검색광고 /estimate/average-position-bid/keyword (2026-09-24).
 *
 * 왜: 키워드도구(keywordstool) 응답에는 단가 필드가 없다. 그날 원응답 필드 9개를 찍어 확인했다
 * (relKeyword · monthlyPcQcCnt · monthlyMobileQcCnt · plAvgDepth · compIdx · 클릭 2 · 클릭률 2).
 * 코드가 보존한다던 monthlyAveCpc 는 한 번도 온 적이 없어서 CPC 가 늘 빈 값이었다.
 * 이 창구는 사장님 키로 된다 — 개인회생 58,670 · 건강보험료 13,380 · 근로장려금 70(최저가).
 * /npc-estimate 는 값이 훨씬 낮게 나온다(다른 광고 상품) — 흔히 말하는 단가는 이쪽(파워링크)이다.
 */
const CONFIG = { accessLicense: 'test-license', secretKey: 'test-secret', customerId: '1234567' };

type Call = { url: string; method: string; headers: Record<string, string>; body: any };

function fakeFetch(respond: (body: any, callIndex: number) => { status: number; json?: unknown }) {
  const calls: Call[] = [];
  const impl = (async (url: string, init: any) => {
    const body = JSON.parse(String(init.body));
    calls.push({ url, method: init.method, headers: init.headers, body });
    const out = respond(body, calls.length - 1);
    return {
      ok: out.status >= 200 && out.status < 300,
      status: out.status,
      json: async () => out.json,
      text: async () => JSON.stringify(out.json ?? null),
    } as any;
  }) as unknown as typeof fetch;
  return { impl, calls };
}

const echo = (body: any) => ({
  status: 200,
  json: { estimate: body.items.map((item: any) => ({ keyword: item.key, position: item.position, bid: item.key.length * 100 })) },
});

describe('응답 풀기', () => {
  it('estimate 배열을 키워드 → 입찰가 표로 푼다', () => {
    const map = parseAveragePositionBids({ estimate: [
      { keyword: '개인회생', position: 3, bid: 58670 },
      { keyword: '근로장려금', position: 3, bid: 70 },
    ] });
    expect(map.get(bidKey('개인회생'))).toBe(58670);
    expect(map.get(bidKey('근로장려금'))).toBe(70);
  });

  it('모양이 아니면 빈 표 — 바깥 입력으로 본다', () => {
    expect(parseAveragePositionBids(null).size).toBe(0);
    expect(parseAveragePositionBids({ estimate: '아님' }).size).toBe(0);
    expect(parseAveragePositionBids({ estimate: [{ keyword: 'x', bid: '비쌈' }, { bid: 100 }] }).size).toBe(0);
  });
});

describe('조회', () => {
  it('파워링크 창구에 POST 로 묻고, 서명을 붙인다', async () => {
    const { impl, calls } = fakeFetch(echo);
    await getNaverSearchAdAveragePositionBids(CONFIG, ['개인회생'], { device: 'MOBILE', fetchImpl: impl, reserve: () => true, gapMs: 0 });
    expect(calls).toHaveLength(1);
    const call = calls[0];
    expect(call.url).toBe('https://api.searchad.naver.com/estimate/average-position-bid/keyword');
    expect(call.method).toBe('POST');
    expect(call.body).toEqual({ device: 'MOBILE', items: [{ key: '개인회생', position: 3 }] });
    expect(call.headers['X-API-KEY']).toBe(CONFIG.accessLicense);
    expect(call.headers['X-Customer']).toBe(CONFIG.customerId);
    const expected = createHmac('sha256', CONFIG.secretKey)
      .update(`${call.headers['X-Timestamp']}.POST./estimate/average-position-bid/keyword`, 'utf8')
      .digest('base64');
    expect(call.headers['X-Signature']).toBe(expected);
  });

  it(`${AVERAGE_POSITION_BID_CHUNK}개씩 묶어 부른다`, async () => {
    const { impl, calls } = fakeFetch(echo);
    const keywords = Array.from({ length: 120 }, (_, i) => `키워드${i}`);
    const map = await getNaverSearchAdAveragePositionBids(CONFIG, keywords, { device: 'PC', fetchImpl: impl, reserve: () => true, gapMs: 0 });
    expect(calls.map((call) => call.body.items.length)).toEqual([50, 50, 20]);
    expect(map.size).toBe(120);
  });

  /*
   * 공백 함정(2026-09-24 실측): '자동차보험 비교' 70원 / '자동차보험비교' 21,270원,
   * '임플란트 가격' 70원 / '임플란트가격' 26,060원. 공백이 든 말은 네이버가 등록 안 된 말로 보고
   * 늘 최저가를 준다. 지난 실측의 공백 든 말 273개가 전부 70원이던 이유다.
   */
  it('공백을 빼고 묻는다 — 공백이 있으면 늘 최저가(70원)가 온다', async () => {
    const { impl, calls } = fakeFetch(echo);
    const map = await getNaverSearchAdAveragePositionBids(CONFIG, ['자동차보험 비교', 'ISA 계좌'], { device: 'PC', fetchImpl: impl, reserve: () => true, gapMs: 0 });
    expect(calls[0].body.items.map((item: any) => item.key)).toEqual(['자동차보험비교', 'ISA계좌']);
    expect(map.get(bidKey('자동차보험 비교'))).toBe('자동차보험비교'.length * 100);
    expect(map.get(bidKey('isa 계좌'))).toBe('ISA계좌'.length * 100);
  });

  it('같은 말(공백만 다름)은 한 번만 묻는다', async () => {
    const { impl, calls } = fakeFetch(echo);
    await getNaverSearchAdAveragePositionBids(CONFIG, ['임플란트 가격', '임플란트가격', '임플란트 가격'], { device: 'PC', fetchImpl: impl, reserve: () => true, gapMs: 0 });
    expect(calls[0].body.items).toHaveLength(1);
  });

  it('한 묶음이 실패해도 나머지 묶음 값은 남는다', async () => {
    const { impl } = fakeFetch((body, index) => (index === 0 ? { status: 500, json: { title: 'error' } } : echo(body)));
    const keywords = Array.from({ length: 60 }, (_, i) => `k${i}`);
    const map = await getNaverSearchAdAveragePositionBids(CONFIG, keywords, { device: 'PC', fetchImpl: impl, reserve: () => true, gapMs: 0 });
    expect(map.size).toBe(10);
  });

  it('쿼터가 다 되면 더 묻지 않는다 — 잰 만큼만 돌려준다', async () => {
    const { impl, calls } = fakeFetch(echo);
    let left = 1;
    const keywords = Array.from({ length: 120 }, (_, i) => `k${i}`);
    const map = await getNaverSearchAdAveragePositionBids(CONFIG, keywords, {
      device: 'PC', fetchImpl: impl, gapMs: 0, reserve: () => (left-- > 0),
    });
    expect(calls).toHaveLength(1);
    expect(map.size).toBe(50);
  });

  it('키가 없으면 부르지 않고 알린다', async () => {
    const { impl, calls } = fakeFetch(echo);
    await expect(getNaverSearchAdAveragePositionBids({ accessLicense: '', secretKey: '' }, ['x'], { device: 'PC', fetchImpl: impl, reserve: () => true }))
      .rejects.toThrow(/인증/);
    expect(calls).toHaveLength(0);
  });

  it('PC · 모바일을 따로 물어 한 표로 합친다', async () => {
    const { impl, calls } = fakeFetch((body) => ({
      status: 200,
      json: { estimate: body.items.map((item: any) => ({ keyword: item.key, position: 3, bid: body.device === 'PC' ? 10380 : 13380 })) },
    }));
    const pairs = await getNaverSearchAdBidPairs(CONFIG, ['건강보험료'], { fetchImpl: impl, reserve: () => true, gapMs: 0 });
    expect(calls.map((call) => call.body.device).sort()).toEqual(['MOBILE', 'PC']);
    expect(pairs.get(bidKey('건강보험료'))).toEqual({ pc: 10380, mobile: 13380 });
  });
});
