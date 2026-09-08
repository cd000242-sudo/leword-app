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

export interface AnswerCardVerdict {
  answerCard: boolean;
  reason: string;
}

/*
 * 카드 답 검색어 — 네이버가 결과 맨 위 카드로 직접 답해서 블로그 클릭이 없는 말.
 *
 * 왜(사장님 2026-09-08 "블로그로 날씨 같은 걸 찾아볼까? 프로필을 검색하지만 블로그를
 * 찾아보는 사람이 있니?"): 발행 보드 122행 중 30행이 이 부류였고 24행이 'xx cc 날씨'였다.
 * 검색량÷문서수는 크다 — 아무도 골프장 날씨 글을 안 쓰니까. 그런데 검색한 사람은
 * 날씨 카드 한 줄로 만족하고 나간다. 자리가 빈 게 아니라 쓸 게 없는 것이다.
 * 보강 AI 도 이미 "만족 조건이 전부 '한 줄 사실'"이라 판정했는데 등급이 못 봤다.
 *
 * 끝맺음(`$`)으로만 잡는다. 한글은 낱말 경계가 없어서 '나이'를 넣으면 톤틴연금
 * 가입'나이'·쳇지피티 재미'나이'(Gemini)·'나이'스차저가 걸린다 — 실제 보드에 있던
 * 행들이다. 사람 사실(나이·키·본명)은 여기서 안 잡고 SERP 인물 카드 마커(실측)와
 * 수익 판정이 잡는다. 뒤에 말이 붙으면 글감이다('날씨 옷차림'·'금시세 전망'·'로또 명당').
 */
const ANSWER_CARD_PATTERNS: ReadonlyArray<{ pattern: RegExp; label: string }> = [
  { pattern: /날씨$/, label: '날씨 카드가 답한다 — 예보 한 줄이면 나간다' },
  { pattern: /프로필$/, label: '인물 정보 카드가 답한다 — 한 줄 사실 검색이다' },
  { pattern: /(?:주가|환율)$|(?:금|은|코인|비트코인|이더리움|달러)시세$/, label: '증권·시세 카드가 답한다 — 숫자 하나면 나간다' },
  { pattern: /운세$/, label: '운세 카드가 답한다' },
  { pattern: /로또$|로또(?:당첨)?(?:번호|결과)(?:조회)?$/, label: '로또 결과 카드가 답한다' },
  { pattern: /(?:주소|영업시간|전화번호|위치|오시는길)$/, label: '플레이스 카드가 답한다 — 주소·시간은 지도가 준다' },
  { pattern: /지도$/, label: '지도 카드가 답한다' },
  { pattern: /(?:사전|뜻|의미|영어로|한자로|일본어로|중국어로)$/, label: '사전 카드가 답한다' },
  { pattern: /가사$/, label: '가사 카드가 답한다' },
  { pattern: /(?:택배|배송|운송장)조회$|배송추적$/, label: '배송조회 카드가 답한다' },
];

/** 네이버가 카드로 직접 답하는 검색어인가. 순수 함수 — 판정 근거를 문장으로 남긴다. */
export function judgeAnswerCardKeyword(keyword: string): AnswerCardVerdict {
  const text = String(keyword || '').replace(/\s+/g, '').trim();
  if (!text) return { answerCard: false, reason: '' };
  for (const { pattern, label } of ANSWER_CARD_PATTERNS) {
    if (pattern.test(text)) return { answerCard: true, reason: label };
  }
  return { answerCard: false, reason: '' };
}

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

