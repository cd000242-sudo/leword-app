/**
 * 유형이 다른 제목 묶음(golden-writing-kit 에서 2026-10-06 분리 — 동작 동일).
 * 사이트판 설계실이 같은 제목을 내야 해서 일렉트론이 없는 순수 파일로 꺼냈다. 사이트는 이 파일을 묶은 사본
 * (spa/src/lib/titleForge.generated.mjs)을 쓴다 — 고칠 때는 여기를 고치고 사이트 사본을 다시 만든다.
 */
import { forgeTitles, supportedFrames, type DerivedKeyword } from './forge';
import { findEmptyFrames, type TitleFrame } from './frame-analysis';
import { isPersonIssueKeyword, issueTitles } from './issue';

/** 제목 유형 수. 유형마다 검색용·끌리는 두 개가 나온다. */
export const FRAME_CAP = 3;

/** 화면에 보일 유형 이름. frame-analysis 의 코드명을 초보자 말로 바꾼 것뿐이다. */
export const FRAME_LABEL: Record<TitleFrame, string> = {
  recipe: '순서',
  review: '후기',
  compare: '비교',
  price: '비용',
  schedule: '시기',
  mistake: '실수',
  recommend: '추천',
  howto: '방법',
  checklist: '체크',
  generic: '일반',
  issue: '인물·이슈',
};

export interface VariedTitle {
  text: string;
  /** '검색용' | '끌리는' */
  kind: string;
  frame: TitleFrame;
  frameLabel: string;
  basis: string;
}

const norm = (value: string) => String(value || '').replace(/\s+/g, '');

/**
 * 유형이 다른 제목을 뽑는다. 1페이지에 없는 유형을 먼저 쓰고, 모자라면 덜 포화된 유형으로 채운다.
 * 유형은 반드시 파생 키워드 실측에서 나온 것만 쓴다 — 근거 없는 각도는 본문이 약속을 못 지킨다.
 */
export function forgeVariedTitles(
  keyword: string,
  derived: readonly DerivedKeyword[],
  serpTitles: readonly string[],
  frameCap: number = FRAME_CAP,
): VariedTitle[] {
  // 인물 · 이슈는 전용 틀(상품 · 생활정보 틀로는 '별세 이유 원인과 해결법' 같은 말이 됐다, 2026-10-07)
  if (isPersonIssueKeyword(keyword)) {
    const t = issueTitles(keyword, derived);
    return [
      { text: t.home.text, kind: '끌리는', frame: 'issue', frameLabel: FRAME_LABEL.issue, basis: t.home.basis },
      { text: t.seo.text, kind: '검색용', frame: 'issue', frameLabel: FRAME_LABEL.issue, basis: t.seo.basis },
    ];
  }
  const base = { keyword, derivedKeywords: derived, serpTitles };
  const supported = supportedFrames(base);
  if (supported.length === 0) {
    const forged = forgeTitles(base);
    return [
      { text: forged.seo.text, kind: '검색용', frame: forged.seo.frame, frameLabel: FRAME_LABEL[forged.seo.frame], basis: forged.seo.basis },
      { text: forged.home.text, kind: '끌리는', frame: forged.home.frame, frameLabel: FRAME_LABEL[forged.home.frame], basis: forged.home.basis },
    ];
  }
  const empty = findEmptyFrames(serpTitles, supported);
  const rest = supported.filter((frame) => !empty.includes(frame));
  const frames = empty.concat(rest).slice(0, Math.max(1, frameCap));

  const titles: VariedTitle[] = [];
  const seen = new Set<string>();
  for (const frame of frames) {
    const forged = forgeTitles({ ...base, frame });
    for (const [kind, one] of [['끌리는', forged.home], ['검색용', forged.seo]] as const) {
      const key = norm(one.text);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      titles.push({ text: one.text, kind, frame: one.frame, frameLabel: FRAME_LABEL[one.frame], basis: one.basis });
    }
  }
  return titles;
}
