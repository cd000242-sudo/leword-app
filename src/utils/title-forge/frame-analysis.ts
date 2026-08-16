/**
 * 제목 프레임 분석 — 1페이지 제목들이 어떤 각도로 쓰였는지 세고, 빈 각도를 찾는다.
 *
 * 왜 필요한가: 검색 1페이지는 제목 10개가 나란히 붙는 경쟁이다. 이미 넷이
 * "황금레시피" 프레임이면 다섯 번째 황금레시피는 후킹이 아니라 배경이다.
 * 후킹 사전(총정리·꿀팁)에서 고르는 게 아니라, **그 키워드의 실제 1페이지에
 * 없는 프레임**을 고른다 — 실측 기반이고 추가 비용이 없다(SERP 는 winnability
 * 판정 때 이미 사 왔다).
 *
 * 순수 함수 · 외부 호출 없음 · Math.random 없음.
 */

export type TitleFrame =
  | 'recipe'      // 레시피
  | 'review'      // 후기·내돈내산
  | 'compare'     // 비교·차이
  | 'price'       // 가격·비용
  | 'schedule'    // 일정·시기
  | 'mistake'     // 실수·실패·원인·해결
  | 'recommend'   // 추천·순위
  | 'howto'       // 방법·사용법
  | 'checklist'   // 총정리·목록
  | 'generic';

/**
 * 순서가 판정이다 — 위에서 먼저 걸리는 프레임이 이긴다.
 * '노각무침 황금레시피 총정리'는 레시피이지 총정리가 아니다. 독자가 받는
 * 핵심 약속(레시피)이 앞이고, 형식(총정리)은 뒤라서 구체적인 것을 앞에 둔다.
 */
const FRAME_PATTERNS: ReadonlyArray<{ frame: TitleFrame; pattern: RegExp }> = [
  { frame: 'recipe', pattern: /레시피/ },
  { frame: 'review', pattern: /후기|내돈내산|사용기|리뷰|써보/ },
  { frame: 'compare', pattern: /비교|차이|vs\b|대신/i },
  { frame: 'price', pattern: /가격|비용|수리비|얼마|최저가|할인/ },
  { frame: 'schedule', pattern: /일정|날짜|언제|기간|편성표|시기/ },
  { frame: 'mistake', pattern: /실수|실패|주의|안됨|안돼|해결|물러|원인|이유/ },
  { frame: 'recommend', pattern: /추천|순위|베스트|BEST|TOP/i },
  { frame: 'howto', pattern: /방법|하는법|만드는법|사용법|만들기/ },
  { frame: 'checklist', pattern: /총정리|정리|체크리스트|목록/ },
];

/** 제목 하나가 어떤 각도로 쓰였는가. 어느 것도 아니면 generic. */
export function classifyTitleFrame(title: string): TitleFrame {
  const text = String(title || '');
  for (const { frame, pattern } of FRAME_PATTERNS) {
    if (pattern.test(text)) return frame;
  }
  return 'generic';
}

/** 프레임별 등장 횟수. 없는 프레임은 키 자체가 없다(0 과 못 잼을 섞지 않는다). */
export function countFrames(titles: readonly string[]): Map<TitleFrame, number> {
  const counts = new Map<TitleFrame, number>();
  for (const title of titles) {
    const frame = classifyTitleFrame(title);
    counts.set(frame, (counts.get(frame) || 0) + 1);
  }
  return counts;
}

/**
 * 빈 프레임 — SERP 에 한 번도 안 나온 각도 중, 근거가 있는 것만.
 *
 * supportedFrames 밖의 프레임은 비어 있어도 내놓지 않는다. 파생 키워드나
 * 시기 실측에 근거 없는 각도로 제목을 뽑으면, 제목이 약속한 것을 본문이
 * 못 주는 낚시가 된다. 순서는 supportedFrames 순서를 지킨다(호출자가
 * 근거 강도순으로 넘긴다).
 */
export function findEmptyFrames(
  serpTitles: readonly string[],
  supportedFrames: readonly TitleFrame[],
): TitleFrame[] {
  const counts = countFrames(serpTitles);
  return supportedFrames.filter((frame) => !counts.has(frame));
}
