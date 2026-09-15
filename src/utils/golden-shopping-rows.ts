/**
 * 쇼핑 쪽으로 넘긴 말을 황금키워드 발굴 화면에 따로 보인다 (2026-09-15, 사장님 "쇼핑으로 넘긴 말도 앱에 따로 보이기").
 *
 * 자리 재기에서 검색 화면이 상품판인 말은 쇼핑 레인으로 넘긴다(platform-lane, 2026-08-17 — 쇼핑 = 커넥트 소관).
 * 황금 판 규칙은 그대로 두고, 넘긴 말을 조용히 버리지 않고 따로 모아 보인다.
 * 실측(2026-09-15 인테리어·DIY 두 번째 실측): 후보 120건 중 72건이 쇼핑 쪽으로 넘어갔고, 늘어난 실용 후보 6개 중 5개가 여기 있었다.
 *
 * 출처는 둘이다.
 *   · 사이트 판 routedShopping — 발행 스크립트가 검색량 · 이유만 싣는다(문서량 없음). 잰 시각은 판의 발행 시각.
 *   · 이 PC 판 — 앱이 회차마다 자리 재기 결과(board.json)의 routedShopping 을 90일 쌓는다(문서량 있음).
 * 같은 말은 한 번만, 더 최근에 잰 쪽. 황금 판에 이미 실린 말은 뺀다.
 */
import { siteTopicInCategory } from './golden-site-merge';

export type ShoppingLaneSource = 'site-board' | 'app-board';

export interface ShoppingLaneEntry {
  topic: string;
  keyword: string;
  searchVolume: number | null;
  documentCount: number | null;
  reasons: string[];
  measuredAt: string | null;
}

export interface ShoppingLaneRow extends ShoppingLaneEntry {
  from: ShoppingLaneSource;
}

export interface ShoppingSource {
  from: ShoppingLaneSource;
  entries: readonly ShoppingLaneEntry[];
}

/** 이 PC 에 쌓아 두는 기간 — 발행 스크립트의 판 이월(carryDays 90)과 같다. */
export const SHOPPING_CARRY_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

const compactKey = (value: unknown): string => String(value || '').replace(/\s+/g, '').toLowerCase();
const finiteOrNull = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);

function measuredMs(entry: { measuredAt: string | null }): number {
  const at = entry.measuredAt ? Date.parse(entry.measuredAt) : Number.NaN;
  return Number.isFinite(at) ? at : Number.NEGATIVE_INFINITY;
}

/** 판의 routedShopping 을 한 모양으로. 검색어가 비면 뺀다. 못 잰 칸은 null 로 둔다(0 으로 채우지 않는다). */
export function normalizeShoppingEntries(list: unknown, measuredAt: string | null): ShoppingLaneEntry[] {
  if (!Array.isArray(list)) return [];
  return list.flatMap((item) => {
    const keyword = String((item && item.keyword) || '').trim();
    if (!keyword) return [];
    const reasons = Array.isArray(item.reasons)
      ? item.reasons.map((reason: unknown) => String(reason || '').trim()).filter(Boolean)
      : [];
    const ownMeasuredAt = typeof item.measuredAt === 'string' && Number.isFinite(Date.parse(item.measuredAt)) ? item.measuredAt : null;
    return [{
      topic: String(item.topic || ''),
      keyword,
      searchVolume: finiteOrNull(item.searchVolume),
      documentCount: finiteOrNull(item.documentCount),
      reasons,
      measuredAt: ownMeasuredAt || measuredAt,
    }];
  });
}

/** 이 PC 에 쌓아 둔 목록에 이번 회차를 합친다 — 같은 말은 더 최근에 잰 쪽, 90일 넘은 말과 잰 시각이 없는 말은 뺀다. */
export function mergeShoppingStore(
  previous: readonly ShoppingLaneEntry[],
  incoming: readonly ShoppingLaneEntry[],
  nowMs: number,
  carryDays: number = SHOPPING_CARRY_DAYS,
): ShoppingLaneEntry[] {
  const byKey = new Map<string, ShoppingLaneEntry>();
  for (const entry of [...previous, ...incoming]) {
    const key = compactKey(entry.keyword);
    if (!key) continue;
    const kept = byKey.get(key);
    if (!kept || measuredMs(entry) >= measuredMs(kept)) byKey.set(key, entry);
  }
  const oldest = nowMs - carryDays * DAY_MS;
  return [...byKey.values()].filter((entry) => {
    const at = measuredMs(entry);
    return Number.isFinite(at) && at >= oldest;
  });
}

/**
 * 발굴 화면에 줄 쇼핑 쪽 목록 — 고른 카테고리의 주제만, 황금 판에 이미 실린 말은 빼고, 같은 말은 더 최근에 잰 쪽 한 번.
 * 잰 시각이 같으면 앞 출처를 남긴다(이 PC 판을 앞에 두면 문서량 있는 줄이 남는다). 검색량 큰 순, 못 잰 것은 뒤.
 */
export function buildShoppingLaneRows(
  sources: readonly ShoppingSource[],
  category: string | null | undefined,
  excludeKeywords: Iterable<string> = [],
): ShoppingLaneRow[] {
  const excluded = new Set([...excludeKeywords].map(compactKey));
  const byKey = new Map<string, ShoppingLaneRow>();
  for (const source of sources) {
    for (const entry of source.entries) {
      if (!siteTopicInCategory(entry.topic, category)) continue;
      const key = compactKey(entry.keyword);
      if (!key || excluded.has(key)) continue;
      const kept = byKey.get(key);
      if (!kept || measuredMs(entry) > measuredMs(kept)) byKey.set(key, { ...entry, from: source.from });
    }
  }
  return [...byKey.values()].sort((a, b) => (b.searchVolume ?? -1) - (a.searchVolume ?? -1));
}
