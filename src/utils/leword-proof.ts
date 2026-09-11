/**
 * "그걸 꾸준히 쓰면 성과가 나는거야?" 에 답할 숫자(2026-09-11).
 *
 * 지금은 답할 근거가 없다. 노출 추적에 319건이 쌓여 있는데 실측해 보니 쓸 수 없었다:
 *   category — auto-extracted 307 · naver-home 1 · (없음) 11
 *   '첫 페이지에 든 적 있음' 59건 중 12건의 검색량을 검색광고에 물었더니 **12/12 전부 "모름"**.
 *   1위 목록이 "왕복 벗고 이등병" · "빚더미 고백 돌연" 처럼 제목을 잘라 만든 조각이었다.
 *   아무도 안 치는 말에서 1위 하는 건 쉽다. 그건 성과가 아니다.
 *
 * 그래서 **LEWORD 가 고른 것만** 따로 세고, 고를 때 잰 값(검색량·경쟁 글·자리·정면)을 같이 남긴다.
 * 쌓이면 "정면 N개 이하 · 경쟁 글 M개 이하에서는 올라갔다" 는 경계가 이 블로그 실측으로 나온다.
 *
 * 정직 규칙 셋 — 여기서 지어내는 값은 하나도 없다.
 *   ① 아직 한 번도 순위를 안 잰 것은 **분모에서 뺀다**(안 잰 것을 진 것으로 만들지 않는다).
 *   ② 표본이 MIN_FOR_RATE 미만이면 **비율을 말하지 않는다**(3건 중 1건을 33%라 적으면 거짓이다).
 *   ③ 못 잰 값(null)은 경계 계산에 안 쓴다.
 */

/** LEWORD 가 고른 것에만 붙는 표시. 이게 없는 줄은 증명에서 뺀다. */
export const LEWORD_PICK_CATEGORY = 'leword-pick';

/** 비율을 말하기 시작하는 최소 표본. 이보다 적으면 숫자만 주고 비율은 null 이다. */
export const MIN_FOR_RATE = 5;

/** 첫 페이지 = 블로그탭 10위 안. envelope.ts 의 WON_RANK 와 같은 뜻이다. */
export const WON_RANK = 10;

export interface PickFacts {
  /** 어느 판이 내놓았나. */
  source: string;
  searchVolume: number | null;
  documentCount: number | null;
  /** 고를 때 잰 자리 판정(열림·반열림 등). */
  seat: string | null;
  /** 그때 정면으로 다룬 글 수. */
  facing: number | null;
  measuredAt: string;
}

export interface TrackedLike {
  keyword: string;
  category?: string;
  registeredAt: string;
  history?: Array<{ checkedAt?: string; rank?: number | null }>;
  /** LEWORD 가 고를 때 잰 값. 옛 기록에는 없다. */
  pick?: PickFacts;
}

export interface ProofRow {
  keyword: string;
  source: string;
  /** 도달한 가장 좋은 순위. 상위 목록에서 못 찾았으면 null — 그래도 '잰 것'이다. */
  bestRank: number | null;
  /** 한 번이라도 순위를 확인했나. null 순위도 확인한 것이다(진 것이지 안 잰 것이 아니다). */
  checked: boolean;
  won: boolean;
  searchVolume: number | null;
  documentCount: number | null;
  seat: string | null;
  facing: number | null;
}

export interface ProofSummary {
  /** LEWORD 가 고른 것 중 추적에 들어간 수. */
  tracked: number;
  /** 표시가 없어 뺀 옛 기록 수. */
  excluded: number;
  /** 그중 순위를 한 번이라도 잰 수 = 비율의 분모. */
  measured: number;
  /** 아직 한 번도 안 잰 수. */
  pending: number;
  /** 첫 페이지(10위 안)에 든 수. */
  won: number;
  /** won / measured. 표본이 적거나 잰 것이 없으면 null — 지어내지 않는다. */
  rate: number | null;
  /** 올라간 것 중 가장 큰 경쟁 글 수. 못 잰 값은 안 쓴다. */
  wonMaxDocumentCount: number | null;
  /** 안 올라간 것 중 가장 작은 경쟁 글 수. 이 둘 사이가 이 블로그의 경계다. */
  lostMinDocumentCount: number | null;
  rows: ProofRow[];
  note: string | null;
}

const num = (v: unknown): number | null => (typeof v === 'number' && isFinite(v) ? v : null);

/** 한 줄이 도달한 가장 좋은 순위. 한 번 올라갔다 밀린 것도 올라간 것이다. */
function bestRankOf(row: TrackedLike): number | null {
  const ranks = (row.history || [])
    .map((h) => num(h?.rank))
    .filter((r): r is number => r !== null && r > 0);
  return ranks.length > 0 ? Math.min(...ranks) : null;
}

export function summarizeProof(rows: readonly TrackedLike[]): ProofSummary {
  const mine: TrackedLike[] = [];
  let excluded = 0;
  for (const row of rows) {
    if (row && row.category === LEWORD_PICK_CATEGORY) mine.push(row);
    else excluded += 1;
  }

  const out: ProofRow[] = mine.map((row) => {
    const best = bestRankOf(row);
    const facts = row.pick;
    return {
      keyword: row.keyword,
      source: (facts && facts.source) || '',
      bestRank: best,
      // 확인 기록이 한 줄이라도 있으면 잰 것이다. 순위가 null 인 건 '상위 목록에 없었다'는 결과다 —
      // 그걸 분모에서 빼면 승률이 부풀고, 봉투 분모에서 겪은 것과 같은 거짓이 된다.
      checked: (row.history || []).length > 0,
      won: best !== null && best <= WON_RANK,
      searchVolume: facts ? num(facts.searchVolume) : null,
      documentCount: facts ? num(facts.documentCount) : null,
      seat: (facts && facts.seat) || null,
      facing: facts ? num(facts.facing) : null,
    };
  });

  const measuredRows = out.filter((r) => r.checked);
  const wonRows = measuredRows.filter((r) => r.won);
  const lostRows = measuredRows.filter((r) => !r.won);

  const wonDocs = wonRows.map((r) => r.documentCount).filter((v): v is number => v !== null);
  const lostDocs = lostRows.map((r) => r.documentCount).filter((v): v is number => v !== null);

  // 비율은 표본이 쌓인 뒤에만. 적을 때는 숫자만 주고 왜 비율이 없는지 적는다.
  const enough = measuredRows.length >= MIN_FOR_RATE;
  const rate = enough ? wonRows.length / measuredRows.length : null;
  const note = enough
    ? null
    : (measuredRows.length === 0
      ? '아직 순위를 잰 것이 없습니다. 7일 뒤부터 채워집니다.'
      : `아직 ${measuredRows.length}건이라 비율은 말하지 않습니다(${MIN_FOR_RATE}건부터).`);

  return {
    tracked: mine.length,
    excluded,
    measured: measuredRows.length,
    pending: out.length - measuredRows.length,
    won: wonRows.length,
    rate,
    wonMaxDocumentCount: wonDocs.length > 0 ? Math.max(...wonDocs) : null,
    lostMinDocumentCount: lostDocs.length > 0 ? Math.min(...lostDocs) : null,
    rows: out,
    note,
  };
}
