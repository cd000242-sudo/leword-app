/**
 * 발행 직전 죽은 행 판정 — 검색량÷문서수 등급은 의도를 볼 수 없다.
 *
 * 2026-09-08 실측: 발행 보드 122행 중 30행이 카드로 답이 나오는 검색어였다
 * ('xx cc 날씨' 24행 · '송강 프로필' · 'etl 기업 주가'). 초황금 등급은 goldenIndex(검색량÷
 * 문서수)만으로 나오므로(정본 grade.ts) 숫자로는 못 막는다. 보강 AI 는 이미
 * "만족 조건이 전부 '한 줄 사실'"이라 bad 를 냈지만 카드 깊숙이 표시만 됐다.
 * 그래서 발행에서 뺀다 — 이월 행에도 걸리므로 다음 회차에 보드가 청소된다.
 * 원장(board.json 아티팩트)에는 사유와 함께 남는다. 조용히 지우지 않는다.
 *
 * 세 근거를 다 보고 전부 문장으로 남긴다:
 *   ① 말 모양(judgeAnswerCardKeyword)          — 무료, 후보 단계에서도 같은 판정
 *   ② SERP 실측 구획에 날씨·인물정보 카드       — naver-serp-structure 가 페이지에서 읽은 것
 *   ③ 보강 AI 수익 판정 bad                     — 판정문 첫 줄을 근거로
 * mixed·미판정은 살린다 — 모르는 것을 나쁜 것으로 적지 않는다.
 */
import { judgeAnswerCardKeyword } from './preemption-supply-guards';

export interface DeadRowInput {
  keyword?: string | null;
  serpSections?: readonly string[] | null;
  monetize?: { verdict?: string | null; points?: ReadonlyArray<{ text?: string }> | null } | null;
}

export interface DeadRowVerdict {
  dead: boolean;
  reason: string;
}

/** SERP 에 이 구획이 떠 있으면 클릭이 카드로 간다. 구획 라벨은 naver-serp-structure 것이다. */
const ANSWER_CARD_SECTIONS: ReadonlyArray<string> = ['날씨', '인물정보'];

export function judgeDeadRow(row: DeadRowInput): DeadRowVerdict {
  const reasons: string[] = [];

  const byShape = judgeAnswerCardKeyword(String(row.keyword || ''));
  if (byShape.answerCard) reasons.push(byShape.reason);

  const sections = Array.isArray(row.serpSections) ? row.serpSections : [];
  const card = ANSWER_CARD_SECTIONS.find((label) => sections.includes(label));
  if (card) reasons.push(`실측 SERP 에 ${card} 카드가 떠 있다 — 클릭이 카드로 간다`);
  /*
   * 사이트를 찾아가는 검색어(2026-09-09 보드 감사): 광고(파워링크)를 뺀 첫 구획이 '웹사이트'면 네이버가 그 검색을
   * 특정 사이트로 보내는 것이다 — '셀레나 이러닝'·'라이어게임 사이트'·'ok저축은행 개인신용대출'·'모노키즈 에이전시'.
   * 문서수가 적어 황금비는 높지만 블로그 글이 낄 자리가 아니다. 실측 구획 순서로만 판정한다(추측 없음).
   */
  const firstNonAd = sections.find((label) => label !== '파워링크');
  if (firstNonAd === '웹사이트') reasons.push('첫 구획이 웹사이트 — 사이트를 찾아가는 검색어(블로그 자리 아님)');

  if (row.monetize && row.monetize.verdict === 'bad') {
    const first = row.monetize.points && row.monetize.points[0] && row.monetize.points[0].text;
    reasons.push(`수익 판정 bad — ${String(first || '광고 수익이 안 나온다').slice(0, 80)}`);
  }

  return { dead: reasons.length > 0, reason: reasons.join(' · ') };
}
