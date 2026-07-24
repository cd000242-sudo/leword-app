import { RelatedCandidateInput, RankedRelatedKeyword } from './keyword-relevance';
import { rankKeywordExpansionCandidates } from './keyword-expansion-ranker';

export interface MindmapExpansionCandidate extends RelatedCandidateInput {
  keyword: string;
}

function compactKeyword(keyword: string): string {
  return String(keyword || '').toLowerCase().replace(/\s+/g, '').trim();
}

function normalizeKeyword(keyword: string): string {
  return String(keyword || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const ARTICLE_TITLE_MINDMAP_RE = /(?:\uCD1D\uC815\uB9AC|\uD55C\uB208\uC5D0|\uC644\uBCBD\s*(?:\uAC00\uC774\uB4DC|\uD65C\uC6A9\uBC95)|\uC774\uAC83\uB9CC\s*\uC54C\uBA74|\uD655\uC778\uD560\s*\d+\uAC00\uC9C0|\d+\uAC00\uC9C0|\uC4F0\uAE30\s*\uC804|\uAE30\uBCF8\s*\uAD6C\uC131\s*\uC774\uD574|\uB3C4\uC6C0(?:\uC740)?\s*\uD544\uC218|\uD544\uC218(?:\uC785\uB2C8\uB2E4)?|\uC0B4\uD3B4\uBD10\uC694|\uC54C\uC544\uBCF4\uAE30)$/u;
const CONTENT_STRATEGY_MINDMAP_RE = /(?:\b(?:AEO|GEO|SEO)\b|\uC800\uACBD\uC7C1\s*(?:\uD6C4\uD0B9|\uAC00\uB2A5\uC131)|\uD6C4\uD0B9\s*\uB871\uD14C\uC77C|\uC9C8\uBB38\s*\uD574\uACB0\s*\uCF58\uD150\uCE20|\uD2B8\uB798\uD53D\s*\uC21C\uD658\s*\uD074\uB7EC\uC2A4\uD130|\uD5C8\uBE0C\s*\uAD6C\uC870|\uD6C4\uC18D\s*\uAC80\uC0C9|\uB3C5\uC790\s*\uC9C0\uC815)/iu;
const SENTENCE_STYLE_MINDMAP_RE = /(?:\uAC80\uC0C9\uC790|\uB3C5\uC790|\uCCAB\s*\uBB38\uB2E8|\uBCF8\uBB38|\uC18C\uC81C\uBAA9|\uD074\uB9AD\s*\uC774\uC720|\uC774\uD0C8|\uAD6C\uC870|\uC815\uB9AC\s*\uD615\uD0DC|\uAE30\uC900\uD45C\uCC98\uB7FC|\uB2F5\uBCC0\uD569\uB2C8\uB2E4|\uC81C\uC2DC|\uBD84\uB9AC\uD569\uB2C8\uB2E4|\uB9CC\uB4E6|\uC904\uC785\uB2C8\uB2E4|\uB179\uC785\uB2C8\uB2E4|\uB9DE\uCDB0|\uC55E\uC138\uC6B0\uAE30|\uD655\uC778\s*\uD750\uB984|\uB274\uC2A4\s*\uC81C\uBAA9|\uD55C\s*\uD654\uBA74\uC5D0\uC11C\s*\uBE44\uAD50|\uAC80\uC0C9\s*\uC804\s*\uD655\uC778|\uB193\uCE58\uBA74\s*\uC548\s*\uB418\uB294|\uBD10\uC57C\s*\uD560\s*\uAC74|\uAC80\uC0C9\uB7C9\s*\uBD99\uAE30\s*\uC804|\uC228\uC740\s*\uBCC0\uC218|\uB2E4\uC74C\s*\uD589\uB3D9)/u;
const MINDMAP_SHARED_HEAD_SUFFIX_RE = /(?:\uBCF4\uD5D8\uB8CC\uACC4\uC0B0\uAE30|\uBCF4\uD5D8\uB8CC\uACC4\uC0B0|\uACC4\uC0B0\uAE30|\uACC4\uC0B0|\uC694\uC728\uD45C|\uC694\uC728|\uAC00\uC785\uB0B4\uC5ED\uD655\uC778|\uAC00\uC785\uD655\uC778)$/u;

function canonicalMindmapKey(keyword: string): string {
  return compactKeyword(keyword).replace(/\uC0AC\uB300/gu, '4\uB300');
}

function canonicalMindmapHead(keyword: string): string {
  return canonicalMindmapKey(keyword).replace(MINDMAP_SHARED_HEAD_SUFFIX_RE, '');
}

function isConciseSharedMindmapBranch(seed: string, keyword: string): boolean {
  const seedKey = canonicalMindmapKey(seed);
  const candidateKey = canonicalMindmapKey(keyword);
  if (!seedKey || !candidateKey) return false;
  if (seedKey === candidateKey) return true;
  const seedHead = canonicalMindmapHead(seed);
  const candidateHead = canonicalMindmapHead(keyword);
  if (seedHead.length < 4 || candidateHead.length < 4) return false;
  return seedHead === candidateHead || seedKey.startsWith(candidateHead) || candidateKey.startsWith(seedHead);
}

function isMindmapIssueBridgeCandidate(candidate: MindmapExpansionCandidate): boolean {
  return [
    candidate.source || '',
    ...(candidate.sources || []),
  ].some((source) => /mindmap-(?:issue|semantic)-(?:bridge|autocomplete|naver-relkwd)/i.test(source));
}

const SEMANTIC_BRIDGE_GENERIC_TOKENS = new Set([
  '다음',
  '후보',
  '이유',
  '과정',
  '전말',
  '논란',
  '일정',
  '방법',
  '대상',
  '조건',
  '조회',
  '확인',
  '신청',
  '발표',
  '추천',
  '후기',
  '비교',
  '가격',
  '정보',
  '관련',
  '정리',
  '결과',
  '기준',
  '변수',
]);
const SEMANTIC_BRIDGE_SPORTS_RE = /(?:홍명보|축구|대한축구협회|축구협회|KFA|국가대표|대표팀|월드컵|감독|이강인|이재성|김민재|선임|사퇴|교체|투입)/iu;
const SEMANTIC_BRIDGE_SPORTS_DRIFT_RE = /(?:축구|대한축구협회|축구협회|KFA|국가대표|대표팀|월드컵|감독|이강인|이재성|김민재|선임|사퇴|교체|투입)/iu;
const MINDMAP_TERMINAL_INTENTS = [
  '신청방법', '신청 방법', '신청자격', '지급일', '지급 일', '금액', '지원금액',
  '필요서류', '대상', '대상자', '자격', '조건', '조회', '확인', '제외대상', '제외 대상',
  '사용처', '가맹점', '잔액', '잔액조회', '온라인', '오프라인', '입장료', '예약',
  '주차', '운영시간', '후기', '가격', '비교', '추천', '방법', '주의사항',
];

function stripTerminalIntent(keyword: string): string {
  let out = normalizeKeyword(keyword);
  const intents = [...MINDMAP_TERMINAL_INTENTS].sort((a, b) => compactKeyword(b).length - compactKeyword(a).length);
  for (let pass = 0; pass < 4; pass += 1) {
    const before = out;
    for (const intent of intents) {
      const pattern = new RegExp(`\\s*${intent.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s*')}$`, 'iu');
      out = out.replace(pattern, '').trim();
    }
    if (out === before) break;
  }
  return out || normalizeKeyword(keyword);
}

function hasDuplicatedIntentChain(seed: string, keyword: string): boolean {
  const seedKey = compactKeyword(seed);
  const rootKey = compactKeyword(stripTerminalIntent(seed));
  const keywordKey = compactKeyword(keyword);
  if (!seedKey || !rootKey || !keywordKey || keywordKey === seedKey || keywordKey === rootKey) return false;
  if (seedKey !== rootKey && keywordKey.startsWith(seedKey)) return true;
  if (!keywordKey.startsWith(rootKey)) return false;
  let tailKey = keywordKey.slice(rootKey.length);
  let hits = 0;
  const intentKeys = Array.from(new Set(MINDMAP_TERMINAL_INTENTS.map(compactKeyword).filter(Boolean)))
    .sort((a, b) => b.length - a.length);
  for (const intentKey of intentKeys) {
    if (intentKey && tailKey.includes(intentKey)) {
      hits += 1;
      tailKey = tailKey.replace(intentKey, '');
    }
    if (hits >= 2) return true;
  }
  return false;
}

function semanticBridgeTokens(keyword: string): string[] {
  return Array.from(new Set(
    normalizeKeyword(keyword)
      .match(/[\uAC00-\uD7A3A-Za-z0-9]{2,}/gu) || [],
  ))
    .map((token) => token.toLowerCase())
    .filter((token) => token.length >= 2 && !SEMANTIC_BRIDGE_GENERIC_TOKENS.has(token));
}

function hasSemanticTokenOverlap(seed: string, keyword: string): boolean {
  const seedTokens = new Set(semanticBridgeTokens(seed));
  if (seedTokens.size === 0) return false;
  return semanticBridgeTokens(keyword).some((token) => seedTokens.has(token));
}

function isSemanticBridgeCompatible(seed: string, keyword: string): boolean {
  const normalizedSeed = normalizeKeyword(seed);
  const normalizedKeyword = normalizeKeyword(keyword);
  if (!normalizedSeed || !normalizedKeyword) return false;

  const seedSportsContext = SEMANTIC_BRIDGE_SPORTS_RE.test(normalizedSeed);
  const candidateSportsContext = SEMANTIC_BRIDGE_SPORTS_DRIFT_RE.test(normalizedKeyword);
  if (candidateSportsContext && !seedSportsContext) return false;
  if (seedSportsContext && candidateSportsContext) return true;
  return hasSemanticTokenOverlap(normalizedSeed, normalizedKeyword);
}

export function isMindmapExpansionKeywordCandidate(keyword: string): boolean {
  const kw = normalizeKeyword(keyword);
  if (kw.length < 2 || kw.length > 42) return false;
  if (/^[\d\s.,_-]+$/.test(kw)) return false;
  if (/[<>{}[\]\\]/.test(kw)) return false;
  if (/[:;!?]/.test(kw)) return false;
  if (ARTICLE_TITLE_MINDMAP_RE.test(kw)) return false;
  if (CONTENT_STRATEGY_MINDMAP_RE.test(kw)) return false;
  if (SENTENCE_STYLE_MINDMAP_RE.test(kw)) return false;
  if (/[,.]\s/.test(kw)) return false;
  if (/([^\x00-\x7F])\1{2,}/u.test(kw)) return false;
  if (/^(?:\uBC14\uB85C\uAC00\uAE30\s*\uC774\uB3D9|\uC774\uBBF8\uC9C0|\uC0AC\uC9C4|\uB3D9\uC601\uC0C1|\uB274\uC2A4|\uBE14\uB85C\uADF8|\uCE74\uD398|\uC6F9\uD398\uC774\uC9C0)$/iu.test(kw)) return false;
  if (/ㅋ{2,}|ㅎ{2,}|ㅠ{2,}|ㅜ{2,}/.test(kw)) return false;
  if (/^(바로가기|이동|이미지|사진|동영상|뉴스|블로그|카페|홈페이지)$/i.test(kw)) return false;
  if (kw.split(/\s+/).length > 5) return false;
  return true;
}

export function rankMindmapExpansionCandidates(
  seed: string,
  candidates: MindmapExpansionCandidate[],
  limit: number,
): RankedRelatedKeyword[] {
  const safeLimit = Math.max(1, Math.floor(Number(limit) || 1));
  const seen = new Set<string>();
  // v2.49.72: 어순 순열 중복 제거 — "청주시의원 최영중"/"최영중 청주시의원"/"청주 최영중 시의원"은
  // 같은 검색의도의 순열이라 한 칸만 차지해야 한다(문자 멀티셋 키). 확장 목록이 순열로 도배되면
  // 실데이터(자동완성·연관어)의 다른 가지가 밀려나 마인드맵이 빈약해진다.
  const seenCharMultiset = new Set<string>();
  const normalized: MindmapExpansionCandidate[] = [];

  for (const candidate of candidates || []) {
    const keyword = normalizeKeyword(candidate.keyword);
    const key = compactKeyword(keyword);
    if (!keyword || !key || seen.has(key)) continue;
    if (!isMindmapExpansionKeywordCandidate(keyword)) continue;
    if (hasDuplicatedIntentChain(seed, keyword)) continue;
    const charKey = key.length >= 6 ? [...key].sort().join('') : '';
    if (charKey && seenCharMultiset.has(charKey)) continue;
    seen.add(key);
    if (charKey) seenCharMultiset.add(charKey);
    normalized.push({ ...candidate, keyword });
  }

  const aliasRanked: RankedRelatedKeyword[] = normalized
    .filter((candidate) => isConciseSharedMindmapBranch(seed, candidate.keyword))
    .map((candidate, index) => ({
      ...candidate,
      score: Math.max(56, 82 - index * 2),
      reasons: ['mindmap-shared-query-branch', ...(candidate.sources || [])],
    }));
  const issueBridgeRanked: RankedRelatedKeyword[] = normalized
    .filter((candidate) => isMindmapIssueBridgeCandidate(candidate) && isSemanticBridgeCompatible(seed, candidate.keyword))
    .map((candidate, index) => ({
      ...candidate,
      score: Math.max(64, 90 - index * 1.5),
      reasons: ['mindmap-semantic-bridge', ...(candidate.sources || [])],
    }));

  const primaryRanked = rankKeywordExpansionCandidates(seed, normalized, {
    limit: safeLimit,
    minScore: 30,
    fallbackMinScore: 22,
    minKeep: Math.min(8, safeLimit),
  });

  const merged: RankedRelatedKeyword[] = [];
  const mergedKeys = new Set<string>();
  for (const item of [...issueBridgeRanked, ...aliasRanked, ...primaryRanked]) {
    const key = compactKeyword(item.keyword);
    if (!key || mergedKeys.has(key)) continue;
    mergedKeys.add(key);
    merged.push(item);
    if (merged.length >= safeLimit) break;
  }
  return merged;
}
