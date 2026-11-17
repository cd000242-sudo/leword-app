/**
 * API HUB key pool — pure rules: parsing, de-duplication, ordering, daily-limit detection,
 * per-key state (hash only, never the key value) and the masked-value guard.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  apiHubKeyHash,
  apiHubQuotaExhaustedMessage,
  collectApiHubKeys,
  isApiHubDailyQuotaResponse,
  isApiHubKeyQuotaBlocked,
  markApiHubKeyQuotaBlocked,
  parseApiHubKeyPool,
  resetApiHubPoolSessionState,
  sanitizeApiHubKeyPool,
} from '../naver-api-hub-pool';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'naver-api-hub-pool-'));
const STATE_ENV = 'LEWORD_NAVER_APIHUB_QUOTA_STATE_FILE';
const savedState = process.env[STATE_ENV];
let round = 0;

beforeEach(() => {
  round += 1;
  process.env[STATE_ENV] = path.join(dir, `state-${round}.json`);
  resetApiHubPoolSessionState();
});

afterAll(() => {
  if (savedState === undefined) delete process.env[STATE_ENV];
  else process.env[STATE_ENV] = savedState;
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('parseApiHubKeyPool', () => {
  it('id:key 쌍을 쉼표·세미콜론·줄바꿈으로 나눠 읽는다', () => {
    expect(parseApiHubKeyPool('id2:key2,id3:key3;id4|key4\nid5:key5')).toEqual([
      { keyId: 'id2', key: 'key2', label: 'pool-1' },
      { keyId: 'id3', key: 'key3', label: 'pool-2' },
      { keyId: 'id4', key: 'key4', label: 'pool-3' },
      { keyId: 'id5', key: 'key5', label: 'pool-4' },
    ]);
  });

  it('JSON 배열도 읽는다 (keyId/key 또는 id/secret)', () => {
    const parsed = parseApiHubKeyPool('[{"keyId":"a","key":"b","label":"둘째"},{"id":"c","secret":"d"}]');
    expect(parsed).toEqual([
      { keyId: 'a', key: 'b', label: '둘째' },
      { keyId: 'c', key: 'd', label: 'pool-2' },
    ]);
  });

  it('빈 값·짝이 안 맞는 항목은 버린다', () => {
    expect(parseApiHubKeyPool('')).toEqual([]);
    expect(parseApiHubKeyPool('only-id:,:only-key,ok:yes').map((k) => k.keyId)).toEqual(['ok']);
  });
});

describe('collectApiHubKeys — 순서와 중복 제거', () => {
  it('1번(기존 칸) → config 풀 → 환경 변수 풀 순서, 같은 키는 한 번만', () => {
    const keys = collectApiHubKeys(
      {
        naverApiHubKeyId: 'main-id',
        naverApiHubKey: 'main-key',
        naverApiHubKeyPool: [
          { keyId: 'two-id', key: 'two-key' },
          { keyId: 'main-id', key: 'main-key' },
        ],
      },
      { NAVER_APIHUB_KEY_POOL: 'two-id:two-key,three-id:three-key' } as NodeJS.ProcessEnv,
    );
    expect(keys.map((k) => k.keyId)).toEqual(['main-id', 'two-id', 'three-id']);
  });

  it('기존 칸이 비어 있어도 풀만으로 동작한다', () => {
    const keys = collectApiHubKeys({ naverApiHubKeyPool: [{ keyId: 'p-id', key: 'p-key' }] }, {} as NodeJS.ProcessEnv);
    expect(keys.map((k) => k.keyId)).toEqual(['p-id']);
  });

  it('환경 변수의 기존 칸(NAVER_APIHUB_KEY_ID/KEY)도 1번으로 읽는다', () => {
    const keys = collectApiHubKeys({}, { NAVER_APIHUB_KEY_ID: 'e-id', NAVER_APIHUB_KEY: 'e-key' } as NodeJS.ProcessEnv);
    expect(keys).toEqual([{ keyId: 'e-id', key: 'e-key' }]);
  });
});

describe('sanitizeApiHubKeyPool — 저장 가드', () => {
  it('가려진 표시값(•, *, ●)은 저장 대상에서 뺀다', () => {
    const out = sanitizeApiHubKeyPool([
      { keyId: 'ok-id', key: 'ok-key' },
      { keyId: 'masked-id', key: '••••••••' },
      { keyId: 'star-id', key: '********' },
      { keyId: '●●●●', key: 'x' },
    ]);
    expect(out).toEqual([{ keyId: 'ok-id', key: 'ok-key' }]);
  });

  it('공백을 다듬고 빈 행·중복을 버린다, 배열이 아니면 빈 목록', () => {
    expect(
      sanitizeApiHubKeyPool([
        { keyId: ' a ', key: ' b ' },
        { keyId: 'a', key: 'b' },
        { keyId: '', key: 'zzz' },
        null,
      ]),
    ).toEqual([{ keyId: 'a', key: 'b' }]);
    expect(sanitizeApiHubKeyPool('nope')).toEqual([]);
    expect(sanitizeApiHubKeyPool(undefined)).toEqual([]);
  });
});

describe('isApiHubDailyQuotaResponse', () => {
  const daily = '{"error":{"errorCode":429,"message":"일별 사용량 한도가 초과하였습니다."}}';
  it('429 + 일별 사용량 한도 문구만 "오늘 끝"', () => {
    expect(isApiHubDailyQuotaResponse(429, daily)).toBe(true);
    expect(isApiHubDailyQuotaResponse(429, '{"error":{"errorCode":429,"message":"Daily quota exceeded"}}')).toBe(true);
  });
  it('문구 없는 429(초당 제한 등)는 "오늘 끝"이 아니다', () => {
    expect(isApiHubDailyQuotaResponse(429, '')).toBe(false);
    expect(isApiHubDailyQuotaResponse(429, '{"error":{"errorCode":429,"message":"Rate limit exceeded"}}')).toBe(false);
    expect(isApiHubDailyQuotaResponse(429, '요청이 너무 많습니다')).toBe(false);
  });
  it('429 가 아니면 문구가 있어도 아니다', () => {
    expect(isApiHubDailyQuotaResponse(403, daily)).toBe(false);
    expect(isApiHubDailyQuotaResponse(200, daily)).toBe(false);
  });
});

describe('키별 상태 — 해시만 남기고 다음 한국 자정까지', () => {
  const key = { keyId: 'SECRET-ID-001', key: 'SECRET-KEY-VALUE-001' };

  it('막으면 그 시각 뒤 한국 자정까지 막히고, 자정이 지나면 풀린다', () => {
    const now = Date.parse('2026-11-18T05:00:00Z'); // 14:00 KST
    const until = markApiHubKeyQuotaBlocked(key, now);
    expect(until).toBe(Date.parse('2026-11-18T15:00:00Z')); // 다음 KST 자정
    expect(isApiHubKeyQuotaBlocked(key, now + 1000)).toBe(true);
    expect(isApiHubKeyQuotaBlocked(key, until)).toBe(false);
  });

  it('프로그램을 다시 켜도(메모리 초기화) 파일에서 기억한다', () => {
    const now = Date.now();
    markApiHubKeyQuotaBlocked(key, now);
    resetApiHubPoolSessionState();
    expect(isApiHubKeyQuotaBlocked(key, now + 1000)).toBe(true);
  });

  it('상태 파일에 키 값·Key ID 가 없다 (해시만)', () => {
    markApiHubKeyQuotaBlocked(key, Date.now());
    const raw = fs.readFileSync(process.env[STATE_ENV] as string, 'utf8');
    expect(raw).not.toContain(key.keyId);
    expect(raw).not.toContain(key.key);
    expect(raw).toContain(apiHubKeyHash(key));
    expect(apiHubKeyHash(key)).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('소진 오류 문구', () => {
  it('한 문장 한국어', () => {
    expect(apiHubQuotaExhaustedMessage(3)).toBe(
      '허브 키 3개 모두 오늘 한도가 끝났습니다. 자정 이후 다시 되거나, 다른 계정 키를 추가해 주세요.',
    );
  });
});
