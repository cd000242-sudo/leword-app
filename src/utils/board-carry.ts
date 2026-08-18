/**
 * 보드 누적(이월) 병합 — "회차가 돌 때마다 쌓인다" (목표 2,000키워드+, 2026-08-18 사장님 지시)
 *
 * 왜: 발행이 매 회차 보드를 **대체**해서, 아무리 돌려도 한 회차 최대치가 천장이었다.
 * BD 무료 한도상 회당 통과는 ~200행이라, 2,000 은 누적으로만 도달한다.
 *
 * 규칙:
 *  - 신규 행이 항상 이긴다(측정이 더 최신). 다만 같은 키워드의 직전 발행본에 있던
 *    AI 보강 자산(서브·제목·풀·수익판정·트렌드)은 신규 행에 접붙인다 — 재보강
 *    AI 콜을 아끼고, 보강 전에 화면이 비는 시간도 없앤다.
 *  - 신규에 없는 기존 행은 이월한다. 단 측정이 carryDays 를 넘긴 것은 만료 —
 *    선점 보드에서 낡은 실측은 거짓말이 되기 때문이다. 화면은 measuredAt 로
 *    "언제 잰 값인지"를 이미 보여준다.
 */

export interface CarryOptions {
  carryDays: number;
  nowMs: number;
}

export interface CarryResult {
  rows: any[];
  fresh: number;    // 이번 회차 신규
  carried: number;  // 이월된 기존 행
  expired: number;  // 낡아서 만료된 기존 행
  grafted: number;  // 보강 자산을 접붙인 신규 행
}

const ENRICHMENT_FIELDS = ['subKeywords', 'titles', 'keywordPool', 'monetize', 'trend', 'enrichedAt'] as const;

function compactKey(keyword: unknown): string {
  return String(keyword || '').replace(/\s+/g, '').toLowerCase();
}

export function mergeCarryRows(
  newRows: any[],
  prevPayload: { publishedAt?: string; rows?: any[] } | null | undefined,
  options: CarryOptions
): CarryResult {
  const prevRows = Array.isArray(prevPayload?.rows) ? prevPayload!.rows! : [];
  const anchorMs = Date.parse(String(prevPayload?.publishedAt || '')) || options.nowMs;
  const carryMs = options.carryDays * 86_400_000;

  const prevByKey = new Map<string, any>();
  for (const row of prevRows) {
    const key = compactKey(row?.keyword);
    if (key && !prevByKey.has(key)) prevByKey.set(key, row);
  }

  let grafted = 0;
  const newKeys = new Set<string>();
  const freshRows = (Array.isArray(newRows) ? newRows : []).map((row) => {
    const key = compactKey(row?.keyword);
    if (key) newKeys.add(key);
    const prev = key ? prevByKey.get(key) : undefined;
    if (!prev) return row;
    const graft: Record<string, unknown> = {};
    for (const field of ENRICHMENT_FIELDS) {
      const hasNew = row[field] !== undefined && row[field] !== null
        && !(Array.isArray(row[field]) && row[field].length === 0);
      if (!hasNew && prev[field] !== undefined && prev[field] !== null) graft[field] = prev[field];
    }
    if (Object.keys(graft).length === 0) return row;
    grafted += 1;
    return { ...row, ...graft };
  });

  let expired = 0;
  const carriedRows: any[] = [];
  for (const row of prevRows) {
    const key = compactKey(row?.keyword);
    if (!key || newKeys.has(key)) continue;
    const measuredMs = Date.parse(String(row?.measuredAt || '')) || anchorMs;
    if (options.nowMs - measuredMs > carryMs) {
      expired += 1;
      continue;
    }
    carriedRows.push(row.carried === true ? row : { ...row, carried: true });
  }

  return {
    rows: [...freshRows, ...carriedRows],
    fresh: freshRows.length,
    carried: carriedRows.length,
    expired,
    grafted,
  };
}
