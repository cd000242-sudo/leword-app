/**
 * 쿠팡파트너스 — 상품 매칭 + 트래킹 링크 생성
 *
 * 2가지 모드:
 *   1. 기본: 상품명 → 쿠팡 검색 URL (블로거가 수동 매칭)
 *   2. 파트너스 ID 설정: HMAC-SHA256 deeplink API로 트래킹 링크 자동 생성
 *
 * 쿠팡파트너스 공식: https://partners.coupang.com/
 */

import * as crypto from 'crypto';
import { EnvironmentManager } from './environment-manager';

export interface CoupangPartnersConfig {
  accessKey?: string;
  secretKey?: string;
  subId?: string;  // 광고 추적용 sub_id
}

// v2.43.63: 쿠팡 Product Search API 응답
export interface CoupangProductSearchResult {
  productId: number;
  productName: string;
  productPrice: number;
  productImage: string;
  productUrl: string;       // 쿠팡 상품 상세 URL (어필리에이트 변환 가능)
  categoryName?: string;
  isRocket?: boolean;       // 로켓배송 여부
  isFreeShipping?: boolean;
}

/**
 * 상품명으로 쿠팡 검색 URL 생성 (파트너스 ID 없을 때 기본)
 * 블로거가 이 URL로 가서 정확한 상품 찾은 뒤 수동 파트너스 변환 가능
 */
export function buildCoupangSearchUrl(keyword: string): string {
  const q = encodeURIComponent(keyword.trim());
  return `https://www.coupang.com/np/search?q=${q}&channel=user`;
}

/**
 * 쿠팡파트너스 Deeplink API로 트래킹 링크 자동 생성
 * 상품 URL 여러 개를 일괄 변환. 최대 20개/호출.
 *
 * API: POST https://api-gateway.coupang.com/v2/providers/affiliate_open_api/apis/openapi/v1/deeplink
 * 인증: HMAC 시그니처
 */
// v2.43.59: 4팀 비평 — 24h 캐시 + timeout + 빈문자 정규화
const PARTNERS_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const PARTNERS_FETCH_TIMEOUT_MS = 12_000;
const partnersCache = new Map<string, { result: { originalUrl: string; shortenUrl: string; landingUrl: string }; expiresAt: number }>();
function pruneCacheIfBig(): void {
  if (partnersCache.size < 5000) return;
  const now = Date.now();
  for (const [k, v] of partnersCache.entries()) {
    if (v.expiresAt < now) partnersCache.delete(k);
  }
}

export async function convertToPartnersLinks(
  urls: string[],
  config: CoupangPartnersConfig
): Promise<Array<{ originalUrl: string; shortenUrl: string; landingUrl: string }>> {
  // v2.43.59: 4팀 — 빈문자 가드 (env fallback이 '' 통과 → HMAC 5xx)
  const accessKey = (config.accessKey || '').trim();
  const secretKey = (config.secretKey || '').trim();
  if (!accessKey || !secretKey) {
    throw new Error('쿠팡파트너스 Access Key / Secret Key가 필요합니다.');
  }
  if (!urls || urls.length === 0) return [];

  // 24h 캐시 적중 분리 — sub_id 별로 별도 캐시 (트래킹 분리)
  const subId = (config.subId || '').trim();
  pruneCacheIfBig();
  const now = Date.now();
  const cacheKeyFor = (u: string) => `${subId}|${u}`;
  const miss: string[] = [];
  const passThroughIdx: Array<{ idx: number; result: { originalUrl: string; shortenUrl: string; landingUrl: string } }> = [];
  for (let i = 0; i < urls.length; i++) {
    const u = urls[i];
    const e = partnersCache.get(cacheKeyFor(u));
    if (e && e.expiresAt > now) {
      passThroughIdx.push({ idx: i, result: e.result });
    } else {
      miss.push(u);
    }
  }

  let fetched: Array<{ originalUrl: string; shortenUrl: string; landingUrl: string }> = [];
  if (miss.length > 0) {
    const cleanUrls = miss.slice(0, 20);
    const path = '/v2/providers/affiliate_open_api/apis/openapi/v1/deeplink';
    const method = 'POST';
    const body = JSON.stringify({
      coupangUrls: cleanUrls,
      ...(subId ? { subId } : {}),
    });

    const nowDate = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const datetime = `${String(nowDate.getUTCFullYear()).slice(2)}${pad(nowDate.getUTCMonth() + 1)}${pad(nowDate.getUTCDate())}T${pad(nowDate.getUTCHours())}${pad(nowDate.getUTCMinutes())}${pad(nowDate.getUTCSeconds())}Z`;

    const message = `${datetime}${method}${path}`;
    const signature = crypto.createHmac('sha256', secretKey).update(message).digest('hex');
    const authorization = `CEA algorithm=HmacSHA256, access-key=${accessKey}, signed-date=${datetime}, signature=${signature}`;

    // v2.43.59: 4팀 — AbortController 12s timeout (deeplink hang 차단)
    const ctrl = new AbortController();
    const killer = setTimeout(() => ctrl.abort(), PARTNERS_FETCH_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(`https://api-gateway.coupang.com${path}`, {
        method,
        headers: {
          'Authorization': authorization,
          'Content-Type': 'application/json;charset=UTF-8',
        },
        body,
        signal: ctrl.signal,
      });
    } catch (e: any) {
      if (e?.name === 'AbortError') throw new Error('쿠팡파트너스 API timeout (12s)');
      throw e;
    } finally {
      clearTimeout(killer);
    }

    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`쿠팡파트너스 API ${res.status}: ${txt.slice(0, 200)}`);
    }

    const json = (await res.json()) as any;
    const data = Array.isArray(json?.data) ? json.data : [];
    fetched = data.map((d: any) => ({
      originalUrl: String(d.originalUrl || ''),
      shortenUrl: String(d.shortenUrl || ''),
      landingUrl: String(d.landingUrl || ''),
    }));

    // 캐시 적재
    for (const f of fetched) {
      if (f.originalUrl) {
        partnersCache.set(cacheKeyFor(f.originalUrl), { result: f, expiresAt: now + PARTNERS_CACHE_TTL_MS });
      }
    }
  }

  // 결과 합치기 (입력 urls 순서 보존)
  const fetchedMap = new Map(fetched.map(f => [f.originalUrl, f]));
  const final: Array<{ originalUrl: string; shortenUrl: string; landingUrl: string }> = [];
  for (let i = 0; i < urls.length; i++) {
    const u = urls[i];
    const hit = passThroughIdx.find(p => p.idx === i);
    if (hit) final.push(hit.result);
    else if (fetchedMap.has(u)) final.push(fetchedMap.get(u)!);
  }
  return final;
}

export function getCoupangPartnersConfig(): CoupangPartnersConfig {
  const cfg: any = EnvironmentManager.getInstance().getConfig();
  // v2.43.59: 4팀 — 빈문자 → undefined 정규화 (accessKey/secretKey 둘 다 있을 때만 활성)
  const normalize = (v: any): string | undefined => {
    const s = String(v || '').trim();
    return s.length > 0 ? s : undefined;
  };
  return {
    accessKey: normalize(cfg.coupangAccessKey || process.env['COUPANG_ACCESS_KEY']),
    secretKey: normalize(cfg.coupangSecretKey || process.env['COUPANG_SECRET_KEY']),
    subId: normalize(cfg.coupangSubId || process.env['COUPANG_SUB_ID']),
  };
}

/**
 * 상품명에서 쿠팡 검색에 유용한 "핵심 키워드" 추출
 * v2.43.59: 4팀 — 모델코드 보존 + 단위 확장
 *   - [/(/{ 등 대괄호 내용 제거
 *   - 단위(ml, g, L, kg, cm, mm, W, V, Hz 등) 제거
 *   - 모델코드 (V11, RTX4090, X10 등 "영문+숫자") 보존
 *   - 너무 긴 설명은 앞부분 4단어만
 */
export function simplifyTitleForCoupangSearch(title: string): string {
  if (!title) return '';
  const cleaned = title
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\{[^}]*\}/g, ' ')
    // 단위 확장 — cm/mm/W/V/Hz/A/Wh/mAh/inch/인치 추가
    .replace(/\b\d+\s?(ml|g|kg|L|EA|개|호|매|팩|종|병|박스|cm|mm|W|V|Hz|A|Wh|mAh|inch|인치)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  // 모델코드 (영문+숫자 또는 영문대문자+숫자) 우선 보존
  const tokens = cleaned.split(' ').filter(w => w.length >= 2);
  const modelCodes = tokens.filter(t => /^[A-Za-z]+\d+[A-Za-z0-9]*$/.test(t) || /^\d+[A-Za-z]+$/.test(t));
  const others = tokens.filter(t => !modelCodes.includes(t));
  // 모델코드 최대 2개 + 나머지 채워서 4단어
  const chosen = [...modelCodes.slice(0, 2), ...others.slice(0, 4 - Math.min(modelCodes.length, 2))];
  return chosen.slice(0, 4).join(' ');
}

// v2.43.63: 쿠팡 Product Search API — 정확한 productId 기반 어필리에이트 매칭
//   엔드포인트: GET /v2/providers/affiliate_open_api/apis/openapi/v1/products/search
//   인증: 동일 HMAC-SHA256
//   24h 캐시 + AbortController + 빈문자 가드 (deeplink 와 동일 패턴)
const PRODUCT_SEARCH_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const PRODUCT_SEARCH_TIMEOUT_MS = 8000;
const productSearchCache = new Map<string, { result: CoupangProductSearchResult[]; expiresAt: number }>();

export async function coupangProductSearch(
  keyword: string,
  config: CoupangPartnersConfig,
  options: { limit?: number } = {}
): Promise<CoupangProductSearchResult[]> {
  const accessKey = (config.accessKey || '').trim();
  const secretKey = (config.secretKey || '').trim();
  if (!accessKey || !secretKey) {
    throw new Error('쿠팡파트너스 키 필요');
  }
  const cleanKw = (keyword || '').trim();
  if (!cleanKw) return [];
  const limit = Math.min(Math.max(options.limit ?? 3, 1), 20);

  // 캐시
  const cacheKey = `${cleanKw}|${limit}`;
  const hit = productSearchCache.get(cacheKey);
  if (hit && hit.expiresAt > Date.now()) return hit.result;

  const path = `/v2/providers/affiliate_open_api/apis/openapi/v1/products/search?keyword=${encodeURIComponent(cleanKw)}&limit=${limit}`;
  const method = 'GET';

  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const datetime = `${String(now.getUTCFullYear()).slice(2)}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`;

  // HMAC signature 는 path (querystring 포함) 기반
  const message = `${datetime}${method}${path.split('?')[0]}${(path.split('?')[1] || '')}`;
  const signature = crypto.createHmac('sha256', secretKey).update(message).digest('hex');
  const authorization = `CEA algorithm=HmacSHA256, access-key=${accessKey}, signed-date=${datetime}, signature=${signature}`;

  const ctrl = new AbortController();
  const killer = setTimeout(() => ctrl.abort(), PRODUCT_SEARCH_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`https://api-gateway.coupang.com${path}`, {
      method,
      headers: { 'Authorization': authorization },
      signal: ctrl.signal,
    });
  } catch (e: any) {
    if (e?.name === 'AbortError') throw new Error('쿠팡 product search timeout (8s)');
    throw e;
  } finally {
    clearTimeout(killer);
  }

  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`쿠팡 product search ${res.status}: ${txt.slice(0, 200)}`);
  }

  const json: any = await res.json();
  const data = Array.isArray(json?.data) ? json.data : [];
  const results: CoupangProductSearchResult[] = data.map((d: any) => ({
    productId: Number(d.productId) || 0,
    productName: String(d.productName || ''),
    productPrice: Number(d.productPrice) || 0,
    productImage: String(d.productImage || ''),
    productUrl: String(d.productUrl || ''),
    categoryName: d.categoryName ? String(d.categoryName) : undefined,
    isRocket: !!d.isRocket,
    isFreeShipping: !!d.isFreeShipping,
  }));

  productSearchCache.set(cacheKey, { result: results, expiresAt: Date.now() + PRODUCT_SEARCH_CACHE_TTL_MS });
  return results;
}

/**
 * 가장 잘 맞는 쿠팡 상품 1건 — 매칭 점수 휴리스틱
 *   1. 모델코드 매칭 (영문+숫자 토큰) 일치 시 큰 가중
 *   2. 토큰 일치율 (네이버 simplified 와 쿠팡 productName 의 공통 토큰 수)
 *   3. 가격 근접도 (네이버 가격 대비 ±30% 이내 우대)
 */
export function pickBestCoupangMatch(
  candidates: CoupangProductSearchResult[],
  naverTitle: string,
  naverPrice?: number
): CoupangProductSearchResult | null {
  if (!candidates || candidates.length === 0) return null;
  const naverSimplified = simplifyTitleForCoupangSearch(naverTitle);
  const naverTokens = naverSimplified.toLowerCase().split(/\s+/).filter(Boolean);
  const modelRe = /^[A-Za-z]+\d+[A-Za-z0-9]*$|^\d+[A-Za-z]+$/;
  const naverModels = new Set(naverTokens.filter(t => modelRe.test(t)));

  let best: CoupangProductSearchResult | null = null;
  let bestScore = -1;

  for (const c of candidates) {
    const cName = (c.productName || '').toLowerCase();
    const cTokens = new Set(cName.split(/\s+/).filter(Boolean));
    let score = 0;
    // 모델코드 매칭 (가장 강한 신호)
    for (const m of naverModels) {
      if (cTokens.has(m)) score += 30;
    }
    // 토큰 일치율
    const overlap = naverTokens.filter(t => cTokens.has(t)).length;
    score += overlap * 5;
    // 가격 근접 (±30%)
    if (naverPrice && c.productPrice > 0) {
      const ratio = c.productPrice / naverPrice;
      if (ratio >= 0.7 && ratio <= 1.3) score += 10;
      else if (ratio >= 0.5 && ratio <= 1.5) score += 4;
    }
    // 로켓배송 약가산 (전환 유리)
    if (c.isRocket) score += 2;

    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  // 최저 임계값 — 너무 약한 매칭은 검색 URL fallback 권장
  return bestScore >= 15 ? best : null;
}
