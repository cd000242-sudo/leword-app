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
export async function convertToPartnersLinks(
  urls: string[],
  config: CoupangPartnersConfig
): Promise<Array<{ originalUrl: string; shortenUrl: string; landingUrl: string }>> {
  if (!config.accessKey || !config.secretKey) {
    throw new Error('쿠팡파트너스 Access Key / Secret Key가 필요합니다.');
  }
  if (!urls || urls.length === 0) return [];

  const cleanUrls = urls.slice(0, 20);
  const path = '/v2/providers/affiliate_open_api/apis/openapi/v1/deeplink';
  const method = 'POST';
  const body = JSON.stringify({
    coupangUrls: cleanUrls,
    ...(config.subId ? { subId: config.subId } : {}),
  });

  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  // YYMMDDTHHMMSSZ
  const datetime = `${String(now.getUTCFullYear()).slice(2)}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`;

  const message = `${datetime}${method}${path}`;
  const signature = crypto.createHmac('sha256', config.secretKey).update(message).digest('hex');
  const authorization = `CEA algorithm=HmacSHA256, access-key=${config.accessKey}, signed-date=${datetime}, signature=${signature}`;

  const res = await fetch(`https://api-gateway.coupang.com${path}`, {
    method,
    headers: {
      'Authorization': authorization,
      'Content-Type': 'application/json;charset=UTF-8',
    },
    body,
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`쿠팡파트너스 API ${res.status}: ${txt.slice(0, 200)}`);
  }

  const json = (await res.json()) as any;
  const data = Array.isArray(json?.data) ? json.data : [];
  return data.map((d: any) => ({
    originalUrl: String(d.originalUrl || ''),
    shortenUrl: String(d.shortenUrl || ''),
    landingUrl: String(d.landingUrl || ''),
  }));
}

export function getCoupangPartnersConfig(): CoupangPartnersConfig {
  const cfg: any = EnvironmentManager.getInstance().getConfig();
  return {
    accessKey: cfg.coupangAccessKey || process.env['COUPANG_ACCESS_KEY'] || '',
    secretKey: cfg.coupangSecretKey || process.env['COUPANG_SECRET_KEY'] || '',
    subId: cfg.coupangSubId || process.env['COUPANG_SUB_ID'] || '',
  };
}

/**
 * 상품명에서 쿠팡 검색에 유용한 "핵심 키워드" 추출
 * - [/(/{ 등 대괄호 내용 제거
 * - 단위(ml, g, L, kg 등) 제거
 * - 너무 긴 설명은 앞부분 3-4단어만
 */
export function simplifyTitleForCoupangSearch(title: string): string {
  if (!title) return '';
  const cleaned = title
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\{[^}]*\}/g, ' ')
    .replace(/\b\d+\s?(ml|g|kg|L|EA|개|호|매|팩|종|병|박스)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const words = cleaned.split(' ').filter(w => w.length >= 2).slice(0, 4);
  return words.join(' ');
}
