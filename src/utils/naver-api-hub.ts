/**
 * NAVER API HUB 어댑터 — 개발자센터 API 종료(유예 ~2027-06-30) 선제 대응 SSoT
 *
 * 배경: 검색·데이터랩 API 가 네이버클라우드 API HUB 로 이관됐다(2026-06-25).
 *   - 주소:  openapi.naver.com/v1/search/news.json → naverapihub.apigw.ntruss.com/search/v1/news
 *   - 헤더:  X-Naver-Client-Id/Secret → X-NCP-APIGW-API-KEY-ID / X-NCP-APIGW-API-KEY
 * 뉴스 경로는 공개 이관 가이드로 확정, 블로그·데이터랩 경로는 문서마다 게이트웨이가
 * 갈려서(naverapihub vs naveropenapi) 추측을 코드에 박지 않는다 — 키가 입력되는
 * 순간 probeApiHub() 가 후보를 실측해 작동하는 게이트웨이를 잠근다(실측 > 문서).
 *
 * 사용법: 기존 호출부는 fetch(url, {headers}) 를 naverApiFetch(url, {headers}) 로만
 * 바꾼다. HUB 키가 없으면 그대로 legacy 로 나가고, 있으면 자동 변환된다.
 */

import { EnvironmentManager } from './environment-manager';
import {
  ApiHubKey,
  ApiHubKeyConfigSource,
  collectApiHubKeys,
  isApiHubKeyQuotaBlocked,
  isApiHubKeyUsable,
  isApiHubDailyQuotaResponse,
  markApiHubKeyInvalid,
  markApiHubKeyQuotaBlocked,
  raiseApiHubQuotaExhausted,
  resetApiHubPoolSessionState,
} from './naver-api-hub-pool';

/** 실측으로 확인될 때까지의 게이트웨이 후보 — probe 가 순서대로 시험한다 */
export const API_HUB_BASE_CANDIDATES = [
  'https://naverapihub.apigw.ntruss.com',
  'https://naveropenapi.apigw.ntruss.com',
] as const;

export interface ApiHubCredentials {
  keyId: string;
  key: string;
  base: string; // probe 로 잠근 게이트웨이 (미확정이면 후보 1순위)
}

/** All usable-by-configuration HUB keys in order: existing fields first, then the extra-account pool. */
export function getApiHubKeys(): ApiHubKey[] {
  const config = EnvironmentManager.getInstance().getConfig();
  return collectApiHubKeys(config as ApiHubKeyConfigSource);
}

function getApiHubBase(): string {
  const config = EnvironmentManager.getInstance().getConfig();
  return config.naverApiHubBase || process.env['NAVER_APIHUB_BASE'] || API_HUB_BASE_CANDIDATES[0];
}

/** First configured key (kept for callers that only need "is HUB set up"). */
export function getApiHubCredentials(): ApiHubCredentials | null {
  const first = getApiHubKeys()[0];
  if (!first) return null;
  return { keyId: first.keyId, key: first.key, base: getApiHubBase() };
}

export function isApiHubConfigured(): boolean {
  return getApiHubCredentials() !== null;
}

/**
 * legacy openapi URL → HUB URL. 매핑 불가능한 URL 은 null (변환하지 않음).
 *   /v1/search/{type}.json → /search/v1/{type}       (2026-08-18 실측 200)
 *   /v1/datalab/search     → /search-trend/v1/search  (2026-08-18 실측 200 —
 *     문서 추정 경로 /datalab/v1/search 는 실제 404였다)
 * 쇼핑·책·전문자료는 HUB 에도 없다(완전 종료) — 변환 대상에서 제외.
 * datalab/shopping(쇼핑인사이트)은 HUB 경로 미실측 — 변환하지 않고 legacy 로 둔다.
 */
export function mapLegacyUrlToHub(legacyUrl: string, base: string): string | null {
  const search = legacyUrl.match(/^https:\/\/openapi\.naver\.com\/v1\/search\/(blog|news|webkr|kin|cafearticle|image|local|doc|encyc)\.json(\?.*)?$/);
  if (search) return `${base}/search/v1/${search[1]}${search[2] || ''}`;
  const datalab = legacyUrl.match(/^https:\/\/openapi\.naver\.com\/v1\/datalab\/search(\?.*)?$/);
  if (datalab) return `${base}/search-trend/v1/search${datalab[1] || ''}`;
  return null;
}

/** legacy 헤더 묶음 → HUB 헤더 묶음 (Content-Type 등 인증 외 헤더는 보존) */
export function swapAuthHeaders(
  headers: Record<string, string>,
  creds: { keyId: string; key: string }
): Record<string, string> {
  const kept = Object.fromEntries(
    Object.entries(headers || {}).filter(
      ([name]) => !/^x-naver-client-(id|secret)$/i.test(name)
    )
  );
  return {
    ...kept,
    'X-NCP-APIGW-API-KEY-ID': creds.keyId,
    'X-NCP-APIGW-API-KEY': creds.key,
  };
}

// HUB 로 보냈다가 인증/경로 오류가 난 세션에서는 legacy 로 눌러앉는다 —
// 요청마다 죽은 조합을 반복 시도하며 지연을 쌓지 않기 위한 세션 플래그.
let hubBrokenThisSession = false;

// Responses that really came from the HUB (not from the legacy fallback). Callers use this to
// avoid writing a HUB reply into the legacy OpenAPI key state.
const hubResponses = new WeakSet<object>();

export function isApiHubResponse(response: Response): boolean {
  return hubResponses.has(response);
}

/** 테스트·재프로브용 초기화 */
export function resetApiHubSessionState(): void {
  hubBrokenThisSession = false;
  resetApiHubPoolSessionState();
}

async function isDailyQuotaReply(response: Response): Promise<boolean> {
  if (response.status !== 429) return false;
  const text = await response.clone().text().catch(() => '');
  return isApiHubDailyQuotaResponse(response.status, text);
}

/** Log which key replaces the spent one. Numbers only — never a key value or Key ID. "남은 키" counts usable keys from the next one on. */
function logKeySwitch(keys: ApiHubKey[], spentIndex: number): void {
  const later = keys.map((item, index) => ({ item, index })).filter(({ item, index }) => index > spentIndex && isApiHubKeyUsable(item));
  if (later.length === 0) {
    console.warn(`[API-HUB] ${spentIndex + 1}번 키 오늘 한도 끝 (남은 키 0개)`);
    return;
  }
  console.warn(`[API-HUB] ${spentIndex + 1}번 키 오늘 한도 끝 → ${later[0].index + 1}번 키로 전환 (남은 키 ${later.length}개)`);
}

/**
 * fetch 드롭인 대체. HUB 키가 설정돼 있으면 URL·헤더를 변환해 호출한다.
 *  - 일별 한도 429(본문에 일별 사용량 한도): 그 키를 다음 한국 자정까지 막고 다음 키로 같은 요청을 다시 보낸다.
 *  - 문구 없는 429(초당 제한 등): 전환하지 않고 그대로 돌려준다.
 *  - 401/403: 그 키만 이번 세션 건너뛴다. 404 또는 키가 전부 무효면 이번 세션은 legacy 로 눌러앉는다(기존 동작).
 *  - 모든 키가 한도 끝: legacy 로 넘어가지 않고 한 문장 오류를 던진다 (조용한 대체 금지).
 * HUB 키가 없으면 원본 그대로 나간다.
 */
export async function naverApiFetch(
  url: string,
  init: Omit<RequestInit, 'headers'> & { headers?: Record<string, string> } = {}
): Promise<Response> {
  const keys = hubBrokenThisSession ? [] : getApiHubKeys();
  const hubUrl = keys.length > 0 ? mapLegacyUrlToHub(url, getApiHubBase()) : null;
  if (!hubUrl) {
    return fetch(url, init as RequestInit);
  }
  try {
    for (let index = 0; index < keys.length; index += 1) {
      const key = keys[index];
      if (!isApiHubKeyUsable(key)) continue;
      const hubInit = { ...init, headers: swapAuthHeaders(init.headers || {}, key) };
      const response = await fetch(hubUrl, hubInit as RequestInit);
      if (response.status === 404) {
        hubBrokenThisSession = true;
        console.warn(`[API-HUB] HUB 응답 ${response.status} — 이번 세션은 legacy 로 복귀 (${hubUrl.slice(0, 60)})`);
        return fetch(url, init as RequestInit);
      }
      if (response.status === 401 || response.status === 403) {
        markApiHubKeyInvalid(key);
        console.warn(`[API-HUB] ${index + 1}번 키 응답 ${response.status} — 이 키만 건너뜁니다`);
        continue;
      }
      if (await isDailyQuotaReply(response)) {
        markApiHubKeyQuotaBlocked(key);
        logKeySwitch(keys, index);
        continue;
      }
      hubResponses.add(response);
      return response;
    }
  } catch (error: any) {
    hubBrokenThisSession = true;
    console.warn('[API-HUB] HUB 호출 실패 — legacy 로 복귀:', error?.message || error);
    return fetch(url, init as RequestInit);
  }
  const spent = keys.filter((item) => isApiHubKeyQuotaBlocked(item)).length;
  if (spent > 0) raiseApiHubQuotaExhausted(spent);
  // Only auth-rejected keys remain: same as the old 401/403 rule — settle on legacy for this session.
  hubBrokenThisSession = true;
  console.warn('[API-HUB] 모든 HUB 키가 인증 거부(401/403) — 이번 세션은 legacy 로 복귀');
  return fetch(url, init as RequestInit);
}

/**
 * axios 등 fetch 가 아닌 클라이언트용 순수 변환 — HUB 키가 있으면 변환된
 * {url, headers} 를, 없거나 매핑 불가면 원본 그대로 돌려준다.
 * 이 경로는 응답을 볼 수 없어 키 전환은 못 한다. 이미 한도가 끝난 키는 건너뛰고,
 * 전부 끝났으면 naverApiFetch 와 같은 한 문장 오류를 던진다.
 */
export function transformNaverRequest(
  url: string,
  headers: Record<string, string>
): { url: string; headers: Record<string, string> } {
  const keys = hubBrokenThisSession ? [] : getApiHubKeys();
  if (keys.length === 0) return { url, headers };
  const hubUrl = mapLegacyUrlToHub(url, getApiHubBase());
  if (!hubUrl) return { url, headers };
  const usable = keys.find((item) => isApiHubKeyUsable(item));
  if (usable) return { url: hubUrl, headers: swapAuthHeaders(headers, usable) };
  const spent = keys.filter((item) => isApiHubKeyQuotaBlocked(item)).length;
  if (spent > 0) raiseApiHubQuotaExhausted(spent);
  return { url, headers };
}

export interface ApiHubProbeResult {
  ok: boolean;
  base?: string;           // 작동이 실측된 게이트웨이
  searchOk?: boolean;
  datalabOk?: boolean;
  detail: string;
}

/**
 * 키 입력 시 1회 실행 — 게이트웨이 후보 × (블로그 검색 + 데이터랩) 실측.
 * 성공한 base 를 반환하며, 호출측(설정 저장)이 naverApiHubBase 로 잠근다.
 */
export async function probeApiHub(keyId: string, key: string): Promise<ApiHubProbeResult> {
  const trimmedId = (keyId || '').trim();
  const trimmedKey = (key || '').trim();
  if (!trimmedId || !trimmedKey) {
    return { ok: false, detail: '키가 비어 있습니다.' };
  }
  const headers = swapAuthHeaders({}, { keyId: trimmedId, key: trimmedKey });
  const attempts: string[] = [];

  for (const base of API_HUB_BASE_CANDIDATES) {
    let searchOk = false;
    let datalabOk = false;
    try {
      const searchRes = await fetch(`${base}/search/v1/blog?query=%ED%85%8C%EC%8A%A4%ED%8A%B8&display=1`, {
        headers,
        signal: AbortSignal.timeout(10000),
      });
      if (searchRes.status === 200) {
        const body: any = await searchRes.json().catch(() => null);
        searchOk = !!body && Array.isArray(body.items);
      }
      attempts.push(`${base} 검색=${searchRes.status}`);
    } catch (error: any) {
      attempts.push(`${base} 검색=예외(${String(error?.message || error).slice(0, 40)})`);
    }
    if (!searchOk) continue;

    try {
      const datalabRes = await fetch(`${base}/search-trend/v1/search`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startDate: '2026-07-01',
          endDate: '2026-07-31',
          timeUnit: 'month',
          keywordGroups: [{ groupName: '테스트', keywords: ['테스트'] }],
        }),
        signal: AbortSignal.timeout(10000),
      });
      datalabOk = datalabRes.status === 200;
      attempts.push(`${base} 데이터랩=${datalabRes.status}`);
    } catch (error: any) {
      attempts.push(`${base} 데이터랩=예외(${String(error?.message || error).slice(0, 40)})`);
    }

    return {
      ok: true,
      base,
      searchOk,
      datalabOk,
      detail: `실측 성공: ${base} (검색 OK${datalabOk ? ', 데이터랩 OK' : ', 데이터랩 확인 필요'})`,
    };
  }

  return { ok: false, detail: `모든 게이트웨이 후보 실패 — ${attempts.join(' / ')}` };
}
