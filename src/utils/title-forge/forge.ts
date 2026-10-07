/**
 * 제목 대장간 — 키워드(앞자리) + 실측 파생 + 1페이지에 없는 프레임으로
 * SEO/홈판 제목 2종을 만든다. 규칙만으로 돈다(CI 에 LLM 이 없다).
 *
 * 낚시 가드가 뼈대다: 프레임은 반드시 파생 키워드 실측이나 시기 실측에서
 * 근거를 얻은 것만 쓴다. 근거 없는 각도로 뽑은 제목은 본문이 약속을 못 지키고,
 * 그 대가는 체류시간 붕괴로 돌아온다.
 *
 * 길이 규격은 llm-title-writer 와 같다 — SEO 40자 · 홈판 38자 상한.
 */

import { buildPurchaseDesireAngles } from '../shopping-purchase-angle';
import { classifyTitleFrame, findEmptyFrames, countFrames, type TitleFrame } from './frame-analysis';
import { displayKeyword } from './issue';

export interface DerivedKeyword {
  keyword: string;
  searchVolume: number | null;
}

export interface TitleForgeInput {
  keyword: string;
  /** 검색량 실측이 붙은 파생 키워드들. 프레임 근거이자 제목 재료다. */
  derivedKeywords: readonly DerivedKeyword[];
  /** 그 키워드의 실제 1페이지 제목들(serp-winnability topTitles). */
  serpTitles: readonly string[];
  /** keyword-demand-shape 의 시기 문구. 있으면 schedule 프레임의 근거가 된다. */
  timing?: string;
  isProduct?: boolean;
  productName?: string;
  /** 도메인 판별용 신호(카테고리·상품명 등 자유 문자열). */
  productSignal?: string;
  /**
   * 프레임을 밖에서 고정한다. 안 주면 여느 때처럼 대장간이 고른다.
   * 쓰는 곳: 한 키워드에서 유형이 다른 제목을 여러 개 뽑을 때(앱 발굴 화면의 글감 펼침).
   * 근거 없는 프레임을 넣으면 낚시 가드가 뚫리므로, 부르는 쪽이 supportedFrames 안에서만 골라야 한다.
   */
  frame?: TitleFrame;
}

export interface ForgedTitle {
  text: string;
  frame: TitleFrame;
  /** 이 제목이 어느 실측에서 나왔는가. 추정 표현을 쓰지 않는다. */
  basis: string;
}

export interface ForgedTitles {
  seo: ForgedTitle;
  home: ForgedTitle;
}

const SEO_MAX = 40;
const HOME_MAX = 38;

// 회귀 테스트가 전 프레임 문구를 금지 정규식과 대조한다 — export 는 그 용도다.
export const SEO_SUFFIX: Record<TitleFrame, string> = {
  recipe: '따라하기 쉬운 순서',
  review: '직접 써본 기록',
  compare: '무엇이 어떻게 다른가',
  price: '실제 비용 정리',
  schedule: '언제부터 언제까지',
  mistake: '원인과 해결법',
  recommend: '고르는 기준',
  howto: '단계별 방법',
  checklist: '빠뜨리기 쉬운 것들',
  /*
   * 근거가 없을 때 나오는 문구다. 그러니 **아무것도 단정하면 안 된다**.
   * 옛 문구 '기본 정보와 최근 소식' 은 '최근 소식' 이 있다고 단정했다 —
   * 우리는 그런 걸 잰 적이 없다(사장님 지적 2026-08-22).
   */
  generic: '어떤 정보가 있는지',
  // 인물 · 이슈(2026-10-07) — 확인 안 된 사실(가짜 뉴스일 수 있다)을 단정하지 않는다. 실제 제목은 issue.ts 가 만든다.
  issue: '확인된 사실만',
};

/**
 * 키워드에 이미 있는 낱말이 꼬리말에 또 나올 때 쓰는 꼬리말(2026-10-07 "청년도약계좌 신청 방법 단계별 방법").
 * 같은 약속을 다른 말로 한다 — 단정 · 상투구 없이(회귀 테스트가 금지 정규식과 대조한다).
 */
export const SEO_SUFFIX_ALT: Partial<Record<TitleFrame, string>> = {
  recipe: '실패 없는 순서',
  review: '써 보고 알게 된 것',
  compare: '무엇을 보고 고를지',
  price: '실제로 드는 금액',
  schedule: '놓치지 않는 날짜',
  mistake: '왜 생기고 어떻게 푸는지',
  recommend: '고를 때 보는 기준',
  howto: '처음 해도 막히지 않는 순서',
  checklist: '빠뜨리기 쉬운 것들',
};

/** 꼬리말 고르기 — 키워드 낱말(2자 이상)과 겹치면 대체 꼬리말. 대체도 겹치거나 없으면 원래 꼬리말. */
function suffixFor(frame: TitleFrame, keyword: string): string {
  const words = keyword.split(/\s+/).filter((w) => w.length >= 2);
  const overlaps = (suffix: string) => suffix.split(' ').some((token) => words.some((w) => w.includes(token) || token.includes(w)));
  const base = SEO_SUFFIX[frame];
  const alt = SEO_SUFFIX_ALT[frame];
  return overlaps(base) && alt && !overlaps(alt) ? alt : base;
}

export const HOME_TEMPLATE: Record<TitleFrame, (kw: string, extra: string) => string> = {
  recipe: (kw) => `${kw}, 이 순서대로만 하면 됩니다`,
  review: (kw) => `${kw} 직접 써보고 알게 된 것들`,
  compare: (kw, extra) => `${kw} ${extra}, 기준은 하나면 됩니다`,
  price: (kw, extra) => `${kw} ${extra}, 미리 알면 다릅니다`,
  schedule: (kw) => `${kw}, 지금이 준비할 때입니다`,
  mistake: (kw, extra) => `${kw} ${extra}, 원인은 따로 있습니다`,
  recommend: (kw) => `${kw} 고르다 지쳤다면 볼 것`,
  howto: (kw) => `${kw}, 어렵게 할 필요 없습니다`,
  checklist: (kw) => `${kw}, 이 글 하나로 끝냅니다`,
  /*
   * 옛 문구 `${kw}, 지금 왜 찾는 사람이 많을까` 를 버린다(사장님 지적 2026-08-22
   * '오퍼레이터24hr' 실사고). 두 가지가 동시에 잘못됐다.
   *   ① "찾는 사람이 많다" 를 단정한다 — 급증을 잰 적이 없는 자리인데 그렇다고 쓴다.
   *   ② 왜 뜨는지는 **우리가 알아내야 할 것**인데, 그 질문을 그대로 제목으로 낸다.
   * 근거가 없을 때는 모른다는 사실에 맞는 말을 쓴다 — 단정도 질문 떠넘기기도 없이.
   * 쉼표 이분법도 피한다(홈판 교리 ②).
   */
  generic: (kw) => `${kw} 이게 뭔지 몰라서 찾아봤습니다`,
  issue: (kw) => `${kw} 소식 돌던데… 직접 확인해 봤습니다`,
};

/**
 * 금지 상투구 — 사장님 확정("'핵심 정리'가 클릭하고 싶을까?"). 검증기(enrich)와
 * 대장간이 같은 정규식을 봐야 한다. 2026-08-19 실사고: 대장간의 폴백 문구
 * 자체가 이 목록에 걸리는 말이라("핵심 정리"·"총정리"·"한눈에") 검증기가
 * AI 제목만 지키고 규칙 제목은 그대로 화면까지 갔다. 발원지 SSoT 로 옮긴다.
 */
// 상투구 + CTR 신뢰 위반어(2026-09-06 사장님 홈판 CTR 프롬프트) — 무조건·100%·평생·완벽 가이드는
// 과장이라 신뢰를 깨고, 나머지는 아무 글에나 붙는 라벨이다.
export const TITLE_CLICHES = /핵심\s*정리|핵심만|총정리|확인할\s*점|알아보|한눈에|정리해\s*봤|무조건|100\s*%|평생|완벽\s*가이드/;

/**
 * 파생 키워드에서 본 키워드 어절을 뺀 나머지 — 제목에 실을 추가 표현. 키워드 앞에 붙은 말(before)과 뒤 말(after)을 나눈다.
 * 검색광고 연관어는 붙여 쓴 꼴('KB자동차보험'·'자동차보험비교')로 와서, 띄어쓰기로만 나누던 옛 방식은 통째로 끼웠다
 * (2026-10-06 "자동차 보험 갱신 KB자동차보험 어떤 정보가 있는지"). 두 글자 이상 어절은 붙어 있어도 지우고,
 * 지운 자리에 한 글자만 남은 조각('보험료'의 '료')은 말이 안 되므로 버린다.
 */
function splitExtra(derived: string, keyword: string): { before: string; after: string } {
  const words = keyword.split(/\s+/).filter(Boolean);
  const short = new Set(words.filter((w) => w.length < 2));
  const text = collapse(derived);
  const covered: boolean[] = Array.from({ length: text.length }, () => false);
  for (const word of words) {
    if (word.length < 2) continue;
    for (let at = text.indexOf(word); at >= 0; at = text.indexOf(word, at + word.length)) {
      for (let k = at; k < at + word.length; k += 1) covered[k] = true;
    }
  }
  const runs: Array<{ text: string; start: number; end: number }> = [];
  let start = -1;
  for (let i = 0; i <= text.length; i += 1) {
    const cut = i === text.length || covered[i] || text[i] === ' ';
    if (cut && start >= 0) { runs.push({ text: text.slice(start, i), start, end: i }); start = -1; }
    if (!cut && start < 0) start = i;
  }
  const glued = (r: { start: number; end: number }) => (r.start > 0 && covered[r.start - 1]) || (r.end < text.length && covered[r.end]);
  const kept = runs.filter((r) => !short.has(r.text) && !(r.text.length === 1 && glued(r)));
  const firstCovered = covered.indexOf(true);
  const isBefore = (r: { end: number }) => firstCovered >= 0 && r.end <= firstCovered;
  return {
    before: kept.filter(isBefore).map((r) => r.text).join(' '),
    after: kept.filter((r) => !isBefore(r)).map((r) => r.text).join(' '),
  };
}

/**
 * 끝나지 않은 조각(…면 · …는데 · …려면 · …지만)은 뒤에서 뗀다 — 검색어 '갱신 기간 놓치면'의 '놓치면'이 끼어
 * "자동차 보험 갱신 기간 놓치면 언제부터 언제까지"가 됐다(2026-10-07). 2자 이상 낱말만 본다('라면' 같은 명사는 '면' 앞이 1자라 남는다).
 */
function withoutDangling(extra: string): string {
  const tokens = extra.split(' ').filter(Boolean);
  while (tokens.length && /^[가-힣]{2,}(려면|으면|는데|지만|하면|면)$/.test(tokens[tokens.length - 1]) && !/^[가-힣]라면$/.test(tokens[tokens.length - 1])) tokens.pop();
  return tokens.join(' ');
}

/** 뒤 문구에 이미 있는 말은 뺀다 — "방법 단계별 방법" 같은 겹침을 막는다. */
function withoutRepeats(extra: string, suffix: string): string {
  return extra.split(' ').filter((token) => token && !suffix.includes(token)).join(' ');
}

function collapse(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/** 상한을 넘으면 뒤 어절부터 덜어낸다 — 키워드(앞자리)는 절대 안 자른다. */
function fitWithin(text: string, max: number): string {
  let words = collapse(text).split(' ');
  while (words.join(' ').length > max && words.length > 1) {
    words = words.slice(0, -1);
  }
  return words.join(' ');
}

/**
 * 근거 있는 프레임 목록 — 파생 키워드(검색량 많은 순)의 프레임 + 시기 실측.
 * 여기 없는 프레임은 어떤 경우에도 제목이 되지 않는다(낚시 가드).
 */
export function supportedFrames(input: TitleForgeInput): TitleFrame[] {
  const ordered = [...input.derivedKeywords]
    .sort((a, b) => (b.searchVolume || 0) - (a.searchVolume || 0));
  const frames: TitleFrame[] = [];
  for (const derived of ordered) {
    const frame = classifyTitleFrame(derived.keyword);
    // 일반 틀은 근거가 아니다 — 'KB자동차보험'(115,300)이 일반 틀을 맨 앞에 세워 "어떤 정보가 있는지"가 나왔다(2026-10-07).
    // 근거 틀이 하나도 없을 때만 pickFrame · forgeVariedTitles 가 일반 틀로 떨어진다.
    if (frame === 'generic') continue;
    if (!frames.includes(frame)) frames.push(frame);
  }
  if (input.timing && !frames.includes('schedule')) frames.push('schedule');
  return frames;
}

/** 선택한 프레임의 근거가 된 파생 키워드(검색량 최대). 없으면 null. */
function derivedForFrame(input: TitleForgeInput, frame: TitleFrame): DerivedKeyword | null {
  const matches = input.derivedKeywords
    .filter((d) => classifyTitleFrame(d.keyword) === frame)
    .sort((a, b) => (b.searchVolume || 0) - (a.searchVolume || 0));
  return matches[0] || null;
}

function pickFrame(input: TitleForgeInput): TitleFrame {
  const supported = supportedFrames(input);
  // 밖에서 고정한 프레임은 근거 목록 안에 있을 때만 받는다 — 낚시 가드는 우회할 수 없다.
  if (input.frame && supported.includes(input.frame)) return input.frame;
  if (supported.length === 0) return 'generic';
  const empty = findEmptyFrames(input.serpTitles, supported);
  if (empty.length > 0) return empty[0];
  // 빈 프레임이 없으면 가장 덜 포화된 지원 프레임 — 그래도 근거 밖으로는 안 나간다.
  const counts = countFrames(input.serpTitles);
  return [...supported].sort((a, b) => (counts.get(a) || 0) - (counts.get(b) || 0))[0];
}

function basisFor(input: TitleForgeInput, frame: TitleFrame, derived: DerivedKeyword | null): string {
  if (derived) {
    const volume = derived.searchVolume === null ? '미측정' : String(derived.searchVolume);
    return `파생 키워드 실측 '${derived.keyword}' (검색량 ${volume}) — 1페이지 ${input.serpTitles.length}개 제목에 없는 프레임`;
  }
  if (frame === 'schedule' && input.timing) return `시기 실측: ${input.timing}`;
  return '근거 프레임 없음 — 일반형';
}

export function forgeTitles(input: TitleForgeInput): ForgedTitles {
  // 붙여 쓴 키워드는 띄워서 박는다('가수주현미별세이유' → '가수 주현미 별세 이유', 2026-10-07)
  const keyword = displayKeyword(input.keyword);
  const frame = pickFrame(input);
  const derived = derivedForFrame(input, frame);
  const split = derived ? splitExtra(derived.keyword, keyword) : { before: '', after: '' };
  const before = split.before;
  const after = withoutDangling(split.after);
  const basis = basisFor(input, frame, derived);

  // 검색용은 키워드가 맨 앞이어야 하므로 앞에 붙은 말(before)은 끌리는 제목에만 싣는다.
  const seo: ForgedTitle = {
    text: fitWithin(`${keyword} ${withoutRepeats(after, suffixFor(frame, keyword))} ${suffixFor(frame, keyword)}`, SEO_MAX),
    frame,
    basis,
  };

  if (input.isProduct && input.productName) {
    // 홈판 제품 공식: 제품명 + 구매욕구 후킹. 규칙 문구 엔진을 그대로 쓴다.
    const angles = buildPurchaseDesireAngles(
      { cleanTitle: input.productName, title: input.productSignal || input.productName },
      keyword,
    );
    const angle = angles[0];
    if (angle) {
      return {
        seo,
        home: {
          text: fitWithin(angle.text, HOME_MAX),
          frame,
          basis: `${angle.kind} · ${angle.basis}`,
        },
      };
    }
  }

  const home: ForgedTitle = {
    text: fitWithin(HOME_TEMPLATE[frame](collapse(`${before} ${keyword}`), after).replace(/\s+,/g, ','), HOME_MAX),
    frame,
    basis,
  };
  return { seo, home };
}
