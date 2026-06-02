import { buildPracticalIntentExpansions } from './keyword-expansion-ranker';

export interface ExposureHistoryEntry {
  checkedAt?: string;
  ts?: number;
  inTop10?: boolean;
  inTop30?: boolean;
  rank: number | null;
}

export interface ExposureTrackedPair {
  keyword: string;
  postUrl?: string;
  postTitle?: string;
  category?: string;
  registeredAt?: string | number;
  lastCheckedAt?: string | number;
  history: ExposureHistoryEntry[];
}

export interface ExposureGrowthSeed {
  keyword: string;
  category: string;
  score: number;
  growthGrade: 'S+' | 'S' | 'A' | 'WATCH';
  currentRank: number | null;
  bestRank: number | null;
  top10Rate: number;
  top30Rate: number;
  totalChecks: number;
  exposedChecks: number;
  postCount: number;
  latestPostTitle: string;
  latestPostUrl: string;
  suggestedExpansions: string[];
  nextAction: string;
  reasons: string[];
}

export interface ExposureGrowthOptions {
  limit?: number;
  expansionLimit?: number;
}

function normalizeKeyword(value: string): string {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function compactKeyword(value: string): string {
  return normalizeKeyword(value).toLowerCase().replace(/\s+/g, '');
}

function isValidRank(rank: number | null | undefined): rank is number {
  return typeof rank === 'number' && Number.isFinite(rank) && rank > 0;
}

function rankTimestamp(pair: ExposureTrackedPair, entry?: ExposureHistoryEntry): number {
  if (entry?.ts && Number.isFinite(entry.ts)) return entry.ts;
  const checkedAt = entry?.checkedAt || pair.lastCheckedAt || pair.registeredAt || '';
  const time = new Date(String(checkedAt)).getTime();
  return Number.isFinite(time) ? time : 0;
}

function gradeExposureSeed(score: number, bestRank: number | null, top30Rate: number, totalChecks: number): ExposureGrowthSeed['growthGrade'] {
  if (bestRank != null && bestRank <= 10 && top30Rate >= 70 && totalChecks >= 2 && score >= 85) return 'S+';
  if (bestRank != null && bestRank <= 20 && top30Rate >= 55 && score >= 72) return 'S';
  if (bestRank != null && bestRank <= 30 && top30Rate >= 35 && score >= 55) return 'A';
  return 'WATCH';
}

function buildSuggestedExpansions(keyword: string, limit: number): string[] {
  const baseKey = compactKeyword(keyword);
  const out: string[] = [];
  const seen = new Set<string>([baseKey]);
  for (const candidate of buildPracticalIntentExpansions(keyword, Math.max(limit + 4, 12))) {
    const key = compactKeyword(candidate);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(candidate);
    if (out.length >= limit) break;
  }
  return out;
}

export function rankExposureGrowthSeeds(
  pairs: ExposureTrackedPair[],
  options: ExposureGrowthOptions = {},
): ExposureGrowthSeed[] {
  const limit = Math.max(1, Math.floor(Number(options.limit) || 12));
  const expansionLimit = Math.max(3, Math.min(12, Math.floor(Number(options.expansionLimit) || 6)));
  const grouped = new Map<string, {
    keyword: string;
    category: string;
    postCount: number;
    latestPostTitle: string;
    latestPostUrl: string;
    latestTs: number;
    ranks: number[];
    currentRank: number | null;
    currentTs: number;
    totalChecks: number;
    top10Count: number;
    top30Count: number;
    improvement: number;
  }>();

  for (const pair of pairs || []) {
    const keyword = normalizeKeyword(pair.keyword);
    const key = compactKeyword(keyword);
    if (!keyword || !key) continue;
    const history = Array.isArray(pair.history) ? pair.history : [];
    if (history.length === 0) continue;

    const checked = history.filter(entry => entry && (isValidRank(entry.rank) || entry.rank === null));
    if (checked.length === 0) continue;
    const ranks = checked.map(entry => entry.rank).filter(isValidRank);
    const top30Count = checked.filter(entry => entry.inTop30 === true || (isValidRank(entry.rank) && entry.rank <= 30)).length;
    const top10Count = checked.filter(entry => entry.inTop10 === true || (isValidRank(entry.rank) && entry.rank <= 10)).length;
    const latest = [...checked].sort((a, b) => rankTimestamp(pair, b) - rankTimestamp(pair, a))[0];
    const latestRank = isValidRank(latest?.rank) ? latest.rank : null;

    const firstRank = checked.find(entry => isValidRank(entry.rank))?.rank;
    const improvement = isValidRank(firstRank) && latestRank != null ? Math.max(0, firstRank - latestRank) : 0;
    const latestTs = rankTimestamp(pair, latest);
    const current = grouped.get(key) || {
      keyword,
      category: pair.category || 'general',
      postCount: 0,
      latestPostTitle: '',
      latestPostUrl: '',
      latestTs: 0,
      ranks: [],
      currentRank: null,
      currentTs: 0,
      totalChecks: 0,
      top10Count: 0,
      top30Count: 0,
      improvement: 0,
    };

    current.postCount += 1;
    current.totalChecks += checked.length;
    current.top10Count += top10Count;
    current.top30Count += top30Count;
    current.ranks.push(...ranks);
    current.improvement = Math.max(current.improvement, improvement);
    if (latestTs >= current.latestTs) {
      current.latestTs = latestTs;
      current.latestPostTitle = pair.postTitle || keyword;
      current.latestPostUrl = pair.postUrl || '';
      current.category = pair.category || current.category;
    }
    if (latestRank != null && (current.currentRank == null || latestTs >= current.currentTs)) {
      current.currentRank = latestRank;
      current.currentTs = latestTs;
    }
    grouped.set(key, current);
  }

  const scored: ExposureGrowthSeed[] = [];
  for (const item of grouped.values()) {
    if (item.totalChecks <= 0) continue;
    const top30Rate = Math.round((item.top30Count / item.totalChecks) * 100);
    const top10Rate = Math.round((item.top10Count / item.totalChecks) * 100);
    const bestRank = item.ranks.length > 0 ? Math.min(...item.ranks) : null;
    const currentlyExposed = item.currentRank != null && item.currentRank <= 30;
    const repeatedExposure = item.top30Count >= 2 && top30Rate >= 50;
    if (!currentlyExposed && !repeatedExposure) continue;

    let score = 0;
    score += Math.min(40, top30Rate * 0.4);
    score += Math.min(25, top10Rate * 0.25);
    if (bestRank != null) {
      if (bestRank <= 3) score += 24;
      else if (bestRank <= 10) score += 18;
      else if (bestRank <= 20) score += 12;
      else if (bestRank <= 30) score += 7;
    }
    if (item.currentRank != null) {
      if (item.currentRank <= 10) score += 12;
      else if (item.currentRank <= 30) score += 7;
    }
    score += Math.min(8, Math.max(0, item.totalChecks - 1) * 2);
    score += Math.min(6, item.postCount * 2);
    score += Math.min(5, item.improvement);
    score = Math.round(Math.min(100, score));

    const growthGrade = gradeExposureSeed(score, bestRank, top30Rate, item.totalChecks);
    const reasons: string[] = [];
    if (top10Rate > 0) reasons.push(`TOP10 ${top10Rate}%`);
    if (top30Rate > 0) reasons.push(`TOP30 ${top30Rate}%`);
    if (bestRank != null) reasons.push(`최고 ${bestRank}위`);
    if (item.postCount > 1) reasons.push(`글 ${item.postCount}개에서 검증`);
    if (item.improvement > 0) reasons.push(`순위 ${item.improvement}단계 개선`);

    scored.push({
      keyword: item.keyword,
      category: item.category || 'general',
      score,
      growthGrade,
      currentRank: item.currentRank,
      bestRank,
      top10Rate,
      top30Rate,
      totalChecks: item.totalChecks,
      exposedChecks: item.top30Count,
      postCount: item.postCount,
      latestPostTitle: item.latestPostTitle,
      latestPostUrl: item.latestPostUrl,
      suggestedExpansions: buildSuggestedExpansions(item.keyword, expansionLimit),
      nextAction: growthGrade === 'S+'
        ? '마인드맵으로 같은 주제 롱테일을 즉시 확장'
        : growthGrade === 'S'
          ? '관련 키워드 2차 확장 후 내부링크로 묶기'
          : '제목/본문 보강 후 가까운 롱테일만 확장',
      reasons,
    });
  }

  return scored
    .filter(item => item.growthGrade !== 'WATCH')
    .sort((a, b) =>
      b.score - a.score ||
      (a.bestRank || 99) - (b.bestRank || 99) ||
      b.top30Rate - a.top30Rate ||
      a.keyword.localeCompare(b.keyword)
    )
    .slice(0, limit);
}
