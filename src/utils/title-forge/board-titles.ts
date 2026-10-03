/**
 * 보드 행 → 제목 배선.
 *
 * 대장간(forge)의 파생 키워드는 새 API 호출이 아니라 **같은 회차에서 이미
 * 실측한 같은 주제 후보들**에서 얻는다. 후기·부작용처럼 여러 대상에 붙는
 * 의도 단어나 넓은 씨앗만 같다는 이유로 다른 상품·제도를 제목에 섞지 않는다.
 * 근거가 없으면 빈 제목과 보류 사유를 반환한다.
 */

import { forgeTitles, type ForgedTitles, type DerivedKeyword } from './forge';
import { classifyTitleFrame, countFrames } from './frame-analysis';

export interface TopicCandidate {
  keyword: string;
  searchVolume: number | null;
  seed?: string | null;
}

export interface BoardTitleRow {
  keyword: string;
  seed?: string | null;
  timing?: string;
}

const MAX_SIBLINGS = 8;

function tokensOf(keyword: string): Set<string> {
  return new Set(
    String(keyword || '')
      .split(/\s+/)
      .filter((token) => token.length >= 2),
  );
}

export function sharesToken(left: string, right: string): boolean {
  const leftTokens = tokensOf(left);
  for (const token of tokensOf(right)) {
    if (leftTokens.has(token)) return true;
  }
  return false;
}

// 검색 의도·범주만 같아서는 동일 대상이라고 볼 수 없다.
const NON_ENTITY_TOKEN = /^(?:후기|리뷰|부작용|효과|효능|가격|비용|방법|신청|조건|대상|기간|일정|서류|추천|순위|비교|차이|금리|한도|대출|지원금|보조금|환급|사업|경제|금융|보험|방석|제품|상품|정리|총정리|사용법|주의사항|청년|소상공인|자영업자|중소기업|정부|지자체|[0-9]+(?:년|월|일)?)$/i;

function entityHead(keyword: string): string | undefined {
  return [...tokensOf(keyword.normalize('NFKC').toLowerCase())]
    .find((token) => !NON_ENTITY_TOKEN.test(token));
}

/** 보수적인 동일 대상 판정. 의도 단어를 뺀 첫 대상명이 일치해야 한다. */
export function sharesTopic(left: string, right: string): boolean {
  const head = entityHead(left);
  return Boolean(head && head === entityHead(right));
}

export const UNSUPPORTED_BOARD_TITLE = /어떤\s*정보가\s*있는지|이게\s*뭔지\s*몰라서|직접\s*(?:써\s*본|써\s*보(?:고|니)|사용해\s*본|먹어\s*본|받아\s*본|해\s*본|신청해\s*본|구매해\s*본|가\s*본)|(?:해|써|먹어|받아|가|이용해|사용해|신청해|구매해)\s*봤(?:어요|습니다|더니|는데|다가|더라고요|다|던)|(?:사용|방문|신청|구매|이용|복용|경험|체험|수령|결제|가입)했(?:어요|습니다|더니|는데|다가|더라고요|다)|(?:해|써|먹어|받아|사용해|이용해)\s*본\s*(?:후기|경험|기록|결과)|내돈내산|제가\s*직접|내가\s*직접/;

export function isBoardTitleSafe(text: string): boolean {
  return Boolean(String(text || '').trim()) && !UNSUPPORTED_BOARD_TITLE.test(text);
}

/** AI 제목도 입력 후보에서 확인된 다른 대상명을 끼워 넣었으면 유지하지 않는다. */
export function isBoardTitleForTopic(keyword: string, text: string, candidates: readonly TopicCandidate[]): boolean {
  if (!isBoardTitleSafe(text) || !text.includes(keyword)) return false;
  const normalizedTitle = text.normalize('NFKC').toLowerCase();
  const normalizedKeyword = keyword.normalize('NFKC').toLowerCase();
  return !candidates.some((candidate) => {
    if (sharesTopic(keyword, candidate.keyword)) return false;
    const foreignHead = entityHead(candidate.keyword);
    return Boolean(foreignHead && !normalizedKeyword.includes(foreignHead) && normalizedTitle.includes(foreignHead));
  });
}

/**
 * 같은 대상 후보 중 같은 씨앗 형제 우선. 자기 자신은 제외, 최대 8개.
 * 검색량 큰 순 — 대장간이 프레임 근거 강도순으로 읽는다.
 */
export function siblingDerivedKeywords(
  rowKeyword: string,
  rowSeed: string | null | undefined,
  topicCandidates: readonly TopicCandidate[],
): DerivedKeyword[] {
  const others = topicCandidates.filter((c) => c.keyword !== rowKeyword && sharesTopic(c.keyword, rowKeyword));
  const sameSeed = rowSeed
    ? others.filter((c) => c.seed && c.seed === rowSeed)
    : [];
  const pool = sameSeed.length > 0
    ? sameSeed
    : others;
  return pool
    .map((c) => ({ keyword: c.keyword, searchVolume: c.searchVolume }))
    .sort((a, b) => (b.searchVolume || 0) - (a.searchVolume || 0))
    .slice(0, MAX_SIBLINGS);
}

/** 보드 행 하나의 SEO/홈판 제목. 실측(형제·SERP·시기)만 재료로 쓴다. */
export function buildBoardTitles(
  row: BoardTitleRow,
  topicCandidates: readonly TopicCandidate[],
  serpTitles: readonly string[],
): ForgedTitles {
  const derived = siblingDerivedKeywords(row.keyword, row.seed, topicCandidates);
  // 메인 검색어 자체의 '후기/비교/방법'도 독자 질문이다. 검색량은 만들지 않는다.
  if (derived.length === 0 && classifyTitleFrame(row.keyword) !== 'generic') {
    derived.push({ keyword: row.keyword, searchVolume: null });
  }
  const titles = forgeTitles({
    keyword: row.keyword,
    derivedKeywords: derived,
    serpTitles,
    timing: row.timing || '',
  });
  if (titles.seo.frame === 'generic') {
    const unavailable = { text: '', frame: 'generic' as const, basis: '제목 제안 보류 — 구체적인 검색 질문과 출처 확인 필요' };
    return { seo: { ...unavailable }, home: { ...unavailable } };
  }

  const evidence = derived.find((item) => classifyTitleFrame(item.keyword) === titles.seo.frame);
  const matched = countFrames(serpTitles).get(titles.seo.frame) || 0;
  const basis = evidence
    ? `검색 질문 '${evidence.keyword}' 기반 초안 · 경쟁 제목 ${serpTitles.length}개 중 동일 유형 ${matched}개 · 본문 사실 확인 필요`
    : `시기 정보 '${row.timing}' 기반 초안 · 공식 일정 확인 필요`;
  titles.seo.basis = basis;
  titles.home.basis = basis;
  if (titles.seo.frame === 'review') {
    // 검색자가 후기를 찾는다는 사실은 작성자가 직접 써 봤다는 증거가 아니다.
    titles.seo.text = `${row.keyword} 경험담을 판단할 기준`.slice(0, 40);
    titles.home.text = `${row.keyword} 누구에게 맞는지 먼저 살펴보세요`.slice(0, 38);
  }
  return titles;
}

/** 누적 보드의 옛 규칙 제목은 재생성하고, 안전한 AI 제목만 유지한다. 외부 호출 없음. */
export function repairBoardTitles(
  row: BoardTitleRow,
  topicCandidates: readonly TopicCandidate[],
  serpTitles: readonly string[],
  existing?: { seo?: { text: string; frame: string; basis: string }; home?: { text: string; frame: string; basis: string } } | null,
): ForgedTitles {
  const repaired = buildBoardTitles(row, topicCandidates, serpTitles);
  for (const lane of ['seo', 'home'] as const) {
    const previous = existing?.[lane];
    // AI frame는 저장 데이터에서만 사용한다. 공개 반환형의 기존 호환성을 유지한다.
    if (previous?.frame === 'ai' && isBoardTitleForTopic(row.keyword, previous.text, topicCandidates)) {
      repaired[lane] = previous as ForgedTitles[typeof lane];
    }
  }
  return repaired;
}
