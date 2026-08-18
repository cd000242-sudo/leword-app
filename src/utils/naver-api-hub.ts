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

export function getApiHubCredentials(): ApiHubCredentials | null {
  const config = EnvironmentManager.getInstance().getConfig();
  const keyId = config.naverApiHubKeyId || process.env['NAVER_APIHUB_KEY_ID'] || '';
  const key = config.naverApiHubKey || process.env['NAVER_APIHUB_KEY'] || '';
  if (!keyId.trim() || !key.trim()) return null;
  const base = config.naverApiHubBase || process.env['NAVER_APIHUB_BASE'] || API_HUB_BASE_CANDIDATES[0];
  return { keyId: keyId.trim(), key: key.trim(), base };
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

/** 테스트·재프로브용 초기화 */
export function resetApiHubSessionState(): void {
  hubBrokenThisSession = false;
}

/**
 * fetch 드롭인 대체. HUB 키가 설정돼 있으면 URL·헤더를 변환해 호출하고,
 * HUB 쪽이 401/403/404(키·경로 문제)면 legacy 로 즉시 재시도한 뒤 이번 세션은
 * legacy 에 눌러앉는다. HUB 키가 없으면 원본 그대로 나간다.
 */
export async function naverApiFetch(
  url: string,
  init: Omit<RequestInit, 'headers'> & { headers?: Record<string, string> } = {}
): Promise<Response> {
  const creds = getApiHubCredentials();
  if (!creds || hubBrokenThisSession) {
    return fetch(url, init as RequestInit);
  }
  const hubUrl = mapLegacyUrlToHub(url, creds.base);
  if (!hubUrl) {
    return fetch(url, init as RequestInit);
  }
  const hubInit = { ...init, headers: swapAuthHeaders(init.headers || {}, creds) };
  try {
    const response = await fetch(hubUrl, hubInit as RequestInit);
    if (response.status === 401 || response.status === 403 || response.status === 404) {
      hubBrokenThisSession = true;
      console.warn(`[API-HUB] HUB 응답 ${response.status} — 이번 세션은 legacy 로 복귀 (${hubUrl.slice(0, 60)})`);
      return fetch(url, init as RequestInit);
    }
    return response;
  } catch (error: any) {
    hubBrokenThisSession = true;
    console.warn('[API-HUB] HUB 호출 실패 — legacy 로 복귀:', error?.message || error);
    return fetch(url, init as RequestInit);
  }
}

/**
 * axios 등 fetch 가 아닌 클라이언트용 순수 변환 — HUB 키가 있으면 변환된
 * {url, headers} 를, 없거나 매핑 불가면 원본 그대로 돌려준다.
 */
export function transformNaverRequest(
  url: string,
  headers: Record<string, string>
): { url: string; headers: Record<string, string> } {
  const creds = getApiHubCredentials();
  if (!creds || hubBrokenThisSession) return { url, headers };
  const hubUrl = mapLegacyUrlToHub(url, creds.base);
  if (!hubUrl) return { url, headers };
  return { url: hubUrl, headers: swapAuthHeaders(headers, creds) };
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
