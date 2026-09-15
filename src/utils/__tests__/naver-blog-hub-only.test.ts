import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * API HUB 키만 있는 사용자도 문서수를 잰다(2026-09-15, 사장님 "HUB 키만 있는 사용자도 이 PC 판 쓰게").
 *
 * 2026-06-25 이후 새로 발급한 사용자는 API HUB 키뿐이다. 문서수 함수가 옛 오픈 API 키 목록만 보고
 * '키 없음'으로 멈춰, 이 PC 판 후보가 하나도 못 나왔다. 가짜 fetch 로 실제 요청 주소 · 헤더를 확인한다
 * — 문자열 비교만으로는 옛 헤더가 새거나 주소가 안 바뀌는 버그를 못 잡는다.
 */
const mocks = vi.hoisted(() => ({ config: {} as Record<string, string> }));

vi.mock('../environment-manager', () => ({
  EnvironmentManager: { getInstance: () => ({ getConfig: () => mocks.config }) },
}));

import { getNaverBlogDocumentCount } from '../naver-blog-api';
import { resetApiHubSessionState } from '../naver-api-hub';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'naver-blog-hub-only-'));
const OWN_ENV = [
  'NAVER_CLIENT_ID', 'NAVER_CLIENT_SECRET', 'NAVER_OPENAPI_KEY_POOL', 'NAVER_CLIENT_KEY_POOL',
  'NAVER_APIHUB_KEY_ID', 'NAVER_APIHUB_KEY', 'NAVER_APIHUB_BASE',
  'LEWORD_NAVER_DOCUMENT_COUNT_CACHE_FILE', 'LEWORD_NAVER_OPENAPI_QUOTA_STATE_FILE',
];
const savedEnv = Object.fromEntries(OWN_ENV.map((key) => [key, process.env[key]]));
let round = 0;

beforeEach(() => {
  for (const key of OWN_ENV) delete process.env[key];
  round += 1;
  process.env.LEWORD_NAVER_DOCUMENT_COUNT_CACHE_FILE = path.join(dir, `document-count-${round}.json`);
  process.env.LEWORD_NAVER_OPENAPI_QUOTA_STATE_FILE = path.join(dir, `quota-${round}.json`);
  resetApiHubSessionState();
  vi.unstubAllGlobals();
});

afterAll(() => {
  vi.unstubAllGlobals();
  for (const key of OWN_ENV) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
  fs.rmSync(dir, { recursive: true, force: true });
});

type Call = { url: string; headers: Record<string, string> };

function stubFetch(total: number): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: unknown, init?: { headers?: Record<string, string> }) => {
    calls.push({ url: String(url), headers: { ...(init?.headers || {}) } });
    return new Response(JSON.stringify({ total, items: [{ title: '욕실 줄눈 셀프 시공 후기' }] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }));
  return calls;
}

describe('API HUB 키만 있는 사용자의 문서수', () => {
  it('옛 키가 없어도 HUB 주소 · HUB 헤더로 재서 문서수를 돌려준다', async () => {
    mocks.config = { naverClientId: '', naverClientSecret: '', naverApiHubKeyId: 'hub-id', naverApiHubKey: 'hub-key' };
    const calls = stubFetch(4321);
    expect(await getNaverBlogDocumentCount('욕실 줄눈 셀프 시공', { forceFresh: true })).toBe(4321);
    expect(calls).toHaveLength(1);
    expect(calls[0].url.startsWith('https://naverapihub.apigw.ntruss.com/search/v1/blog?query=')).toBe(true);
    expect(calls[0].headers).toMatchObject({ 'X-NCP-APIGW-API-KEY-ID': 'hub-id', 'X-NCP-APIGW-API-KEY': 'hub-key' });
    expect(Object.keys(calls[0].headers).some((name) => /^x-naver-client-/i.test(name))).toBe(false);
  });

  it('옛 키도 HUB 키도 없으면 부르지 않고 못 잰 것(null)으로 둔다', async () => {
    mocks.config = { naverClientId: '', naverClientSecret: '' };
    const calls = stubFetch(1);
    expect(await getNaverBlogDocumentCount('베란다 방수 페인트', { forceFresh: true })).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it('옛 키만 있으면 전과 같이 옛 주소 · 옛 헤더로 보낸다', async () => {
    mocks.config = { naverClientId: 'legacy-id', naverClientSecret: 'legacy-secret' };
    const calls = stubFetch(77);
    expect(await getNaverBlogDocumentCount('현관 중문 가격', { forceFresh: true })).toBe(77);
    expect(calls).toHaveLength(1);
    expect(calls[0].url.startsWith('https://openapi.naver.com/v1/search/blog.json?query=')).toBe(true);
    expect(calls[0].headers).toMatchObject({ 'X-Naver-Client-Id': 'legacy-id', 'X-Naver-Client-Secret': 'legacy-secret' });
  });
});
