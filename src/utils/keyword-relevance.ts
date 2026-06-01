export interface RelatedCandidateInput {
  keyword: string;
  sources?: string[];
  source?: string;
  freq?: number;
  monthlyVolume?: number;
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
  sibling: 24,
  mindmap: 16,
  spider: 8,
  'title-extract': 6,
};

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

function hasCommercialIntent(value: string): boolean {
  return /추천|후기|리뷰|가격|비용|비교|순위|랭킹|할인|쿠폰|구매|구입|신청|조건|대상|조회|방법|종류/.test(value);
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

  const seedCompact = compact(seed);
  const keywordCompact = compact(keyword);
  if (!seedCompact || (!candidate.source && !candidate.sources?.length && seedCompact === keywordCompact)) return null;

  const seedTokens = tokenizeKeyword(seed);
  const keywordTokens = tokenizeKeyword(keyword);
  if (keywordTokens.length === 0) return null;

  const seedCore = coreTokens(seedTokens);
  const keywordCore = coreTokens(keywordTokens);
  const tokenOverlap = countOverlap(seedTokens, keywordTokens);
  const coreOverlap = countOverlap(seedCore, keywordCore);
  const head = seedCore[seedCore.length - 1] || seedTokens[seedTokens.length - 1] || '';
  const sameHead = head.length >= 2 && keywordCore.includes(head);
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

  const sourceScore = bestSourceWeight(sources);
  if (sourceScore > 0) {
    score += sourceScore;
    reasons.push(`source:${sourceScore}`);
  }

  const freq = Math.max(0, candidate.freq || sources.length || 0);
  if (freq > 1) score += Math.min(12, (freq - 1) * 4);
  if (candidate.monthlyVolume && candidate.monthlyVolume > 0) {
    score += Math.min(18, Math.log10(candidate.monthlyVolume + 1) * 4);
    reasons.push('volume');
  }

  if (hasCommercialIntent(keyword) && (coreOverlap > 0 || sameHead || keywordCompact.includes(seedCompact))) score += 6;
  if (keyword.length <= 4 && coreOverlap === 0 && !sameHead) score -= 22;
  if (keyword.length > 35) score -= 10;
  if (sources.includes('naver-shopping') && !hasCommercialIntent(seed) && coreOverlap === 0 && !sameHead) score -= 18;
  if (coreOverlap === 0 && !sameHead && !keywordCompact.includes(seedCompact) && !seedCompact.includes(keywordCompact)) {
    score -= 28;
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
