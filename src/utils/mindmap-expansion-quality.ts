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

function isBasicMindmapCandidate(keyword: string): boolean {
  const kw = normalizeKeyword(keyword);
  if (kw.length < 2 || kw.length > 42) return false;
  if (/^[\d\s.,_-]+$/.test(kw)) return false;
  if (/[<>{}[\]\\]/.test(kw)) return false;
  if (/ㅋ{2,}|ㅎ{2,}|ㅠ{2,}|ㅜ{2,}/.test(kw)) return false;
  if (/^(바로가기|이동|이미지|사진|동영상|뉴스|블로그|카페|홈페이지)$/i.test(kw)) return false;
  if (kw.split(/\s+/).length >= 8) return false;
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

  return rankKeywordExpansionCandidates(seed, normalized, {
    limit: safeLimit,
    minScore: 30,
    fallbackMinScore: 22,
    minKeep: Math.min(8, safeLimit),
  });
}
