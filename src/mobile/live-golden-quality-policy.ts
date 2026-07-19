export type LiveGoldenQualityReasonCode =
  | 'malformed-present'
  | 'platform-residue-present'
  | 'obvious-head-term'
  | 'generic-yearly-template'
  | 'sentence-residue-present'
  | 'hidden-provenance-missing';

export type LiveGoldenHiddenProvenanceSignal =
  | 'server-exact-autocomplete'
  | 'second-hop-autocomplete'
  | 'real-demand-autocomplete'
  | 'exact-related-keyword'
  | 'reviewed-home-briefing'
  | 'concrete-problem'
  | 'multiple-discovery-sources'
  | 'validated-modifier';

export interface LiveGoldenKeywordIdentity {
  /** Query text used for measurement/cache binding. Internal spacing is preserved. */
  exactQueryKey: string;
  /** Spelling/spacing aliases for one search intent collapse to this key. */
  semanticIntentKey: string;
  /** Presentation/action suffixes collapse to this broader board-diversity family. */
  diversityFamilyKey: string;
}

export interface LiveGoldenQualityCandidate {
  keyword: string;
  evidence?: readonly string[];
  /** Independent discovery origins only; measurement providers must not be passed here. */
  discoverySources?: readonly string[];
  concreteProblem?: boolean;
  validatedModifier?: boolean;
}

export interface LiveGoldenHiddenProvenanceAssessment {
  passed: boolean;
  signals: LiveGoldenHiddenProvenanceSignal[];
  reasonCodes: LiveGoldenQualityReasonCode[];
}

export interface LiveGoldenKeywordQualityAssessment {
  eligible: boolean;
  identity: LiveGoldenKeywordIdentity;
  hiddenProvenance: LiveGoldenHiddenProvenanceAssessment;
  reasonCodes: LiveGoldenQualityReasonCode[];
}

/** Human-review cohorts must contain no repeated diversity family. */
export const LIVE_GOLDEN_STRICT_REVIEW_MAXIMUM_PER_FAMILY = 1 as const;

const PLATFORM_TOKEN = '(?:복지로|정부24|홈택스|손택스|고용24|워크넷|국민비서)';
const ACTION_BEFORE_PLATFORM_TAIL_RE = new RegExp(
  `(?:신청방법|조회방법|발급방법|청구방법|예약방법|사용방법|신청|조회|발급|청구|예약|확인|방법)(?:에서|은|는)?${PLATFORM_TOKEN}$`,
  'u',
);
const MALFORMED_POSSESSIVE_INSURANCE_RE = /^내(?:의료실비보험|실비보험|실손보험)(?:조회|청구|확인|가입|비교)?$/u;
const OBVIOUS_HEAD_TERM_RE = /^(?:지원금|정부지원금|정책|정부정책|혜택|정부혜택|근로장려금|자녀장려금|문화누리카드|청년도약계좌|내일배움카드|실업급여|부모급여|기초연금|에너지바우처|농식품바우처|청년미래적금|소상공인지원금|소상공인정책자금|실비보험|4대보험|제주렌터카|자동차에어컨|로봇청소기)$/u;
const GENERIC_YEARLY_TEMPLATE_RE = /^20\d{2}년?(?:(?:전국|정부|국민|지역|생활|민생|복지|청년|소상공인))?(?:지원금|정책|혜택)(?:신청|대상|자격|조건|조회|정리|총정리|안내)?$/u;
const GENERIC_YEARLY_POLICY_HEADS = [
  '지원금', '정부지원금', '정책', '정부정책', '혜택', '정부혜택',
  '근로장려금', '자녀장려금', '문화누리카드', '청년미래적금', '청년도약계좌',
  '소상공인지원금', '소상공인정책자금', '실업급여', '부모급여', '기초연금',
  '에너지바우처', '국민내일배움카드', '내일배움카드', '건강보험', '4대보험',
] as const;
const GENERIC_YEARLY_POLICY_ACTIONS = [
  '신청', '신청방법', '지급일', '지급일조회', '대상', '대상자', '자격', '자격조건',
  '조건', '조회', '서류', '필요서류', '금액', '지급액', '지급금액', '기간', '일정',
  '사용처', '발급', '혜택',
] as const;
const SENTENCE_ENDING_RESIDUE_RE = /(?:[?!.~…]+|(?:인가요|일까요|되나요|하나요|할까요|있나요|없나요|맞나요|가능한가요|어떻게\s*하나요|어떻게\s*해야\s*하나요|알려\s*주세요|알려줘|궁금해요|궁금합니다|부탁드립니다|해\s*주세요|해야\s*합니다|하고\s*싶어요|하고\s*싶습니다|입니다|합니다|됩니다|했어요|해요)(?:[?!.~…]+)?)$/u;
const SERVER_EXACT_AUTOCOMPLETE_RE = /^server[-_: ]*autocomplete[-_: ]*exact[-_: ]*measured$/iu;
const LEGACY_SERVER_EXACT_AUTOCOMPLETE_RE = /^autocomplete[-_: ]*exact[-_: ]*measured$/iu;
const SECOND_HOP_AUTOCOMPLETE_RE = /^(?:autocomplete[-_: ]*second[-_: ]*hop|second[-_: ]*hop[-_: ]*autocomplete)$/iu;
const REAL_DEMAND_AUTOCOMPLETE_RE = /^real[-_: ]*demand[-_: ]*(?:echo|extension|verified)$/iu;
const EXACT_RELATED_KEYWORD_RE = /^(?:related[-_: ]*keyword[-_: ]*exact|exact[-_: ]*related[-_: ]*keyword)$/iu;
const REVIEWED_HOME_BRIEFING_RE = /^home[-_: ]*keyword[-_: ]*briefing[-_: ]*reviewed$/iu;
const CONCRETE_PROBLEM_RE = /^(?:concrete[-_: ]*problem|problem[-_: ]*specific|follow[-_: ]*up[-_: ]*intent)$/iu;
const VALIDATED_MODIFIER_RE = /^(?:validated[-_: ]*modifier|modifier[-_: ]*(?:demand[-_: ]*)?validated|differentiating[-_: ]*modifier[-_: ]*validated)$/iu;
const MULTIPLE_SOURCE_MARKER_RE = /^(?:multi(?:ple)?[-_: ]*source|cross[-_: ]*source|discovery[-_: ]*source[-_: ]*count[-_: =]*[2-9]\d*)$/iu;
const DISCOVERY_SOURCE_MARKER_RE = /^discovery[-_: ]*source[-_: =]+(.+)$/iu;

const DIVERSITY_LEADING_PLATFORM_RE = /^(?:복지로|정부24|홈택스|손택스|고용24|워크넷|국민비서)/u;
const DIVERSITY_LEADING_YEAR_RE = /^20\d{2}년?/u;
const DIVERSITY_PRESENTATION_SUFFIX_RE = /(?:신청방법|조회방법|발급방법|청구방법|예약방법|사용방법|가격비교|최저가|금액조회|지급액조회|사용처조회|자격조회|신청|가입|조회|발급|청구|예약|예매|추천|후기|사용처|자격|대상|조건|서류|지급일|비용|가격|방법)$/u;

function normalizeExactQuery(value: unknown): string {
  return String(value ?? '')
    .normalize('NFKC')
    .trim()
    .replace(/\s+/gu, ' ')
    .toLocaleLowerCase('ko-KR');
}

function compactQuery(value: unknown): string {
  return normalizeExactQuery(value).replace(/[^0-9a-z가-힣]/giu, '');
}

function normalizeSemanticAliases(value: string): string {
  return value
    .replace(/렌트카/gu, '렌터카')
    .replace(/(?:의료실비보험|실손보험)/gu, '실비보험')
    .replace(/국민내일배움카드/gu, '내일배움카드')
    .replace(/^내일배움카드사용처조회$/u, '내일배움카드사용처')
    .replace(/^사대보험/u, '4대보험')
    .replace(/^근로장려금(?:금액|지급금액)조회$/u, '근로장려금지급액조회')
    .replace(/^강아지스케일링비용$/u, '강아지치석제거비용');
}

function normalizeEvidence(evidence: readonly string[] | undefined): string[] {
  return (evidence || [])
    .map((value) => normalizeExactQuery(value))
    .filter(Boolean);
}

/**
 * Proof markers below are assertions made by a trusted server-side discovery
 * or verification path. They are reserved at every client/file ingest
 * boundary; raw clients may still submit ordinary measurement evidence.
 */
export function isReservedLiveGoldenHiddenProofEvidence(value: unknown): boolean {
  const evidence = normalizeExactQuery(value);
  if (!evidence) return false;
  return SERVER_EXACT_AUTOCOMPLETE_RE.test(evidence)
    || LEGACY_SERVER_EXACT_AUTOCOMPLETE_RE.test(evidence)
    || SECOND_HOP_AUTOCOMPLETE_RE.test(evidence)
    || REAL_DEMAND_AUTOCOMPLETE_RE.test(evidence)
    || EXACT_RELATED_KEYWORD_RE.test(evidence)
    || REVIEWED_HOME_BRIEFING_RE.test(evidence)
    || CONCRETE_PROBLEM_RE.test(evidence)
    || VALIDATED_MODIFIER_RE.test(evidence)
    || MULTIPLE_SOURCE_MARKER_RE.test(evidence)
    || DISCOVERY_SOURCE_MARKER_RE.test(evidence);
}

export function stripUntrustedLiveGoldenHiddenEvidence(
  evidence: readonly string[] | undefined,
): string[] {
  return (evidence || [])
    .map((value) => String(value ?? '').trim())
    .filter(Boolean)
    .filter((value) => !isReservedLiveGoldenHiddenProofEvidence(value));
}

function uniqueDiscoverySources(candidate: LiveGoldenQualityCandidate, evidence: readonly string[]): string[] {
  const explicit = (candidate.discoverySources || []).map((value) => normalizeExactQuery(value));
  const embedded = evidence.flatMap((value) => {
    const match = value.match(DISCOVERY_SOURCE_MARKER_RE);
    return match?.[1] ? [normalizeExactQuery(match[1])] : [];
  });
  return [...new Set([...explicit, ...embedded].filter(Boolean))];
}

export function liveGoldenExactQueryKey(keyword: string): string {
  return normalizeExactQuery(keyword);
}

export function liveGoldenSemanticIntentKey(keyword: string): string {
  return normalizeSemanticAliases(compactQuery(keyword));
}

export function liveGoldenDiversityFamilyKey(keyword: string): string {
  const semanticIntentKey = liveGoldenSemanticIntentKey(keyword);
  let family = semanticIntentKey
    .replace(DIVERSITY_LEADING_YEAR_RE, '')
    .replace(DIVERSITY_LEADING_PLATFORM_RE, '');

  let previous = '';
  while (family && family !== previous) {
    previous = family;
    family = family.replace(DIVERSITY_PRESENTATION_SUFFIX_RE, '');
  }

  return family || semanticIntentKey;
}

export function liveGoldenKeywordIdentity(keyword: string): LiveGoldenKeywordIdentity {
  return {
    exactQueryKey: liveGoldenExactQueryKey(keyword),
    semanticIntentKey: liveGoldenSemanticIntentKey(keyword),
    diversityFamilyKey: liveGoldenDiversityFamilyKey(keyword),
  };
}

export function isMalformedLiveGoldenKeyword(keyword: string): boolean {
  const compact = compactQuery(keyword);
  if (!compact) return true;
  return MALFORMED_POSSESSIVE_INSURANCE_RE.test(compact);
}

export function hasLiveGoldenPlatformTailResidue(keyword: string): boolean {
  return ACTION_BEFORE_PLATFORM_TAIL_RE.test(compactQuery(keyword));
}

export function isObviousLiveGoldenHeadTerm(keyword: string): boolean {
  return OBVIOUS_HEAD_TERM_RE.test(normalizeSemanticAliases(compactQuery(keyword)));
}

export function isGenericYearlyLiveGoldenTemplate(keyword: string): boolean {
  const compact = compactQuery(keyword);
  if (GENERIC_YEARLY_TEMPLATE_RE.test(compact)) return true;
  const yearMatch = compact.match(/^20\d{2}(?:년)?(.+)$/u);
  const remainder = yearMatch?.[1] || '';
  if (!remainder) return false;
  return GENERIC_YEARLY_POLICY_HEADS.some((head) => (
    GENERIC_YEARLY_POLICY_ACTIONS.some((action) => remainder === `${head}${action}`)
  ));
}

export function hasLiveGoldenSentenceResidue(keyword: string): boolean {
  return SENTENCE_ENDING_RESIDUE_RE.test(normalizeExactQuery(keyword));
}

export function assessLiveGoldenHiddenProvenance(
  candidate: LiveGoldenQualityCandidate,
): LiveGoldenHiddenProvenanceAssessment {
  const evidence = normalizeEvidence(candidate.evidence);
  const signals: LiveGoldenHiddenProvenanceSignal[] = [];

  if (evidence.some((value) => (
    SERVER_EXACT_AUTOCOMPLETE_RE.test(value)
    || LEGACY_SERVER_EXACT_AUTOCOMPLETE_RE.test(value)
  ))) {
    signals.push('server-exact-autocomplete');
  }
  if (evidence.some((value) => SECOND_HOP_AUTOCOMPLETE_RE.test(value))) {
    signals.push('second-hop-autocomplete');
  }
  if (evidence.some((value) => REAL_DEMAND_AUTOCOMPLETE_RE.test(value))) {
    signals.push('real-demand-autocomplete');
  }
  if (evidence.some((value) => EXACT_RELATED_KEYWORD_RE.test(value))) {
    signals.push('exact-related-keyword');
  }
  if (evidence.some((value) => REVIEWED_HOME_BRIEFING_RE.test(value))) {
    signals.push('reviewed-home-briefing');
  }
  if (candidate.concreteProblem === true || evidence.some((value) => CONCRETE_PROBLEM_RE.test(value))) {
    signals.push('concrete-problem');
  }
  if (
    uniqueDiscoverySources(candidate, evidence).length >= 2
    || evidence.some((value) => MULTIPLE_SOURCE_MARKER_RE.test(value))
  ) {
    signals.push('multiple-discovery-sources');
  }
  if (candidate.validatedModifier === true || evidence.some((value) => VALIDATED_MODIFIER_RE.test(value))) {
    signals.push('validated-modifier');
  }

  const deduplicatedSignals = [...new Set(signals)];
  const passed = deduplicatedSignals.length > 0;
  return {
    passed,
    signals: deduplicatedSignals,
    reasonCodes: passed ? [] : ['hidden-provenance-missing'],
  };
}

export function assessLiveGoldenKeywordQuality(
  candidate: LiveGoldenQualityCandidate,
): LiveGoldenKeywordQualityAssessment {
  const hiddenProvenance = assessLiveGoldenHiddenProvenance(candidate);
  const reasonCodes: LiveGoldenQualityReasonCode[] = [];

  if (isMalformedLiveGoldenKeyword(candidate.keyword)) {
    reasonCodes.push('malformed-present');
  }
  if (hasLiveGoldenPlatformTailResidue(candidate.keyword)) {
    reasonCodes.push('platform-residue-present');
  }
  if (isObviousLiveGoldenHeadTerm(candidate.keyword)) {
    reasonCodes.push('obvious-head-term');
  }
  if (isGenericYearlyLiveGoldenTemplate(candidate.keyword)) {
    reasonCodes.push('generic-yearly-template');
  }
  if (hasLiveGoldenSentenceResidue(candidate.keyword)) {
    reasonCodes.push('sentence-residue-present');
  }
  reasonCodes.push(...hiddenProvenance.reasonCodes);

  return {
    eligible: reasonCodes.length === 0,
    identity: liveGoldenKeywordIdentity(candidate.keyword),
    hiddenProvenance,
    reasonCodes: [...new Set(reasonCodes)],
  };
}

/**
 * Deterministic board-family cap. A quantity target is never allowed to relax
 * the cap; returning fewer rows is the explicit signal that more discovery is
 * required.
 */
export function selectLiveGoldenDiverseCandidates<T extends { keyword: string }>(
  candidates: readonly T[],
  target: number,
  maximumPerFamily = 2,
): T[] {
  const limit = Math.max(0, Math.floor(Number(target) || 0));
  const familyLimit = Math.max(1, Math.floor(Number(maximumPerFamily) || 1));
  const selected: T[] = [];
  const familyCounts = new Map<string, number>();
  for (const candidate of candidates || []) {
    if (selected.length >= limit) break;
    const familyKey = liveGoldenDiversityFamilyKey(candidate.keyword);
    if (!familyKey) continue;
    const count = familyCounts.get(familyKey) || 0;
    if (count >= familyLimit) continue;
    familyCounts.set(familyKey, count + 1);
    selected.push(candidate);
  }
  return selected;
}

export interface LiveGoldenBalancedSelectionOptions<T> {
  target: number;
  maximumPerFamily?: number;
  categoryKey: (candidate: T) => string;
  categoryOrder?: readonly string[];
  minimumPerCategory?: number;
  maximumCategoryShare?: number;
}

/**
 * Deterministic category-deficit selection for the review/gate inventory.
 * Input order remains the score order used for ties and the fill pass. Neither
 * the semantic-family cap nor the category-share cap is relaxed to hit target.
 */
export function selectLiveGoldenBalancedCandidates<T extends { keyword: string }>(
  candidates: readonly T[],
  options: LiveGoldenBalancedSelectionOptions<T>,
): T[] {
  const target = Math.max(0, Math.floor(Number(options.target) || 0));
  if (target === 0) return [];
  const familyLimit = Math.max(1, Math.floor(Number(options.maximumPerFamily) || 2));
  const minimumPerCategory = Math.max(0, Math.floor(Number(options.minimumPerCategory) || 0));
  const maximumCategoryShare = Math.min(1, Math.max(0, Number(options.maximumCategoryShare) || 0));
  const categoryLimit = maximumCategoryShare > 0
    ? Math.floor(target * maximumCategoryShare)
    : target;
  if (categoryLimit <= 0) return [];

  const categoryCandidates = new Map<string, T[]>();
  const encounteredCategories: string[] = [];
  for (const candidate of candidates || []) {
    const category = String(options.categoryKey(candidate) ?? '').trim();
    if (!category) continue;
    if (!categoryCandidates.has(category)) {
      categoryCandidates.set(category, []);
      encounteredCategories.push(category);
    }
    categoryCandidates.get(category)!.push(candidate);
  }
  const orderedCategories = [
    ...new Set([
      ...(options.categoryOrder || []).map((value) => String(value ?? '').trim()).filter(Boolean),
      ...encounteredCategories,
    ]),
  ].filter((category) => categoryCandidates.has(category));

  const selected: T[] = [];
  const selectedReferences = new Set<T>();
  const semanticKeys = new Set<string>();
  const familyCounts = new Map<string, number>();
  const categoryCounts = new Map<string, number>();
  const trySelect = (candidate: T): boolean => {
    if (selected.length >= target || selectedReferences.has(candidate)) return false;
    const category = String(options.categoryKey(candidate) ?? '').trim();
    if (!category || (categoryCounts.get(category) || 0) >= categoryLimit) return false;
    const semanticKey = liveGoldenSemanticIntentKey(candidate.keyword);
    const familyKey = liveGoldenDiversityFamilyKey(candidate.keyword);
    if (!semanticKey || !familyKey || semanticKeys.has(semanticKey)) return false;
    if ((familyCounts.get(familyKey) || 0) >= familyLimit) return false;
    selected.push(candidate);
    selectedReferences.add(candidate);
    semanticKeys.add(semanticKey);
    familyCounts.set(familyKey, (familyCounts.get(familyKey) || 0) + 1);
    categoryCounts.set(category, (categoryCounts.get(category) || 0) + 1);
    return true;
  };

  // Fill category deficits in rounds so an early/high-score category cannot
  // consume the entire target before every available core category activates.
  const cursors = new Map<string, number>();
  for (let round = 0; round < Math.min(minimumPerCategory, categoryLimit); round += 1) {
    for (const category of orderedCategories) {
      if (selected.length >= target) break;
      const rows = categoryCandidates.get(category) || [];
      let cursor = cursors.get(category) || 0;
      while (cursor < rows.length && !trySelect(rows[cursor])) cursor += 1;
      cursors.set(category, cursor + 1);
    }
  }

  // Finish in original score order while retaining every hard cap.
  for (const candidate of candidates || []) {
    if (selected.length >= target) break;
    trySelect(candidate);
  }
  return selected;
}
