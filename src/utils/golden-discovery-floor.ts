import type { GoldenGrade } from './mdp-engine';

export const GOLDEN_DISCOVERY_SSS_FLOOR = 30;

export interface GoldenDiscoveryLike {
  keyword: string;
  grade?: GoldenGrade | string;
  score?: number;
  searchVolume?: number | null;
  documentCount?: number | null;
  goldenRatio?: number | null;
  cpc?: number | null;
}

export interface GoldenDiscoveryScanOptions {
  categoryFirst?: boolean;
}

function gradeRank(grade: unknown): number {
  const g = String(grade || '').toUpperCase();
  if (g === 'SSS') return 6;
  if (g === 'SS') return 5;
  if (g === 'S') return 4;
  if (g === 'A') return 3;
  if (g === 'B') return 2;
  return 1;
}

function compactKeyword(keyword: string): string {
  return String(keyword || '').toLowerCase().replace(/\s+/g, '').trim();
}

export function getGoldenDiscoveryScanLimit(
  requestedLimit: number,
  isUnlimited: boolean,
  seedCount = 0,
  options: GoldenDiscoveryScanOptions = {},
): number {
  const categoryFirst = options.categoryFirst === true;
  if (isUnlimited) return categoryFirst ? 12000 : 5000;
  const displayTarget = Math.max(GOLDEN_DISCOVERY_SSS_FLOOR, requestedLimit || GOLDEN_DISCOVERY_SSS_FLOOR);
  const targetPressure = categoryFirst ? displayTarget * 80 : displayTarget * 12;
  const seedPressure = seedCount > 0
    ? Math.min(categoryFirst ? 12000 : 2400, Math.max(0, seedCount * (categoryFirst ? 12 : 4)))
    : 0;
  return Math.min(categoryFirst ? 12000 : 5000, Math.max(targetPressure, categoryFirst ? 2400 : 360, seedPressure));
}

export function countSss<T extends GoldenDiscoveryLike>(items: T[]): number {
  return items.filter(item => String(item.grade || '').toUpperCase() === 'SSS').length;
}

export function rankGoldenDiscoveryResults<T extends GoldenDiscoveryLike>(
  items: T[],
  requestedLimit: number,
  isUnlimited = false,
): T[] {
  const seen = new Set<string>();
  const unique: T[] = [];
  for (const item of items || []) {
    const key = compactKeyword(item.keyword);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(item);
  }

  const sorted = unique.sort((a, b) => {
    const gradeDiff = gradeRank(b.grade) - gradeRank(a.grade);
    if (gradeDiff !== 0) return gradeDiff;

    const scoreDiff = (b.score || 0) - (a.score || 0);
    if (Math.abs(scoreDiff) > 0.001) return scoreDiff;

    const ratioDiff = (b.goldenRatio || 0) - (a.goldenRatio || 0);
    if (Math.abs(ratioDiff) > 0.001) return ratioDiff;

    const dcA = typeof a.documentCount === 'number' && a.documentCount > 0 ? a.documentCount : Number.MAX_SAFE_INTEGER;
    const dcB = typeof b.documentCount === 'number' && b.documentCount > 0 ? b.documentCount : Number.MAX_SAFE_INTEGER;
    if (dcA !== dcB) return dcA - dcB;

    const svDiff = (b.searchVolume || 0) - (a.searchVolume || 0);
    if (svDiff !== 0) return svDiff;

    return (b.cpc || 0) - (a.cpc || 0);
  });

  if (isUnlimited) return sorted;
  const displayTarget = Math.max(GOLDEN_DISCOVERY_SSS_FLOOR, requestedLimit || GOLDEN_DISCOVERY_SSS_FLOOR);
  return sorted.slice(0, displayTarget);
}
