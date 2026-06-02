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
  const corpus = candidates
    .slice(0, 80)
    .map(candidate => candidate.keyword)
    .join(' ');
  return detectExpansionDomain(seed, corpus);
}

const DOMAIN_INTENTS: Record<ExpansionDomain, string[]> = {
  policy: ['대상', '지급일', '신청기간', '조건', '자격', '신청', '서류', '필요서류', '지원내용', '소득기준', '조회', '마감', '신청방법', '온라인신청', '지역별', '선정기준', '홈페이지', '전화번호', '발표일', '2026'],
  supplement: ['후기', '추천', '복용법', '부작용', '성분', '효능', '복용시간', '가격', '비교', '주의사항', '먹는법', '추천대상'],
  footwear: ['추천', '후기', '가격', '사이즈', '비교', '코디', '세탁', '관리', '착용감', '할인', '쿠션', '발볼'],
  entertainment: ['프로필', '인스타', '출연', '나이', '근황', '소속사', '공식입장', '드라마', '예능', '일정', '팬미팅', '예매', '티켓팅', '라인업', '출연진', '방송시간', '다시보기'],
  generic: ['추천', '후기', '가격', '비교', '방법', '장단점', '주의사항', '체크리스트', '2026', '최신'],
};

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

  const rankNormalized = (minScore: number) => rankRelatedKeywordCandidates(seed, Array.from(normalizedByKey.values()), {
    limit: Math.max(limit, 120),
    minScore,
    includeSeed: options.includeSeed === true,
  });

  const injectIntentFallbacks = () => {
    const domain = inferExpansionDomain(seed, Array.from(normalizedByKey.values()));
    const fallbackSeeds = buildPracticalIntentExpansions(seed, Math.max(intentCoverageMin + 6, 18), domain);
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
