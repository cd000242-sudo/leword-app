import {
  rankRelatedKeywordCandidates,
  RelatedCandidateInput,
  RankedRelatedKeyword,
} from './keyword-relevance';

export interface KeywordExpansionRankOptions {
  limit?: number;
  minScore?: number;
  fallbackMinScore?: number;
  minKeep?: number;
  includeSeed?: boolean;
  ensureIntentCoverage?: boolean;
  intentCoverageMin?: number;
}

function normalizeKeyword(keyword: string): string {
  return String(keyword || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function compactKeyword(keyword: string): string {
  return normalizeKeyword(keyword).toLowerCase().replace(/\s+/g, '');
}

function isUsableExpansionKeyword(keyword: string): boolean {
  const kw = normalizeKeyword(keyword);
  if (kw.length < 2 || kw.length > 50) return false;
  if (/^[\d\s.,_-]+$/.test(kw)) return false;
  if (/[<>{}[\]\\]/.test(kw)) return false;
  if (/ㅋ{2,}|ㅎ{2,}|ㅠ{2,}|ㅜ{2,}/.test(kw)) return false;
  if (kw.split(/\s+/).length >= 8) return false;
  return true;
}

function getCandidateSources(candidate: RelatedCandidateInput): string[] {
  return Array.from(new Set([
    ...(candidate.sources || []),
    candidate.source || '',
  ].filter(Boolean)));
}

function mergeExpansionCandidate(
  current: RelatedCandidateInput,
  next: RelatedCandidateInput,
): RelatedCandidateInput {
  const sources = Array.from(new Set([
    ...getCandidateSources(current),
    ...getCandidateSources(next),
  ]));
  return {
    ...current,
    sources,
    source: sources[0],
    freq: Math.max(current.freq || 0, next.freq || 0, sources.length),
    monthlyVolume: Math.max(current.monthlyVolume || 0, next.monthlyVolume || 0) || undefined,
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const TRAILING_INTENTS = [
  '신청방법', '하는방법', '하는법', '복용시간', '주의사항',
  '추천', '후기', '리뷰', '가격', '비용', '비교', '순위', '랭킹',
  '신청', '조건', '대상', '자격', '조회', '확인', '서류', '지급일',
  '방법', '효능', '효과', '부작용', '성분', '복용법', '사이즈',
  '할인', '쿠폰', '코디', '세탁', '관리',
].sort((a, b) => b.length - a.length);

function stripTrailingIntent(seed: string): string {
  let out = normalizeKeyword(seed);
  for (const intent of TRAILING_INTENTS) {
    out = out.replace(new RegExp(`\\s*${escapeRegExp(intent)}$`, 'i'), '').trim();
  }
  return out || normalizeKeyword(seed);
}

type ExpansionDomain = 'policy' | 'supplement' | 'footwear' | 'entertainment' | 'generic';
export type PracticalIntentGroup =
  | 'eligibility'
  | 'apply'
  | 'timing'
  | 'documents'
  | 'lookup'
  | 'criteria'
  | 'review'
  | 'comparison'
  | 'price'
  | 'usage'
  | 'risk'
  | 'ingredients'
  | 'profile'
  | 'appearance'
  | 'watch'
  | 'reaction'
  | 'generic';

function detectExpansionDomain(seed: string, corpus = ''): ExpansionDomain {
  const compacted = compactKeyword(`${seed} ${corpus}`);
  if (/지원금|보조금|지원사업|정부지원|정책브리핑|정부24|보조금24|바우처|장려금|근로장려금|자녀장려금|급여|수당|기초연금|실업급여|주거급여|긴급복지|생계지원|소상공인|자영업자|청년월세|취업지원|에너지바우처|문화누리카드|민생회복|소비쿠폰|지역화폐|환급금/.test(compacted)) {
    return 'policy';
  }
  if (/영양제|건강기능식품|건기식|비타민|오메가3|유산균|프로바이오틱스|루테인|밀크씨슬|마그네슘|칼슘|철분|아연|엽산|콜라겐|홍삼/.test(compacted)) {
    return 'supplement';
  }
  if (/운동화|러닝화|스니커즈|워킹화|등산화|신발|나이키|아디다스|뉴발란스|아식스/.test(compacted)) {
    return 'footwear';
  }
  if (/아이돌|배우|가수|연예인|스타|걸그룹|보이그룹|컴백|공식입장|팬미팅|콘서트|시상식|드라마|예능|출연|직캠|공항패션|무대|프로필|인스타|소속사/.test(compacted)) {
    return 'entertainment';
  }
  return 'generic';
}

function inferExpansionDomain(seed: string, candidates: RelatedCandidateInput[]): ExpansionDomain {
  const seedDomain = detectExpansionDomain(seed);
  if (seedDomain !== 'generic') return seedDomain;

  const counts = new Map<ExpansionDomain, number>();
  const corpusKeywords = candidates
    .slice(0, 80)
    .map(candidate => candidate.keyword);
  for (const keyword of corpusKeywords) {
    const domain = detectExpansionDomain(keyword);
    if (domain === 'generic') continue;
    counts.set(domain, (counts.get(domain) || 0) + 1);
  }

  const rankedDomains = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  const [best, second] = rankedDomains;
  if (best && best[1] >= 2 && best[1] >= ((second?.[1] || 0) + 1)) return best[0];

  const corpus = corpusKeywords.join(' ');
  const compacted = compactKeyword(`${seed} ${corpus}`);
  if (
    /프로필|인스타|출연|출연진|나이|근황|소속사|다시보기|방송시간|앨범|콘서트|컴백|드라마|예능|공식입장|공항패션/.test(compacted)
  ) {
    return 'entertainment';
  }

  const mediaContextCount = (corpus.match(/사진|이미지|움짤|갤러리|배경화면|기사|뉴스/g) || []).length;
  const looksLikeShortKoreanName = /^[가-힣]{2,8}$/.test(normalizeKeyword(seed));
  const seedHasHardNonEntertainmentIntent = /지원금|보조금|신청|조건|자격|서류|가격|추천|후기|사이즈|복용|성분|효능/.test(compactKeyword(seed));
  const hardNonEntertainmentCandidateCount = corpusKeywords.filter(keyword =>
    /지원금|보조금|신청|조건|자격|서류|가격|추천|후기|사이즈|복용|성분|효능/.test(compactKeyword(keyword)),
  ).length;
  const hasHardNonEntertainmentIntent = seedHasHardNonEntertainmentIntent || hardNonEntertainmentCandidateCount >= 2;
  if (looksLikeShortKoreanName && mediaContextCount >= 3 && !hasHardNonEntertainmentIntent) {
    return 'entertainment';
  }

  return 'generic';
}

const DOMAIN_INTENTS: Record<ExpansionDomain, string[]> = {
  policy: ['대상', '지급일', '신청기간', '조건', '자격', '신청', '서류', '필요서류', '지원내용', '소득기준', '조회', '마감', '신청방법', '온라인신청', '지역별', '선정기준', '홈페이지', '전화번호', '발표일', '2026'],
  supplement: ['후기', '추천', '복용법', '부작용', '성분', '효능', '복용시간', '가격', '비교', '주의사항', '먹는법', '추천대상'],
  footwear: ['추천', '후기', '가격', '사이즈', '비교', '코디', '세탁', '관리', '착용감', '할인', '쿠션', '발볼'],
  entertainment: ['프로필', '인스타', '출연', '나이', '근황', '소속사', '공식입장', '드라마', '예능', '일정', '팬미팅', '예매', '티켓팅', '라인업', '출연진', '방송시간', '다시보기'],
  generic: ['추천', '후기', '가격', '비교', '방법', '장단점', '주의사항', '체크리스트', '2026', '최신'],
};

const DOMAIN_INTENT_GROUP_ORDER: Record<ExpansionDomain, PracticalIntentGroup[]> = {
  policy: ['eligibility', 'apply', 'timing', 'documents', 'lookup', 'criteria'],
  supplement: ['review', 'usage', 'risk', 'ingredients', 'price', 'comparison'],
  footwear: ['review', 'price', 'comparison', 'usage'],
  entertainment: ['profile', 'appearance', 'timing', 'watch', 'reaction'],
  generic: ['review', 'comparison', 'price', 'usage', 'risk'],
};

export function classifyPracticalIntentGroup(
  keyword: string,
  domainHint: ExpansionDomain | 'government-benefit' | 'entertainment-issue' = 'generic',
): PracticalIntentGroup {
  const kw = compactKeyword(keyword);
  const domain = domainHint === 'government-benefit'
    ? 'policy'
    : domainHint === 'entertainment-issue'
      ? 'entertainment'
      : domainHint;

  if (domain === 'policy') {
    if (/대상|자격|조건|누가|지원대상|제외대상/.test(kw)) return 'eligibility';
    if (/신청|접수|온라인신청|방법|홈페이지/.test(kw)) return 'apply';
    if (/기간|마감|지급일|일정|발표일|언제/.test(kw)) return 'timing';
    if (/서류|준비물|필요서류|제출/.test(kw)) return 'documents';
    if (/조회|확인|결과|발표|전화번호/.test(kw)) return 'lookup';
    if (/소득|기준|금액|선정|내역|지원금액/.test(kw)) return 'criteria';
  }

  if (domain === 'supplement') {
    if (/후기|추천|평점|리뷰/.test(kw)) return 'review';
    if (/복용|먹는법|복용법|복용시간|섭취|사용법/.test(kw)) return 'usage';
    if (/부작용|주의|위험|금기/.test(kw)) return 'risk';
    if (/성분|효능|효과|원료/.test(kw)) return 'ingredients';
    if (/가격|비용|할인|최저가/.test(kw)) return 'price';
    if (/비교|순위|차이|대체/.test(kw)) return 'comparison';
  }

  if (domain === 'footwear') {
    if (/후기|추천|착용감|리뷰/.test(kw)) return 'review';
    if (/가격|할인|쿠폰|최저가/.test(kw)) return 'price';
    if (/비교|순위|차이/.test(kw)) return 'comparison';
    if (/사이즈|코디|착샷|관리|발볼|쿠션/.test(kw)) return 'usage';
  }

  if (domain === 'entertainment') {
    if (/프로필|나이|인스타|소속사|키|본명/.test(kw)) return 'profile';
    if (/출연|출연진|드라마|예능|앨범|콘서트|라인업|공식입장/.test(kw)) return 'appearance';
    if (/일정|방송시간|공개일|발매|컴백|시상식/.test(kw)) return 'timing';
    if (/다시보기|ott|회차|줄거리|결말/.test(kw)) return 'watch';
    if (/반응|근황|논란|열애설|팬|후기/.test(kw)) return 'reaction';
  }

  if (/후기|추천|리뷰/.test(kw)) return 'review';
  if (/비교|순위|차이/.test(kw)) return 'comparison';
  if (/가격|비용|할인/.test(kw)) return 'price';
  if (/방법|사용법|체크리스트|하는법/.test(kw)) return 'usage';
  if (/주의|부작용|위험/.test(kw)) return 'risk';
  return 'generic';
}

function rebalancePracticalIntentCoverage(
  ranked: RankedRelatedKeyword[],
  limit: number,
  intentCoverageMin: number,
  domain: ExpansionDomain,
): RankedRelatedKeyword[] {
  if (ranked.length <= 1 || limit <= 1 || intentCoverageMin <= 1) return ranked.slice(0, limit);

  const groupOrder = DOMAIN_INTENT_GROUP_ORDER[domain] || DOMAIN_INTENT_GROUP_ORDER.generic;
  const desiredGroupCount = Math.min(
    groupOrder.length,
    Math.max(0, Math.min(intentCoverageMin, Math.ceil(limit * 0.65))),
  );
  if (desiredGroupCount <= 1) return ranked.slice(0, limit);

  const selected: RankedRelatedKeyword[] = [];
  const used = new Set<string>();
  const add = (item: RankedRelatedKeyword | undefined) => {
    if (!item) return;
    const key = compactKeyword(item.keyword);
    if (!key || used.has(key)) return;
    used.add(key);
    selected.push(item);
  };

  for (const group of groupOrder) {
    if (selected.length >= desiredGroupCount) break;
    add(ranked.find(item => classifyPracticalIntentGroup(item.keyword, domain) === group));
  }

  for (const item of ranked) {
    if (selected.length >= limit) break;
    add(item);
  }

  return selected.slice(0, limit);
}

export function buildPracticalIntentExpansions(seed: string, limit = 20, domainHint?: ExpansionDomain): string[] {
  const base = stripTrailingIntent(seed);
  if (!base) return [];

  const domain = domainHint || detectExpansionDomain(seed);
  const intents = DOMAIN_INTENTS[domain] || DOMAIN_INTENTS.generic;
  const out: string[] = [];
  const seen = new Set<string>();

  for (const intent of intents) {
    const keyword = `${base} ${intent}`.replace(/\s+/g, ' ').trim();
    const key = compactKeyword(keyword);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(keyword);
    if (out.length >= limit) break;
  }

  return out;
}

export function rankKeywordExpansionCandidates(
  seed: string,
  candidates: RelatedCandidateInput[],
  options: KeywordExpansionRankOptions = {},
): RankedRelatedKeyword[] {
  const limit = Math.max(1, Math.floor(Number(options.limit) || candidates.length || 50));
  const normalizedByKey = new Map<string, RelatedCandidateInput>();

  for (const candidate of candidates || []) {
    const keyword = normalizeKeyword(candidate.keyword);
    const key = compactKeyword(keyword);
    if (!keyword || !key) continue;
    if (!isUsableExpansionKeyword(keyword)) continue;
    const next = { ...candidate, keyword };
    const current = normalizedByKey.get(key);
    normalizedByKey.set(key, current ? mergeExpansionCandidate(current, next) : next);
  }

  const primaryMinScore = typeof options.minScore === 'number' ? options.minScore : 30;
  const fallbackMinScore = typeof options.fallbackMinScore === 'number' ? options.fallbackMinScore : 22;
  const minKeep = Math.max(0, Math.floor(Number(options.minKeep) || Math.min(8, limit)));
  const intentCoverageMin = Math.max(
    0,
    Math.min(limit, Math.floor(Number(options.intentCoverageMin) || minKeep)),
  );

  let inferredDomain = inferExpansionDomain(seed, Array.from(normalizedByKey.values()));

  const rankNormalized = (minScore: number) => rankRelatedKeywordCandidates(seed, Array.from(normalizedByKey.values()), {
    limit: Math.max(limit, 120),
    minScore,
    includeSeed: options.includeSeed === true,
  });

  const injectIntentFallbacks = () => {
    inferredDomain = inferExpansionDomain(seed, Array.from(normalizedByKey.values()));
    const fallbackSeeds = buildPracticalIntentExpansions(seed, Math.max(intentCoverageMin + 6, 18), inferredDomain);
    fallbackSeeds.forEach((keyword, index) => {
      const key = compactKeyword(keyword);
      if (!key || normalizedByKey.has(key)) return;
      normalizedByKey.set(key, {
        keyword,
        sources: ['intent-fallback'],
        source: 'intent-fallback',
        freq: 3,
        priority: Math.max(1, fallbackSeeds.length - index),
      });
    });
  };

  let ranked = rankNormalized(primaryMinScore);

  if (options.ensureIntentCoverage === true) {
    injectIntentFallbacks();
    ranked = rankNormalized(primaryMinScore);
  }

  if (ranked.length < Math.min(minKeep, limit)) {
    ranked = rankNormalized(fallbackMinScore);
  }

  if (options.ensureIntentCoverage === true) {
    ranked = rebalancePracticalIntentCoverage(ranked, limit, intentCoverageMin, inferredDomain);
  }

  return ranked.slice(0, limit);
}

export function rankKeywordExpansionStrings(
  seed: string,
  keywords: string[],
  options: KeywordExpansionRankOptions & { source?: string; sources?: string[] } = {},
): string[] {
  const sources = options.sources || (options.source ? [options.source] : ['autocomplete']);
  return rankKeywordExpansionCandidates(
    seed,
    (keywords || []).map(keyword => ({ keyword, sources })),
    options,
  ).map(item => item.keyword);
}
