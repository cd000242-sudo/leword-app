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
  generic: '기본 정보와 최근 소식',
};

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
  generic: (kw) => `${kw}, 지금 왜 찾는 사람이 많을까`,
};

/**
 * 금지 상투구 — 사장님 확정("'핵심 정리'가 클릭하고 싶을까?"). 검증기(enrich)와
 * 대장간이 같은 정규식을 봐야 한다. 2026-08-19 실사고: 대장간의 폴백 문구
 * 자체가 이 목록에 걸리는 말이라("핵심 정리"·"총정리"·"한눈에") 검증기가
 * AI 제목만 지키고 규칙 제목은 그대로 화면까지 갔다. 발원지 SSoT 로 옮긴다.
 */
export const TITLE_CLICHES = /핵심\s*정리|핵심만|총정리|확인할\s*점|알아보|한눈에|정리해\s*봤/;

/** 파생 키워드에서 본 키워드 어절을 뺀 나머지 — 제목에 실을 추가 표현. */
function extraTokens(derived: string, keyword: string): string {
  const base = new Set(keyword.split(/\s+/).filter(Boolean));
  return derived
    .split(/\s+/)
    .filter((token) => token.length > 0 && !base.has(token))
    .join(' ');
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
function supportedFrames(input: TitleForgeInput): TitleFrame[] {
  const ordered = [...input.derivedKeywords]
    .sort((a, b) => (b.searchVolume || 0) - (a.searchVolume || 0));
  const frames: TitleFrame[] = [];
  for (const derived of ordered) {
    const frame = classifyTitleFrame(derived.keyword);
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
  const keyword = collapse(input.keyword);
  const frame = pickFrame(input);
  const derived = derivedForFrame(input, frame);
  const extra = derived ? extraTokens(derived.keyword, keyword) : '';
  const basis = basisFor(input, frame, derived);

  const seo: ForgedTitle = {
    text: fitWithin(`${keyword} ${extra} ${SEO_SUFFIX[frame]}`, SEO_MAX),
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
    text: fitWithin(HOME_TEMPLATE[frame](keyword, extra), HOME_MAX),
    frame,
    basis,
  };
  return { seo, home };
}
