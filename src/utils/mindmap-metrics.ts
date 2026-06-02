export type MindmapMetricGrade = 'SSS' | 'SS' | 'S' | 'A' | 'B' | 'C';

export interface RawMindmapMetric {
  keyword?: string | null;
  pcSearchVolume?: number | null;
  mobileSearchVolume?: number | null;
  searchVolume?: number | null;
  monthlyVolume?: number | null;
  documentCount?: number | null;
  monthlyAveCpc?: number | null;
  competition?: string | null;
  pcSearchVolumeLt10?: boolean;
  mobileSearchVolumeLt10?: boolean;
}

export interface MindmapMeasuredKeywordItem {
  keyword: string;
  searchVolume: number | null;
  searchVolumeDisplay: string;
  searchVolumeKnown: boolean;
  searchVolumeIsRange: boolean;
  searchVolumeLowerBound: number | null;
  searchVolumeUpperBound: number | null;
  pcSearchVolume: number | null;
  mobileSearchVolume: number | null;
  pcSearchVolumeLt10: boolean;
  mobileSearchVolumeLt10: boolean;
  documentCount: number;
  goldenRatio: number;
  goldenRatioDisplay: string;
  grade: MindmapMetricGrade;
  cpc: number;
  competition: string | null;
  isSeed: boolean;
  depth: number;
}

export function compactMindmapKeyword(keyword: string): string {
  return String(keyword || '').toLowerCase().replace(/[\s+]+/g, '').trim();
}

export function calculateMindmapMetricGrade(
  searchVolume: number,
  documentCount: number,
  ratio: number,
): MindmapMetricGrade {
  if (searchVolume >= 1000 && documentCount > 0 && documentCount <= 5000 && ratio >= 5) return 'SSS';
  if (searchVolume >= 500 && documentCount > 0 && documentCount <= 10000 && ratio >= 3) return 'SS';
  if (searchVolume >= 300 && ratio >= 2) return 'S';
  if (searchVolume >= 100) return 'A';
  if (searchVolume >= 30) return 'B';
  return 'C';
}

function readNumber(value: unknown): number | null {
  if (typeof value !== 'number') return null;
  return Number.isFinite(value) ? value : null;
}

export function buildMindmapMeasuredKeywordItem(
  metric: RawMindmapMetric,
  options: { seed?: string; isSeed?: boolean; depth: number },
): MindmapMeasuredKeywordItem {
  const keyword = String(metric?.keyword || '').trim();
  const pcKnown = metric?.pcSearchVolume !== null && metric?.pcSearchVolume !== undefined;
  const mobileKnown = metric?.mobileSearchVolume !== null && metric?.mobileSearchVolume !== undefined;
  const pc = pcKnown ? readNumber(metric.pcSearchVolume) || 0 : null;
  const mobile = mobileKnown ? readNumber(metric.mobileSearchVolume) || 0 : null;

  const directVolume = readNumber(metric?.searchVolume) ?? readNumber(metric?.monthlyVolume);
  const hasDirectVolume = directVolume !== null && directVolume > 0;
  const volumeKnown = pcKnown || mobileKnown || hasDirectVolume;
  const rawTotal = (pcKnown || mobileKnown) ? ((pc || 0) + (mobile || 0)) : directVolume;
  const searchVolume = volumeKnown ? (rawTotal || 0) : null;

  const pcLt10 = pcKnown && (metric.pcSearchVolumeLt10 === true || pc === 0);
  const mobileLt10 = mobileKnown && (metric.mobileSearchVolumeLt10 === true || mobile === 0);
  const hiddenCap = (pcLt10 ? 10 : 0) + (mobileLt10 ? 10 : 0);
  const lowerBound = searchVolume || 0;
  const upperBound = hiddenCap > 0 ? lowerBound + hiddenCap : searchVolume;
  const isRange = volumeKnown && hiddenCap > 0;

  let searchVolumeDisplay = '-';
  if (volumeKnown) {
    if (isRange && lowerBound === 0) searchVolumeDisplay = `< ${hiddenCap}`;
    else if (isRange) searchVolumeDisplay = `${lowerBound.toLocaleString()}+`;
    else searchVolumeDisplay = lowerBound.toLocaleString();
  }

  const documentCount = readNumber(metric?.documentCount) || 0;
  const ratio = documentCount > 0 && searchVolume !== null
    ? parseFloat((searchVolume / documentCount).toFixed(2))
    : 0;

  let goldenRatioDisplay = '-';
  if (documentCount > 0 && searchVolume !== null) {
    if (isRange && lowerBound === 0 && hiddenCap > 0) {
      goldenRatioDisplay = `< ${(hiddenCap / documentCount).toFixed(2)}`;
    } else {
      goldenRatioDisplay = ratio.toFixed(2);
    }
  }

  const seedCompact = compactMindmapKeyword(options.seed || '');
  const keywordCompact = compactMindmapKeyword(keyword);
  const isSeed = options.isSeed === true || (!!seedCompact && seedCompact === keywordCompact);

  return {
    keyword,
    searchVolume,
    searchVolumeDisplay,
    searchVolumeKnown: volumeKnown,
    searchVolumeIsRange: isRange,
    searchVolumeLowerBound: volumeKnown ? lowerBound : null,
    searchVolumeUpperBound: volumeKnown ? upperBound : null,
    pcSearchVolume: pc,
    mobileSearchVolume: mobile,
    pcSearchVolumeLt10: pcLt10,
    mobileSearchVolumeLt10: mobileLt10,
    documentCount,
    goldenRatio: ratio,
    goldenRatioDisplay,
    grade: calculateMindmapMetricGrade(searchVolume || 0, documentCount, ratio),
    cpc: readNumber(metric?.monthlyAveCpc) || 0,
    competition: metric?.competition || null,
    isSeed,
    depth: options.depth,
  };
}
