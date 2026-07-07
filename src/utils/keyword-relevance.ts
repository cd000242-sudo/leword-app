export interface RelatedCandidateInput {
  keyword: string;
  sources?: string[];
  source?: string;
  freq?: number;
  monthlyVolume?: number;
  priority?: number;
}

export interface RankedRelatedKeyword extends RelatedCandidateInput {
  keyword: string;
  score: number;
  reasons: string[];
}

export interface RankRelatedOptions {
  limit?: number;
  minScore?: number;
  includeSeed?: boolean;
}

const INTENT_TOKENS = new Set([
  '추천', '후기', '리뷰', '가격', '비용', '비교', '순위', '랭킹', '베스트', '인기',
  '방법', '하는법', '신청', '조건', '대상', '조회', '확인', '정리', '총정리',
  '종류', '장단점', '차이', '뜻', '의미', '공식', '홈페이지', '바로가기',
]);

const STOP_TOKENS = new Set([
  '그리고', '하지만', '관련', '정보', '뉴스', '기사', '블로그', '카페', '영상',
  '사진', '이미지', '내용', '자료', '보기', '이동', '바로', '가기',
]);

const SOURCE_WEIGHT: Record<string, number> = {
  'naver-relkwd': 34,
  searchad: 34,
  autocomplete: 28,
  'naver-pc': 28,
  'naver-mobile': 28,
  'naver-suffix': 23,
  'naver-jamo': 20,
  'naver-shopping': 14,
  'daum-suggest': 22,
  'google-suggest': 22,
  'naver-smartblock': 12,
  'naver-ai-briefing': 10,
  'naver-related-question': 18,
  'completed-pool': 34,
  'mindmap-completed': 36,
  'rich-feed-completed': 18,
  sibling: 24,
  mindmap: 16,
  'intent-fallback': 16,
  spider: 8,
  'title-extract': 6,
};

const DOMAIN_GROUPS: Array<{ name: string; patterns: RegExp[] }> = [
  {
    name: 'supplement',
    patterns: [
      /영양제|건강기능식품|건기식|비타민|멀티비타민|종합비타민|오메가\s*3|오메가3/i,
      /유산균|프로바이오틱스|루테인|밀크씨슬|마그네슘|칼슘|철분|아연|엽산/i,
      /콜라겐|프로폴리스|코엔자임|코큐텐|비오틴|홍삼|복용법|복용시간|부족\s*증상/i,
    ],
  },
  {
    name: 'government-benefit',
    patterns: [
      /지원금|보조금|지원사업|정부지원|정부24|보조금24|바우처|소비쿠폰/i,
      /장려금|근로장려금|자녀장려금|급여|수당|기초연금|실업급여|주거급여|교육급여/i,
      /긴급복지|생계지원|소상공인|자영업자|청년월세|청년도약|취업지원|국민취업지원/i,
      /에너지바우처|문화누리카드|평생교육바우처|출산지원|육아휴직급여/i,
    ],
  },
  {
    name: 'footwear',
    patterns: [
      /운동화|러닝화|스니커즈|워킹화|등산화|신발|나이키|아디다스|뉴발란스|아식스/i,
    ],
  },
  {
    name: 'skincare',
    patterns: [
      /스팟\s*엑스|스팟엑스|스팟|세럼|에센스|앰플|크림|토너|패드|피부|스킨|더마|나이아신|pdrn|글루타|글루타샷/i,
      /쥐젖|비립종|편평사마귀|여드름|어드름|잡티|기미|미백|모공|트러블|진정|재생/i,
    ],
  },
  {
    name: 'entertainment-issue',
    patterns: [
      /아이돌|배우|가수|연예인|컴백|공식입장|팬미팅|콘서트|시상식|드라마|예능|출연/i,
    ],
  },
];

export function normalizeCandidateKeyword(value: string): string {
  return String(value || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&quot;|&#34;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;|&gt;/g, ' ')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/[「」『』“”‘’]/g, '')
    .replace(/[|·•▶▷◆◇■□●○★☆※]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function compact(value: string): string {
  return normalizeCandidateKeyword(value).toLowerCase().replace(/\s+/g, '');
}

function stripTrailingQueryIntent(compacted: string): string {
  return compacted.replace(/(후기|리뷰|내돈내산|추천|가격|비교|방법|사용법|효과|부작용|종류|뜻|정리|문제|사례|원인|최신|faq)$/i, '');
}

export function tokenizeKeyword(value: string): string[] {
  const normalized = normalizeCandidateKeyword(value).toLowerCase();
  const tokens = normalized.match(/[가-힣]{2,}|[a-z0-9]{2,}/gi) || [];
  const out: string[] = [];
  for (const raw of tokens) {
    const token = raw.toLowerCase();
    if (STOP_TOKENS.has(token)) continue;
    out.push(token);
    for (const suffix of INTENT_TOKENS) {
      if (token.length > suffix.length + 1 && token.endsWith(suffix)) {
        const stem = token.slice(0, -suffix.length);
        if (stem.length >= 2 && !STOP_TOKENS.has(stem)) out.push(stem);
      }
    }
  }
  return Array.from(new Set(out));
}

function coreTokens(tokens: string[]): string[] {
  const core = tokens.filter(token => !INTENT_TOKENS.has(token) && !STOP_TOKENS.has(token));
  return core.length > 0 ? core : tokens;
}

function countOverlap(a: string[], b: string[]): number {
  const bs = new Set(b);
  return a.filter(token => bs.has(token)).length;
}

function detectDomains(value: string): string[] {
  const normalized = normalizeCandidateKeyword(value);
  const compacted = normalized.replace(/\s+/g, '');
  const domains: string[] = [];
  for (const group of DOMAIN_GROUPS) {
    if (group.patterns.some(pattern => pattern.test(normalized) || pattern.test(compacted))) {
      domains.push(group.name);
    }
  }
  return domains;
}

function hasCommercialIntent(value: string): boolean {
  return /추천|후기|리뷰|가격|비용|비교|순위|랭킹|할인|쿠폰|구매|구입|신청|조건|대상|조회|방법|종류/.test(value);
}

const PERSON_CONTEXT_RE = /(나이|부모|가족|아버지|어머니|엄마|아빠|형제|남편|아내|배우자|결혼|열애|프로필|인스타|인스타그램|근황|출연|출연진|예능|드라마|다시보기|방송시간|방송|유튜브|배우|가수|개그맨|셰프|작가|감독|선수|아이돌|소속사|학력|학교|고향|일정|팬미팅|공식입장|무대|앨범)/;
const PERSON_BAD_INTENT_RE = /(가격|비용|견적|시세|추천|비교|순위|랭킹|할인|쿠폰|구매|구입|리뷰|후기|방법|사용법|장단점|종류)/;
const NON_PERSON_SINGLE_TOKEN_RE = /(제네시스|카니발|아반떼|쏘렌토|아이오닉|그랜저|임플란트|에어컨|냉장고|세탁기|청소기|제습기|영양제|비타민|유산균|오메가|노트북|운동화|향수|화장품|지원금|보조금|대출|보험|부동산|아파트|청약)/;

const HOUSING_CONTEXT_RE = /(?:\uC6D0\uB8F8|\uC6D4\uC138|\uC804\uC138|\uBCF4\uC99D\uAE08|\uAD00\uB9AC\uBE44|\uC624\uD53C\uC2A4\uD154|\uC790\uCDE8\uBC29|\uC784\uB300\uCC28|\uC804\uC785\uC2E0\uACE0|\uD655\uC815\uC77C\uC790|\uC785\uC8FC|\uC774\uC0AC|\uBD80\uB3D9\uC0B0)/;
const PRODUCT_LAUNCH_CONTEXT_RE = /(?:\uCD9C\uC2DC\uC77C|\uBC1C\uB9E4\uC77C|\uC0AC\uC804\uC608\uC57D|\uACF5\uC2DD\uC601\uC0C1|\uC2A4\uD399|\uCD9C\uC2DC|\uACF5\uAC1C\uC77C)/;
const APPLIANCE_PURCHASE_TAIL_RE = /(?:\uCD5C\uC800\uAC00|\uAD6C\uB9E4\uCC98|\uD560\uC778|\uCFE0\uD3F0|\uC124\uCE58\uBE44|\uC800\uC18C\uC74C|\uD544\uD130|\uC2A4\uD399)/;
const APPLIANCE_BASE_RE = /(?:\uC5D0\uC5B4\uCEE8|\uC81C\uC2B5\uAE30|\uACF5\uAE30\uCCAD\uC815\uAE30|\uCCAD\uC18C\uAE30|\uB85C\uBD07\uCCAD\uC18C\uAE30|\uC120\uD48D\uAE30|\uB0C9\uC7A5\uACE0|\uC138\uD0C1\uAE30|\uAC74\uC870\uAE30)/;
const TERMINAL_POLICY_CHAIN_RE = /(?:\uC0AC\uC6A9\uCC98|\uAC00\uB9F9\uC810|\uC794\uC561\uC870\uD68C).{0,10}(?:\uC9C0\uAE09\uC77C|\uB9C8\uAC10\uC77C|\uC18C\uB4DD\uAE30\uC900|\uC2E0\uCCAD\s*(?:\uBC29\uBC95|\uB300\uC0C1)|\uC81C\uC678\s*\uB300\uC0C1|\uD544\uC694\s*\uC11C\uB958)/;
const TERMINAL_PRODUCT_CHAIN_RE = /(?:\uAD6C\uB9E4\uCC98|\uCD5C\uC800\uAC00|\uD560\uC778|\uCFE0\uD3F0|\uAC00\uACA9\uBE44\uAD50|\uBE44\uC6A9\uBE44\uAD50).{0,12}(?:\uC6D0\uB8F8|\uC790\uCDE8\uBC29|\uC804\uAE30\uC694\uAE08|\uC18C\uC74C|\uC800\uC18C\uC74C|\uC124\uCE58\uBE44|\uD544\uD130|\uC2A4\uD399|\uCD9C\uC2DC\uC77C|\uBC1C\uB9E4\uC77C)/;
const TERMINAL_POLICY_COMPACT_CHAIN_RE = /(?:\uC0AC\uC6A9\uCC98|\uAC00\uB9F9\uC810|\uC794\uC561\uC870\uD68C)(?:\uC9C0\uAE09\uC77C|\uB9C8\uAC10\uC77C|\uC18C\uB4DD\uAE30\uC900|\uC2E0\uCCAD\uBC29\uBC95|\uC2E0\uCCAD\uB300\uC0C1|\uC81C\uC678\uB300\uC0C1|\uD544\uC694\uC11C\uB958)|(?:\uC9C0\uAE09\uC77C|\uB9C8\uAC10\uC77C|\uC18C\uB4DD\uAE30\uC900|\uC2E0\uCCAD\uBC29\uBC95|\uC2E0\uCCAD\uB300\uC0C1|\uC81C\uC678\uB300\uC0C1|\uD544\uC694\uC11C\uB958)(?:\uC0AC\uC6A9\uCC98|\uAC00\uB9F9\uC810|\uC794\uC561\uC870\uD68C)/;
const PRODUCT_HOUSING_CONTEXT_CHAIN_RE = /(?:(?:\uC6D0\uB8F8|\uC790\uCDE8\uBC29).{0,12}(?:\uCD9C\uC2DC\uC77C|\uBC1C\uB9E4\uC77C).{0,10}(?:\uBE44\uC6A9|\uAC00\uACA9|\uAD6C\uB9E4\uCC98|\uCD5C\uC800\uAC00|\uD560\uC778|\uCFE0\uD3F0)|(?:\uC5D0\uC5B4\uCEE8|\uC81C\uC2B5\uAE30|\uACF5\uAE30\uCCAD\uC815\uAE30|\uCCAD\uC18C\uAE30|\uB85C\uBD07\uCCAD\uC18C\uAE30|\uB178\uD2B8\uBD81|\uBAA8\uB2C8\uD130|\uC544\uC774\uD3F0|\uAC24\uB7ED\uC2DC|\uB0C9\uC7A5\uACE0|\uC138\uD0C1\uAE30|\uAC74\uC870\uAE30|\uC120\uD48D\uAE30|\uC11C\uD058\uB808\uC774\uD130)(?=.*(?:\uC6D0\uB8F8|\uC790\uCDE8\uBC29))(?=.*(?:\uC18C\uC74C|\uC800\uC18C\uC74C))(?=.*(?:\uAD6C\uB9E4\uCC98|\uCD5C\uC800\uAC00|\uD560\uC778|\uCFE0\uD3F0|\uAC00\uACA9|\uBE44\uC6A9|\uC124\uCE58\uBE44|\uC804\uAE30\uC694\uAE08|\uC804\uAE30\uC138|\uCD9C\uC2DC\uC77C|\uBC1C\uB9E4\uC77C))|(?:\uC5D0\uC5B4\uCEE8|\uC81C\uC2B5\uAE30|\uACF5\uAE30\uCCAD\uC815\uAE30|\uCCAD\uC18C\uAE30|\uB85C\uBD07\uCCAD\uC18C\uAE30|\uB178\uD2B8\uBD81|\uB0C9\uC7A5\uACE0)(?=.*(?:\uC6D0\uB8F8|\uC790\uCDE8\uBC29))(?=.*(?:\uCD9C\uC2DC\uC77C|\uBC1C\uB9E4\uC77C))|(?:\uC5D0\uC5B4\uCEE8|\uC81C\uC2B5\uAE30|\uACF5\uAE30\uCCAD\uC815\uAE30|\uCCAD\uC18C\uAE30|\uB85C\uBD07\uCCAD\uC18C\uAE30|\uB178\uD2B8\uBD81|\uB0C9\uC7A5\uACE0)(?=.*(?:\uC18C\uC74C|\uC800\uC18C\uC74C))(?=.*(?:\uC6D0\uB8F8.*\uC790\uCDE8\uBC29|\uC790\uCDE8\uBC29.*\uC6D0\uB8F8)))/;

function looksLikeShortKoreanName(value: string): boolean {
  const normalized = normalizeCandidateKeyword(value);
  return /^[가-힣]{2,8}$/.test(normalized)
    && !NON_PERSON_SINGLE_TOKEN_RE.test(normalized);
}

function isAwkwardPersonCommercialCandidate(seed: string, keyword: string): boolean {
  const normalizedSeed = normalizeCandidateKeyword(seed);
  const normalizedKeyword = normalizeCandidateKeyword(keyword);
  if (!looksLikeShortKoreanName(normalizedSeed)) return false;

  const compactSeed = compact(normalizedSeed);
  const compactKeyword = compact(normalizedKeyword);
  if (!compactKeyword.includes(compactSeed)) return false;

  const hasPersonContext = PERSON_CONTEXT_RE.test(normalizedKeyword);
  const hasBadIntent = PERSON_BAD_INTENT_RE.test(normalizedKeyword);
  if (!hasBadIntent) return false;

  // 인물/연예인형 검색에서 "부모 가격", "일정 가격", "부모 추천" 같은 조합은
  // 자동완성 보강이 만든 잡음이다. 실제 연관키워드로 보여주지 않는다.
  if (hasPersonContext) return true;

  const tail = compactKeyword.replace(compactSeed, '');
  return PERSON_BAD_INTENT_RE.test(tail) && tail.length <= 8;
}

function isAwkwardHousingProductCandidate(seed: string, keyword: string): boolean {
  const normalizedSeed = normalizeCandidateKeyword(seed);
  const normalizedKeyword = normalizeCandidateKeyword(keyword);
  const combined = `${normalizedSeed} ${normalizedKeyword}`;
  const compactCombined = compact(combined);
  if (PRODUCT_HOUSING_CONTEXT_CHAIN_RE.test(combined) || PRODUCT_HOUSING_CONTEXT_CHAIN_RE.test(compactCombined)) return true;
  if (!HOUSING_CONTEXT_RE.test(combined)) return false;
  if (PRODUCT_LAUNCH_CONTEXT_RE.test(combined)) return true;
  if (APPLIANCE_PURCHASE_TAIL_RE.test(normalizedKeyword) && !APPLIANCE_BASE_RE.test(normalizedSeed)) return true;
  return false;
}

function isAwkwardTerminalIntentChain(seed: string, keyword: string): boolean {
  const normalizedSeed = normalizeCandidateKeyword(seed);
  const normalizedKeyword = normalizeCandidateKeyword(keyword);
  const combined = `${normalizedSeed} ${normalizedKeyword}`;
  const compactCombined = compact(combined);
  return TERMINAL_POLICY_CHAIN_RE.test(combined)
    || TERMINAL_PRODUCT_CHAIN_RE.test(combined)
    || TERMINAL_POLICY_COMPACT_CHAIN_RE.test(compactCombined)
    || PRODUCT_HOUSING_CONTEXT_CHAIN_RE.test(combined)
    || PRODUCT_HOUSING_CONTEXT_CHAIN_RE.test(compactCombined);
}

function bestSourceWeight(sources: string[]): number {
  let best = 0;
  for (const source of sources) best = Math.max(best, SOURCE_WEIGHT[source] || 0);
  return best;
}

function isBadCandidate(keyword: string): boolean {
  if (!keyword || keyword.length < 2 || keyword.length > 50) return true;
  if (/^[\d\s.,_-]+$/.test(keyword)) return true;
  if (/[<>{}[\]\\]/.test(keyword)) return true;
  if (/ㅋ{2,}|ㅎ{2,}|ㅠ{2,}|ㅜ{2,}/.test(keyword)) return true;
  if (/^(보기|바로가기|이동|이미지|사진|동영상|뉴스|블로그|카페|홈페이지)$/i.test(keyword)) return true;
  if (keyword.split(/\s+/).length >= 8) return true;
  return false;
}

export function scoreKeywordRelevance(seed: string, candidate: RelatedCandidateInput): RankedRelatedKeyword | null {
  const keyword = normalizeCandidateKeyword(candidate.keyword);
  if (isBadCandidate(keyword)) return null;
  if (isAwkwardPersonCommercialCandidate(seed, keyword)) return null;
  if (isAwkwardHousingProductCandidate(seed, keyword)) return null;
  if (isAwkwardTerminalIntentChain(seed, keyword)) return null;

  const seedCompact = compact(seed);
  const keywordCompact = compact(keyword);
  if (!seedCompact || (!candidate.source && !candidate.sources?.length && seedCompact === keywordCompact)) return null;
  const seedBaseCompact = stripTrailingQueryIntent(seedCompact);

  const seedTokens = tokenizeKeyword(seed);
  const keywordTokens = tokenizeKeyword(keyword);
  if (keywordTokens.length === 0) return null;

  const seedCore = coreTokens(seedTokens);
  const keywordCore = coreTokens(keywordTokens);
  const tokenOverlap = countOverlap(seedTokens, keywordTokens);
  const coreOverlap = countOverlap(seedCore, keywordCore);
  const head = seedCore[seedCore.length - 1] || seedTokens[seedTokens.length - 1] || '';
  const sameHead = head.length >= 2 && keywordCore.includes(head);
  const seedDomains = detectDomains(seed);
  const candidateDomains = detectDomains(keyword);
  const sharedDomains = seedDomains.filter(domain => candidateDomains.includes(domain));
  const sources = Array.from(new Set([...(candidate.sources || []), candidate.source || ''].filter(Boolean)));
  const reasons: string[] = [];

  let score = 0;
  if (seedCompact === keywordCompact) {
    score += 100;
    reasons.push('seed');
  }
  if (keywordCompact.includes(seedCompact) && keywordCompact !== seedCompact) {
    score += 42;
    reasons.push('contains-seed');
    if (keywordCompact.startsWith(seedCompact)) score += 10;
  } else if (
    seedBaseCompact.length >= 4
    && seedBaseCompact !== seedCompact
    && keywordCompact.includes(seedBaseCompact)
  ) {
    score += 42;
    reasons.push('contains-seed-base');
    if (keywordCompact.startsWith(seedBaseCompact)) score += 10;
  } else if (seedCompact.includes(keywordCompact)) {
    score += keywordCompact.length >= 4 ? 12 : -12;
    reasons.push('seed-contains');
  }

  if (coreOverlap > 0) {
    score += coreOverlap * 24;
    reasons.push(`core-overlap:${coreOverlap}`);
  }
  if (tokenOverlap > coreOverlap) {
    score += (tokenOverlap - coreOverlap) * 10;
    reasons.push(`token-overlap:${tokenOverlap}`);
  }
  if (sameHead) {
    score += 18;
    reasons.push('same-head');
  }
  if (sharedDomains.length > 0) {
    const domainBonus = coreOverlap > 0 || sameHead || keywordCompact.includes(seedCompact)
      ? 10
      : 24;
    score += domainBonus;
    reasons.push(`domain:${sharedDomains.join('|')}`);
  }

  const sourceScore = bestSourceWeight(sources);
  if (sourceScore > 0) {
    score += sourceScore;
    reasons.push(`source:${sourceScore}`);
  }

  const freq = Math.max(0, candidate.freq || sources.length || 0);
  if (freq > 1) score += Math.min(12, (freq - 1) * 4);
  if (candidate.priority && candidate.priority > 0) {
    score += Math.min(12, candidate.priority);
    reasons.push('priority');
  }
  if (candidate.monthlyVolume && candidate.monthlyVolume > 0) {
    score += Math.min(18, Math.log10(candidate.monthlyVolume + 1) * 4);
    reasons.push('volume');
  }

  if (hasCommercialIntent(keyword) && (coreOverlap > 0 || sameHead || keywordCompact.includes(seedCompact) || (seedBaseCompact.length >= 4 && keywordCompact.includes(seedBaseCompact)))) score += 6;
  if (keyword.length <= 4 && coreOverlap === 0 && !sameHead) score -= 22;
  if (keyword.length > 35) score -= 10;
  if (sources.includes('naver-shopping') && !hasCommercialIntent(seed) && coreOverlap === 0 && !sameHead) score -= 18;
  if (coreOverlap === 0 && !sameHead && !keywordCompact.includes(seedCompact) && !(seedBaseCompact.length >= 4 && keywordCompact.includes(seedBaseCompact)) && !seedCompact.includes(keywordCompact)) {
    score -= sharedDomains.length > 0 ? 8 : 28;
  }

  return { ...candidate, keyword, sources, score, reasons };
}

export function rankRelatedKeywordCandidates(
  seed: string,
  candidates: RelatedCandidateInput[],
  options: RankRelatedOptions = {}
): RankedRelatedKeyword[] {
  const minScore = typeof options.minScore === 'number' ? options.minScore : 32;
  const limit = options.limit || candidates.length || 50;
  const includeSeed = options.includeSeed === true;
  const seen = new Set<string>();
  const ranked: RankedRelatedKeyword[] = [];

  for (const candidate of candidates) {
    const scored = scoreKeywordRelevance(seed, candidate);
    if (!scored) continue;
    const key = compact(scored.keyword);
    if (!key || seen.has(key)) continue;
    if (!includeSeed && key === compact(seed)) continue;
    if (scored.score < minScore) continue;
    seen.add(key);
    ranked.push(scored);
  }

  ranked.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const av = a.monthlyVolume || 0;
    const bv = b.monthlyVolume || 0;
    if (bv !== av) return bv - av;
    return a.keyword.length - b.keyword.length || a.keyword.localeCompare(b.keyword);
  });

  return ranked.slice(0, limit);
}
