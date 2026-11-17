/**
 * naverApiFetch — HUB key failover. Fake fetch only: no real NAVER / HUB traffic, no real keys.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ config: {} as Record<string, any> }));

vi.mock('../environment-manager', () => ({
  EnvironmentManager: { getInstance: () => ({ getConfig: () => mocks.config }) },
}));

import { naverApiFetch, resetApiHubSessionState } from '../naver-api-hub';
import { ApiHubQuotaExhaustedError, apiHubQuotaExhaustedMessage } from '../naver-api-hub-pool';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'naver-api-hub-failover-'));
const OWN_ENV = [
  'NAVER_APIHUB_KEY_ID', 'NAVER_APIHUB_KEY', 'NAVER_APIHUB_KEY_POOL', 'NAVER_APIHUB_BASE',
  'LEWORD_NAVER_APIHUB_QUOTA_STATE_FILE', 'GITHUB_ACTIONS',
];
const savedEnv = Object.fromEntries(OWN_ENV.map((key) => [key, process.env[key]]));
let round = 0;
let stateFile = '';

const SECRETS = ['main-id', 'MAINSECRET0001', 'second-id', 'SECONDSECRET0002', 'third-id', 'THIRDSECRET0003'];
const DAILY = '{"error":{"errorCode":429,"message":"일별 사용량 한도가 초과하였습니다."}}';
const URL_BLOG = 'https://openapi.naver.com/v1/search/blog.json?query=a&display=1';

type Call = { url: string; keyId: string };
type Reply = { status: number; body?: string };

const logs: string[] = [];

beforeEach(() => {
  for (const key of OWN_ENV) delete process.env[key];
  round += 1;
  stateFile = path.join(dir, `state-${round}.json`);
  process.env.LEWORD_NAVER_APIHUB_QUOTA_STATE_FILE = stateFile;
  resetApiHubSessionState();
  logs.length = 0;
  for (const level of ['log', 'warn', 'error', 'info'] as const) {
    vi.spyOn(console, level).mockImplementation((...args: unknown[]) => { logs.push(args.map(String).join(' ')); });
  }
  mocks.config = {
    naverApiHubKeyId: 'main-id',
    naverApiHubKey: 'MAINSECRET0001',
    naverApiHubKeyPool: [
      { keyId: 'second-id', key: 'SECONDSECRET0002' },
      { keyId: 'third-id', key: 'THIRDSECRET0003' },
    ],
  };
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

afterAll(() => {
  for (const key of OWN_ENV) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
  fs.rmSync(dir, { recursive: true, force: true });
});

/** replies are chosen by the Key ID the request carried, so tests read like the real scenario */
function stubFetch(byKeyId: Record<string, Reply | undefined>, legacy: Reply = { status: 200, body: '{"total":1,"items":[]}' }): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: unknown, init?: { headers?: Record<string, string> }) => {
    const keyId = init?.headers?.['X-NCP-APIGW-API-KEY-ID'] || '';
    calls.push({ url: String(url), keyId });
    const reply = keyId ? byKeyId[keyId] || { status: 200, body: '{"total":5,"items":[]}' } : legacy;
    return new Response(reply.body ?? '', { status: reply.status });
  }));
  return calls;
}

describe('일별 한도 429 → 다음 키로 같은 요청 한 번', () => {
  it('1번 키가 일별 한도면 2번 키로 같은 주소를 한 번 다시 보내고 로그 한 줄을 남긴다', async () => {
    const calls = stubFetch({ 'main-id': { status: 429, body: DAILY } });
    const response = await naverApiFetch(URL_BLOG, { headers: { 'X-Naver-Client-Id': 'x', 'X-Naver-Client-Secret': 'y' } });
    expect(response.status).toBe(200);
    expect(calls.map((c) => c.keyId)).toEqual(['main-id', 'second-id']);
    expect(calls[1].url).toBe(calls[0].url);
    expect(logs).toContain('[API-HUB] 1번 키 오늘 한도 끝 → 2번 키로 전환 (남은 키 2개)');
  });

  it('이미 막힌 키는 다음 요청에서 보내지 않고 바로 2번 키로 간다', async () => {
    const calls = stubFetch({ 'main-id': { status: 429, body: DAILY } });
    await naverApiFetch(URL_BLOG);
    await naverApiFetch(URL_BLOG);
    expect(calls.map((c) => c.keyId)).toEqual(['main-id', 'second-id', 'second-id']);
  });

  it('문구 없는 429(초당 제한)는 전환하지 않고 그대로 돌려준다 (기존 재시도 동작 유지)', async () => {
    const calls = stubFetch({ 'main-id': { status: 429, body: '{"error":{"errorCode":429,"message":"Rate limit exceeded"}}' } });
    const response = await naverApiFetch(URL_BLOG);
    expect(response.status).toBe(429);
    expect(calls.map((c) => c.keyId)).toEqual(['main-id']);
    expect(fs.existsSync(stateFile)).toBe(false);
  });

  it('본문이 빈 429 도 전환하지 않는다', async () => {
    const calls = stubFetch({ 'main-id': { status: 429, body: '' } });
    expect((await naverApiFetch(URL_BLOG)).status).toBe(429);
    expect(calls).toHaveLength(1);
  });
});

describe('401/403 은 그 키만 건너뛴다', () => {
  it('1번 키 401 → 2번 키로 보내고, 이후 요청도 1번 키를 건너뛴다 (한도 상태는 안 적힘)', async () => {
    const calls = stubFetch({ 'main-id': { status: 401, body: 'denied' } });
    expect((await naverApiFetch(URL_BLOG)).status).toBe(200);
    expect((await naverApiFetch(URL_BLOG)).status).toBe(200);
    expect(calls.map((c) => c.keyId)).toEqual(['main-id', 'second-id', 'second-id']);
    expect(fs.existsSync(stateFile)).toBe(false);
  });

  it('기존 조건 유지: 404 는 옛 방식(legacy)으로 복귀한다', async () => {
    const calls = stubFetch({ 'main-id': { status: 404, body: 'nf' } });
    const response = await naverApiFetch(URL_BLOG, { headers: { 'X-Naver-Client-Id': 'legacy', 'X-Naver-Client-Secret': 'legacy' } });
    expect(response.status).toBe(200);
    expect(calls[calls.length - 1].url).toBe(URL_BLOG);
  });
});

describe('모든 허브 키가 끝났을 때', () => {
  it('한 문장 오류로 끝내고 옛 방식(legacy)으로 넘어가지 않는다', async () => {
    const calls = stubFetch({
      'main-id': { status: 429, body: DAILY },
      'second-id': { status: 429, body: DAILY },
      'third-id': { status: 429, body: DAILY },
    });
    const error = await naverApiFetch(URL_BLOG).catch((e) => e);
    expect(error).toBeInstanceOf(ApiHubQuotaExhaustedError);
    expect(error.message).toBe(apiHubQuotaExhaustedMessage(3));
    expect(calls).toHaveLength(3);
    expect(calls.every((c) => c.url.includes('ntruss.com'))).toBe(true);
  });

  it('다음 요청은 아예 보내지 않고, 다시 켜도(메모리 초기화) 오늘은 같은 오류', async () => {
    const calls = stubFetch({
      'main-id': { status: 429, body: DAILY },
      'second-id': { status: 429, body: DAILY },
      'third-id': { status: 429, body: DAILY },
    });
    await naverApiFetch(URL_BLOG).catch(() => undefined);
    const before = calls.length;
    await expect(naverApiFetch(URL_BLOG)).rejects.toThrow('허브 키 3개 모두 오늘 한도가 끝났습니다');
    resetApiHubSessionState();
    await expect(naverApiFetch(URL_BLOG)).rejects.toBeInstanceOf(ApiHubQuotaExhaustedError);
    expect(calls).toHaveLength(before);
  });

  it('GitHub Actions 에서는 ::error:: 한 줄로 보인다', async () => {
    process.env.GITHUB_ACTIONS = 'true';
    stubFetch({
      'main-id': { status: 429, body: DAILY },
      'second-id': { status: 429, body: DAILY },
      'third-id': { status: 429, body: DAILY },
    });
    await naverApiFetch(URL_BLOG).catch(() => undefined);
    await naverApiFetch(URL_BLOG).catch(() => undefined);
    const lines = logs.filter((line) => line.startsWith('::error::'));
    expect(lines).toEqual([`::error::${apiHubQuotaExhaustedMessage(3)}`]);
  });
});

describe('키 값은 로그·상태 파일에 남지 않는다', () => {
  it('전환·소진 과정 전체의 로그와 상태 파일에 키 값·Key ID 가 없다', async () => {
    stubFetch({
      'main-id': { status: 429, body: DAILY },
      'second-id': { status: 429, body: DAILY },
      'third-id': { status: 429, body: DAILY },
    });
    await naverApiFetch(URL_BLOG).catch(() => undefined);
    const haystack = logs.join('\n') + '\n' + fs.readFileSync(stateFile, 'utf8');
    for (const secret of SECRETS) expect(haystack).not.toContain(secret);
  });
});
