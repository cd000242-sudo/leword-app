/**
 * 앱 ↔ 사이트 API 키 한 몸(2026-10-07 사장님 "앱에 api 키를 저장했는데 굳이 사이트에서도 따로 저장해야 되는 이유가 있나? 둘이 한 몸이어야").
 * 충돌은 마지막에 저장한 쪽이 이긴다(사장님 결정) — 그래서 앱도 키를 바꾼 시각(apiKeysSavedAt)을 남긴다.
 */
import { describe, expect, it } from 'vitest';
import { API_KEY_FIELD_MAP, apiKeysChanged, configToSiteKeys, siteKeysToConfigPartial } from '../api-key-sync';

describe('앱 설정 ↔ 사이트 키 칸', () => {
  it('앱 설정을 사이트 칸 이름으로 — 빈 칸은 보내지 않는다', () => {
    const keys = configToSiteKeys({ naverClientId: ' id1 ', naverClientSecret: '', youtubeApiKey: 'yt', naverSearchAdCustomerId: '123' } as any);
    expect(keys).toEqual({ openApiId: 'id1', youtubeKey: 'yt', searchAdCustomer: '123' });
  });

  it('사이트가 보낸 키 → 앱 설정 조각: 아는 칸 · 값 있는 것만 · 저장 시각을 함께', () => {
    const partial = siteKeysToConfigPartial({ openApiId: 'abc', searchAdSecret: '  sec  ', youtubeKey: '', evil: 'x', coupangAccessKey: 'c' }, '2026-10-07T01:00:00.000Z');
    expect(partial).toEqual({ naverClientId: 'abc', naverSearchAdSecretKey: 'sec', apiKeysSavedAt: '2026-10-07T01:00:00.000Z' });
  });

  it('비정상 값(너무 김 · 줄바꿈 · 문자열 아님)은 버린다 — 빈 값으로 덮지도 않는다', () => {
    const partial = siteKeysToConfigPartial({ openApiId: 'a'.repeat(500), openApiSecret: 'x\ny', youtubeKey: 42 as any, apihubKey: 'ok' }, 'not-a-date');
    expect(partial.naverClientId).toBeUndefined();
    expect(partial.naverClientSecret).toBeUndefined();
    expect(partial.youtubeApiKey).toBeUndefined();
    expect(partial.naverApiHubKey).toBe('ok');
    expect(Number.isFinite(Date.parse(String(partial.apiKeysSavedAt)))).toBe(true);
  });

  it('키 칸이 실제로 바뀔 때만 "바뀜" — 다른 설정만 저장하거나 같은 값이면 아님', () => {
    const prev = { naverClientId: 'a', youtubeApiKey: 'y', lowSpecMode: false } as any;
    expect(apiKeysChanged(prev, { lowSpecMode: true } as any)).toBe(false);
    expect(apiKeysChanged(prev, { naverClientId: 'a' } as any)).toBe(false);
    expect(apiKeysChanged(prev, { naverClientId: 'b' } as any)).toBe(true);
    expect(apiKeysChanged(prev, { naverApiHubKey: 'new' } as any)).toBe(true);
  });

  it('칸 표는 사이트 브리지와 같은 8칸', () => {
    expect(Object.keys(API_KEY_FIELD_MAP).sort()).toEqual(['apihubKey', 'apihubKeyId', 'openApiId', 'openApiSecret', 'searchAdCustomer', 'searchAdLicense', 'searchAdSecret', 'youtubeKey']);
  });
});
