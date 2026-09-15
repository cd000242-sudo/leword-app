/**
 * 브리핑 키워드 "검색량 이유" 추론기 (서버, 발행 시점 배치).
 *
 * 2026-09-16 사장님 결정("서버 키 경로를 코드에서 제거" · "Manus 도 지우기"): 서버는 API 키로 AI 를 부르지 않는다.
 * 예전에는 발행 때 서버 환경변수의 Claude(ANTHROPIC_API_KEY) → Manus(MANUS_API_KEY)를 유료로 불렀다.
 * 이제 키가 들어 있어도 아무 곳도 부르지 않는다. 이유 없이 저장된 행은 브라우저의 agentInferredSearchReason 이
 * 사전 · 규칙으로 채운다(발행 흐름 · 저장 형식은 그대로).
 *
 * 결정론적 스코어링(검색량·문서수·기회지수·등급)은 건드리지 않는다.
 */

export interface BriefingReasonRow {
  keyword: string;
  searchVolume?: number;
  documentCount?: number;
}

export interface BriefingReasonResult {
  /** keyword -> 추론된 검색 이유 문장. 서버 AI 를 쓰지 않으므로 늘 비어 있다. */
  reasons: Record<string, string>;
  /** 'ok'(추론할 행 없음) · 'disabled'(서버 AI 를 쓰지 않음). 나머지는 호출부 로그 호환용 옛 값이다. */
  status: 'ok' | 'partial' | 'no-key' | 'no-credit' | 'error' | 'timeout' | 'disabled';
  detail?: string;
}

/** 절대 throw 하지 않는다 — 발행을 막으면 안 되기 때문. */
export async function inferBriefingSearchReasons(rows: BriefingReasonRow[]): Promise<BriefingReasonResult> {
  const clean = rows.filter((r) => r && typeof r.keyword === 'string' && r.keyword.trim());
  if (!clean.length) return { reasons: {}, status: 'ok' };
  return { reasons: {}, status: 'disabled' };
}
