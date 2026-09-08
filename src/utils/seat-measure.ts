/**
 * 자리 실측기 — 내 PC 브라우저로 연 네이버 검색 결과 두 장(블로그탭·통합검색)을 읽어
 * "이 키워드에 자리가 있나"를 센다. 앱 전용 기능(2026-09-08): 사이트 표는 자리를 안 재고,
 * 선점 회차는 브라이트데이터 예산 안에서만 잰다. 여기는 한도가 내 브라우저뿐이다.
 *
 * 새 판정 규칙을 만들지 않는다. 브라이트데이터 파이프라인이 쓰는 판정기를 그대로 잇는다:
 *   analyzeSerp / verdictFor  (serp-winnability)  — 정면 글·부분 글·낡은 글·열림/반열림/잠김
 *   findOpenSlot              (preemption-gate)   — 몇 번째 자리가 비었나
 *   readSerpStructure         (naver-serp-structure) — 카드 답(날씨·인물정보)·광고 수·AI 브리핑
 *   judgeAnswerCardKeyword    (preemption-supply-guards) — 검색어 모양만으로 카드가 답하는 말
 *
 * 센 것만 적는다. 추정 점수는 없다. 못 읽은 것은 null 이지 0 이 아니다.
 */
import { analyzeSerp, verdictFor, DEFAULT_SERP_THRESHOLDS, type SerpVerdictCode } from './serp-winnability';
import { findOpenSlot } from './preemption-gate';
import { readSerpStructure } from './naver-serp-structure';
import { judgeAnswerCardKeyword } from './preemption-supply-guards';

/** SERP 에 이 구획이 떠 있으면 클릭이 카드로 간다(board-dead-rows 와 같은 목록). */
export const SEAT_ANSWER_CARD_SECTIONS: ReadonlyArray<string> = ['날씨', '인물정보'];

export type SeatVerdict = '열림' | '반열림' | '잠김' | '카드답' | '자료없음';

export interface SeatMeasurement {
  keyword: string;
  measuredAt: string;
  /** 상위 10개 중 제목이 검색어를 정면으로 담은 글 수 */
  facing: number;
  /** 제목이 검색어를 절반 이상 담은 글 수(정면 제외) */
  partial: number;
  /** 제목을 읽은 글 수 — 3개 미만이면 판정 보류 */
  sampled: number;
  /** 상위 글 날짜의 중앙값(일). 못 읽으면 null */
  staleDays: number | null;
  /** 몇 번째 자리가 비었나(1부터). 다 찼거나 못 세면 null */
  vacancy: number | null;
  /** 통합검색에 뜬 답 카드 구획(날씨·인물정보). 통합검색을 못 읽었으면 null */
  cards: string[] | null;
  /** 통합검색 노출 광고 수. 못 읽었으면 null */
  ads: number | null;
  /** AI 브리핑이 떠 있나. 못 읽었으면 null */
  aiBriefing: boolean | null;
  /** 통합검색을 읽었나 — false 면 카드·광고·AI 는 '안 본 것'이다 */
  structureRead: boolean;
  verdict: SeatVerdict;
  /** 브라이트데이터 판정 코드 그대로 — 사이트·보드와 대조용 */
  verdictCode: SerpVerdictCode;
  reason: string;
  topTitles: string[];
}

export interface SeatMeasureInput {
  keyword: string;
  /** 블로그탭 HTML — 제목·날짜 실측 */
  blogTabHtml: string;
  /** 통합검색 HTML — 카드·광고·AI 브리핑. 없으면 그 칸은 null */
  allTabHtml?: string | null;
  nowMs?: number;
}

function toSeatVerdict(code: SerpVerdictCode): SeatVerdict {
  if (code === 'WINNABLE') return '열림';
  if (code === 'CONTESTED') return '반열림';
  if (code === 'LOCKED') return '잠김';
  return '자료없음';
}

/**
 * 두 장의 HTML 을 여섯 숫자와 판정 하나로 줄인다.
 * 카드가 떠 있거나 검색어 모양이 카드 답이면 판정은 '카드답'이다 — 자리가 있어도 클릭이 안 온다.
 */
export function measureSeat(input: SeatMeasureInput): SeatMeasurement {
  const keyword = String(input.keyword || '').trim();
  const nowMs = input.nowMs ?? Date.now();
  const analysis = analyzeSerp(String(input.blogTabHtml || ''), keyword, { nowMs });
  const verdict = verdictFor(analysis, DEFAULT_SERP_THRESHOLDS);
  const vacancy = analysis.sampledTitles > 0 ? findOpenSlot(analysis, keyword) : null;

  const structure = input.allTabHtml ? readSerpStructure(input.allTabHtml) : null;
  const cards = structure ? structure.sections.filter((label) => SEAT_ANSWER_CARD_SECTIONS.includes(label)) : null;
  const byShape = judgeAnswerCardKeyword(keyword);

  const reasons: string[] = [];
  let seatVerdict = toSeatVerdict(verdict.verdict);
  if (cards && cards.length > 0) {
    seatVerdict = '카드답';
    reasons.push(`통합검색에 ${cards.join('·')} 카드가 떠 있다 — 클릭이 카드로 간다`);
  } else if (byShape.answerCard) {
    seatVerdict = '카드답';
    reasons.push(byShape.reason);
  }
  reasons.push(verdict.reason);
  if (analysis.medianDaysAgo !== null && analysis.medianDaysAgo >= 365) {
    reasons.push(`상위 글 날짜 중앙값 ${Math.round(analysis.medianDaysAgo / 30)}개월 전 — 낡은 판`);
  }
  if (vacancy !== null) reasons.push(`${vacancy}위 자리가 비어 있다`);
  if (structure) {
    if (structure.adCount > 0) reasons.push(`광고 ${structure.adCount}개`);
    if (structure.hasAiBriefing) reasons.push('AI 브리핑이 떠 있다 — 클릭 일부를 AI 가 가져간다');
  } else if (input.allTabHtml) {
    reasons.push('통합검색 화면을 못 읽었다(차단 또는 빈 응답) — 카드·광고는 안 본 것');
  }

  return {
    keyword,
    measuredAt: new Date(nowMs).toISOString(),
    facing: analysis.exactTitleHits,
    partial: analysis.partialTitleHits,
    sampled: analysis.sampledTitles,
    staleDays: analysis.medianDaysAgo,
    vacancy,
    cards,
    ads: structure ? structure.adCount : null,
    aiBriefing: structure ? structure.hasAiBriefing : null,
    structureRead: !!structure,
    verdict: seatVerdict,
    verdictCode: verdict.verdict,
    reason: reasons.join(' · '),
    topTitles: analysis.topTitles,
  };
}

/** 브라이트데이터 단계와 같은 주소 — 블로그탭(제목·날짜). */
export function seatBlogTabUrl(keyword: string): string {
  return `https://search.naver.com/search.naver?ssc=tab.blog.all&sm=tab_jum&query=${encodeURIComponent(keyword)}`;
}

/** 브라이트데이터 단계와 같은 주소 — 통합검색(카드·광고·AI 브리핑). */
export function seatAllTabUrl(keyword: string): string {
  return `https://search.naver.com/search.naver?query=${encodeURIComponent(keyword)}`;
}

/** 붙여넣은 글을 키워드 목록으로 — 줄·쉼표 구분, 중복·빈 줄 제거, 최대 max 개. */
export function parseSeatKeywords(text: string, max = 100): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of String(text || '').split(/[\n,]/)) {
    const keyword = raw.replace(/\s+/g, ' ').trim();
    if (keyword.length < 2 || keyword.length > 40) continue;
    const key = keyword.replace(/\s+/g, '');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(keyword);
    if (out.length >= max) break;
  }
  return out;
}
