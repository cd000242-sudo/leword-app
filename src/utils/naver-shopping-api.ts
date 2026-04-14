/**
 * 네이버 쇼핑 검색 API — 쇼핑 커넥트 기능용
 *
 * 입력: 키워드
 * 출력: 상품 목록 (상품명/가격/쇼핑몰/이미지/상품URL)
 *
 * 목적: 블로그 판매 글 작성용 상품 정보 수집 → 글 내에 상품 카드로 소개 → 판매 전환
 */

import { EnvironmentManager } from './environment-manager';

export interface ShoppingItem {
  title: string;           // HTML 태그 제거된 상품명
  link: string;            // 네이버 쇼핑 상품 URL
  image: string;           // 상품 이미지 URL
  lprice: number;          // 최저가
  hprice: number;          // 최고가 (0이면 가격 범위 없음)
  mallName: string;        // 쇼핑몰 이름
  productId: string;       // 네이버 상품 ID
  productType: number;     // 1=일반, 2=중고, 3=단종, 4=판매중지
  brand?: string;          // 브랜드
  maker?: string;          // 제조사
  category1?: string;      // 대분류
  category2?: string;      // 중분류
  category3?: string;      // 소분류
  category4?: string;      // 세분류
}

export interface ShoppingSearchResult {
  total: number;
  start: number;
  display: number;
  items: ShoppingItem[];
}

export type ShoppingSort = 'sim' | 'date' | 'asc' | 'dsc';
// sim=정확도, date=날짜, asc=가격↑, dsc=가격↓

function stripTags(s: string): string {
  return (s || '').replace(/<[^>]*>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'");
}

/**
 * 네이버 쇼핑 검색 API 호출
 *
 * @param keyword 검색 키워드
 * @param options  display(1-100), start(1-1000), sort
 */
export async function searchNaverShopping(
  keyword: string,
  options: { display?: number; start?: number; sort?: ShoppingSort } = {}
): Promise<ShoppingSearchResult> {
  const envManager = EnvironmentManager.getInstance();
  const config = envManager.getConfig();

  const clientId = config.naverClientId || process.env['NAVER_CLIENT_ID'] || '';
  const clientSecret = config.naverClientSecret || process.env['NAVER_CLIENT_SECRET'] || '';

  if (!clientId || !clientSecret) {
    throw new Error('네이버 API 키가 설정되지 않았습니다. 환경설정에서 NAVER_CLIENT_ID/SECRET 을 설정해주세요.');
  }

  const display = Math.min(Math.max(options.display ?? 20, 1), 100);
  const start = Math.min(Math.max(options.start ?? 1, 1), 1000);
  const sort = options.sort ?? 'sim';

  const url = `https://openapi.naver.com/v1/search/shop.json?query=${encodeURIComponent(keyword)}&display=${display}&start=${start}&sort=${sort}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'X-Naver-Client-Id': clientId,
      'X-Naver-Client-Secret': clientSecret,
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`네이버 쇼핑 API 오류 (${response.status}): ${body.slice(0, 200)}`);
  }

  const data = (await response.json()) as any;

  const items: ShoppingItem[] = (data.items || []).map((raw: any) => ({
    title: stripTags(raw.title),
    link: raw.link,
    image: raw.image,
    lprice: Number(raw.lprice) || 0,
    hprice: Number(raw.hprice) || 0,
    mallName: raw.mallName || '',
    productId: raw.productId || '',
    productType: Number(raw.productType) || 1,
    brand: raw.brand || undefined,
    maker: raw.maker || undefined,
    category1: raw.category1 || undefined,
    category2: raw.category2 || undefined,
    category3: raw.category3 || undefined,
    category4: raw.category4 || undefined,
  }));

  return {
    total: Number(data.total) || 0,
    start: Number(data.start) || start,
    display: Number(data.display) || display,
    items,
  };
}

/**
 * 블로그 글 작성용 "추천 상품" 선별
 *
 * 전략:
 *  - 일반 상품만 (productType === 1)
 *  - 가격대 분산 (저/중/고)
 *  - 메이저 쇼핑몰 우선
 *  - 가격 범위 중앙값 기준 ±30% 내 항목을 우선
 */
export function pickBlogRecommendedItems(items: ShoppingItem[], limit: number = 10): ShoppingItem[] {
  const normal = items.filter(i => i.productType === 1 && i.lprice > 0);
  if (normal.length === 0) return [];

  // 가격 중앙값
  const sorted = normal.slice().sort((a, b) => a.lprice - b.lprice);
  const median = sorted[Math.floor(sorted.length / 2)].lprice;
  const low = median * 0.7;
  const high = median * 1.3;

  // 우선순위: 중앙값 근처 → 메이저몰 → 가격 오름차순
  const majors = new Set(['네이버', '쿠팡', '11번가', 'G마켓', '옥션', '위메프', '티몬', '인터파크']);

  const scored = normal.map(item => {
    let score = 0;
    if (item.lprice >= low && item.lprice <= high) score += 10;
    if (majors.has(item.mallName)) score += 5;
    if (item.brand) score += 2;
    return { item, score };
  });

  scored.sort((a, b) => b.score - a.score || a.item.lprice - b.item.lprice);

  return scored.slice(0, limit).map(x => x.item);
}
