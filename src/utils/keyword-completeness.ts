/**
 * 키워드 완결성 — "검색은 되지만 글 주제가 안 되는" 조각을 걸러낸다.
 *
 * 왜 필요한가:
 *   자동완성은 사람이 실제로 친 것을 그대로 준다. 그래서 검색어로는 전부 진짜다.
 *   그런데 `강아지 사료 대신`, `고양이 화장실 삽`, `강아지 사료 상함` 같은 것은
 *   **글 제목이 될 수 없다.** 검색량·문서수 어떤 숫자로도 이걸 못 가른다.
 *   실측 30건을 하나씩 읽어 보고서야 보였고, 그 판단을 여기 규칙으로 남긴다.
 *
 * 방식: **조각만 열거하고 나머지는 통과시킨다(블랙리스트).**
 *   처음에는 반대로 했다 — 의도어 목록에 없으면 조각으로 봤다. 그랬더니
 *   '허리 통증 병원', '당일치기 여행 코스' 같은 멀쩡한 주제가 전부 잘렸다.
 *   정상이 다수이고 조각이 소수다. 다수를 열거하려 든 것이 잘못이었다.
 *
 * 점수를 만들지 않는다. 통과/탈락과 그 이유만 돌려준다.
 */

/**
 * 어느 주제에서나 글을 끝맺는 말.
 * 검색자가 "무엇을 알고 싶은지"를 드러내는 어미들이다.
 */
export const CORE_INTENT_TAILS: readonly string[] = Object.freeze([
  '방법', '추천', '비용', '가격', '후기', '순위', '기준', '시기', '자격', '조건',
  '신청', '계산', '계산기', '예약', '증상', '원인', '차이', '종류', '효과', '부작용',
  '순서', '준비물', '체크리스트', '정리', '비교', '뜻', '의미', '위치', '일정',
  '방식', '팁', '노하우', '가이드', '총정리', '리스트', '목록', '사용법', '고르는법',
  'pdf', 'app', '앱', '양식', '서식', '템플릿',
]);

/** 끝이 이것들이면 문장이 끊긴 조각이다. 실측 후보에서 직접 뽑았다. */
const FRAGMENT_TAILS: readonly string[] = Object.freeze([
  '대신', '상함', '안먹음', '안될때', '했을때', '하면', '되면', '인지', '한지', '려면',
]);

/**
 * 커뮤니티·플랫폼 꼬리표. 검색은 실제로 되지만 블로그 글 주제가 아니다.
 * 실측 후보에서 '강아지 사료 추천 디시', '당일치기 여행 추천 디시' 로 나왔다.
 */
const NOISE_TAILS: readonly string[] = Object.freeze([
  '디시', '더쿠', '인스티즈', '뽐뿌', '클리앙', '나무위키', '지식인', '네이버', '구글',
  '티어', '갤러리', '카페',
]);

export interface CompletenessResult {
  complete: boolean;
  /** 사람이 읽는 사유. 운영자가 규칙을 조정할 때 본다. */
  reason: string;
}

function tailToken(keyword: string): string {
  const tokens = String(keyword).trim().split(/\s+/).filter(Boolean);
  return tokens.length > 0 ? tokens[tokens.length - 1] : '';
}

/**
 * 키워드가 글 주제로 끝맺는지 본다.
 *
 * @param extraTails 주제별 의도어(blog-topic-coverage 의 seedIntents). 주제마다
 *                   자연스러운 끝맺음이 달라서 넘겨받는다 — 예를 들어 원예는
 *                   '물주기·분갈이', 어학은 '공부법·교재' 가 완결이다.
 */
export function judgeCompleteness(
  keyword: string,
  extraTails: readonly string[] = [],
): CompletenessResult {
  const text = String(keyword || '').trim();
  if (!text) return { complete: false, reason: '빈 키워드' };

  const tail = tailToken(text);
  const compact = text.replace(/\s+/g, '');

  // ① 끊긴 조각 — 문장이 중간에 멈춘 것들
  for (const fragment of FRAGMENT_TAILS) {
    if (tail === fragment || compact.endsWith(fragment)) {
      return { complete: false, reason: `'${fragment}' 로 끝나 문장이 끊긴다` };
    }
  }

  // ② 커뮤니티·플랫폼 꼬리표 — 검색은 되지만 글 주제가 아니다
  for (const noise of NOISE_TAILS) {
    if (tail === noise) {
      return { complete: false, reason: `'${noise}' 는 커뮤니티 꼬리표라 글 주제가 아니다` };
    }
  }

  // ③ 한 글자로 끝나면 대개 잘린 것이다 ('고양이 화장실 삽')
  if (tail.length <= 1) {
    return { complete: false, reason: `'${tail}' 한 글자로 끝나 잘린 말이다` };
  }

  /*
   * 나머지는 전부 통과시킨다.
   *
   * 예전에는 의도어 화이트리스트에 없으면 조각으로 봤다. 그랬더니
   * '허리 통증 병원', '당일치기 여행 코스', '강아지 사료 급여량' 처럼
   * 완벽한 글 주제가 전부 잘려 나갔다 — 롱테일 1,984건 중 1,840건을 버렸다.
   *
   * 정상이 다수이고 조각이 소수다. 다수를 열거하려 든 것이 잘못이었다.
   * 조각만 열거하고 나머지는 통과시킨다.
   */
  const tails = [...CORE_INTENT_TAILS, ...extraTails];
  const matchedIntent = tails.find((intent) => tail === intent || tail.endsWith(intent) || compact.endsWith(intent));
  if (matchedIntent) return { complete: true, reason: `'${matchedIntent}' 로 끝맺음` };
  if (/[0-9]+(년|월|일|개월|주차|인분|kg|km|원)?$/.test(tail)) {
    return { complete: true, reason: '수치로 끝나 구체적이다' };
  }
  return { complete: true, reason: `'${tail}' 로 끝맺음` };
}

/** 통과분만 남긴다. 탈락 사유는 호출자가 로그로 남겨 규칙을 조정한다. */
export function filterComplete<T extends { keyword: string }>(
  rows: readonly T[],
  extraTails: readonly string[] = [],
): { kept: T[]; dropped: Array<T & { reason: string }> } {
  const kept: T[] = [];
  const dropped: Array<T & { reason: string }> = [];
  for (const row of rows) {
    const verdict = judgeCompleteness(row.keyword, extraTails);
    if (verdict.complete) kept.push(row);
    else dropped.push({ ...row, reason: verdict.reason });
  }
  return { kept, dropped };
}
