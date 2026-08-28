/**
 * 검색 의도 · AI 브리핑 위험 · 규제 위험.
 *
 * 왜 필요한가 (docs/golden-keyword-research-2026-08.md §2, §3, §5):
 *   2026년 네이버가 AI 브리핑을 강화하면서 **정의형·단순 증상형 키워드는
 *   사용자가 블로그를 클릭하기 전에 답이 끝난다.** 업계 보도로 블로거 수익
 *   40% 감소가 나왔다.
 *
 *   그래서 "검색량 있고 문서수 적다"만으로 고르면 AI 가 삼킬 키워드를 추천하게
 *   된다. 자리가 빈 이유가 "아무도 안 썼다"가 아니라 **"써도 유입이 없어서
 *   아무도 안 쓴다"** 일 수 있다. 숫자로는 이 둘이 구분되지 않는다.
 *
 * 여기 있는 것은 전부 **어절 매칭 사실**이다. 점수·확률을 만들지 않는다.
 * 화면에는 "무엇에 걸렸는지"만 라벨로 나간다.
 */

/** 검색 의도 4분류. 블로그 값어치는 commercial > transactional > informational 순이다. */
export type SearchIntent = 'commercial' | 'transactional' | 'informational' | 'navigational' | 'unknown';

export const SEARCH_INTENT_LABEL: Record<SearchIntent, string> = {
  commercial: '구매 검토',
  transactional: '거래',
  informational: '정보',
  navigational: '길찾기',
  unknown: '분류 안 됨',
};

/** AI 브리핑이 답을 대신할 위험. 높을수록 자리가 비어 있어도 클릭이 안 온다. */
export type BriefingRisk = 'high' | 'medium' | 'low';

export const BRIEFING_RISK_LABEL: Record<BriefingRisk, string> = {
  high: 'AI 답변에 잠식 위험 높음',
  medium: 'AI 답변과 일부 겹침',
  low: 'AI 가 대신 답하기 어려움',
};

/** 법·규정 위험. 수익은 높지만 심의·행정처분 대상이 될 수 있다. */
export type RegulatoryRisk = 'medical' | 'financial' | null;

export const REGULATORY_RISK_LABEL: Record<'medical' | 'financial', string> = {
  medical: '의료광고 심의 대상',
  financial: '금융 표현 주의',
};

/* ─────────────── 어휘 ─────────────── */

/** 구매를 앞두고 비교·검토할 때 붙는 말. 블로그에 제일 값어치가 크다. */
const COMMERCIAL_TOKENS = [
  '추천', '후기', '리뷰', '비교', '순위', '베스트', '단점', '장단점',
  '내돈내산', '솔직', '차이', '어디가', '뭐가', '나은', '괜찮은',
] as const;

/** 지금 사거나 신청하려는 말. */
const TRANSACTIONAL_TOKENS = [
  '가격', '비용', '요금', '최저가', '할인', '쿠폰', '구매', '주문', '예약', '신청',
  '방법', '결제', '배송', '무료', '체험', '가입', '설치', '다운로드',
] as const;

/**
 * AI 브리핑이 한 줄로 답하고 끝내기 쉬운 말.
 * 정의·용어·단순 사실 질의는 클릭이 발생하지 않는다.
 */
const DEFINITION_TOKENS = ['뜻', '의미', '유래', '어원', '정의', '무엇', '뭐임', '뭔가요'] as const;

/** 증상·원인 나열형. 부분적으로 AI 가 요약한다. */
const SYMPTOM_TOKENS = ['증상', '원인', '종류', '효능', '부작용', '기준', '조건'] as const;

/**
 * AI 가 대신 답하기 어려운 말.
 * 값이 계속 바뀌거나(가격·일정), 현장 경험이 필요하거나(후기·코스),
 * 개인 상황에 따라 달라지는 것들이다.
 */
const RESILIENT_TOKENS = [
  '후기', '내돈내산', '코스', '일정', '예약', '가격', '최저가', '실비',
  '추천', '비교', '순위', '준비물', '체크리스트', '실패', '주의',
] as const;

/** 의료광고 심의 대상이 되기 쉬운 말. */
/*
 * 한 글자 어휘를 넣지 않는다.
 * '약' 하나를 넣었더니 '한강 캠핑장 예약 방법' 이 의료 위험으로 잡혔다 —
 * 예약·계약·약속이 전부 걸린다. 한국어는 부분 문자열 매칭이라 짧은 말이
 * 다른 단어 속에 숨어 있다. 반드시 두 글자 이상으로 쓴다.
 */
const MEDICAL_TOKENS = [
  '병원', '의원', '클리닉', '치료', '시술', '수술', '처방', '진료',
  '한의원', '치과', '성형', '주사', '약국', '복용', '효능', '완치', '진단',
] as const;

/** 금융 표현 규제가 걸리기 쉬운 말. */
const FINANCIAL_TOKENS = [
  '대출', '보험', '적금', '펀드', '투자', '수익률', '코인', '주식',
  '연금', '카드론', '신용', '금리',
] as const;

const compact = (value: string) => String(value || '').replace(/\s+/g, '');
const hasAny = (keyword: string, tokens: readonly string[]) => {
  const text = compact(keyword);
  return tokens.some((token) => text.includes(token));
};

/* ─────────────── 판정 ─────────────── */

export interface IntentResult {
  intent: SearchIntent;
  intentLabel: string;
  /** 무엇에 걸려 그렇게 봤는지. 화면에 근거로 쓸 수 있다. */
  matched: string[];
}

/**
 * 검색 의도를 가른다.
 *
 * 순서가 중요하다. '가격 비교'처럼 둘 다 걸리는 말은 **구매 검토**로 본다 —
 * 비교를 원하는 사람이 블로그를 끝까지 읽고, AI 도 "어느 게 나은가"는
 * 아직 대신 답하지 못한다.
 */
export function classifySearchIntent(keyword: string): IntentResult {
  const text = compact(keyword);
  const matched: string[] = [];

  const commercial = COMMERCIAL_TOKENS.filter((token) => text.includes(token));
  if (commercial.length > 0) {
    matched.push(...commercial);
    return { intent: 'commercial', intentLabel: SEARCH_INTENT_LABEL.commercial, matched };
  }

  const transactional = TRANSACTIONAL_TOKENS.filter((token) => text.includes(token));
  if (transactional.length > 0) {
    matched.push(...transactional);
    return { intent: 'transactional', intentLabel: SEARCH_INTENT_LABEL.transactional, matched };
  }

  const informational = [...DEFINITION_TOKENS, ...SYMPTOM_TOKENS].filter((token) => text.includes(token));
  if (informational.length > 0) {
    matched.push(...informational);
    return { intent: 'informational', intentLabel: SEARCH_INTENT_LABEL.informational, matched };
  }

  // 아무 신호가 없으면 단정하지 않는다. 정보형으로 반올림하면 멀쩡한 키워드가
  // AI 위험 높음으로 강등된다.
  return { intent: 'unknown', intentLabel: SEARCH_INTENT_LABEL.unknown, matched: [] };
}

/* ─────────────── 구획으로 보강 ─────────────── */

export interface ResolvedIntentResult extends IntentResult {
  /** 무엇으로 판정했는가. lexical = 검색자가 쓴 말, serp = 화면에 실제로 뜬 구획. */
  source: 'lexical' | 'serp' | 'none';
}

/**
 * 어휘로 분류가 안 된 키워드를 **화면에 실제로 뜬 구획**으로 판정한다.
 *
 * 왜 필요한가:
 *   실제 후보의 다수는 '강아지 사료'·'제주 애월 카페'처럼 의도어 없이 명사만
 *   있는 말이다. 어휘 목록으로는 전부 '분류 안 됨' 이 되고, 그러면 실행 계획이
 *   제목 지침 한 줄만 남는다.
 *
 * 왜 이게 추정이 아닌가:
 *   네이버가 그 검색어에 쇼핑 구획을 내놨다는 것은 **네이버가 측정한 구매 의도**다.
 *   우리가 단어를 보고 넘겨짚는 게 아니라, 화면에서 확인한 사실을 옮기는 것이다.
 *
 * 어휘 판정이 이미 났으면 건드리지 않는다 — 검색자가 직접 쓴 말이 더 가까운 증거다.
 */
export function resolveIntentFromSerp(
  lexical: IntentResult,
  sections: readonly string[] | null | undefined,
): ResolvedIntentResult {
  if (lexical.intent !== 'unknown') return { ...lexical, source: 'lexical' };
  if (!sections || sections.length === 0) return { ...lexical, source: 'none' };

  // 쇼핑이 광고를 이긴다. 상품 목록이 떴다면 파는 물건이 있는 검색어다.
  if (sections.includes('쇼핑')) {
    return {
      intent: 'commercial',
      intentLabel: SEARCH_INTENT_LABEL.commercial,
      matched: ['쇼핑 구획'],
      source: 'serp',
    };
  }
  // 서로 묻고 답하는 구획이 떴다 = 아직 정보를 찾는 단계다.
  // 광고보다 먼저 본다: '멜라토닌 복용량' 실측에서 질문 20건과 광고 1건이 같이 떴는데,
  // 광고를 앞세우면 정보형을 거래형으로 잘못 부른다. 사람 수가 더 무거운 증거다.
  const asking = ['지식iN', '카페'].filter((name) => sections.includes(name));
  if (asking.includes('지식iN')) {
    return {
      intent: 'informational',
      intentLabel: SEARCH_INTENT_LABEL.informational,
      matched: asking.map((name) => `${name} 구획`),
      source: 'serp',
    };
  }
  // 상품도 질문도 없는데 광고가 붙는다 = 신청·예약·견적에 돈을 쓰는 검색어다.
  if (sections.includes('파워링크')) {
    return {
      intent: 'transactional',
      intentLabel: SEARCH_INTENT_LABEL.transactional,
      matched: ['파워링크 구획'],
      source: 'serp',
    };
  }
  if (asking.length > 0) {
    return {
      intent: 'informational',
      intentLabel: SEARCH_INTENT_LABEL.informational,
      matched: asking.map((name) => `${name} 구획`),
      source: 'serp',
    };
  }

  // 인플루언서만 뜬 경우가 여기 온다. 그것만으로는 무엇을 원하는 검색인지 모른다.
  return { ...lexical, source: 'none' };
}

export interface BriefingRiskResult {
  risk: BriefingRisk;
  label: string;
  reason: string;
}

/**
 * AI 브리핑이 이 키워드의 답을 대신할 위험.
 *
 * 실측이 아니라 **유형 추론**이다. 실제로 어느 키워드가 잠식되는지는
 * SERP 에서 AI 브리핑 노출을 봐야 알 수 있고 아직 측정하지 못했다.
 * 그래서 화면에 확률로 쓰지 않고 '위험' 라벨로만 쓴다.
 */
export function judgeBriefingRisk(keyword: string): BriefingRiskResult {
  const text = compact(keyword);

  // 값이 변하거나 경험이 필요한 말이 있으면 AI 가 못 삼킨다 — 정의어가 섞여 있어도.
  const resilient = RESILIENT_TOKENS.filter((token) => text.includes(token));
  if (resilient.length > 0) {
    return {
      risk: 'low',
      label: BRIEFING_RISK_LABEL.low,
      reason: `'${resilient[0]}' — 값이 바뀌거나 경험이 필요해 한 줄로 답이 안 된다`,
    };
  }

  const definition = DEFINITION_TOKENS.filter((token) => text.includes(token));
  if (definition.length > 0) {
    return {
      risk: 'high',
      label: BRIEFING_RISK_LABEL.high,
      reason: `'${definition[0]}' — 정의형이라 AI 가 한 줄로 답하고 끝난다`,
    };
  }

  const symptom = SYMPTOM_TOKENS.filter((token) => text.includes(token));
  if (symptom.length > 0) {
    return {
      risk: 'medium',
      label: BRIEFING_RISK_LABEL.medium,
      reason: `'${symptom[0]}' — 나열형이라 AI 요약과 겹친다`,
    };
  }

  return { risk: 'low', label: BRIEFING_RISK_LABEL.low, reason: '정의·나열형 신호 없음' };
}

export interface RegulatoryResult {
  risk: RegulatoryRisk;
  label: string;
  matched: string[];
}

/** 의료·금융 규제 위험. 걸린다고 버리지 않고 **알려만 준다** — 쓸지는 사람이 정한다. */
export function judgeRegulatoryRisk(keyword: string): RegulatoryResult {
  const medical = MEDICAL_TOKENS.filter((token) => compact(keyword).includes(token));
  if (medical.length > 0) {
    return { risk: 'medical', label: REGULATORY_RISK_LABEL.medical, matched: medical };
  }
  const financial = FINANCIAL_TOKENS.filter((token) => compact(keyword).includes(token));
  if (financial.length > 0) {
    return { risk: 'financial', label: REGULATORY_RISK_LABEL.financial, matched: financial };
  }
  return { risk: null, label: '', matched: [] };
}

export interface KeywordSignals {
  intent: IntentResult;
  briefing: BriefingRiskResult;
  regulatory: RegulatoryResult;
}

export function analyzeKeywordSignals(keyword: string): KeywordSignals {
  return {
    intent: classifySearchIntent(keyword),
    briefing: judgeBriefingRisk(keyword),
    regulatory: judgeRegulatoryRisk(keyword),
  };
}

/**
 * 같은 층 안에서의 우선순위 가중치.
 *
 * **화면에 노출하지 않는다.** 내부 정렬에만 쓴다(추정치 UI 노출 금지 규칙).
 * 구매 검토형을 앞에, AI 잠식 위험이 큰 것을 뒤로 민다.
 */
export function sortWeight(signals: KeywordSignals, keyword = '', searchVolume: number | null = null): number {
  const intentWeight = { commercial: 0, transactional: 1, unknown: 2, informational: 3, navigational: 4 }[signals.intent.intent];
  const riskWeight = { low: 0, medium: 1, high: 2 }[signals.briefing.risk];
  /*
   * 같은 의도끼리는 **틈새를 앞에 둔다**(사장님 지시 2026-08-28).
   *
   * 왜: 이 정렬이 Bright Data 예산을 누구에게 쓸지 정한다. 예전에는 의도만 봐서
   * 대형 키워드가 앞자리를 먹었다 — 8/28 회차 실측으로 검색량 1만 이상이 25%,
   * 어절 4개 이상은 5% 뿐이었다. 사장님이 1등 하신 'KTX 대기순번' 같은 긴
   * 롱테일이 뒤로 밀려 subKeywords 장식으로만 남았다.
   *
   * 두 축을 쓴다. 둘 다 실측이거나 글자 그대로다 — 지어낸 점수가 아니다:
   *   ① 어절 수가 많을수록 앞 (구체적인 문구일수록 자리가 있다)
   *   ② 검색량이 작을수록 앞 (대형은 이미 남들이 다 썼다)
   * 의도 가중치보다 작게 둬서 층 자체는 뒤집지 않는다.
   */
  const words = String(keyword).trim().split(/\s+/).filter(Boolean).length;
  const longTail = Math.max(0, 4 - Math.min(words, 4));           // 4어절 이상이면 0
  const volume = searchVolume == null ? 1.5                        // 못 잰 것은 중간
    : searchVolume >= 10_000 ? 3
      : searchVolume >= 3_000 ? 2
        : searchVolume >= 1_000 ? 1 : 0;
  return intentWeight * 100 + riskWeight * 10 + longTail + volume;
}
