export const SEARCHAD_KEYWORD_BINDING_VERSION = 'keyword-keyed-v2' as const;
export type SearchAdKeywordBindingVersion = typeof SEARCHAD_KEYWORD_BINDING_VERSION;

export interface SearchAdKeywordBindingMetadata {
  searchVolumeBindingVersion: SearchAdKeywordBindingVersion;
  searchVolumeMeasuredAt: string;
}

/**
 * Converts an already keyword-bound SearchAd row into persistable provenance.
 * The version marker is never inferred from split values, source labels, or a
 * surrounding request timestamp. Both the explicit marker and the row's own
 * measurement time are required so downstream code cannot launder legacy or
 * position-bound values into trusted supply.
 */
export function searchAdKeywordBindingMetadata(
  row: {
    searchVolumeBindingVersion?: unknown;
    searchVolumeMeasuredAt?: unknown;
    measuredAtMs?: unknown;
  } | null | undefined,
): SearchAdKeywordBindingMetadata | null {
  if (row?.searchVolumeBindingVersion !== SEARCHAD_KEYWORD_BINDING_VERSION) return null;

  const explicitMeasuredAt = String(row.searchVolumeMeasuredAt || '').trim();
  if (explicitMeasuredAt) {
    const parsed = Date.parse(explicitMeasuredAt);
    if (!Number.isFinite(parsed)) return null;
    return {
      searchVolumeBindingVersion: SEARCHAD_KEYWORD_BINDING_VERSION,
      searchVolumeMeasuredAt: new Date(parsed).toISOString(),
    };
  }

  const measuredAtMs = Number(row.measuredAtMs);
  if (!Number.isFinite(measuredAtMs) || measuredAtMs <= 0) return null;
  const measuredAt = new Date(measuredAtMs);
  if (!Number.isFinite(measuredAt.getTime())) return null;
  return {
    searchVolumeBindingVersion: SEARCHAD_KEYWORD_BINDING_VERSION,
    searchVolumeMeasuredAt: measuredAt.toISOString(),
  };
}

export function normalizeSearchAdResultKeyword(value: unknown): string {
  return String(value || '').toLowerCase().replace(/[\s+]+/g, '');
}

export function alignSearchAdRowsByKeyword<T extends { keyword?: unknown }>(
  keywords: string[],
  rows: readonly T[] | null | undefined,
): Array<T | null> {
  const rowsByKeyword = new Map<string, T[]>();
  for (const row of rows || []) {
    const key = normalizeSearchAdResultKeyword(row?.keyword);
    if (!key) continue;
    const queued = rowsByKeyword.get(key) || [];
    queued.push(row);
    rowsByKeyword.set(key, queued);
  }
  return keywords.map((keyword) => {
    const key = normalizeSearchAdResultKeyword(keyword);
    return rowsByKeyword.get(key)?.shift() || null;
  });
}
