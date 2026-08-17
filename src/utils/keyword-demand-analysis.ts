/**
 * "이 키워드를 왜 이렇게 많이 검색하나" — 근거 판정.
 *
 * ## 왜 판정이 필요한가
 *
 * 이 질문은 AI 가 가장 그럴듯하게 지어내기 쉬운 종류다. "최근 관심이 높아지고
 * 있습니다", "많은 분들이 궁금해하는 주제입니다" 같은 문장은 어느 키워드에
 * 갖다 붙여도 말이 되고, 읽는 사람에게 아무것도 알려주지 않는다. 더 나쁜 것은
 * "20대 여성에게 인기"처럼 **우리가 재지도 않은 것**을 사실처럼 적는 경우다.
 *
 * 그래서 설명 하나하나가 우리가 실제로 잰 신호를 짚어야만 통과시킨다.
 * 못 짚은 문장은 버린다 — 빈 화면이 거짓 설명보다 낫다.
 *
 * 사장님 원칙과 같은 선이다: 추정치는 화면에 올리지 않는다.
 */

export interface DemandReason {
  text: string;
  /** 어떤 실측 신호에 기댄 설명인가. 비면 근거 없음이다. */
  basis: string;
}

export interface DemandEvidence {
  keyword: string;
  /** 이번에 실제로 잰 신호 이름들. 여기 없는 것은 근거로 인정하지 않는다. */
  signals: string[];
  expansions: string[];
  serpSections: string[];
  measuredVolumes: number;
}

/** 설명이 너무 짧으면 무슨 말인지 알 수 없다 — 라벨이지 설명이 아니다. */
const MIN_REASON_LENGTH = 12;

export function buildDemandEvidence(input: {
  keyword: string;
  expansions: readonly string[];
  volumes: ReadonlyMap<string, number>;
  serpSections: readonly string[];
}): DemandEvidence {
  const expansions = input.expansions.filter(Boolean);
  const serpSections = input.serpSections.filter(Boolean);
  const measuredVolumes = input.volumes.size;

  /*
   * 근거 목록은 "이번에 실제로 잰 것"만 담는다. 자동완성을 못 받아 왔으면
   * 자동완성을 근거로 쓴 설명도 통과해선 안 된다 — 안 본 것을 봤다고 하는 셈이다.
   */
  const signals: string[] = [];
  if (expansions.length > 0) signals.push('자동완성');
  if (measuredVolumes > 0) signals.push('검색량');
  if (serpSections.length > 0) signals.push('SERP');

  return { keyword: input.keyword, signals, expansions, serpSections, measuredVolumes };
}

/**
 * 설명을 실측에 붙들어 맨다.
 *
 * 통과 조건은 둘 중 하나다:
 *   1. basis 가 이번에 잰 신호 이름과 맞는다
 *   2. 설명 본문이 실제 확장 검색어나 SERP 구획 이름을 직접 인용한다
 *
 * 2번을 두는 이유: 좋은 설명은 대개 근거를 문장 안에서 이미 짚는다
 * ("규격·안경·배경색을 따로 검색한다"). 라벨이 비었다고 버리면 아깝다.
 */
export function groundDemandReasons(
  reasons: readonly DemandReason[],
  evidence: DemandEvidence,
): DemandReason[] {
  const kept: DemandReason[] = [];
  for (const reason of reasons) {
    const text = String(reason?.text || '').replace(/\s+/g, ' ').trim();
    if (text.length < MIN_REASON_LENGTH) continue;

    /*
     * 빈 라벨은 어떤 신호와도 맞지 않는다. 안 그러면 ''.includes 규칙 탓에
     * 빈 문자열이 모든 신호에 "포함"되어 상투구가 전부 통과한다(실측으로 겪었다).
     */
    const basis = String(reason?.basis || '').trim();
    const basisMatch = basis.length === 0
      ? undefined
      : evidence.signals.find((signal) => basis.includes(signal) || signal.includes(basis));

    const quotesExpansion = evidence.expansions.some((expansion) => {
      // 확장 검색어 전체가 아니라 "메인 뒤에 붙는 말"만 인용해도 인정한다.
      const tail = expansion.replace(evidence.keyword, '').trim();
      return (tail.length >= 2 && text.includes(tail)) || (expansion.length >= 2 && text.includes(expansion));
    });
    const quotesSection = evidence.serpSections.some(
      (section) => section.length >= 2 && text.includes(section),
    );

    if (basisMatch || quotesExpansion || quotesSection) {
      kept.push({ text, basis: basisMatch || (quotesSection ? 'SERP' : '자동완성') });
    }
  }
  return kept;
}
