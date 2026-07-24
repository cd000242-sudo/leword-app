/**
 * 쿠팡 핫상품 시드 수집기 — 골드박스(오늘의 특가) + 베스트 카테고리
 *
 * 목적: 쇼핑커넥트의 시드 풀에 "쿠팡에서 지금 실제로 팔리는 상품" 신호를 공급한다.
 *   - 골드박스 상품은 이미 쿠팡에 존재 → 딥링크 매칭 성공률·수익화 직결.
 *   - 공식 파트너스 OpenAPI 사용(스크래핑 아님) — 차단 이슈 없음.
 *   - 키 미설정/호출 실패 시 빈 배열 fail-soft: 기능 자동 비활성, 결과를 깎지 않음.
 */

import {
  type CoupangHotProduct,
  fetchCoupangBestCategory,
  fetchCoupangGoldbox,
  getCoupangPartnersConfig,
  simplifyTitleForCoupangSearch,
} from '../coupang-partners';

export interface CoupangHotSeed {
  keyword: string;
  reason: string;
  productName: string;
  productPrice: number;
  productUrl: string;
  source: 'coupang-goldbox' | 'coupang-best';
}

// 블로그/쇼츠 소재성이 높은 베스트 카테고리 (쿠팡 파트너스 카테고리 ID)
const BEST_CATEGORY_IDS: ReadonlyArray<{ id: string; label: string }> = [
  { id: '1012', label: '가전디지털' },
  { id: '1010', label: '뷰티' },
  { id: '1015', label: '생활용품' },
];

const SEED_CACHE_TTL_MS = 60 * 60 * 1000;
let seedCache: { atMs: number; seeds: CoupangHotSeed[] } | null = null;

function toSeed(product: CoupangHotProduct, reason: string, source: CoupangHotSeed['source']): CoupangHotSeed | null {
  const keyword = simplifyTitleForCoupangSearch(product.productName);
  if (!keyword || keyword.length < 2 || keyword.length > 35) return null;
  return {
    keyword,
    reason,
    productName: product.productName,
    productPrice: product.productPrice,
    productUrl: product.productUrl,
    source,
  };
}

/**
 * 쿠팡 핫상품 → 쇼핑 시드. 키 없으면 [].
 */
export async function getCoupangHotProductSeeds(limit: number = 30): Promise<CoupangHotSeed[]> {
  const nowMs = Date.now();
  if (seedCache && nowMs - seedCache.atMs < SEED_CACHE_TTL_MS) {
    return seedCache.seeds.slice(0, limit);
  }
  const config = getCoupangPartnersConfig();
  if (!config.accessKey || !config.secretKey) return [];

  const seeds: CoupangHotSeed[] = [];
  const seen = new Set<string>();
  const push = (seed: CoupangHotSeed | null) => {
    if (!seed) return;
    const key = seed.keyword.replace(/\s+/g, '').toLowerCase();
    if (!key || seen.has(key)) return;
    seen.add(key);
    seeds.push(seed);
  };

  const [goldbox, ...bests] = await Promise.allSettled([
    fetchCoupangGoldbox(config, { limit: 40 }),
    ...BEST_CATEGORY_IDS.map((category) => fetchCoupangBestCategory(category.id, config, { limit: 20 })),
  ]);

  if (goldbox.status === 'fulfilled') {
    for (const product of goldbox.value) {
      push(toSeed(product, `쿠팡 골드박스 오늘의 특가 ${product.rank}위`, 'coupang-goldbox'));
    }
  } else {
    console.warn('[COUPANG-HOT] goldbox 실패:', (goldbox.reason as Error)?.message);
  }
  bests.forEach((row, index) => {
    const label = BEST_CATEGORY_IDS[index]?.label || '카테고리';
    if (row.status === 'fulfilled') {
      for (const product of row.value) {
        push(toSeed(product, `쿠팡 ${label} 베스트 ${product.rank}위`, 'coupang-best'));
      }
    } else {
      console.warn(`[COUPANG-HOT] best(${label}) 실패:`, (row.reason as Error)?.message);
    }
  });

  seedCache = { atMs: nowMs, seeds };
  if (seeds.length > 0) {
    console.log(`[COUPANG-HOT] 핫상품 시드 ${seeds.length}개 (골드박스+베스트${BEST_CATEGORY_IDS.length}종)`);
  }
  return seeds.slice(0, limit);
}
