import * as fs from 'fs';
import * as path from 'path';
import type { AddressInfo } from 'net';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createWebBridge } from '../../main/web-bridge';

/**
 * 사이트 AI 는 앱 브리지 전용이다(2026-09-16 사장님 결정). 워커에만 있던 글감 주제 판정과, 클로드 토큰으로
 * 서비스 한도를 조회하던 사용량 칸을 앱 브리지 경로로 옮겼다. 주제 판정은 재료(검색어 목록)만 받고,
 * 사용량은 서비스 한도(%)가 아니라 이 PC 앱이 센 호출 수를 준다.
 */
const gapTopics = vi.fn(async (input: { keywords: string[]; provider?: string }) => ({
  topics: input.keywords.map((keyword) => ({ keyword, shopping: false, policy: false, ai: false })),
  provider: 'codex',
}));
const agentUsage = vi.fn(async () => ({
  usage: [{ provider: 'claude', window5h: 3, day: 7, failed5h: 1, resetAt: null, lastAt: null }],
  countedBy: 'app',
}));

const server = createWebBridge({
  appVersion: 'test-1.0.0',
  getAgentStatuses: async () => [],
  forgeInsights: async (keyword: string) => ({ keyword, subs: [] }),
  gapTopics,
  agentUsage,
});
let base = '';

beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

const post = (route: string, body: unknown, origin = 'https://leaderspro.kr') => fetch(`${base}${route}`, {
  method: 'POST',
  headers: { Origin: origin, 'content-type': 'application/json' },
  body: typeof body === 'string' ? body : JSON.stringify(body),
});

describe('글감 주제 판정 경로', () => {
  it('검색어 목록만 받아 문자열만 · 60자 · 최대 60개로 자르고, 허용 밖 엔진 이름은 버린다', async () => {
    gapTopics.mockClear();
    const keywords = [' 혀클리너 ', 42, '', '가'.repeat(80), ...Array.from({ length: 70 }, (_, index) => `검색어${index}`)];
    const res = await post('/v1/bridge/gap-topics', { keywords, provider: 'rm -rf /' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.result.provider).toBe('codex');
    const input = gapTopics.mock.calls[0][0];
    expect(input.keywords[0]).toBe('혀클리너');
    expect(input.keywords[1]).toBe('가'.repeat(60));
    expect(input.keywords).toHaveLength(60);
    expect(input.provider).toBe('');
  });

  it('허용한 엔진 이름은 그대로 넘긴다', async () => {
    gapTopics.mockClear();
    await post('/v1/bridge/gap-topics', { keywords: ['혀클리너'], provider: 'gemini' });
    expect(gapTopics.mock.calls[0][0]).toEqual({ keywords: ['혀클리너'], provider: 'gemini' });
  });

  it('판정할 검색어가 없거나 본문이 JSON 이 아니면 400 — 엔진을 부르지 않는다', async () => {
    gapTopics.mockClear();
    expect((await post('/v1/bridge/gap-topics', { keywords: [] })).status).toBe(400);
    expect((await post('/v1/bridge/gap-topics', { keywords: '혀클리너' })).status).toBe(400);
    expect((await post('/v1/bridge/gap-topics', '{깨진')).status).toBe(400);
    expect(gapTopics).not.toHaveBeenCalled();
  });

  it('허용 밖 출처는 403', async () => {
    const res = await post('/v1/bridge/gap-topics', { keywords: ['혀클리너'] }, 'https://evil.example');
    expect(res.status).toBe(403);
  });
});

describe('앱이 센 사용량 경로', () => {
  it('GET 으로 이 앱이 센 횟수를 돌려준다', async () => {
    const res = await fetch(`${base}/v1/bridge/agent-usage`, { headers: { Origin: 'https://leaderspro.kr' } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.countedBy).toBe('app');
    expect(body.result.usage[0]).toMatchObject({ provider: 'claude', window5h: 3, day: 7, failed5h: 1 });
  });
});

describe('앱 배선', () => {
  it('브리지 호스트가 두 경로를 앱 에이전트 체인 · 사용량 장부에 잇는다', () => {
    const host = fs.readFileSync(path.join(__dirname, '..', '..', 'main', 'web-bridge-host.ts'), 'utf8');
    expect(host).toContain('gapTopics: async ({ keywords, provider })');
    expect(host).toContain("await import('../utils/gap-topics-prompt')");
    expect(host).toContain('agentUsage: async () =>');
    expect(host).toContain('summarizeAgentUsage');
  });
});
