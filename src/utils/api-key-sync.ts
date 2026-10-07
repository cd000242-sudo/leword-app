/**
 * 앱 ↔ 사이트 API 키 한 몸(2026-10-07 사장님 "둘이 한 몸이 되어야 정상"). 같은 PC 의 사이트가 브리지로
 * 앱 키를 읽어 가고(/v1/bridge/api-keys), 사이트에서 저장한 키를 앱에 넣는다(/v1/bridge/api-keys-save).
 * 충돌은 마지막에 저장한 쪽이 이긴다(사장님 결정) — 앱은 키 칸이 바뀔 때마다 apiKeysSavedAt 을 남긴다(environment-manager.saveConfig).
 */

/** 사이트 칸(userKeys.UserKeyField) → 앱 설정 키. 사이트 브리지와 같은 8칸. */
export const API_KEY_FIELD_MAP = {
  openApiId: 'naverClientId',
  openApiSecret: 'naverClientSecret',
  apihubKeyId: 'naverApiHubKeyId',
  apihubKey: 'naverApiHubKey',
  searchAdLicense: 'naverSearchAdAccessLicense',
  searchAdSecret: 'naverSearchAdSecretKey',
  searchAdCustomer: 'naverSearchAdCustomerId',
  youtubeKey: 'youtubeApiKey',
} as const;

type SiteField = keyof typeof API_KEY_FIELD_MAP;
type ConfigField = (typeof API_KEY_FIELD_MAP)[SiteField];
type ConfigLike = Partial<Record<ConfigField, unknown>> & Record<string, unknown>;

const MAX_KEY_CHARS = 400;
const clean = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

/** 앱 설정 → 사이트 칸. 값이 없는 칸은 보내지 않는다(빈 문자열로 덮지 않게). */
export function configToSiteKeys(env: ConfigLike): Record<string, string> {
  const keys: Record<string, string> = {};
  for (const [site, config] of Object.entries(API_KEY_FIELD_MAP)) {
    const value = clean(env[config]);
    if (value) keys[site] = value;
  }
  return keys;
}

/**
 * 사이트가 보낸 키 → 앱 설정 조각. 아는 8칸 · 값이 있는 문자열만(400자 안 · 줄바꿈 · 제어문자 없음).
 * 빈 칸은 넣지 않는다 — 앱 설정을 빈 값으로 덮던 사고(설정 저장이 없는 칸을 비우던 결함)를 되풀이하지 않는다.
 */
export function siteKeysToConfigPartial(keys: Record<string, unknown>, savedAt: unknown): Record<string, string> {
  const partial: Record<string, string> = {};
  for (const [site, config] of Object.entries(API_KEY_FIELD_MAP)) {
    const value = clean(keys?.[site]);
    if (!value || value.length > MAX_KEY_CHARS || /[\u0000-\u001f\u007f]/.test(value)) continue;
    partial[config] = value;
  }
  const at = typeof savedAt === 'string' && Number.isFinite(Date.parse(savedAt)) ? new Date(savedAt).toISOString() : new Date().toISOString();
  return Object.keys(partial).length ? { ...partial, apiKeysSavedAt: at } : partial;
}

/** 이번 저장이 키 칸을 실제로 바꾸나 — 다른 설정만 저장하거나 같은 값이면 아니다. */
export function apiKeysChanged(prev: ConfigLike, partial: ConfigLike): boolean {
  return Object.values(API_KEY_FIELD_MAP).some((config) => Object.prototype.hasOwnProperty.call(partial, config) && clean(partial[config]) !== clean(prev?.[config]));
}
