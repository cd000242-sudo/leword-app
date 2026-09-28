import { normalizeSearchAdResultKeyword, SEARCHAD_KEYWORD_BINDING_VERSION } from './searchad-result-alignment';

export interface BriefSearchVolumeEvidence {
  source: 'naver-searchad';
  keyword: string;
  measuredAt: string;
  pc: number | null;
  mobile: number | null;
  pcUnder10: boolean;
  mobileUnder10: boolean;
  totalMin: number;
  totalMax: number;
  status: 'exact' | 'range';
}

export const BRIEF_SEARCH_VOLUME_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

type SourceRow = {
  keyword?: unknown;
  pcSearchVolume?: unknown;
  mobileSearchVolume?: unknown;
  totalSearchVolume?: unknown;
  pcSearchVolumeLt10?: unknown;
  mobileSearchVolumeLt10?: unknown;
  measuredAtMs?: unknown;
  searchVolumeBindingVersion?: unknown;
  svEstimated?: unknown;
};

/** Only explicit same-query API provenance can establish a count or interval. */
export function readBriefSearchVolumeEvidence(
  keyword: string, row: SourceRow | null | undefined,
  options: { now?: number; maxAgeMs?: number } = {},
): BriefSearchVolumeEvidence | null {
  const now = options.now ?? Date.now();
  const measured = row?.measuredAtMs;
  if (!keyword.trim() || !row
    || normalizeSearchAdResultKeyword(row.keyword) !== normalizeSearchAdResultKeyword(keyword)
    || row.searchVolumeBindingVersion !== SEARCHAD_KEYWORD_BINDING_VERSION
    || typeof measured !== 'number' || !Number.isFinite(measured) || measured <= 0
    || measured > now || now - measured > (options.maxAgeMs ?? BRIEF_SEARCH_VOLUME_MAX_AGE_MS)) return null;
  const pcUnder10 = row.pcSearchVolumeLt10 === true;
  const mobileUnder10 = row.mobileSearchVolumeLt10 === true;
  const device = (value: unknown, under10: boolean): number | null | undefined => {
    if (under10) return value == null ? null : undefined;
    return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
  };
  const pc = device(row.pcSearchVolume, pcUnder10);
  const mobile = device(row.mobileSearchVolume, mobileUnder10);
  if (pc === undefined || mobile === undefined) return null;
  const isRange = pcUnder10 || mobileUnder10;
  // The shared API marks explicit <10 rows svEstimated=true; those bounds are
  // official disclosure limits. No other estimated row establishes a count.
  if (!isRange && row.svEstimated === true) return null;
  const totalMin = (pc ?? 0) + (mobile ?? 0);
  const totalMax = totalMin + (pcUnder10 ? 9 : 0) + (mobileUnder10 ? 9 : 0);
  if (!Number.isSafeInteger(totalMax)) return null;
  if (isRange ? row.totalSearchVolume != null : row.totalSearchVolume !== totalMin) return null;
  return {source:'naver-searchad',keyword:keyword.trim(),measuredAt:new Date(measured).toISOString(),pc,mobile,pcUnder10,mobileUnder10,totalMin,totalMax,status:isRange?'range':'exact'};
}

/** Revalidate persisted public data; claimed bounds must agree with both devices. */
export function normalizeBriefSearchVolumeEvidence(
  keyword: string, rawEvidence: unknown,
  options: { now?: number; maxAgeMs?: number } = {},
): BriefSearchVolumeEvidence | null {
  if (!rawEvidence || typeof rawEvidence !== 'object' || Array.isArray(rawEvidence)) return null;
  const raw = rawEvidence as Record<string, unknown>;
  if (raw.source !== 'naver-searchad' || typeof raw.keyword !== 'string'
    || typeof raw.measuredAt !== 'string' || !raw.measuredAt.trim()
    || (raw.pc !== null && typeof raw.pc !== 'number') || (raw.mobile !== null && typeof raw.mobile !== 'number')
    || typeof raw.pcUnder10 !== 'boolean' || typeof raw.mobileUnder10 !== 'boolean'
    || (raw.status !== 'exact' && raw.status !== 'range')
    || typeof raw.totalMin !== 'number' || typeof raw.totalMax !== 'number') return null;
  const evidence = readBriefSearchVolumeEvidence(keyword, {
    keyword: raw.keyword,
    pcSearchVolume: raw.pc,
    mobileSearchVolume: raw.mobile,
    pcSearchVolumeLt10: raw.pcUnder10,
    mobileSearchVolumeLt10: raw.mobileUnder10,
    totalSearchVolume: raw.status === 'exact' ? raw.totalMin : null,
    measuredAtMs: Date.parse(raw.measuredAt),
    searchVolumeBindingVersion: SEARCHAD_KEYWORD_BINDING_VERSION,
  }, options);
  if (!evidence || evidence.status !== raw.status || evidence.totalMin !== raw.totalMin || evidence.totalMax !== raw.totalMax) return null;
  return evidence;
}

/** Range and unavailable are separate from exact numeric zero. */
export function applyBriefSearchVolumeEvidence<T extends { coreKeyword: string; searchVolume?: number | null; searchVolumeUnder10?: boolean }>(
  brief: T, evidence: BriefSearchVolumeEvidence | null | undefined,
): T & { searchVolume: number | null; searchVolumeUnder10: boolean; searchVolumeEvidence?: BriefSearchVolumeEvidence } {
  const sameQuery = evidence && normalizeSearchAdResultKeyword(evidence.keyword) === normalizeSearchAdResultKeyword(brief.coreKeyword);
  const valid = sameQuery ? evidence : undefined;
  return {...brief,searchVolume:valid?.status==='exact'?valid.totalMin:null,searchVolumeUnder10:false,searchVolumeEvidence:valid};
}
