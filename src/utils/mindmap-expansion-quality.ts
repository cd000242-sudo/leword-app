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
  const normalized: MindmapExpansionCandidate[] = [];

  for (const candidate of candidates || []) {
    const keyword = normalizeKeyword(candidate.keyword);
    const key = compactKeyword(keyword);
    if (!keyword || !key || seen.has(key)) continue;
    if (!isMindmapExpansionKeywordCandidate(keyword)) continue;
    seen.add(key);
    normalized.push({ ...candidate, keyword });
  }

  const aliasRanked: RankedRelatedKeyword[] = normalized
    .filter((candidate) => isConciseSharedMindmapBranch(seed, candidate.keyword))
    .map((candidate, index) => ({
      ...candidate,
      score: Math.max(56, 82 - index * 2),
      reasons: ['mindmap-shared-query-branch', ...(candidate.sources || [])],
    }));

  const primaryRanked = rankKeywordExpansionCandidates(seed, normalized, {
    limit: safeLimit,
    minScore: 30,
    fallbackMinScore: 22,
    minKeep: Math.min(8, safeLimit),
  });

  const merged: RankedRelatedKeyword[] = [];
  const mergedKeys = new Set<string>();
  for (const item of [...aliasRanked, ...primaryRanked]) {
    const key = compactKeyword(item.keyword);
    if (!key || mergedKeys.has(key)) continue;
    mergedKeys.add(key);
    merged.push(item);
    if (merged.length >= safeLimit) break;
  }
  return merged;
}
