/**
 * 승격 큐 — 직전 발행 보드의 실측 풀을 다음 회차 씨앗으로 되먹인다 (폐순환).
 *
 * 왜: 2026-08-18 회차가 후보 55건 → 21행으로 끝났다. 병목은 게이트가 아니라
 * 공급이었다 — 씨앗 풀에서 이길 수 있는 게 그만큼뿐이었다. 그런데 보강 단계가
 * 이미 행마다 연관 키워드 12개(검색량 실측, 일부 문서수까지)를 재 놓는다.
 * 승자의 인접 지대는 저경쟁일 확률이 높다 — 그 실측 자산을 버리지 않고
 * 다음 회차의 후보로 승격한다. 회차가 돌수록 공급이 복리로 는다.
 *
 * 여기는 **추출만** 한다(순수 함수). 검증(문서수·비율·무료선별·수요 유형)은
 * 발굴 스크립트가 기존 후보와 똑같은 게이트로 한다 — 승격이라고 봐주지 않는다.
 */

export interface PromotableSeed {
  keyword: string;
  searchVolume: number | null;   // 보드에 실린 실측값 (없으면 재조회 필요)
  documentCount: number | null;  // 있으면 재조회 없이 게이트 선적용 가능
  topic: string;                 // 부모 행의 주제를 상속
  fromKeyword: string;           // 어느 승자의 인접 지대인지 (추적용)
  origin: 'pool' | 'sub';
}

function compact(s: string): string {
  return String(s || '').replace(/\s+/g, '').toLowerCase();
}

/** 씨앗으로 쓸 수 없는 문자열을 거른다 — 조각·URL·과대 길이 */
function isUsableKeyword(keyword: string): boolean {
  const t = String(keyword || '').trim();
  if (t.length < 2 || t.length > 25) return false;
  if (/https?:|www\.|[<>{}[\]]/.test(t)) return false;
  if (!/[가-힣a-zA-Z]/.test(t)) return false;
  return true;
}

/**
 * 발행 보드 JSON → 승격 후보 목록.
 * - 보드에 이미 행으로 실린 키워드는 제외(자기 자신과 경쟁하지 않는다)
 * - 같은 키워드가 여러 행의 풀에 나오면 한 번만 (첫 등장 우선)
 */
export function extractPromotableSeeds(board: {
  rows?: Array<{
    keyword?: string;
    topic?: string;
    keywordPool?: Array<{ keyword?: string; searchVolume?: number; documentCount?: number }>;
    subKeywords?: Array<{ keyword?: string; searchVolume?: number }>;
  }>;
}): PromotableSeed[] {
  const rows = Array.isArray(board?.rows) ? board.rows : [];
  const boardKeywords = new Set(rows.map((r) => compact(r.keyword || '')).filter(Boolean));
  const seen = new Set<string>();
  const out: PromotableSeed[] = [];

  for (const row of rows) {
    const topic = String(row.topic || '').trim();
    const fromKeyword = String(row.keyword || '').trim();
    if (!topic || !fromKeyword) continue;

    const entries: Array<{ keyword?: string; searchVolume?: number; documentCount?: number; origin: 'pool' | 'sub' }> = [
      ...(Array.isArray(row.keywordPool) ? row.keywordPool.map((p) => ({ ...p, origin: 'pool' as const })) : []),
      ...(Array.isArray(row.subKeywords) ? row.subKeywords.map((s) => ({ ...s, origin: 'sub' as const })) : []),
    ];

    for (const entry of entries) {
      const keyword = String(entry.keyword || '').trim();
      if (!isUsableKeyword(keyword)) continue;
      const key = compact(keyword);
      if (boardKeywords.has(key) || seen.has(key)) continue;
      seen.add(key);
      const sv = Number(entry.searchVolume);
      const dc = Number(entry.documentCount);
      out.push({
        keyword,
        searchVolume: Number.isFinite(sv) && sv > 0 ? sv : null,
        documentCount: Number.isFinite(dc) && dc > 0 ? dc : null,
        topic,
        fromKeyword,
        origin: entry.origin,
      });
    }
  }
  return out;
}
