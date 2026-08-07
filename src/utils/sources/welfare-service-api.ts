/**
 * 복지서비스 공공데이터 API — 정책 레인의 실수요 공급원.
 *
 * 왜 필요한가: 기존 정책 소스(korea.kr 정책브리핑)는 RSS가 죽어 HTML 스크래핑으로
 * 폴백하는데, 그게 기사 제목을 문장 조각으로 잘라 뱉는다("53개 기관이 신청").
 * 이 API는 **제도명 자체**를 조회수와 함께 주므로 조각이 원천적으로 안 나온다.
 *
 * 두 종류를 쓴다.
 *  - 중앙부처(461건): 전국구 제도. "아이돌봄서비스", "장애인자립자금대여"
 *  - 지자체(4,283건): 롱테일 본진. 시도/시군구가 같이 와서 "옥천군 청년 월세 지원"
 *    처럼 지역+제도 조합이 만들어진다.
 *
 * 키가 없으면 조용히 빈 배열을 돌려준다(fail-soft). 호출부는 기존 소스를 계속 쓴다.
 */

import axios from 'axios';

const CENTRAL_URL = 'https://apis.data.go.kr/B554287/NationalWelfareInformationsV001/NationalWelfarelistV001';
const LOCAL_URL = 'https://apis.data.go.kr/B554287/LocalGovernmentWelfareInformations/LcgvWelfarelist';
const PAGE_SIZE = 500; // API 상한
const REQUEST_TIMEOUT_MS = 20_000;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 제도 목록은 하루 단위로도 거의 안 변한다

export interface WelfareService {
  /** 제도명. 그대로 검색어로 쓸 수 있다. */
  keyword: string;
  /** 조회수 — 공공데이터가 주는 실측 인기도 신호 */
  views: number;
  /** 시도 (지자체 전용) */
  province?: string;
  /** 시군구 (지자체 전용, 광역 단위 사업은 없음) */
  district?: string;
  /** 제도 요약 — 글 도입부 소재 */
  summary?: string;
  /** 생애주기명 (청년/노년 등) */
  lifeStage?: string;
  /** 관심주제명 (주거/일자리 등) */
  theme?: string;
  detailUrl?: string;
  scope: 'central' | 'local';
}

interface CacheEntry {
  atMs: number;
  rows: WelfareService[];
}

const cache = new Map<string, CacheEntry>();

/**
 * serviceKey 는 발급 시점부터 URL 인코딩된 형태(%2B, %3D%3D)다.
 * axios params 로 넘기면 이중 인코딩돼 인증에 실패하므로 쿼리 문자열에 직접 붙인다.
 */
function welfareApiKey(): string {
  return String(process.env['WELFARE_API_KEY'] || process.env['DATA_GO_KR_API_KEY'] || '').trim();
}

function textBetween(xml: string, tag: string): string {
  const match = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  if (!match) return '';
  return match[1]
    .replace(/<!\[CDATA\[|\]\]>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function clean(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function rowFromFields(
  get: (key: string) => string,
  scope: WelfareService['scope'],
): WelfareService | null {
  const keyword = get('servNm');
  if (!keyword) return null;
  return {
    keyword,
    views: Number(get('inqNum')) || 0,
    province: get('ctpvNm') || undefined,
    district: get('sggNm') || undefined,
    summary: get('servDgst') || undefined,
    // 중앙부처는 코드 배열(lifeArray), 지자체는 이름 배열(lifeNmArray)로 필드명이 다르다.
    lifeStage: get('lifeNmArray') || get('lifeArray') || undefined,
    theme: get('intrsThemaNmArray') || get('intrsThemaArray') || undefined,
    detailUrl: get('servDtlLink') || undefined,
    scope,
  };
}

/**
 * 항목 단위로 잘라서 파싱한다.
 *
 * 응답 포맷이 두 가지다 — 문서에는 XML 이라고 적혀 있지만 Accept 헤더에 따라 JSON 이
 * 온다(axios 기본값이 JSON 을 선호해서 실제로는 JSON 이 온다). 둘 다 받는다.
 *
 * XML 경로 주의: 필드별 정규식 배열을 zip 하면 sggNm 이 없는 광역 항목 때문에 지역이
 * 어긋난다(예: "대전광역시 홍천군" 같은 존재하지 않는 조합). 반드시 servList 단위로 자를 것.
 */
function parseServiceList(body: string, scope: WelfareService['scope']): WelfareService[] {
  const trimmed = body.trimStart();
  const rows: WelfareService[] = [];

  if (trimmed.startsWith('{')) {
    let payload: { servList?: unknown };
    try {
      payload = JSON.parse(trimmed);
    } catch {
      return rows;
    }
    const list = Array.isArray(payload.servList) ? payload.servList : [];
    for (const entry of list) {
      if (!entry || typeof entry !== 'object') continue;
      const record = entry as Record<string, unknown>;
      const row = rowFromFields((key) => clean(record[key]), scope);
      if (row) rows.push(row);
    }
    return rows;
  }

  const blocks = body.match(/<servList>[\s\S]*?<\/servList>/g) || [];
  for (const block of blocks) {
    const row = rowFromFields((key) => textBetween(block, key), scope);
    if (row) rows.push(row);
  }
  return rows;
}

/** JSON/XML 어느 쪽으로 와도 totalCount 를 읽는다. */
function readTotalCount(body: string): number {
  if (body.trimStart().startsWith('{')) {
    try {
      return Number(clean((JSON.parse(body) as { totalCount?: unknown }).totalCount)) || 0;
    } catch {
      return 0;
    }
  }
  return Number(textBetween(body, 'totalCount')) || 0;
}

async function fetchPage(baseUrl: string, key: string, pageNo: number, sortParam: string): Promise<string> {
  const url = `${baseUrl}?serviceKey=${key}&callTp=L&pageNo=${pageNo}&numOfRows=${PAGE_SIZE}`
    + `&srchKeyCode=003&${sortParam}`;
  const response = await axios.get(url, {
    timeout: REQUEST_TIMEOUT_MS,
    responseType: 'text',
    transformResponse: [(data) => data],
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LewordBot/1.0)' },
    validateStatus: () => true,
  });
  if (response.status !== 200) {
    throw new Error(`복지서비스 API ${response.status}`);
  }
  const body = String(response.data || '');
  // callTp 누락 등 파라미터 오류는 원인 메시지 없이 500/APPLICATION_ERROR 로만 온다.
  const resultCode = body.trimStart().startsWith('{')
    ? clean((JSON.parse(body) as { resultCode?: unknown }).resultCode)
    : textBetween(body, 'resultCode');
  if (resultCode && resultCode !== '0' && resultCode !== '00') {
    throw new Error(`복지서비스 API resultCode=${resultCode} ${textBetween(body, 'resultMsg')}`);
  }
  return body;
}

async function fetchWelfareServices(
  cacheKey: string,
  baseUrl: string,
  sortParam: string,
  scope: WelfareService['scope'],
  maxRows: number,
): Promise<WelfareService[]> {
  const nowMs = Date.now();
  const cached = cache.get(cacheKey);
  if (cached && nowMs - cached.atMs < CACHE_TTL_MS) {
    return cached.rows.slice(0, maxRows);
  }

  const key = welfareApiKey();
  if (!key) return [];

  const rows: WelfareService[] = [];
  const seen = new Set<string>();
  try {
    for (let pageNo = 1; pageNo <= 10 && rows.length < maxRows; pageNo += 1) {
      const body = await fetchPage(baseUrl, key, pageNo, sortParam);
      const parsed = parseServiceList(body, scope);
      if (parsed.length === 0) break;
      for (const row of parsed) {
        const dedupeKey = `${row.province || ''}|${row.district || ''}|${row.keyword}`;
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);
        rows.push(row);
      }
      const total = readTotalCount(body);
      if (total > 0 && rows.length >= total) break;
    }
  } catch (error) {
    console.warn(`[WELFARE-API] ${scope} 수집 실패:`, (error as Error).message);
    // 부분 수집이라도 있으면 그대로 쓴다. 없으면 빈 배열로 fail-soft.
    if (rows.length === 0) return cached ? cached.rows.slice(0, maxRows) : [];
  }

  rows.sort((a, b) => b.views - a.views);
  cache.set(cacheKey, { atMs: nowMs, rows });
  if (rows.length > 0) {
    console.log(`[WELFARE-API] ${scope} 복지서비스 ${rows.length}건 (최다조회 ${rows[0].views.toLocaleString()}회)`);
  }
  return rows.slice(0, maxRows);
}

/** 중앙부처 복지서비스(전국구 제도). 키 없으면 []. */
export function getCentralWelfareServices(limit = 461): Promise<WelfareService[]> {
  return fetchWelfareServices('central', CENTRAL_URL, 'orderBy=popular', 'central', limit);
}

/**
 * 지자체 복지서비스(롱테일 본진).
 * 정렬 파라미터가 중앙부처와 다르다 — orderBy 가 아니라 arrgOrd(002=인기순).
 */
export function getLocalWelfareServices(limit = 1000): Promise<WelfareService[]> {
  return fetchWelfareServices('local', LOCAL_URL, 'arrgOrd=002', 'local', limit);
}

/**
 * 제도명을 검색 시드로 바꾼다.
 * 지자체 사업은 지역명을 앞에 붙인 변형을 함께 낸다 — "옥천군 청년 월세 지원"처럼
 * 지역+제도 조합이 문서수가 적고 검색 의도가 명확한 황금키워드 후보가 된다.
 */
export function welfareServiceToSeeds(row: WelfareService): string[] {
  const base = row.keyword.replace(/\s*\([^)]*\)\s*/g, ' ').replace(/\s+/g, ' ').trim();
  if (!base || base.length < 2) return [];
  const seeds = [base];
  const region = row.district || row.province;
  if (region) {
    // "대전광역시"는 제도명에 "대전"으로만 들어있다. 축약형까지 봐야 "대전 대전 청년
    // 월세지원" 같은 중복 접두가 안 생긴다.
    const regionShort = region.replace(/(특별자치도|특별자치시|광역시|특별시|자치구|자치시|[시군구도])$/, '');
    const already = base.includes(region) || (regionShort.length >= 2 && base.includes(regionShort));
    if (!already && regionShort.length >= 2) seeds.push(`${regionShort} ${base}`);
  }
  return [...new Set(seeds)].filter((seed) => seed.length <= 40);
}

/** 캐시 비우기(테스트용). */
export function clearWelfareServiceCache(): void {
  cache.clear();
}
