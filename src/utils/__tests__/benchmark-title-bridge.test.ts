/**
 * 홈판 벤치마크 소재 하나의 제목을 사이트가 앱(본인 구독)에 바로 짓게 하는 브리지(2026-10-07).
 * 회차(CI)가 시간당 몇십 장밖에 못 지어 1,000장 판에 제목이 25장뿐이었다 — 비어 있는 카드는 사이트에서 [지금 제목 만들기].
 */
import { describe, expect, it } from 'vitest';
import { handleBenchmarkTitleRoute, parseBenchmarkCard } from '../../main/benchmark-title-bridge';

function fakeReq(method: string, url: string, body: unknown, headers: Record<string, string> = { origin: 'https://leaderspro.kr', 'content-type': 'application/json' }) {
  return { method, url, headers, body: typeof body === 'string' ? body : JSON.stringify(body) } as any;
}
function harness() {
  const out: { code?: number; value?: any } = {};
  const res = { setHeader: () => undefined } as any;
  const io = {
    readBody: async (req: any) => req.body,
    json: (_res: any, code: number, value: unknown) => { out.code = code; out.value = value; },
    siteOriginAllowed: (o: string) => o === 'https://leaderspro.kr',
  };
  return { out, res, io };
}
const card = { id: 'abc123', keyword: '나고야 아시안게임 태극기 미게양', category: '스포츠·게임', title: '나고야 아시안게임 태극기 미게양 논란', summary: '시상식에서 태극기 게양이 지연됐다.', relatedKeywords: ['나고야', '태극기'] };

describe('홈판 벤치마크 제목 브리지', () => {
  it('카드 하나를 받아 엔진 결과(제목)를 돌려준다', async () => {
    const { out, res, io } = harness();
    const handled = await handleBenchmarkTitleRoute(fakeReq('POST', '/v1/bridge/benchmark-titles', { card }), res, {
      allowed: async () => true,
      generate: async (c) => ({ provider: 'claude', titles: [c.keyword + ' 왜 늦어졌을까요'] }),
    }, io);
    expect(handled).toBe(true);
    expect(out.code).toBe(200);
    expect(out.value.result.titles).toEqual(['나고야 아시안게임 태극기 미게양 왜 늦어졌을까요']);
  });

  it('다른 경로는 건드리지 않는다', async () => {
    const { res, io } = harness();
    expect(await handleBenchmarkTitleRoute(fakeReq('POST', '/v1/bridge/brief-titles', {}), res, { allowed: async () => true, generate: async () => ({ provider: '', titles: [] }) }, io)).toBe(false);
  });

  it('사이트 밖 출처 · 라이선스 없음 · 잘못된 카드는 막는다', async () => {
    const deps = { allowed: async () => true, generate: async () => ({ provider: 'x', titles: ['t'] }) };
    let h = harness();
    await handleBenchmarkTitleRoute(fakeReq('POST', '/v1/bridge/benchmark-titles', { card }, { origin: 'https://evil.example', 'content-type': 'application/json' }), h.res, deps, h.io);
    expect(h.out.code).toBe(403);
    h = harness();
    await handleBenchmarkTitleRoute(fakeReq('POST', '/v1/bridge/benchmark-titles', { card }), h.res, { ...deps, allowed: async () => false }, h.io);
    expect(h.out.code).toBe(403);
    h = harness();
    await handleBenchmarkTitleRoute(fakeReq('POST', '/v1/bridge/benchmark-titles', { card: { ...card, keyword: '' } }), h.res, deps, h.io);
    expect(h.out.code).toBe(400);
  });

  it('엔진 오류 내용(경로·프롬프트)은 화면에 보내지 않는다', async () => {
    const { out, res, io } = harness();
    await handleBenchmarkTitleRoute(fakeReq('POST', '/v1/bridge/benchmark-titles', { card }), res, {
      allowed: async () => true,
      generate: async () => { throw new Error('C:\\Users\\secret\\claude.cmd token=abc'); },
    }, io);
    expect(out.code).toBe(503);
    expect(JSON.stringify(out.value)).not.toContain('secret');
  });

  it('카드 검사 — 글자 수 자르기 · 제어문자 거부 · 연관어는 문자열만 8개', () => {
    const parsed = parseBenchmarkCard({ ...card, summary: 'x'.repeat(2000), relatedKeywords: ['a', 3, 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'] });
    expect(parsed?.summary.length).toBeLessThanOrEqual(600);
    expect(parsed?.relatedKeywords).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']);
    expect(parseBenchmarkCard({ ...card, keyword: '나고야\n태극기' })).toBeNull();
    expect(parseBenchmarkCard({ ...card, id: '' })).toBeNull();
  });
});

describe('애드센스 검색용 제목(kind: adsense)', () => {
  it('kind 와 대표 검색어(query)를 읽는다 — 애드센스는 query 가 없으면 거부', () => {
    expect(parseBenchmarkCard({ ...card, kind: 'adsense', query: '국민연금추납' })).toMatchObject({ kind: 'adsense', query: '국민연금추납' });
    expect(parseBenchmarkCard({ ...card, kind: 'adsense' })).toBeNull();
    expect(parseBenchmarkCard(card)?.kind).toBe('homefeed');
  });
  it('엔진에 kind 가 그대로 간다', async () => {
    const { out, res, io } = harness();
    const seen: string[] = [];
    await handleBenchmarkTitleRoute(fakeReq('POST', '/v1/bridge/benchmark-titles', { card: { ...card, kind: 'adsense', query: '국민연금추납' } }), res, {
      allowed: async () => true,
      generate: async (c) => { seen.push(String((c as any).kind)); return { provider: 'claude', titles: ['국민연금추납 신청 전 확인할 조건과 비용 정리'] }; },
    }, io);
    expect(out.code).toBe(200);
    expect(seen).toEqual(['adsense']);
  });
  it('애드센스는 고수보다 나은 점(edges)도 제목과 같은 순서로 돌려준다 — 없으면 빼고', async () => {
    const h = harness();
    await handleBenchmarkTitleRoute(fakeReq('POST', '/v1/bridge/benchmark-titles', { card: { ...card, kind: 'adsense', query: '국민연금추납' } }), h.res, {
      allowed: async () => true,
      generate: async () => ({ provider: 'claude', titles: ['t1'], edges: ["고수 2명이 안 다룬 '주의·불이익'까지"] }),
    }, h.io);
    expect(h.out.value.result.edges).toEqual(["고수 2명이 안 다룬 '주의·불이익'까지"]);
    const g = harness();
    await handleBenchmarkTitleRoute(fakeReq('POST', '/v1/bridge/benchmark-titles', { card }), g.res, { allowed: async () => true, generate: async () => ({ provider: 'x', titles: ['t'] }) }, g.io);
    expect('edges' in g.out.value.result).toBe(false);
  });
});
