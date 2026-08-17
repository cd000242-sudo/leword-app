/**
 * 선점 공급 가드 — BD 크레딧을 태우기 전에 "쓸 수 없는" 후보를 거른다.
 *
 * 2026-08-14 회차 실측에서 통과 35행 중 5행이 무대인사 일정·재방송 편성표·
 * 서버 점검 시간류였다. 이런 키워드는 자리가 비어 있어도(경쟁이 없어도)
 * 글의 유통기한이 며칠이라 상위노출로 얻는 것이 없다. 자리 유무는 게이트가
 * 재지만 "쓸 가치"는 아무도 안 재고 있었다 — 그 첫 조각이 이 가드다.
 *
 * 시즌성과 부패를 섞지 않는다: '해수욕장 개장일'·'토익 접수 일정'은 해마다
 * 돌아오는 수요라 남긴다. 여기서 자르는 것은 그 회차가 지나면 검색 자체가
 * 사라지는 **일회성 편성/점검 조회**뿐이다.
 *
 * 순수 함수 · Math.random 없음 · 판정은 전부 패턴 근거를 문장으로 남긴다.
 */

export interface EphemeralVerdict {
  ephemeral: boolean;
  reason: string;
}

/**
 * 일회성 조회 패턴. 하나하나가 실측 회차에서 실제로 통과해 버렸던 부류다.
 * 넓히고 싶어도 좁게 유지할 것 — '티켓팅 실패'(노하우)·'개장일'(연례) 같은
 * 상시 수요를 자르는 순간 가드가 공급을 갉아먹는 쪽으로 뒤집힌다.
 */
const EPHEMERAL_PATTERNS: ReadonlyArray<{ pattern: RegExp; label: string }> = [
  { pattern: /무대인사/, label: '무대인사 일정 — 상영 주간이 지나면 검색이 사라진다' },
  { pattern: /편성표|편성 ?시간/, label: '편성표 조회 — 그 주가 지나면 죽는 검색이다' },
  { pattern: /재방송/, label: '재방송 조회 — 회차 지나면 수요가 사라진다' },
  { pattern: /서버 ?점검|점검 ?시간/, label: '서버 점검 조회 — 점검이 끝나면 죽는 검색이다' },
  { pattern: /첫 ?방송|첫방 ?일/, label: '첫방송 날짜 — 방영 시작과 함께 수요가 사라진다' },
  { pattern: /결방/, label: '결방 조회 — 그 주에만 존재하는 검색이다' },
  { pattern: /방영일|방영 ?시간/, label: '방영 일정 조회 — 편성이 끝나면 죽는 검색이다' },
];

/** 며칠짜리 일정 조회인가. 걸리면 이유(패턴 근거)를 같이 낸다. */
export function judgeEphemeralKeyword(keyword: string): EphemeralVerdict {
  const text = String(keyword || '');
  for (const { pattern, label } of EPHEMERAL_PATTERNS) {
    if (pattern.test(text)) {
      return { ephemeral: true, reason: label };
    }
  }
  return { ephemeral: false, reason: '' };
}

/*
 * 불법·회색 콘텐츠 유도 검색어 — '무료 영화 사이트 링크 모음'이 top3 로
 * 두 회차 연속 통과했다(2026-08-17 실측). 자리가 비어 있어도 그 글은
 * 불법 스트리밍 안내가 되거나 애드센스 정책 위반이 된다. 좁게 잡는다 —
 * '영화관 무료 관람일'(정상 정보) 같은 것을 삼키면 가드가 독이 된다.
 */
const RESTRICTED_PATTERNS: ReadonlyArray<{ pattern: RegExp; label: string }> = [
  {
    pattern: /무료\s*(영화|드라마|애니|웹툰|만화|티비|TV)\s*(사이트|링크|스트리밍|다시\s*보기|보기\s*사이트)/i,
    label: '무료 시청 사이트 유도 — 불법 스트리밍 안내 글이 된다',
  },
  { pattern: /누누티비|티비몬|티비착|누누tv/i, label: '불법 스트리밍 서비스명 — 다룰 수 없는 검색어다' },
];

export function judgeRestrictedKeyword(keyword: string): EphemeralVerdict {
  const text = String(keyword || '');
  for (const { pattern, label } of RESTRICTED_PATTERNS) {
    if (pattern.test(text)) {
      return { ephemeral: true, reason: label };
    }
  }
  return { ephemeral: false, reason: '' };
}
