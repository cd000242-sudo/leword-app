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

function isBasicMindmapCandidate(keyword: string): boolean {
  const kw = normalizeKeyword(keyword);
  if (kw.length < 2 || kw.length > 42) return false;
  if (/^[\d\s.,_-]+$/.test(kw)) return false;
  if (/[<>{}[\]\\]/.test(kw)) return false;
  if (/[:;!?]/.test(kw)) return false;
  if (ARTICLE_TITLE_MINDMAP_RE.test(kw)) return false;
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
    if (!isBasicMindmapCandidate(keyword)) continue;
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
