/**
 * 플랫폼 레인 — 황금키워드를 용도로 가른다 (사장님 지시 2026-08-17).
 *
 * 두 갈래:
 *   'shopping' — 상품/브랜드 키워드. 이 보드의 오염이 아니라 쇼핑 커넥트의
 *                소관이므로 본판에서 빼고 라우팅한다.
 *   'content'  — 정보성 키워드. 네이버 블로그용(자리 판정은 기존 게이트가 함)과
 *                구글 애드센스용(이 모듈의 adsenseFit)으로 다시 갈린다.
 *
 * 판정 원칙 — 전부 실측, 못 본 것은 자르지 않는다:
 *   쇼핑 증거 3종(어느 하나면 충분): ① SERP 에 쇼핑 구획 등장(naver-serp-structure)
 *   ② 쇼핑 카드 상품명 2개 이상(serp-meaning; 1개는 소음일 수 있어 안 자른다)
 *   ③ 스마트블록 쇼핑 상위 3위(smartblock-parser 의 shoppingDominant, MDP 경로).
 *   광고 수(adCount)·브랜드명 추측으로는 자르지 않는다 — '을왕리 펜션'(광고 10건)은
 *   전형적 블로그 소재이고, 브랜드 판별은 '몬스테라 무름병' 같은 신생 개념어를 오폭한다.
 *   2026-08-17 월요일 실회차 28행으로 캘리브레이션했다.
 *
 * 애드센스 적합(adsenseFit) — adsense-keyword-hunter 연구(:414-421)를 따른다:
 *   거래형(가격·구매·주문)은 구매 직전 검색이라 광고 클릭이 거의 0 → false.
 *   정보형은 광고 게재·클릭 최적 → true. 의도 불명이면 CPC 실측이 있을 때만
 *   판정하고, 없으면 null — 추정으로 채우지 않는다.
 *
 * 순수 함수 · 외부 호출 없음 · Math.random 없음.
 */

export type PlatformLane = 'shopping' | 'content';

export interface PlatformLaneInput {
  keyword: string;
  /** SERP 구획 순서(trustedSections). null/undefined = 못 쟀음. */
  serpSections?: readonly string[] | null;
  /** 쇼핑 카드 상품명(serp-meaning.productNames). */
  productNames?: readonly string[] | null;
  /** 스마트블록 쇼핑이 상위 3위 이내(MDP 경로 실측). */
  shoppingDominant?: boolean | null;
  /** keyword-intent SSoT 라벨('구매 검토'|'거래'|'정보'|'길찾기'|'분류 안 됨'). */
  intentLabel?: string | null;
  /** 상단 파워링크 광고주 수 — 근거 문장에만 쓰고 레인은 가르지 않는다. */
  adCount?: number | null;
  /** 검색광고 monthlyAveCpc 실측(원). null = 못 쟀음. */
  cpc?: number | null;
}

export interface PlatformLaneVerdict {
  lane: PlatformLane;
  /** 레인 판정의 실측 근거 문장들. */
  laneReasons: string[];
  /** 애드센스(티스토리/구글) 적합. null = 판정 재료 부족 — 지어내지 않는다. */
  adsenseFit: boolean | null;
  adsenseReason: string;
}

/** 의도 불명일 때 애드센스 적합을 인정할 CPC 하한(원). 실측 분포로 보정 예정. */
const ADSENSE_CPC_FLOOR = 300;

function judgeShoppingEvidence(input: PlatformLaneInput): string[] {
  const reasons: string[] = [];
  if (Array.isArray(input.serpSections) && input.serpSections.includes('쇼핑')) {
    const position = input.serpSections.indexOf('쇼핑') + 1;
    reasons.push(`SERP ${position}번째 구획이 쇼핑 — 검색 화면이 상품판이다`);
  }
  const products = Array.isArray(input.productNames) ? input.productNames.filter(Boolean) : [];
  if (products.length >= 2) {
    reasons.push(`쇼핑 카드 상품명 ${products.length}건 실측 — 상품 검색어다`);
  }
  if (input.shoppingDominant === true) {
    reasons.push('스마트블록 쇼핑이 상위 3위 이내 — 상품판 실측');
  }
  return reasons;
}

function judgeAdsenseFit(input: PlatformLaneInput): { fit: boolean | null; reason: string } {
  if (input.intentLabel === '거래') {
    return { fit: false, reason: '거래형 검색 — 구매 직전이라 광고 클릭이 거의 없다' };
  }
  if (input.intentLabel === '정보') {
    const cpcNote = typeof input.cpc === 'number' && input.cpc > 0
      ? ` (CPC ${Math.round(input.cpc)}원 실측)`
      : '';
    return { fit: true, reason: `정보형 검색 — 광고 게재·클릭 최적${cpcNote}` };
  }
  if (typeof input.cpc === 'number' && input.cpc >= ADSENSE_CPC_FLOOR) {
    return {
      fit: true,
      reason: `CPC ${Math.round(input.cpc)}원 실측 — 광고주가 이미 돈을 넣는 검색어다`,
    };
  }
  return { fit: null, reason: '의도·CPC 실측 부족 — 판정하지 않는다' };
}

export function judgePlatformLane(input: PlatformLaneInput): PlatformLaneVerdict {
  const shoppingReasons = judgeShoppingEvidence(input);
  if (shoppingReasons.length > 0) {
    return {
      lane: 'shopping',
      laneReasons: shoppingReasons,
      // 상품 검색어의 광고 수익 판정은 쇼핑 커넥트의 일이다 — 여기서 말하지 않는다.
      adsenseFit: null,
      adsenseReason: '쇼핑 레인 — 애드센스 판정 대상이 아니다',
    };
  }

  const measuredAnything = Array.isArray(input.serpSections)
    || Array.isArray(input.productNames)
    || typeof input.shoppingDominant === 'boolean';
  const laneReasons = measuredAnything
    ? ['쇼핑 실측 증거 없음 — 콘텐츠 키워드로 본다']
    : ['쇼핑 신호 미측정 — 못 본 것을 자르지 않는다'];

  const adsense = judgeAdsenseFit(input);
  return {
    lane: 'content',
    laneReasons,
    adsenseFit: adsense.fit,
    adsenseReason: adsense.reason,
  };
}
