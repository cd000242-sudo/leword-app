import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 허브에서 온 429 는 허브 키 상태에만 적는다 — 옛 오픈 API 키 한도 상태(다음 자정까지 전부 건너뜀)로
 * 잘못 적히면 안 된다. 가짜 fetch 로 문서수 조회를 돌리고 옛 상태 파일을 직접 확인한다.
 */
const mocks = vi.hoisted(() => ({ config: {} as Record<string, any> }));

vi.mock('../environment-manager', () => ({
  EnvironmentManager: { getInstance: () => ({ getConfig: () => mocks.config }) },
}));

import { getNaverBlogDocumentCount } from '../naver-blog-api';
import { resetApiHubSessionState } from '../naver-api-hub';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'naver-blog-hub-pool-'));
const OWN_ENV = [
  'NAVER_CLIENT_ID', 'NAVER_CLIENT_SECRET', 'NAVER_OPENAPI_KEY_POOL', 'NAVER_CLIENT_KEY_POOL',
  'NAVER_APIHUB_KEY_ID', 'NAVER_APIHUB_KEY', 'NAVER_APIHUB_KEY_POOL', 'NAVER_APIHUB_BASE',
  'LEWORD_NAVER_DOCUMENT_COUNT_CACHE_FILE', 'LEWORD_NAVER_OPENAPI_QUOTA_STATE_FILE', 'LEWORD_NAVER_APIHUB_QUOTA_STATE_FILE',
];
const savedEnv = Object.fromEntries(OWN_ENV.map((key) => [key, process.env[key]]));
const DAILY = '{"error":{"errorCode":429,"message":"일별 사용량 한도가 초과하였습니다."}}';
let round = 0;
let legacyState = '';

beforeEach(() => {
  for (const key of OWN_ENV) delete process.env[key];
  round += 1;
  legacyState = path.join(dir, `legacy-quota-${round}.json`);
  process.env.LEWORD_NAVER_DOCUMENT_COUNT_CACHE_FILE = path.join(dir, `document-count-${round}.json`);
  process.env.LEWORD_NAVER_OPENAPI_QUOTA_STATE_FILE = legacyState;
  process.env.LEWORD_NAVER_APIHUB_QUOTA_STATE_FILE = path.join(dir, `hub-quota-${round}.json`);
  resetApiHubSessionState();
  vi.unstubAllGlobals();
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterAll(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  for (const key of OWN_ENV) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
  fs.rmSync(dir, { recursive: true, force: true });
});

function legacyBlocked(): boolean {
  if (!fs.existsSync(legacyState)) return false;
  const parsed = JSON.parse(fs.readFileSync(legacyState, 'utf8'));
  return Number(parsed.legacyBlockedUntil || 0) > 0 || Object.keys(parsed.blockedUntilByKey || {}).length > 0;
}

describe('허브 429 는 옛 키 한도 상태에 적히지 않는다', () => {
  it('허브 키 전부 일별 한도 → 못 잰 것(null), 옛 키 상태는 그대로 비어 있다', async () => {
    mocks.config = {
      naverClientId: 'legacy-id', naverClientSecret: 'legacy-secret',
      naverApiHubKeyId: 'hub-id', naverApiHubKey: 'hub-key',
      naverApiHubKeyPool: [{ keyId: 'hub-id-2', key: 'hub-key-2' }],
    };
    const urls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: unknown) => {
      urls.push(String(url));
      return new Response(DAILY, { status: 429 });
    }));
    expect(await getNaverBlogDocumentCount('욕실 줄눈 셀프 시공', { forceFresh: true })).toBeNull();
    expect(urls.every((url) => url.includes('ntruss.com'))).toBe(true);
    expect(urls).toHaveLength(2);
    expect(legacyBlocked()).toBe(false);
  });

  it('문구 없는 허브 429 도 옛 키 한도로 적지 않는다', async () => {
    mocks.config = { naverApiHubKeyId: 'hub-id', naverApiHubKey: 'hub-key' };
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 429 })));
    expect(await getNaverBlogDocumentCount('베란다 방수 페인트', { forceFresh: true })).toBeNull();
    expect(legacyBlocked()).toBe(false);
  });

  it('1번 키 한도 → 2번 키로 문서수를 정상으로 잰다', async () => {
    mocks.config = {
      naverApiHubKeyId: 'hub-id', naverApiHubKey: 'hub-key',
      naverApiHubKeyPool: [{ keyId: 'hub-id-2', key: 'hub-key-2' }],
    };
    vi.stubGlobal('fetch', vi.fn(async (_url: unknown, init?: { headers?: Record<string, string> }) => {
      if (init?.headers?.['X-NCP-APIGW-API-KEY-ID'] === 'hub-id') return new Response(DAILY, { status: 429 });
      return new Response(JSON.stringify({ total: 987, items: [] }), { status: 200 });
    }));
    expect(await getNaverBlogDocumentCount('현관 중문 가격', { forceFresh: true })).toBe(987);
    expect(legacyBlocked()).toBe(false);
  });
});
